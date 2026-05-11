import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import { Keys } from '../enums.js';

export var DebugPage = GObject.registerClass(
class LLSDebugPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: 'Debug',
            icon_name: 'preferences-other-symbolic',
            name: 'DebugPage',
        });

        this._settings = settings;

        const group = new Adw.PreferencesGroup();
        group.add(this._buildDisableColorRow());
        group.add(this._buildForceFullscreenRow());
        group.add(this._buildForceGifRow());
        this.add(group);
    }

    _buildDisableColorRow() {
        const row = new Adw.SwitchRow({
            title: 'Disable color conversion',
            subtitle: 'Enabling this might improve performance but will cause color inaccuracy',
        });

        row.active = !this._settings.get_boolean(Keys.DEBUG_USE_COLOR_ACCURATE);
        row.connect('notify::active', r => {
            this._settings.set_boolean(Keys.DEBUG_USE_COLOR_ACCURATE, !r.active);
        });

        return row;
    }

    _buildForceFullscreenRow() {
        const row = new Adw.SwitchRow({
            title: 'Force fullscreen',
            subtitle: 'Enable this if you experience video positioning issues',
        });

        this._settings.bind(Keys.DEBUG_FORCE_FULLSCREEN, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildForceGifRow() {
        const row = new Adw.SwitchRow({
            title: 'Force GIF support',
            subtitle: 'Enable this for experimental GIF support on older gnome versions (unreliable)',
        });

        this._settings.bind(Keys.DEBUG_FORCE_GIF_SUPPORT, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
});