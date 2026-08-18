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
        this._timeoutId = null;

        this._ipcConnection = null;
        this._ipcInStream = null;
        this._ipcOutStream = null;
        this._shuttingDown = false;
        this._reconnecting = false;

        this._slideTimeoutId = null;
        this._currentVolume = volume;

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

            //NOTE: Once the file is loaded send command to pause it and retrieve video size
            if (data.event == "file-loaded") {
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

    /* Fire and forget control methods */
    _slideValue(from, target, durationMs, onStep, onDone, stepMs = 10) {
        // One global slider for all values
        if (this._slideTimeoutId !== null) {
            GLib.source_remove(this._slideTimeoutId);
            this._slideTimeoutId = null;
        }

        const steps = Math.max(1, Math.round(durationMs / stepMs));
        const delta = (target - from) / steps;
        let currentStep = 0;
        let value = from;

        this._slideTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, stepMs, () => {
            currentStep++;

            if (currentStep >= steps) {
                onStep(target);
                this._slideTimeoutId = null;
                onDone?.();
                return GLib.SOURCE_REMOVE;
            }

            value += delta;
            onStep(value);
            return GLib.SOURCE_CONTINUE;
        });
    }

    _slideVolume(target, durationMs, onDone) {
        this._slideValue(
            this._currentVolume,
            target,
            durationMs,
            (value) => {
                this._currentVolume = value;
                this._queueCommand('set_property', 'volume', Math.round(value * 100));
            },
            onDone
        );
    }

    play() {
        this._queueCommand('set_property', 'pause', 'no');
        this._slideVolume(this._volume, 300);
    }

    pause() {
        this._slideVolume(0, 300, () => {
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

                    if (this._timeoutId !== null) {
                        GLib.source_remove(this._timeoutId);
                        this._timeoutId = null;
                    }
                },
                this
            );

            this._timeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                timeoutMs,
                () => {
                    global.window_manager.disconnectObject(this);
                    this._timeoutId = null;

                    reject(new MpvError('timed out waiting for window'));

                    return GLib.SOURCE_REMOVE;
                }
            );
        });
    }

    destroy() {
        this._shuttingDown = true;
        
        if (this._timeoutId !== null) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        if (this._slideTimeoutId !== null) {
            GLib.source_remove(this._slideTimeoutId);
            this._slideTimeoutId = null;
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