import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { logError } from '../utils/logging.js';

export class GstPlayerProcess {
    constructor({ 
        playerPath, videoPath, scalingMode, loop, volume, 
        useVideorate = false, framerate, colorAccurate = true
    }) {
        this._playerPath = playerPath;
        this._videoPath = videoPath;
        this._scalingMode = scalingMode;
        this._loop = loop;
        this._volume = volume;
        this._useVideorate = useVideorate;
        this._framerate = framerate;
        this._colorAccurate = colorAccurate;

        this._proc = null;
        this._pid = null;
        this._stdin = null;
        this._window = null;
        this._mapId = null;
        this._timeoutId = null;

        this.shouldResize = false;
        this.w = 0;
        this.h = 0;
    }

    async run() {
        this._proc = new Gio.Subprocess({
            argv: [
                'gjs', '-m',
                this._playerPath,
                this._videoPath,
                String(this._scalingMode),
                String(this._loop),
                String(this._volume),
                String(this._useVideorate),
                String(this._framerate),
                String(this._colorAccurate),
            ],
            flags: Gio.SubprocessFlags.STDIN_PIPE,
        });

        this._proc.init(null);

        this._pid = parseInt(this._proc.get_identifier());
        this._stdin = new Gio.DataOutputStream({
            base_stream: this._proc.get_stdin_pipe(),
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

                    //NOTE: 
                    // We delegate setting window to video size 
                    // to external player. So the window is guaranteed to be
                    // the target size
                    this.w = win.get_frame_rect().width;
                    this.h = win.get_frame_rect().height;

                    global.window_manager.disconnectObject(this);
                    this._cleanWinTimeout();
                },
                this
            );

            this._cleanWinTimeout();
            this._timeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                timeoutMs,
                () => {
                    global.window_manager.disconnectObject(this);
                    this._timeoutId = null;

                    reject(new Error('GstPlayerProcess: timed out waiting for window'));
                    return GLib.SOURCE_REMOVE;
                }
            );
        });
    }

    _cleanWinTimeout() {
        if (this._timeoutId !== null) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
    }

    play() {
        this._sendCommand('play');
    }

    pause() {
        this._sendCommand('pause');
    }

    _sendCommand(command) {
        if (!this._stdin) return;
        try {
            this._stdin.put_string(`${command}\n`, null);
        } catch (e) {
            logError(`failed to send command "${command}":`, e);
        }
    }

    get pid() { return this._pid; }
    get windows() { return this._windows; }

    destroy() {
        this._cleanWinTimeout();
        global.window_manager.disconnectObject(this);

        if (this._stdin) {
            try { this._stdin.close(null); } catch (_) {}
            this._stdin = null;
        }

        if (this._proc) {
            try { this._proc.send_signal(9); } catch (_) {} // SIGKILL
            this._proc = null;
            this._pid = null;
        }

        if (this._window) {
           this._window.kill();
           this._window = null;
        }
    }
}