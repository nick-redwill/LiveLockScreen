import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { logError, logWarn } from '../utils/logging.js';
import { sleep } from '../utils/base.js';

const logErrorMpv = msg => logError(`MpvPlayerProcess: ${msg}`);
const logWarnMpv = msg => logWarn(`MpvPlayerProcess: ${msg}`);

const MpvError = msg => new Error(`MpvPlayerProcess: ${msg}`);

Gio._promisify(Gio.SocketClient.prototype, 'connect_async', 'connect_finish');
Gio._promisify(Gio.Subprocess.prototype, 'communicate_utf8_async', 'communicate_utf8_finish');
Gio._promisify(Gio.DataInputStream.prototype, 'read_line_async', 'read_line_finish');
Gio._promisify(Gio.OutputStream.prototype, 'write_bytes_async', 'write_bytes_finish');

export class MpvPlayerProcess {
    constructor({
        imagePaths,
        photoDuration = 10,
        loop,
    }) {
        this._socketPath = '/tmp/screensaver-mpv.sock';

        this._imagePaths = imagePaths;
        this._photoDuration = photoDuration;
        this._loop = loop;

        this._proc = null;
        this._pid = null;
        this._window = null;
        this._winTimeoutId = null;

        this._ipcConnection = null;
        this._ipcInStream = null;
        this._ipcOutStream = null;
        this._shuttingDown = false;
        this._reconnecting = false;
        this._pauseOnFirstLoad = true;

        this._writeQueue = [];
        this._writing = false;

        this.shouldResize = true;
        this.w = 0;
        this.h = 0;
    }

    async run() {
        this._removeSocketFile();

        const transparencyArg = await this._getTransparencyArg();
        const args = [
            'mpv',
            `--input-ipc-server=${this._socketPath}`,
            '--keepaspect=no',
            '--hwdec=auto',
            '--vo=gpu-next',
            '--no-border',
            '--keep-open=yes',
            '--osd-level=0',
            '--msg-level=all=no',
            '--no-audio',
            '--no-terminal',
            `--image-display-duration=${this._photoDuration}`,
        ];

        if (transparencyArg)
            args.push(transparencyArg);

        if (this._imagePaths.length > 1)
            args.push('--shuffle');

        if (this._loop) {
            if (this._imagePaths.length > 1)
                args.push('--loop-playlist=inf');
            else
                args.push('--loop-file=inf');
        }

        args.push(...this._imagePaths);

        this._proc = Gio.Subprocess.new(
            args,
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
        this._pid = parseInt(this._proc.get_identifier());

        await this._waitForSocketAndConnect(this._socketPath);
    }

    async _getTransparencyArg() {
        if (this._transparencyArgCache !== undefined)
            return this._transparencyArgCache;

        const version = await this._getMpvVersion();
        if (!version) {
            this._transparencyArgCache = null;
            return this._transparencyArgCache;
        }

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
            const match = stdout.match(/mpv.*?(\d+)\.(\d+)\.(\d+)/);

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
        const file = Gio.File.new_for_path(socketPath);

        for (let i = 0; i < 100; i++) {
            if (this._shuttingDown)
                return;

            if (file.query_exists(null)) {
                await this._connectIpc(socketPath);
                this._startReadLoop().catch(err => logErrorMpv(`read loop crashed: ${err}`));
                return;
            }

            await sleep(50);
        }

        throw new MpvError('timed out waiting for mpv IPC socket to appear');
    }

    _queueCommand(...args) {
        const payload = JSON.stringify({ command: args, request_id: Math.round(Math.random() * 1000) }) + '\n';
        this._writeQueue.push(payload);
        this._processWriteQueue().catch(err => logErrorMpv(`write queue failed: ${err}`));
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
        this._processWriteQueue();
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
        if (this._shuttingDown || this._reconnecting)
            return;

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
                if (this._shuttingDown)
                    return;
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

            if (data.event === 'file-loaded') {
                if (this._pauseOnFirstLoad) {
                    this._queueCommand('set_property', 'pause', 'yes');
                    this._pauseOnFirstLoad = false;
                }
                this._queueCommand('get_property', 'video-params');
            }
        } catch (err) {
            logWarnMpv(`failed to handle "${line}". Reason: ${err}`);
        }
    }

    _cleanupIpc() {
        if (!this._ipcConnection)
            return;

        try {
            this._ipcConnection.close(null);
        } catch (_) {
        }

        this._ipcConnection = null;
        this._ipcOutStream = null;
        this._ipcInStream = null;
    }

    play() {
        this._queueCommand('set_property', 'pause', 'no');
    }

    pause() {
        this._queueCommand('set_property', 'pause', 'yes');
    }

    async waitForWindow(timeoutMs) {
        return new Promise((resolve, reject) => {
            global.window_manager.connectObject(
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

        if (this._winTimeoutId !== null) {
            GLib.source_remove(this._winTimeoutId);
            this._winTimeoutId = null;
        }
        global.window_manager.disconnectObject(this);

        this._cleanupIpc();

        if (this._proc) {
            this._proc.send_signal(9);
            this._proc = null;
            this._pid = null;
        }

        if (this._window) {
            this._window.kill();
            this._window = null;
        }

        this._removeSocketFile();
    }
}
