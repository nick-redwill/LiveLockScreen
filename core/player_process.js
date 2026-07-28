import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { error } from '../utils/logging.js';

export class PlayerProcess {
    constructor({ 
        playerPath, videoPath, scalingMode, loop, volume, 
        useVideorate = false, framerate, 
        colorAccurate = true //NOTE: Redundant
    }) {
        this._socketPath = '/tmp/lls-mpv.sock';

        this._playerPath = playerPath;
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
        this._ipcOutStream = null;

        this._slideTimeoutId = null;
        this._currentVolume = volume;

        this._writeQueue = [];
        this._writing = false;

        this.w = 0;
        this.h = 0;
    }

    run() {
        //NOTE: If socket already exists cleaning it up
        try {
            const file = Gio.File.new_for_path(this._socketPath);
            if (file.query_exists(null))
                file.delete(null);
        } catch (e) {
            error(`PlayerProcess: failed to clean up stale socket: ${e}`);
            return;
        }

        const args = [
            'mpv', 
            `--input-ipc-server=${this._socketPath}`, 
            this._videoPath,
            '--keepaspect=no',
            '--hwdec=auto',
            '--vo=gpu',
            '--no-border',
            '--keep-open=yes',
            // '--background=none', //TODO: properly implement transparency support if possible
            '--osd-level=0',
            '--msg-level=all=no',
            '--no-terminal',
            `--volume=${Math.round(this._volume * 100)}`
        ];
        if (this._loop)
            args.push('--loop');
        
        if (this._useVideorate) {
            args.push(`--vf=fps=${this._framerate}`)
        }

        this._proc = Gio.Subprocess.new(
            args, 
            Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE
        );
        this._pid = parseInt(this._proc.get_identifier());

        //NOTE: Socket is created asyncronously, so we should wait until it exists
        this._waitForSocketAndConnect(this._socketPath);
    }

    _waitForSocketAndConnect(socketPath, attemptsLeft = 100) {
        const file = Gio.File.new_for_path(socketPath);

        if (file.query_exists(null)) {
            try {
                this._connectIpc(socketPath);

                // NOTE: 
                // It is important to read the output back, 
                // without this the socket stalls at some point
                this._startReadLoop();
            } catch (e) {
                error(`PlayerProcess: failed to connect IPC even though socket exists: ${e}`);
            }
            return;
        }

        if (attemptsLeft <= 0) {
            error('PlayerProcess: timed out waiting for mpv IPC socket to appear');
            return;
        }

        // Repeat the connection check every 50 ms
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
            this._waitForSocketAndConnect(socketPath, attemptsLeft - 1);
            return GLib.SOURCE_REMOVE;
        });
    }

    _sendCommand(...args) {
        let r = Math.round(Math.random() * 1000); // Just random value for debug
        const payload = JSON.stringify({ command: args, request_id: r }) + '\n';
        // We use queue to avoid race conditions
        this._writeQueue.push(payload);
        this._processWriteQueue();
    }

    _processWriteQueue() {
        if (this._writing || this._writeQueue.length === 0 || !this._ipcOutStream)
            return;

        this._writing = true;
        const payload = this._writeQueue.shift();
        print(`[ipc] sending @ ${Date.now()}: ${payload.trim()}`);

        this._ipcOutStream.write_bytes_async(
            new GLib.Bytes(payload),
            GLib.PRIORITY_DEFAULT,
            null,
            (stream, result) => {
                this._writing = false;

                try {
                    stream.write_bytes_finish(result);
                } catch (e) {
                    error(`PlayerProcess: IPC write failed: ${e}`);
                    this._reconnectIpc();
                    return;
                }

                this._processWriteQueue(); // send next queued command, if any
            }
        );
    }

    _reconnectIpc() {
        this._cleanupIpc()
        this._waitForSocketAndConnect(this._socketPath);
    }

    _startReadLoop() {
        const readNext = () => {
            if (!this._ipcInStream) return;

            this._ipcInStream.read_line_async(GLib.PRIORITY_DEFAULT, null, (stream, result) => {
                let line;
                try {
                    [line] = stream.read_line_finish_utf8(result);
                } catch (e) {
                    error(`[ipc] read error: ${e}`);
                    this._reconnectIpc();
                    return;
                }

                if (line === null) {
                    error('[ipc] connection closed by mpv (EOF)');
                    this._reconnectIpc();
                    return;
                }

                const data = JSON.parse(line);
                //TODO: Add a callback
                if (data.data && data.data.w && data.data.h) {
                    this.w = data.data.w;
                    this.h = data.data.h;
                }

                //NOTE: Once the file is loaded send command to pause it and retrieve video size
                if (data.event == "file-loaded") {
                    this._sendCommand('set_property', 'pause', 'yes');
                    this._sendCommand('get_property', 'video-params');
                }

                print(`[ipc] <- ${line}`);
                readNext(); // keep reading
            });
        };

        readNext();
    }

    _connectIpc(socketPath) {
        const address = new Gio.UnixSocketAddress({ path: socketPath });
        const client = new Gio.SocketClient();
        
        //TODO: Maybe rewrite to use async connection?
        this._ipcConnection = client.connect(address, null);
        this._ipcOutStream = this._ipcConnection.get_output_stream();
        this._ipcInStream = new Gio.DataInputStream({
            base_stream: this._ipcConnection.get_input_stream(),
        });
    }

    _cleanupIpc() {
        if (this._ipcConnection) {
            try { this._ipcConnection.close(null); } catch (_) {}
            this._ipcConnection = null;
            this._ipcOutStream = null;
            this._ipcInStream = null;
        }
    }

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
                this._sendCommand('set_property', 'volume', Math.round(value * 100));
            },
            onDone
        );
    }

    play() {
        this._sendCommand('set_property', 'pause', 'no');
        this._slideVolume(this._volume, 300);
    }

    pause() {
        this._slideVolume(0, 300, () => {
            this._sendCommand('set_property', 'pause', 'yes');
        });
    }

    waitForWindow(timeoutMs, callback, errback) {
        this._mapId = global.window_manager.connectObject('map', (_wm, windowActor) => {
            const win = windowActor.get_meta_window();
            if (win.get_pid() !== this._pid) return;

            this._window = win;
            callback?.(win);

            global.window_manager.disconnectObject(this);
            if (this._timeoutId !== null) {
                GLib.source_remove(this._timeoutId);
                this._timeoutId = null;
            }
        }, this);

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            global.window_manager.disconnectObject(this);
            this._timeoutId = null;
            errback?.(`timed out waiting for window`);
            return GLib.SOURCE_REMOVE;
        });
    }

    get pid() { return this._pid; }
    get window() { return this._window; }

    destroy() {
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
            this._window.kill(true);
            this._window = null;
        }
    }
}