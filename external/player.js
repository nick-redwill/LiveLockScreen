import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';

import Pipeline from "./pipeline.js";
import { ScalingMode } from "../enums.js";
import CommandHandler from "./command_handler.js";

export default class PlayerMulti {
    constructor({ 
        path, scalingMode, loop, volume, 
        useVideorate, framerate, colorAccurate=true 
    }) {
        this._path = path;
        this._scalingMode = scalingMode;
        this._loop = loop;
        this._volume = volume;
        this._useVideorate = useVideorate;
        this._framerate = framerate;
        this._colorAccurate = colorAccurate;

        this._pipeline = null;
        this._commands = null;
        this._app = null;
    }

    run() {
        this._app = new Gtk.Application({
            flags: Gio.ApplicationFlags.FLAGS_NONE
        });
        this._app.connect('activate', () => this._activate());

        try {
            this._app.run([]);
        } catch(e) {
            this._cleanup();
            throw e;
        }
    }

    _activate() {
        try {
            this._pipeline = new Pipeline({
                path: this._path,
                volume: this._volume,
                loop: this._loop,
                useVideorate: this._useVideorate,
                framerate: this._framerate,
                colorAccurate: this._colorAccurate,
            });
            this._pipeline.init();
            this._pipeline.preroll();

            this._initStyle();
            this._initWindows();
            this._initCommands();
        } catch(e) {
            logError(e, 'PlayerMulti: failed to activate');
            this._cleanup();
        }
    }

    _initStyle() {
        const css = new Gtk.CssProvider();
        css.load_from_string(`
        window {
            background: none;
            background-color: transparent;
        }
        picture {
            background: none;
            background-color: transparent;
        }
        * {
            background: none;
            transition: none;
            animation: none;
        }
        `);

        Gtk.StyleContext.add_provider_for_display(
            Gdk.Display.get_default(),
            css,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
        );
    }

    _initWindows() {
        let scaling;
        switch (this._scalingMode) {
            case ScalingMode.STRETCH: scaling = Gtk.ContentFit.FILL;    break;
            case ScalingMode.FIT:     scaling = Gtk.ContentFit.CONTAIN; break;
            case ScalingMode.COVER:   scaling = Gtk.ContentFit.COVER;   break;
            default:                  scaling = Gtk.ContentFit.FILL;
        }

        const paintable = this._pipeline.get_paintable();
        if (!paintable)
            throw new Error('Failed to get paintable from pipeline');

        const display = Gdk.Display.get_default();
        if (!display)
            throw new Error('Failed to get GDK display');

        const gdkMonitors = display.get_monitors();
        const monitorCount = gdkMonitors.get_n_items();

        if (monitorCount === 0)
            throw new Error('No monitors found');

        for (let i = 0; i < monitorCount; i++) {
            const gdkMonitor = gdkMonitors.get_item(i);
            const connector = gdkMonitor.get_connector();
            const geo = gdkMonitor?.get_geometry();

            const window = new Gtk.Window({
                application: this._app,
                title: `LLS-Player-${connector}`,
            });
            
            const picture = new Gtk.Picture({
                paintable,
                content_fit: scaling,
                can_shrink: true,
                hexpand: true,
                vexpand: true,
            });

            window.set_child(picture);
            window.set_decorated(false);

            try { window.set_modal(false); } catch (_) {}
            try { window.set_startup_id(''); } catch (_) {}
            try { window.set_can_target(false); } catch (_) {}
            try { window.set_focusable(false); } catch (_) {}

            if (geo) {
                window.set_default_size(geo.width, geo.height);
                window.set_size_request(geo.width, geo.height);
            }

            window.connect('realize', () => {
                window.get_surface()?.set_opaque_region(null);
            });
            window.present();
        }
    }

    _initCommands() {
        this._commands = new CommandHandler();
        this._commands.addHandler('play',  () => this._pipeline.play());
        this._commands.addHandler('pause', () => this._pipeline.pause());
        this._commands.addHandler('quit',  () => this._quit());
        this._commands.init();
    }

    _quit() {
        this._cleanup();
        this._app.quit();
    }

    _cleanup() {
        this._commands?.destroy();
        this._pipeline?.destroy();

        this._commands = null;
        this._pipeline = null;
    }
}