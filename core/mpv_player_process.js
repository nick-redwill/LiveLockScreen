import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { logError, logWarn } from '../utils/logging.js';
import { sleep } from '../utils/base.js';
import { ActionOnEnd, MpvProfile } from '../enums.js';

const logErrorMpv = (msg) => logError(`MpvPlayerProcess: ${msg}`);
const logWarnMpv = (msg) => logWarn(`MpvPlayerProcess: ${msg}`);

class MpvError extends Error {
  constructor(msg) {
    super(`MpvPlayerProcess: ${msg}`);
    this.name = 'MpvError';

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, MpvError);
    }
  }
}
Gio._promisify(Gio.SocketClient.prototype, 'connect_async', 'connect_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async', 'write_bytes_finish');

// This number is meant to match the animation
// duration of lockscreen widgets + some ipc overhead
const FADE_DURATION_MS = 280;

// Profile names as defined in external/mpv.conf
const PROFILE_NAMES = {
    [MpvProfile.QUALITY]: 'quality',
    [MpvProfile.BALANCED]: 'balanced',
    [MpvProfile.EFFICIENT]: 'efficient',
};

export class MpvPlayerProcess {
    constructor({
        playlist, actionOnEnd = ActionOnEnd.LOOP, 
        volume,
        useVideorate = false, framerate, imageDuration = 5,
        onSizeChange, onPauseChange, onFileChange, onNext, onPlaybackRestart,
        configPath,
        profile = MpvProfile.QUALITY, customArgs = [],
    }) {
        // Unique per player, inside the user's private runtime dir (/run/user/<uid>)
        this._socketPath = GLib.build_filenamev([
            GLib.get_user_runtime_dir(),
            `live-lockscreen-mpv-${GLib.uuid_string_random()}.sock`,
        ]);

        this._configPath = configPath;
        this._profile = profile;
        this._customArgs = customArgs;

        this._playlist = playlist;
        this._actionOnEnd = actionOnEnd;
        this._shouldPlay = false;
        this._paused = true;
        this._volume = volume;
        this._useVideorate = useVideorate;
        this._framerate = framerate;
        // Seconds each static image stays on screen
        this._imageDuration = imageDuration;

        this._onSizeChange = onSizeChange;
        this._onPauseChange = onPauseChange;
        this._onFileChange = onFileChange;
        //NOTE: If set, the caller must switch to next
        this._onNext = onNext;
        // First frame after loading a file (or seeking) is ready
        this._onPlaybackRestart = onPlaybackRestart;

        this._proc = null;
        this._pid = null;
        this._stdin = null;
        this._window = null;
        this._mapId = null;
        this._winTimeoutId = null;

        this._ipcConnection = null;
        this._ipcInStream = null;
        this._ipcOutStream = null;
        this._shuttingDown = false;
        this._reconnecting = false;
        
        this._transitionTimeoutId = null;
        this._currentVolume = volume;
        this._position = 0;
        this._waitingFirstFrame = false;

        this._writeQueue = [];
        this._writing = false;

        this.shouldResize = true;
        this.w = 0;
        this.h = 0;
    }

