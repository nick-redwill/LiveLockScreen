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
        this._window = null;
        this._mapId = null;
        this._timeoutId = null;
    }

    run() {
        this._proc = Gio.Subprocess.new(
            [
                'mpv', 
                '--input-ipc-server=/tmp/mpv.sock', 
                this._videoPath,
                '--loop',
                '--hwdec=auto',
            ],
            Gio.SubprocessFlags.NO_FLAGS
        );
        this._pid = parseInt(this._proc.get_identifier());
    }

    waitForWindow(timeoutMs, callback, errback) {
        const collected = [];

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

    play() {
        this._sendCommand('play');
    }

    pause() {
        this._sendCommand('pause');
    }

    _sendCommand(command) {
        /* TODO: Implement */
    }

    get pid() { return this._pid; }
    get window() { return this._window; }

    destroy() {
        if (this._timeoutId !== null) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }

        global.window_manager.disconnectObject(this);

        if (this._proc) {
            this._proc.send_signal(9); // SIGKILL
            this._proc = null;
            this._pid = null;
        }
        
        //NOTE: 
        // proc.send_signal sometimes doesnt do the job
        // thats why we use window.kill too
        this._window.kill(true);
        this._window = null;
    }
}