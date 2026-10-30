import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { Keys } from '../enums.js';
import { logError } from '../utils/logging.js';
import { listMediaFiles } from '../utils/media_files.js';

function isDismissed(error) {
    return error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED);
}

export var GeneralPage = GObject.registerClass(
class LLSGeneralPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: 'General',
            icon_name: 'preferences-system-symbolic',
            name: 'GeneralPage',
        });

        this._settings = settings;

        this.add(this._buildVideoGroup());
        this.add(this._buildPlaylistGroup());
        this.add(this._buildEventsGroup());
        this.add(this._buildPerformanceGroup());
        this.add(this._buildAdvancedGroup());
    }

    _buildVideoGroup() {
        const group = new Adw.PreferencesGroup();

        this._sourceRow = this._buildSourceRow();
        group.add(this._sourceRow);
        group.add(this._buildStaticImageRow());
        group.add(this._buildScalingRow());
        group.add(this._buildVolumeRow());
        group.add(this._buildMprisRow());
        return group;
    }

    _buildStaticImageRow() {
        const row = new Adw.ExpanderRow({
            title: 'Static images',
            subtitle: 'Also show static images from the source',
            show_enable_switch: true,
        });
        this._settings.bind(Keys.STATIC_IMAGE_ENABLED, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);
        row.connect('notify::enable-expansion', () => {
            if (this._sourceRow)
                this._updateSourceRow(this._sourceRow);
        });

        row.add_row(this._buildPhotoDurationRow());
        return row;
    }

    _buildPhotoDurationRow() {
        const row = new Adw.SpinRow({
            title: 'Image duration',
            subtitle: 'How long each static image stays on screen',
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

    _buildPlaylistGroup() {
        const group = new Adw.PreferencesGroup({
            title: 'Playlist',
            description: 'Only used when a folder is selected',
        });
        group.add(this._buildPlaylistOrderRow());
        group.add(this._buildPlaylistStartRow());
        return group;
    }

    _buildEventsGroup() {
        const group = new Adw.PreferencesGroup({
            title: 'Events',
        });
        group.add(this._buildActionOnEndRow());
        group.add(this._buildActionOnBlankRow());
        group.add(this._buildBatteryRow());
        group.add(this._buildFootnote(
            'To keep the screen from blanking use the ' +
            '<a href="https://extensions.gnome.org/extension/1414/unblank/">' +
            'Unblank lock screen</a> extension.',
            { markup: true }
        ));
        return group;
    }

    _buildPerformanceGroup() {
        const group = new Adw.PreferencesGroup({ title: 'Performance' });
        group.add(this._buildMpvProfileRow());

        const changeFramerateRow = this._buildChangeFramerateRow();
        const fpsRow = this._buildFpsRow();
        group.add(changeFramerateRow);
        group.add(fpsRow);

        const toggleFpsRow = () => fpsRow.set_visible(changeFramerateRow.active);
        toggleFpsRow();
        changeFramerateRow.connect('notify::active', toggleFpsRow);

        group.add(this._buildFootnote(
            'Efficient is still experimental and may cause issues ' +
            'on some systems. Switch to Balanced if the background ' +
            'does not show up or looks wrong.'
        ));
        return group;
    }

    _buildAdvancedGroup() {
        const group = new Adw.PreferencesGroup({ title: 'Advanced' });
        group.add(this._buildMpvCustomArgsRow());
        group.add(this._buildFootnote(
            'Incorrect parameters can break the extension. ' +
            'If the background stops showing up, clear this field.'
        ));
        return group;
    }

    /**
     * Small dimmed text under the rows of a group
     * @param {string} text
     * @param {object} [options]
     * @param {boolean} [options.markup] - Text contains Pango markup (e.g. links)
     */
    _buildFootnote(text, { markup = false } = {}) {
        return new Gtk.Label({
            label: text,
            use_markup: markup,
            css_classes: ['dim-label', 'caption'],
            wrap: true,
            xalign: 0,
            margin_top: 6,
            margin_start: 12,
            margin_end: 12,
        });
    }

    _buildChangeFramerateRow() {
        const row = new Adw.SwitchRow({
            title: 'Change framerate',
        });
        this._settings.bind(Keys.USE_VIDEORATE, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildFpsRow() {
        const row = new Adw.SpinRow({
            title: 'Framerate',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 120,
                step_increment: 1,
                value: this._settings.get_int(Keys.FRAMERATE),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: 'fps',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        row.connect('notify::value', r => {
            this._settings.set_int(Keys.FRAMERATE, r.get_value());
        });

        return row;
    }

    _buildPlaylistOrderRow() {
        // Order matches PlaylistOrder
        const row = new Adw.ComboRow({
            title: 'Order',
            model: Gtk.StringList.new(['Sequential', 'Shuffle', 'Random']),
        });
        this._settings.bind(Keys.PLAYLIST_ORDER, row, 'selected', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildPlaylistStartRow() {
        // Order matches PlaylistStart
        const row = new Adw.ComboRow({
            title: 'Start with',
            model: Gtk.StringList.new(['First', 'Random', 'Last played']),
        });
        this._settings.bind(Keys.PLAYLIST_START, row, 'selected', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildMpvProfileRow() {
        // Order matches MpvProfile
        const row = new Adw.ComboRow({
            title: 'Playback profile',
            subtitle: 'Balanced and Efficient use less GPU at the cost of image quality',
            model: Gtk.StringList.new(['Quality', 'Balanced', 'Efficient']),
        });
        this._settings.bind(Keys.MPV_PROFILE, row, 'selected', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildMpvCustomArgsRow() {
        const toText = () => this._settings.get_strv(Keys.MPV_CUSTOM_ARGS)
            .map(arg => GLib.shell_quote(arg))
            .join(' ');

        const row = new Adw.EntryRow({
            title: 'Custom MPV arguments (e.g. --deband=yes)',
            text: toText(),
            show_apply_button: true,
        });

        // Split like a shell would, so quoted values with spaces stay one argument
        row.connect('apply', r => {
            const text = r.get_text().trim();
            try {
                const args = text ? GLib.shell_parse_argv(text)[1] : [];
                this._settings.set_strv(Keys.MPV_CUSTOM_ARGS, args);
                r.remove_css_class('error');
            } catch (e) {
                r.add_css_class('error');
                logError(`Invalid custom MPV arguments: ${e.message}`);
            }
        });

        return row;
    }

    _buildScalingRow() {
        // Order matches ScalingMode
        const row = new Adw.ComboRow({
            title: 'Scaling mode',
            subtitle: 'How the background is scaled to fit the screen',
            model: Gtk.StringList.new(['Stretch', 'Fit', 'Cover']),
        });
        this._settings.bind(Keys.SCALING_MODE, row, 'selected', Gio.SettingsBindFlags.DEFAULT);
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

    _buildActionOnEndRow() {
        const row = new Adw.ComboRow({
            title: 'On playback end',
            subtitle: 'What to do when the file finishes playing',
            model: Gtk.StringList.new(['Loop', 'Pause', 'Next file']),
        });
        this._settings.bind(Keys.ACTION_ON_END, row, 'selected', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildBatteryRow() {
        const row = new Adw.SwitchRow({ title: 'Pause on battery' });
        this._settings.bind(Keys.PAUSE_ON_BATTERY, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildMprisRow() {
        const row = new Adw.SwitchRow({
            title: 'Media controls',
            subtitle: 'Control playback with media keys and other MPRIS clients',
        });
        this._settings.bind(Keys.MPRIS_ENABLED, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildActionOnBlankRow() {
        const row = new Adw.ComboRow({
            title: 'Action on blank',
            subtitle: 'What to do when the screen goes black',
            model: Gtk.StringList.new(['Ignore', 'Pause', 'Restart', 'Next file']),
        });
        this._settings.bind(Keys.ACTION_ON_BLANK, row, 'selected', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildSourceRow() {
        const row = new Adw.ActionRow({ title: 'Source' });
        row.set_use_markup(false);

        // Number of playable files, only shown for folders
        this._sourceCountLabel = new Gtk.Label({
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        row.add_suffix(this._sourceCountLabel);

        const fileButton = new Gtk.Button({
            label: 'Choose File',
            valign: Gtk.Align.CENTER,
        });
        fileButton.connect('clicked', () => this._openFileDialog(row));

        const folderButton = new Gtk.Button({
            label: 'Choose Folder',
            valign: Gtk.Align.CENTER,
        });
        folderButton.connect('clicked', () => this._openFolderDialog(row));

        row.add_suffix(fileButton);
        row.add_suffix(folderButton);

        this._updateSourceRow(row);
        return row;
    }

    /**
     * Shows the saved path, and for folders the number of playable files.
     * A folder without any is marked as an error
     */
    _updateSourceRow(row) {
        const path = this._settings.get_string(Keys.VIDEO_PATH);

        const isFolder = path !== '' && Gio.File.new_for_path(path)
            .query_file_type(Gio.FileQueryInfoFlags.NONE, null) === Gio.FileType.DIRECTORY;

        // Trailing slash only in the UI, so folders are easy to tell apart from files
        if (path === '')
            row.subtitle = 'None';
        else if (isFolder && !path.endsWith('/'))
            row.subtitle = `${path}/`;
        else
            row.subtitle = path;

        const count = isFolder ? listMediaFiles(
            path, this._settings.get_boolean(Keys.STATIC_IMAGE_ENABLED)
        ).length : 0;
        this._sourceCountLabel.visible = isFolder;
        this._sourceCountLabel.label = count === 1 ? '1 file' : `${count} files`;

        if (isFolder && count === 0)
            row.add_css_class('error');
        else
            row.remove_css_class('error');
    }

    _openFolderDialog(row) {
        const dialog = new Gtk.FileDialog({ title: 'Select Folder' });

        const videoPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (videoPath) {
            const file = Gio.File.new_for_path(videoPath);
            const isFolder = file.query_file_type(
                Gio.FileQueryInfoFlags.NONE, null
            ) === Gio.FileType.DIRECTORY;

            // A selected folder opens itself, a selected file opens the folder it is in
            const initialFolder = isFolder ? file : file.get_parent();
            if (initialFolder)
                dialog.set_initial_folder(initialFolder);
        }

        const window = row.get_root();
        dialog.select_folder(window, null, (d, result) => {
            try {
                const folder = d.select_folder_finish(result);
                this._settings.set_string(Keys.VIDEO_PATH, folder?.get_path() ?? '');
                this._updateSourceRow(row);
            } catch (e) {
                if (!isDismissed(e))
                    logError(`Error selecting folder: ${e}`);
            }
        });
    }

    _openFileDialog(row) {
        const includeImages = this._settings.get_boolean(Keys.STATIC_IMAGE_ENABLED);
        const filters = new Gio.ListStore({ item_type: Gtk.FileFilter });

        const allFilter = new Gtk.FileFilter();
        allFilter.set_name(includeImages ? 'Video, GIF and image files' : 'Video and GIF files');
        allFilter.add_mime_type('video/*');
        allFilter.add_mime_type(includeImages ? 'image/*' : 'image/gif');

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

        if (includeImages) {
            const imageFilter = new Gtk.FileFilter();
            imageFilter.set_name('Images');
            imageFilter.add_mime_type('image/*');
            filters.append(imageFilter);
        }

        const dialog = new Gtk.FileDialog({
            title: includeImages ? 'Select Video, GIF or Image File' : 'Select Video or GIF File',
        });
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
                this._settings.set_string(Keys.VIDEO_PATH, file?.get_path() ?? '');
                this._updateSourceRow(row);
            } catch (e) {
                if (!isDismissed(e))
                    logError(`Error selecting file: ${e}`);
            }
        });
    }
});