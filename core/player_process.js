import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { error } from '../utils/logging.js';

export class PlayerProcess {
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
        this._windows = [];
        this._mapId = null;
        this._timeoutId = null;
    }

    run() {
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

    waitForWindows(count, timeoutMs, callback, errback) {
        const collected = [];

        this._mapId = global.window_manager.connectObject('map', (_wm, windowActor) => {
            const win = windowActor.get_meta_window();
            if (win.get_pid() !== this._pid) return;

            collected.push(win);

            if (collected.length === count) {
                global.window_manager.disconnectObject(this);
                if (this._timeoutId !== null) {
                    GLib.source_remove(this._timeoutId);
                    this._timeoutId = null;
                }

                callback(collected);
            }
        }, this);

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeoutMs, () => {
            global.window_manager.disconnectObject(this);
            this._timeoutId = null;
            errback?.(`timed out waiting for windows (got ${collected.length}/${count})`);
            return GLib.SOURCE_REMOVE;
        });
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
            error(`failed to send command "${command}":`, e);
        }
    }

    get pid() { return this._pid; }
    get windows() { return this._windows; }

    destroy() {
        if (this._timeoutId !== null) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

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

        this._windows = [];
    }
}