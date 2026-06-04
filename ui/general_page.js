import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { Keys } from '../enums.js';
import { getShellVersion } from "../utils/shell_version_dbus.js";
import { error } from '../utils/logging.js';

export var GeneralPage = GObject.registerClass(
class LLSGeneralPage extends Adw.PreferencesPage {
    _init(settings) {
        this._shellVersion = getShellVersion();

        super._init({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
            name: 'GeneralPage',
        });

        this._settings = settings;
        this._forceGif = settings.get_boolean(Keys.DEBUG_FORCE_GIF_SUPPORT, false);

        const group = new Adw.PreferencesGroup();
        group.add(this._buildPathRow());

        //NOTE: Maybe delete?
        this._warningLabel = new Gtk.Label({
            label: '⚠️ GIF wallpapers are not supported on GNOME 47 and earlier (you can force enable it in debug section)',
            halign: Gtk.Align.FILL,
            wrap: true,
            margin_top: 10,
        });
        this._warningLabel.add_css_class('caption');
        this._warningLabel.add_css_class('warning');
        group.add(this._warningLabel);

        this._updateWarningVisibility();
        this._settings.connect(`changed::${Keys.DEBUG_FORCE_GIF_SUPPORT}`, () => {
            this._updateWarningVisibility();
        });

        group.add(this._buildScalingRow());
        group.add(this._buildVolumeRow());
        group.add(this._buildLoopRow());
        group.add(this._buildBatteryRow());
        this.add(group);
    }

    _updateWarningVisibility() {
        this._forceGif = this._settings.get_boolean(Keys.DEBUG_FORCE_GIF_SUPPORT);
        this._warningLabel.visible = this._shellVersion < 48 && !this._forceGif;
    }

    _buildScalingRow() {
        const row = new Adw.ComboRow({
            title: 'Scaling mode',
            subtitle: 'How the video is scaled to fit the screen',
            model: new Gtk.StringList({
                strings: ['Stretch', 'Fit', 'Cover'],
            }),
        });

        row.set_selected(this._settings.get_int(Keys.SCALING_MODE));
        row.connect('notify::selected', r => {
            this._settings.set_int(Keys.SCALING_MODE, r.selected);
        });

        return row;
    }

    _buildVolumeRow() {
        const row = new Adw.SpinRow({
            title: 'Volume',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: this._settings.get_int(Keys.AUDIO_VOLUME),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        row.connect('notify::value', r => {
            this._settings.set_int(Keys.AUDIO_VOLUME, r.get_value());
        });

        return row;
    }

    _buildLoopRow() {
        const row = new Adw.SwitchRow({ title: 'Loop video' });
        this._settings.bind(Keys.LOOPED, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildBatteryRow() {
        const row = new Adw.SwitchRow({ title: 'Disable on battery' });
        this._settings.bind(Keys.DISABLE_ON_BATTERY, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildPathRow() {
        const path = this._settings.get_string(Keys.VIDEO_PATH);

        const row = new Adw.ActionRow({
            title: 'File',
            subtitle: path !== '' ? path : 'None',
        });

        const button = new Adw.ButtonContent({
            icon_name: 'document-open-symbolic',
            label: 'Browse',
        });

        row.activatable_widget = button;
        row.add_suffix(button);
        row.connect('activated', () => this._openFileDialog(row));

        return row;
    }

    _openFileDialog(row) {
        const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });

        if (this._shellVersion < 48 && !this._forceGif) {
            const allFilter = new Gtk.FileFilter();
            allFilter.set_name('Video files');
            allFilter.add_mime_type('video/*');
            filters.append(allFilter);
        } else {
            const allFilter = new Gtk.FileFilter();
            allFilter.set_name('Video and GIF files');
            allFilter.add_mime_type('video/*');
            allFilter.add_mime_type('image/gif');

            // Separate filters so the user can narrow down if needed.
            const videoFilter = new Gtk.FileFilter();
            videoFilter.set_name('Video files');
            videoFilter.add_mime_type('video/*');

            const gifFilter = new Gtk.FileFilter();
            gifFilter.set_name('GIF images');
            gifFilter.add_mime_type('image/gif');

            filters.append(allFilter);
            filters.append(videoFilter);
            filters.append(gifFilter);
        }

        const dialog = new Gtk.FileDialog({ title: 'Select Video or GIF File' });
        dialog.set_filters(filters);

        const videoPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (videoPath) {
            const file = Gio.File.new_for_path(videoPath);
            const parent = file.get_parent();
            if (parent)
                dialog.set_initial_folder(parent);
        }

        const window = row.get_root();
        dialog.open(window, null, (d, result) => {
            try {
                const file = d.open_finish(result);
                if (file) {
                    row.subtitle = file.get_path();
                    this._settings.set_string(Keys.VIDEO_PATH, file.get_path());
                } else {
                    row.subtitle = 'None';
                    this._settings.set_string(Keys.VIDEO_PATH, '');
                }
            } catch (e) {
                error(`Error selecting file: ${e}`);
            }
        });
    }
});