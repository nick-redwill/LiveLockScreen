import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const MANUAL_FADE_TIME = 300; // mirrors screenShield.js

const UPowerIface = `<node>
<interface name="org.freedesktop.UPower">
    <property name="OnBattery" type="b" access="read"/>
</interface>
</node>`;

export class UnblankManager {
    constructor(extension) {
        this._settings = extension._settings;
        this._timerId = 0;
        this._lastOnBattery = null;
        this._upowerProxyChangedId = 0;

        this._originalActivateFade =
            Main.screenShield._activateFade.bind(Main.screenShield);

        const UPowerProxy = Gio.DBusProxy.makeProxyWrapper(UPowerIface);
        this._upowerProxy = new UPowerProxy(
            Gio.DBus.system,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            (proxy, error) => {
                if (error) {
                    console.error('UnblankManager: UPower proxy error:', error.message);
                    return;
                }
                this._lastOnBattery = this._upowerProxy.OnBattery;
                this._upowerProxyChangedId = this._upowerProxy.connect('g-properties-changed', () => {
                    const onBattery = this._upowerProxy.OnBattery;
                    if (onBattery === this._lastOnBattery)
                        return;
                    this._lastOnBattery = onBattery;
                    this._sync();
                });
                this._sync();
            }
        );

        this._settings.connectObject(
            'changed::enable-unblank', () => this._sync(),
            'changed::unblank-on-ac-only', () => this._sync(),
            this
        );

        this._sync();
    }

    _isUnblankMode() {
        const acOnly = this._settings.get_boolean('unblank-on-ac-only');
        return !(acOnly && this._upowerProxy?.OnBattery);
    }

    _sync() {
        this._cancelTimer();

        if (this._settings.get_boolean('enable-unblank') && this._isUnblankMode())
            Main.screenShield._activateFade = this._patchedActivateFade.bind(this);
        else
            this._restore();
    }

    // Only intercept the short lightbox triggered after manual lock.
    // The long lightbox (idle session fade) runs normally — gsd owns that path.
    _patchedActivateFade(lightbox, time) {
        if (lightbox !== Main.screenShield._shortLightbox || !Main.screenShield._isLocked) {
            this._originalActivateFade(lightbox, time);
            return;
        }

        // Register idle watch so user input resets the delay timer.
        // Mirrors what upstream _activateFade does, minus lightOn().
        if (Main.screenShield._becameActiveId === 0) {
            Main.screenShield._becameActiveId =
                Main.screenShield.idleMonitor.add_user_active_watch(
                    () => this._onUserActive()
                );
        }

        this._startTimer();
    }

    _onUserActive() {
        // Remove the watch — _startTimer will re-register it if needed
        Main.screenShield.idleMonitor.remove_watch(Main.screenShield._becameActiveId);
        Main.screenShield._becameActiveId = 0;

        if (Main.screenShield._isLocked) {
            Main.screenShield._longLightbox.lightOff();
            Main.screenShield._shortLightbox.lightOff();
        }

        // Re-arm: genuine user input resets the blank delay from the top
        this._startTimer();
    }

    _startTimer() {
        this._cancelTimer();

        const sessionSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.session' });
        const delay = sessionSettings.get_value('idle-delay').recursiveUnpack();
        if (delay === 0)
            return; // "never blank" — nothing to do

        // Re-register the watch so the next user interaction is caught
        if (Main.screenShield._becameActiveId === 0) {
            Main.screenShield._becameActiveId =
                Main.screenShield.idleMonitor.add_user_active_watch(
                    () => this._onUserActive()
                );
        }

        this._timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, () => {
            this._timerId = 0;
            // Hand off to upstream — let the original fade + gsd take over
            this._originalActivateFade(Main.screenShield._shortLightbox, MANUAL_FADE_TIME);
            return GLib.SOURCE_REMOVE;
        });
    }

    _cancelTimer() {
        if (this._timerId > 0) {
            GLib.source_remove(this._timerId);
            this._timerId = 0;
        }
    }

    _restore() {
        Main.screenShield._activateFade = this._originalActivateFade;
    }

    destroy() {
        this._settings.disconnectObject(this);
        this._cancelTimer();
        this._restore();

        if (this._upowerProxy && this._upowerProxyChangedId) {
            this._upowerProxy.disconnect(this._upowerProxyChangedId);
            this._upowerProxyChangedId = 0;
        }

        if (Main.screenShield._becameActiveId !== 0) {
            Main.screenShield.idleMonitor.remove_watch(Main.screenShield._becameActiveId);
            Main.screenShield._becameActiveId = 0;
        }

        this._upowerProxy = null;
    }
}
