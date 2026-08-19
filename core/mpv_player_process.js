import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { logError, logWarn } from '../utils/logging.js';
import { sleep } from '../utils/base.js';

const logErrorMpv = (msg) => logError(`MpvPlayerProcess: ${msg}`);
const logWarnMpv = (msg) => logWarn(`MpvPlayerProcess: ${msg}`);

const MpvError = (msg) => new Error(`MpvPlayerProcess: ${msg}`);

Gio._promisify(Gio.SocketClient.prototype, 'connect_async', 'connect_finish');
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async', 'write_bytes_finish');

// This number is meant to match the animation 
// duration of lockscreen widgets + some ipc overhead 
const FADE_DURATION_MS = 280; 

export class MpvPlayerProcess {
    constructor({ 
        videoPath, scalingMode, loop, volume, 
        useVideorate = false, framerate, 
    }) {
        this._socketPath = '/tmp/lls-mpv.sock';

        this._videoPath = videoPath;
        this._scalingMode = scalingMode;
        this._loop = loop;
        this._volume = volume;
        this._useVideorate = useVideorate;
        this._framerate = framerate;

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

        this._writeQueue = [];
        this._writing = false;

        this.shouldResize = true;
        this.w = 0;
        this.h = 0;
    }

    async run() {
        this._removeSocketFile();

        const args = [
            'mpv', 
            `--input-ipc-server=${this._socketPath}`, 
            this._videoPath,
            '--keepaspect=no',
            '--hwdec=auto',
            '--vo=gpu-next',
            '--no-border',
            '--keep-open=yes',
            '--osd-level=0',
            '--msg-level=all=no',
            '--audio-buffer=0.1', //NOTE: prevents audio artifacts on fade
            '--no-terminal',
            `--volume=${Math.round(this._volume * 100)}`
        ];

        if (this._loop)
            args.push('--loop');

        if (this._useVideorate)
            args.push(`--vf=fps=${this._framerate}`);

        this._proc = Gio.Subprocess.new(
            args, 
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
        this._pid = parseInt(this._proc.get_identifier());

        await this._waitForSocketAndConnect(this._socketPath);
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
                this._startReadLoop().catch(err => logErrorMpv(
                    `read loop crashed: ${err}`
                ));
                return
            }

            await sleep(50);
        }
        throw new MpvError('timed out waiting for mpv IPC socket to appear');
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
        if (this._shuttingDown || this._reconnecting) return;
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
        while (!this._shuttingDown) {
            let line;
            try {
                [line] = await this._ipcInStream.read_line_async(GLib.PRIORITY_DEFAULT, null);
            } catch (e) {
                if (this._shuttingDown) return;
                logErrorMpv(`ipc read error: ${e}`);
                this._reconnectIpc();
                return;
            }

            if (line === null) {
                logErrorMpv('ipc connection closed by mpv (EOF)');
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
                this.w = data.data.w;
                this.h = data.data.h;
            }

            if (data.name == 'playback-time' && data.data) {
                this._position = data.data;
            }

            //NOTE: Once the file is loaded send command to pause it and retrieve video size
            if (data.event == "file-loaded") {
                this._queueCommand('observe_property', 1, 'playback-time');
                this._queueCommand('set_property', 'pause', 'yes');
                this._queueCommand('get_property', 'video-params');
            }
        } catch(err) {
            logWarnMpv(`failed to handle "${line}". Reason: ${err}`)
        }
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
        const filterStr = direction === 'in'
            ? `@fade:lavfi=[afade=t=in:st=${this._position}:d=${FADE_DURATION_MS}ms:curve=tri:silence=${currentGain}]`
            : `@fade:lavfi=[afade=t=out:st=${this._position}:d=${FADE_DURATION_MS}ms:curve=tri:unity=${currentGain}]`;

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
        this._queueCommand('set_property', 'pause', 'no');
        this._fade('in');
    }

    pause() {
        this._fade('out', () => {
            this._queueCommand('set_property', 'pause', 'yes');
        });
    }

    async waitForWindow(timeoutMs) {
        return new Promise((resolve, reject) => {
            this._mapId = global.window_manager.connectObject(
                'map',
                (_wm, windowActor) => {
                    const win = windowActor.get_meta_window();

                    if (win.get_pid() !== this._pid)
                        return;

                    this._window = win;
                    resolve(win);

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
            this._proc.send_signal(9); // SIGKILL
            this._proc = null;
            this._pid = null;
        }
        
        //NOTE: 
        // proc.send_signal sometimes doesnt do the job
        // thats why we use window.kill too
        if (this._window) {
           this._window.kill();
           this._window = null;
        }

        this._removeSocketFile();
    }
}