import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { Keys, SourceMode } from '../enums.js';
import { listVideos } from '../utils/video_picker.js';
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
        group.add(this._buildSourceModeRow());
        this._pathRow = this._buildPathRow();
        this._folderRow = this._buildFolderRow();
        this._recursiveRow = this._buildRecursiveRow();
        this._avoidRepeatRow = this._buildAvoidRepeatRow();
        group.add(this._pathRow);
        group.add(this._folderRow);
        group.add(this._recursiveRow);
        group.add(this._avoidRepeatRow);
        this._updateSourceVisibility();
        group.add(this._buildScalingRow());
        group.add(this._buildVolumeRow());
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

    _buildSourceModeRow() {
        const row = new Adw.ComboRow({
            title: 'Video source',
            subtitle: 'Play one fixed video, or pick one from a folder on every lock',
            model: new Gtk.StringList({
                strings: ['Single file', 'Random from folder', 'Sequential from folder'],
            }),
        });

        row.set_selected(this._settings.get_int(Keys.SOURCE_MODE));
        row.connect('notify::selected', r => {
            this._settings.set_int(Keys.SOURCE_MODE, r.selected);
            this._updateSourceVisibility();
        });

        return row;
    }

    _updateSourceVisibility() {
        const mode = this._settings.get_int(Keys.SOURCE_MODE);
        const folderMode = mode !== SourceMode.SINGLE;

        this._pathRow.visible = !folderMode;
        this._folderRow.visible = folderMode;
        this._recursiveRow.visible = folderMode;
        this._avoidRepeatRow.visible = mode === SourceMode.RANDOM;
    }

    _buildFolderRow() {
        const row = new Adw.ActionRow({ title: 'Folder' });
        row.set_use_markup(false);
        this._refreshFolderSubtitle(row);

        const button = new Adw.ButtonContent({
            icon_name: 'folder-open-symbolic',
            label: 'Browse',
        });

        row.activatable_widget = button;
        row.add_suffix(button);
        row.connect('activated', () => this._openFolderDialog(row));

        return row;
    }

    _buildRecursiveRow() {
        const row = new Adw.SwitchRow({
            title: 'Include sub-folders',
            subtitle: 'Scan up to 3 levels deep',
        });
        this._settings.bind(Keys.FOLDER_RECURSIVE, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        this._settings.connect(`changed::${Keys.FOLDER_RECURSIVE}`, () => {
            this._refreshFolderSubtitle(this._folderRow);
        });
        return row;
    }

    _buildAvoidRepeatRow() {
        const row = new Adw.SwitchRow({
            title: 'Avoid repeating the last video',
            subtitle: 'Never pick the same video twice in a row',
        });
        this._settings.bind(Keys.AVOID_REPEAT, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _refreshFolderSubtitle(row) {
        const folder = this._settings.get_string(Keys.FOLDER_PATH);
        if (!folder) {
            row.subtitle = 'None';
            return;
        }

        const count = listVideos(
            folder, this._settings.get_boolean(Keys.FOLDER_RECURSIVE)
        ).length;
        row.subtitle = `${folder}\n${count} video${count === 1 ? '' : 's'} found`;
    }

    _openFolderDialog(row) {
        const dialog = new Gtk.FileDialog({ title: 'Select Video Folder' });

        const current = this._settings.get_string(Keys.FOLDER_PATH);
        if (current)
            dialog.set_initial_folder(Gio.File.new_for_path(current));

        dialog.select_folder(row.get_root(), null, (d, result) => {
            try {
                const folder = d.select_folder_finish(result);
                if (folder) {
                    this._settings.set_string(Keys.FOLDER_PATH, folder.get_path());
                    this._refreshFolderSubtitle(row);
                }
            } catch (e) {
                // Dismissing the dialog throws; only log real errors
                if (!e.matches?.(Gtk.DialogError, Gtk.DialogError.DISMISSED))
                    logError(`Error selecting folder: ${e}`);
            }
        });
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
        row.set_use_markup(false);

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
                logError(`Error selecting file: ${e}`);
            }
        });
    }
});