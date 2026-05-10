import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';
import { isGtk4PaintableSinkAvailable } from './utils/check_dependencies.js';
import { Keys } from "./enums.js";


//TODO: Split into separate classes
export default class LiveLockscreenExtensionPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        window._settings = this.getSettings();
        window.set_default_size(600, 700);

        let page = new Adw.PreferencesPage();
        if (!isGtk4PaintableSinkAvailable()) {
            page.add(this._buildDependencyErrorGroup());
        }

        page.add(this._buildGeneralGroup(window))
        page.add(this._buildAppearanceGroup(window))
        page.add(this._buildPromptGroup(window))
        page.add(this._buildDebugGroup(window))

        window.add(page);
    }

    _buildDependencyErrorGroup() {
        const group = new Adw.PreferencesGroup();

        const row = new Adw.ActionRow({
            title: 'Missing dependency',
            subtitle: 
                `gtk4paintablesink is not available.\n\n` +
                `Install the GStreamer GTK4 plugin for your distribution:\n` +
                `  • Fedora/RHEL: gstreamer1-plugin-gtk4\n` +
                `  • Ubuntu/Debian: gstreamer1.0-gtk4\n` +
                `  • Arch: gst-plugin-gtk4\n\n` +
                `See README.md for more information.`,
            icon_name: 'dialog-error-symbolic',
        });
        row.add_css_class('error');

        group.add(row);
        return group;
    }

    _buildGeneralGroup(window) {
        let generalGroup = new Adw.PreferencesGroup({
            title: 'General',
        });

        generalGroup.add(this._buildPathRow(window));

        const scalingRow = new Adw.ComboRow({
            title: 'Scaling mode',
            subtitle: 'How the video is scaled to fit the screen',
            model: new Gtk.StringList({
                strings: ['Stretch', 'Fit', 'Cover']
            }),
        });

        scalingRow.set_selected(window._settings.get_int(Keys.SCALING_MODE));
        scalingRow.connect('notify::selected', row => {
            window._settings.set_int(Keys.SCALING_MODE, row.selected);
        });
        generalGroup.add(scalingRow)

        let volumeRow = new Adw.SpinRow({
            title: 'Volume',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: window._settings.get_int(Keys.AUDIO_VOLUME),
            }),
        });
        let volumeSuffix = new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        volumeRow.add_suffix(volumeSuffix);
        volumeRow.connect('notify::value', row => {
            window._settings.set_int(Keys.AUDIO_VOLUME, row.get_value());
        });
        generalGroup.add(volumeRow);

        const loopSwitch = new Adw.SwitchRow({
            title: 'Loop video',
        });
        window._settings.bind(
            Keys.LOOPED, loopSwitch, 
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        generalGroup.add(loopSwitch);

        const batteryRow = new Adw.SwitchRow({
            title: 'Disable on battery',
        });
        window._settings.bind(
            Keys.DISABLE_ON_BATTERY, batteryRow,
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        generalGroup.add(batteryRow);

        return generalGroup;
    }

    _buildAppearanceGroup(window) {
        let appearanceGroup = new Adw.PreferencesGroup({
            title: 'Appearance',
        });

        let changeFramerateRow = new Adw.SwitchRow({
            title: 'Change framerate',
            subtitle: 'This may cause artifacts and performance issues due to conversion overhead',
        });
        window._settings.bind(
            Keys.USE_VIDEORATE, changeFramerateRow,
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        appearanceGroup.add(changeFramerateRow);

        let fpsRow = new Adw.SpinRow({
            title: 'Framerate',
            adjustment: new Gtk.Adjustment({
                lower: 1,
                upper: 120,
                step_increment: 1,
                value: window._settings.get_int(Keys.FRAMERATE),
            }),
        });
        fpsRow.connect('notify::value', row => {
            window._settings.set_int(Keys.FRAMERATE, row.get_value());
        });
        let fpsSuffix = new Gtk.Label({
            label: 'fps',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        fpsRow.add_suffix(fpsSuffix);
        appearanceGroup.add(fpsRow);

        const toggleFpsRow = () => {
            fpsRow.set_visible(changeFramerateRow.active);
        };
        toggleFpsRow();
        changeFramerateRow.connect('notify::active', toggleFpsRow);

        let fadeInRow = new Adw.SpinRow({
            title: 'Fade in',
            subtitle: 'Video fade-in animation duration',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 600 * 1000,
                step_increment: 100,
                value: window._settings.get_int(Keys.FADE_IN_DURATION),
            }),
        });
        let fadeSuffix = new Gtk.Label({
            label: 'ms',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        fadeInRow.add_suffix(fadeSuffix);
        fadeInRow.connect('notify::value', row => {
            window._settings.set_int(Keys.FADE_IN_DURATION, row.get_value());
        });
        appearanceGroup.add(fadeInRow);

        let blurRadiusRow = new Adw.SpinRow({
            title: 'Blur radius',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: window._settings.get_int(Keys.BLUR_RADIUS),
            }),
        });
        let radiusSuffix = new Gtk.Label({
            label: 'px',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        blurRadiusRow.add_suffix(radiusSuffix);
        appearanceGroup.add(blurRadiusRow);

        let blurBrightnessRow = new Adw.SpinRow({
            title: 'Blur brightness',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: window._settings.get_double(Keys.BLUR_BRIGHTNESS) * 100,
            }),
        });
        let brightnessSuffix = new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        blurBrightnessRow.add_suffix(brightnessSuffix);
        appearanceGroup.add(blurBrightnessRow);

        const toggleBrightnessSpin = () => {
            blurBrightnessRow.set_sensitive(blurRadiusRow.get_value() !== 0);
        };
        toggleBrightnessSpin();

        blurRadiusRow.connect('notify::value', row => {
            window._settings.set_int(Keys.BLUR_RADIUS, row.get_value());
            toggleBrightnessSpin();
        });
        blurBrightnessRow.connect('notify::value', row => {
            window._settings.set_double(Keys.BLUR_BRIGHTNESS, row.get_value() / 100);
        });

        return appearanceGroup;
    }

    _buildPromptGroup(window) {
        let promptGroup = new Adw.PreferencesGroup({
            title: 'Password Prompt',
            description: 'Customize behavior when password prompt appears',
        });

        const pauseSwitch = new Adw.SwitchRow({
            title: 'Pause video'
        });
        window._settings.bind(
            Keys.PROMPT_PAUSE, pauseSwitch,
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        promptGroup.add(pauseSwitch);

        const grayscaleSwitch = new Adw.SwitchRow({
            title: 'Grayscale video'
        });
        window._settings.bind(
            Keys.PROMPT_GRAYSCALE, grayscaleSwitch,
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        promptGroup.add(grayscaleSwitch);

        const changeBlurSwitch = new Adw.SwitchRow({
            title: 'Change blur'
        });
        window._settings.bind(
            Keys.PROMPT_CHANGE_BLUR, changeBlurSwitch,
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        promptGroup.add(changeBlurSwitch);

        const blurRadiusRow = new Adw.SpinRow({
            title: 'Blur radius',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: window._settings.get_int(Keys.PROMPT_BLUR_RADIUS),
            }),
        });
        let radiusSuffix = new Gtk.Label({
            label: 'px',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        blurRadiusRow.add_suffix(radiusSuffix);

        window._settings.bind(
            Keys.PROMPT_BLUR_RADIUS, blurRadiusRow,
            'value', Gio.SettingsBindFlags.DEFAULT
        );
        promptGroup.add(blurRadiusRow);

        const blurBrightnessRow = new Adw.SpinRow({
            title: 'Blur brightness',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: window._settings.get_double(Keys.PROMPT_BLUR_BRIGHTNESS) * 100,
            }),
        });
        blurBrightnessRow.connect('notify::value', row => {
            window._settings.set_double(Keys.PROMPT_BLUR_BRIGHTNESS, row.get_value() / 100);
        });
        let suffix = new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        blurBrightnessRow.add_suffix(suffix);
        promptGroup.add(blurBrightnessRow);

        const animDurationRow = new Adw.SpinRow({
            title: 'Animation duration',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 600000,
                step_increment: 100,
                value: window._settings.get_int(Keys.PROMPT_BLUR_ANIM_DURATION),
            }),
        });
        window._settings.bind(
            Keys.PROMPT_BLUR_ANIM_DURATION, animDurationRow,
            'value', Gio.SettingsBindFlags.DEFAULT
        );
        let animSuffix = new Gtk.Label({
            label: 'ms',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        });
        animDurationRow.add_suffix(animSuffix);
        promptGroup.add(animDurationRow);

        const toggleBlurRows = () => {
            const enabled = changeBlurSwitch.active;
            blurRadiusRow.set_visible(enabled);
            blurBrightnessRow.set_visible(enabled);
        };
        toggleBlurRows();
        changeBlurSwitch.connect('notify::active', toggleBlurRows);

        return promptGroup;
    }

    _buildDebugGroup(window) {
        let debugGroup = new Adw.PreferencesGroup({
            title: 'Debug',
        });

        let disableColorRow = new Adw.SwitchRow({
            title: 'Disable color conversion',
            subtitle: 'Enabling this might improve performance but will cause color inaccuracy',
        });
        disableColorRow.active = !window._settings.get_boolean(Keys.DEBUG_USE_COLOR_ACCURATE);
        disableColorRow.connect('notify::active', (row) => {
            // Inverting the value so:
            // disable color conversion -> use_color_accurate = false
            window._settings.set_boolean(
                Keys.DEBUG_USE_COLOR_ACCURATE,
                !row.active  
            );
        });
        debugGroup.add(disableColorRow);

        let forceFullscreenRow = new Adw.SwitchRow({
            title: 'Force fullscreen',
            subtitle: 'Enable this if you experience video positioning issues',
        });
        window._settings.bind(
            Keys.DEBUG_FORCE_FULLSCREEN, forceFullscreenRow,
            'active', Gio.SettingsBindFlags.DEFAULT
        );
        debugGroup.add(forceFullscreenRow);

        return debugGroup;
    }

    _buildPathRow(window) {
        let path = window._settings.get_string(Keys.VIDEO_PATH);
        
        const row = new Adw.ActionRow({
            title: "Video",
            subtitle: `${path !== '' ? path : 'None'}`,
        });

        let button = new Adw.ButtonContent({
            icon_name: 'document-open-symbolic',
            label: 'Browse',
        });

        row.activatable_widget = button;
        row.add_suffix(button);

        row.connect('activated', () => {
            this._openFileDialog(window, row)
        });

        return row;
    }

    _openFileDialog(window, row) {
        let filter = new Gtk.FileFilter();
        filter.set_name('Video files');
        filter.add_mime_type('video/*');

        let filters = new Gio.ListStore({ item_type: Gtk.FileFilter });
        filters.append(filter);

        let dialog = new Gtk.FileDialog({ title: 'Select Video File' });
        dialog.set_filters(filters);

        const videoPath = window._settings.get_string(Keys.VIDEO_PATH);
        if (videoPath) {
            const file = Gio.File.new_for_path(videoPath);
            const parentFolder = file.get_parent();
            if (parentFolder)
                dialog.set_initial_folder(parentFolder);
        }

        dialog.open(window, null, (d, result) => {
            try {
                let file = d.open_finish(result);
                if (file) {
                    row.subtitle = file.get_path()
                    window._settings.set_string(Keys.VIDEO_PATH, file.get_path());
                }
                else {
                    row.subtitle = 'None'
                    window._settings.set_string(Keys.VIDEO_PATH, "");
                }
                
            } catch (e) {
                console.log(`Error selecting file: ${e}`);
            }
        });
    }
}
