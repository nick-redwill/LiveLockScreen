import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { Keys } from '../enums.js';
import { logError } from '../utils/logging.js';

export var GeneralPage = GObject.registerClass(
class LLSGeneralPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
            name: 'GeneralPage',
        });

        this._settings = settings;
        this._forceGif = settings.get_boolean(Keys.DEBUG_FORCE_GIF_SUPPORT, false);

        this.add(this._buildBackendNoticeGroup());

        const group = new Adw.PreferencesGroup();
        group.add(this._buildPathRow());
        group.add(this._buildPhotoDurationRow());
        group.add(this._buildScalingRow());
        group.add(this._buildLoopRow());
        group.add(this._buildBatteryRow());
        this.add(group);
    }

    _buildBackendNoticeGroup() {
        const group = new Adw.PreferencesGroup();

        const row = new Adw.ActionRow({
            title: 'GStreamer playback is being retired',
            subtitle:
                `Install MPV for better reliability and continued support.\n\n` +
                `If you run into issues with MPV, please report them. ` +
                `You can force GStreamer playback in debug settings in the meantime.\n\n` +
                `More info in README.md.`,
            icon_name: 'dialog-warning-symbolic',
        });
        row.add_css_class('warning');

        group.add(row);
        return group;
    }

    _buildScalingRow() {
        const row = new Adw.ComboRow({
            title: 'Scaling mode',
            subtitle: 'How the image is scaled to fit the screen',
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

    _buildPhotoDurationRow() {
        const row = new Adw.SpinRow({
            title: 'Photo duration',
            subtitle: 'How long each photo stays on screen',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 3600,
                step_increment: 1,
                value: this._settings.get_int(Keys.PHOTO_DURATION),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: 's',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        row.connect('notify::value', r => {
            this._settings.set_int(Keys.PHOTO_DURATION, r.get_value());
        });

        return row;
    }

    _buildLoopRow() {
        const row = new Adw.SwitchRow({ title: 'Loop media' });
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
            title: 'Image folder',
            subtitle: path !== '' ? path : 'None',
        });

        const button = new Adw.ButtonContent({
            icon_name: 'document-open-symbolic',
            label: 'Browse',
        });

        row.activatable_widget = button;
        row.add_suffix(button);
        row.connect('activated', () => this._openFolderDialog(row));

        return row;
    }

    _openFolderDialog(row) {
        const dialog = new Gtk.FileDialog({ title: 'Select Image Folder' });

        const selectedPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (selectedPath) {
            const file = Gio.File.new_for_path(selectedPath);
            const type = file.query_file_type(Gio.FileQueryInfoFlags.NONE, null);
            if (type === Gio.FileType.DIRECTORY)
                dialog.set_initial_folder(file);
            else {
                const parent = file.get_parent();
                if (parent)
                    dialog.set_initial_folder(parent);
            }
        }

        const window = row.get_root();
        dialog.select_folder(window, null, (d, result) => {
            try {
                const folder = d.select_folder_finish(result);
                if (folder) {
                    row.subtitle = folder.get_path();
                    this._settings.set_string(Keys.VIDEO_PATH, folder.get_path());
                } else {
                    row.subtitle = 'None';
                    this._settings.set_string(Keys.VIDEO_PATH, '');
                }
            } catch (e) {
                logError(`Error selecting folder: ${e}`);
            }
        });
    }
});