    async run() {
        if (!this._configPath || !GLib.file_test(this._configPath, GLib.FileTest.IS_REGULAR))
            throw new MpvError(`mpv config not found at "${this._configPath}"`);

        const transparencyArg = await this._getTransparencyArg();

        // User configs are skipped, everything comes from our own config file
        const args = [
            'mpv',
            '--no-config',
            `--include=${this._configPath}`,
            `--profile=${this._resolveProfileName()}`,
            ...this._filterCustomArgs(this._customArgs),
        ];

        //NOTE:
        // Options below come after the custom args on purpose (last one wins in mpv),
        // the player logic depends on them
        args.push(
            '--pause=yes',
            '--keep-open=yes',
            `--input-ipc-server=${this._socketPath}`,
            `--volume=${Math.round(this._volume * 100)}`
        );

        if (transparencyArg)
            args.push(transparencyArg);

        if (this._actionOnEnd === ActionOnEnd.LOOP)
            args.push('--loop');

        if (this._imageDuration > 0)
            args.push(`--image-display-duration=${this._imageDuration}`);

        // TODO: --vf=fps does not work with static images, re-enable once handled
        // if (this._useVideorate)
        //     args.push(`--vf=fps=${this._framerate}`);

        // "--" so a file name starting with "-" is not parsed as an option
        args.push('--', this._playlist.current());

        this._proc = Gio.Subprocess.new(
            args, 
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
        this._pid = parseInt(this._proc.get_identifier());

        await this._waitForSocketAndConnect(this._socketPath);
    }

    _resolveProfileName() {
        return PROFILE_NAMES[this._profile] ?? PROFILE_NAMES[MpvProfile.QUALITY];
    }

    /**
     * Only options are allowed, anything else would be added
     * to the playlist by mpv as a file to play
     */
    _filterCustomArgs(customArgs) {
        return customArgs.filter(arg => {
            if (arg.startsWith('--') && arg.length > 2)
                return true;

            logWarnMpv(`ignoring custom argument "${arg}", only --options are allowed`);
            return false;
        });
    }

    async _getTransparencyArg() {
        if (this._transparencyArgCache !== undefined)
            return this._transparencyArgCache;

        const version = await this._getMpvVersion();

        if (!version) {
            this._transparencyArgCache = null;
            return this._transparencyArgCache;
        }

        //NOTE: Newer versions of MPV (0.0.38 and above) do not use --alpha flag
        const usesNewBackgroundSyntax =
            version.major > 0 || (version.major === 0 && version.minor >= 38);

        this._transparencyArgCache = usesNewBackgroundSyntax
            ? '--background=none'
            : '--alpha=yes';

        return this._transparencyArgCache;
    }

    async _getMpvVersion() {
        if (this._mpvVersionCache !== undefined)
            return this._mpvVersionCache;

        try {
            const proc = Gio.Subprocess.new(
                ['mpv', '--version'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );

            const [stdout] = await proc.communicate_utf8_async(null, null);
            const match = stdout.match(/mpv.*(\d+)\.(\d+)\.(\d+)/);

            this._mpvVersionCache = match
                ? { major: parseInt(match[1]), minor: parseInt(match[2]), patch: parseInt(match[3]) }
                : null;
        } catch (e) {
            logErrorMpv(`failed to determine mpv version: ${e}`);
            this._mpvVersionCache = null;
        }

        return this._mpvVersionCache;
    }

    _removeSocketFile() {
        try {
            const file = Gio.File.new_for_path(this._socketPath);
            if (file.query_exists(null))
                file.delete(null);
        } catch (e) {
            logErrorMpv(`failed to remove socket file on cleanup: ${e}`);
        }
    }

    async _waitForSocketAndConnect(socketPath) {
        const MAX_ATTEMPTS = 100;
        const file = Gio.File.new_for_path(socketPath);

        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            if (this._shuttingDown) return;

            if (file.query_exists(null)) {
                await this._connectIpc(socketPath);
                this._observeProperties();
                this._startReadLoop().catch(err => logErrorMpv(
                    `read loop crashed: ${err}`
                ));
                return
            }

            await sleep(50);
        }
        throw new MpvError('timed out waiting for mpv IPC socket to appear');
    }

    _observeProperties() {
        // Observers belong to the IPC connection, so they have to be
        // registered again every time we reconnect
        this._queueCommand('observe_property', 1, 'playback-time');
        this._queueCommand('observe_property', 2, 'eof-reached');
        this._queueCommand('observe_property', 3, 'video-params');
        this._queueCommand('observe_property', 4, 'pause');
    }

    isPaused() {
        return this._paused;
    }

    _queueCommand(...args) {
        let r = Math.round(Math.random() * 1000); // Just random value for debug
        const payload = JSON.stringify({ command: args, request_id: r }) + '\n';
        // We use queue to avoid race conditions
        this._writeQueue.push(payload);
        this._processWriteQueue().catch(err => logErrorMpv(
            `write queue failed: ${err}`
        ));
    }

    async _processWriteQueue() {
        if (this._writing || this._writeQueue.length === 0 || !this._ipcOutStream)
            return;

        this._writing = true;
        const payload = this._writeQueue.shift();

        try {
            await this._ipcOutStream.write_bytes_async(
                new GLib.Bytes(payload),
                GLib.PRIORITY_DEFAULT,
                null
            );
        } catch (e) {
            this._writing = false;
            logErrorMpv(`IPC write failed: ${e}`);
            this._reconnectIpc();
            return;
        }

        this._writing = false;
        this._processWriteQueue(); // send next queued command, if any
    }

    async _connectIpc(socketPath) {
        const address = new Gio.UnixSocketAddress({ path: socketPath });
        const client = new Gio.SocketClient();

        this._ipcConnection = await client.connect_async(address, null);
        this._ipcOutStream = this._ipcConnection.get_output_stream();
        this._ipcInStream = new Gio.DataInputStream({
            base_stream: this._ipcConnection.get_input_stream(),
        });
    }

    async _reconnectIpc() {
        if (this._shuttingDown || this._reconnecting || !this._proc) return;
        this._reconnecting = true;

        this._cleanupIpc();

        try {
            await this._waitForSocketAndConnect(this._socketPath);
        } catch (e) {
            logErrorMpv(`reconnect failed: ${e}`);
        }
        this._reconnecting = false;
    }

    async _startReadLoop() {
        const decoder = new TextDecoder();
        while (!this._shuttingDown) {
            let line;
            try {
                const [bytes] = await this._ipcInStream.read_line_async(GLib.PRIORITY_DEFAULT, null);
                if (bytes === null) {
                    logErrorMpv('ipc connection closed by mpv (EOF)');
                    if (this._proc)
                        this._reconnectIpc();
                    return;
                }
                line = decoder.decode(bytes);
            } catch (e) {
                if (this._shuttingDown) return;
                logErrorMpv(`ipc read error: ${e}`);
                this._reconnectIpc();
                return;
            }

            this._handleIpcLine(line);
        }
    }

    _handleIpcLine(line) {
        try {
            const data = JSON.parse(line);

            if (data.data && data.data.w && data.data.h) {
                if (this.w != data.data.w || this.h != data.data.h) {
                    this.w = data.data.w;
                    this.h = data.data.h;
                    this._onSizeChange?.(this.w, this.h);
                }
            }

            if (data.name == 'playback-time' && data.data) {
                this._position = data.data;
            }

            if (data.name == 'pause') {
                this._paused = data.data;
                this._onPauseChange?.(data.data);
            }

            //NOTE: 
            // With --keep-open mpv doesn't send "end-file" when the video 
            // finishes, it just sets eof-reached instead
            if (data.name == 'eof-reached' && data.data === true) {
                this._onVideoEnd();
            }
            
            if (data.event == 'end-file' && data.reason == 'error') {
                logWarnMpv(`failed to play file: ${data.file_error ?? 'unknown error'}`);
                this._waitingForFirstFrame = false;
                // Signal to end the blackout
                this._onPlaybackRestart?.();
            }

            if (data.event == 'file-loaded')
                this._waitingFirstFrame = true;

            // For now we only need to fire this signal once
            // So only when we got the first frame
            // file-loaded fires before the actual video decode, 
            // so its too early
            // playback-restart is the right signal here 
            if (data.event == 'playback-restart' && this._waitingFirstFrame) {
                this._waitingFirstFrame = false;
                this._onPlaybackRestart?.();
            }
        } catch(err) {
            logWarnMpv(`failed to handle "${line}". Reason: ${err}`)
        }
    }

    _onVideoEnd() {
        //NOTE:
        // Loop is handled by mpv itself and pause keeps the last frame.
        // The order of the videos is up to the playlist
        if (this._actionOnEnd !== ActionOnEnd.NEXT)
            return;

        if (this._onNext)
            this._onNext();
        else
            this.next();
    }

    _loadFile(path) {
        this._queueCommand('loadfile', path, 'replace');

        // mpv keeps the pause state across files, this is just in case
        if (this._shouldPlay)
            this._queueCommand('set_property', 'pause', 'no');

        this._onFileChange?.(path);
    }

    get currentFile() {
        return this._playlist.current();
    }

    get hasMultipleVideos() {
        return this._playlist.size > 1;
    }

    next() {
        this._playlist.increment();
        this._loadFile(this._playlist.current());
    }

    previous() {
        this._playlist.decrement();
        this._loadFile(this._playlist.current());
    }

    _cleanupIpc() {
        if (this._ipcConnection) {
            try { this._ipcConnection.close(null); } catch (_) {}
            this._ipcConnection = null;
            this._ipcOutStream = null;
            this._ipcInStream = null;
        }
    }

    _clearTransitionTimeout() {
        if (this._transitionTimeoutId) {
            GLib.source_remove(this._transitionTimeoutId);
            this._transitionTimeoutId = null;
        }
    }

    _currentGainEstimate() {
        // This function is important because we need the approximate 
        // volume for the silence/unity values in the af command

        if (!this._fadeStartedAtMs) return this._lastSettledGain ?? 0;

        const elapsedMs = GLib.get_monotonic_time() / 1000 - this._fadeStartedAtMs;
        const progress = Math.max(0, Math.min(1, elapsedMs / FADE_DURATION_MS));

        // linear (tri) curve assumed
        if (this._fadeDirection === 'in') {
            return this._fadeFromGain + (1 - this._fadeFromGain) * progress;
        } else {
            return this._fadeFromGain * (1 - progress);
        }
    }

    _runFade(direction, onComplete) {
        const currentGain = this._currentGainEstimate();

        this._fadeDirection = direction;
        this._fadeFromGain = currentGain;
        this._fadeStartedAtMs = GLib.get_monotonic_time() / 1000;

        // NOTE: 
        // This scary long command is responsible for smooth audio fade without
        // any weird clicking noises. We need to specify silence/unity value
        // otherwise when interrupted by a new fade the volume jumps to 1 or 0
        
        // This may be hacky but it works :)
        // If you have better ideas please contact me
        const pos = this._position ?? 0;
        const filterStr = direction === 'in'
            ? `@fade:lavfi=[afade=t=in:st=${pos}:d=${FADE_DURATION_MS}ms:curve=tri:silence=${currentGain}]`
            : `@fade:lavfi=[afade=t=out:st=${pos}:d=${FADE_DURATION_MS}ms:curve=tri:unity=${currentGain}]`;

        this._queueCommand('af', 'set', filterStr);

        this._transitionTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FADE_DURATION_MS + 10,
            () => {
                this._queueCommand('af', 'clr', '');
                this._transitionTimeoutId = null;
                this._lastSettledGain = direction === 'in' ? 1 : 0;
                this._fadeStartedAtMs = null;
                if (onComplete) onComplete();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _fade(direction, onComplete) {
        this._clearTransitionTimeout();
        this._runFade(direction, onComplete);
    }

    play() {
        this._shouldPlay = true;
        this._queueCommand('set_property', 'pause', 'no');
        this._fade('in');
    }

    pause() {
        this._shouldPlay = false;
        this._fade('out', () => {
            this._queueCommand('set_property', 'pause', 'yes');
        });
    }

    stopImmediately() {
        this.pauseImmediately();
        this._queueCommand('seek', 0, 'absolute+exact');
    }

    pauseImmediately() {
        this._shouldPlay = false;
        this._clearTransitionTimeout();
        this._queueCommand('set_property', 'pause', 'yes');
        this._lastSettledGain = 0;
        this._fadeStartedAtMs = null;
    }

    _isOwnWindow(windowActor) {
        return windowActor.get_meta_window()?.get_pid() === this._pid;
    }

    async waitForWindow(timeoutMs) {
        //NOTE:
        // Sometimes (e.g. when using dmabuf-wayland) window can be mapped before
        // this is called, and 'map' is not emitted again. Check existing windows first
        const existing = global.get_window_actors().find(a => this._isOwnWindow(a));
        if (existing) {
            this._window = existing.get_meta_window();
            return this._window;
        }

        return new Promise((resolve, reject) => {
            this._mapId = global.window_manager.connectObject(
                'map',
                (_wm, windowActor) => {
                    if (!this._isOwnWindow(windowActor))
                        return;

                    this._window = windowActor.get_meta_window();
                    resolve(this._window);

                    global.window_manager.disconnectObject(this);

                    if (this._winTimeoutId !== null) {
                        GLib.source_remove(this._winTimeoutId);
                        this._winTimeoutId = null;
                    }
                },
                this
            );

            this._winTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                timeoutMs,
                () => {
                    global.window_manager.disconnectObject(this);
                    this._winTimeoutId = null;

                    reject(new MpvError('timed out waiting for window'));

                    return GLib.SOURCE_REMOVE;
                }
            );
        });
    }

    destroy() {
        this._shuttingDown = true;
        
        this._clearTransitionTimeout();

        if (this._winTimeoutId !== null) {
            GLib.source_remove(this._winTimeoutId);
            this._winTimeoutId = null;
        }
        global.window_manager.disconnectObject(this);

        this._cleanupIpc()

        if (this._proc) {
            this._proc.force_exit();
            this._proc = null;
            this._pid = null;
        }
        
        this._window = null;

        this._removeSocketFile();
    }
}