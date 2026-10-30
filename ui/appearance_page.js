import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { Keys } from '../enums.js';

export var AppearancePage = GObject.registerClass(
class LLSAppearancePage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: 'Appearance',
            icon_name: 'preferences-desktop-appearance-symbolic',
            name: 'AppearancePage',
        });

        this._settings = settings;

        this.add(this._buildBackgroundGroup());
        this.add(this._buildPromptGroup());
    }

    _buildBackgroundGroup() {
        const group = new Adw.PreferencesGroup({ title: 'Background' });

        group.add(this._buildFadeInRow());
        group.add(this._buildVideoFadeRow());

        const blurRadiusRow = this._buildBlurRadiusRow();
        const blurBrightnessRow = this._buildBlurBrightnessRow();

        group.add(blurRadiusRow);
        group.add(blurBrightnessRow);

        const toggleBrightnessSpin = () => {
            blurBrightnessRow.set_sensitive(blurRadiusRow.get_value() !== 0);
        };
        toggleBrightnessSpin();

        blurRadiusRow.connect('notify::value', r => {
            this._settings.set_int(Keys.BLUR_RADIUS, r.get_value());
            toggleBrightnessSpin();
        });
        blurBrightnessRow.connect('notify::value', r => {
            this._settings.set_double(Keys.BLUR_BRIGHTNESS, r.get_value() / 100);
        });

        return group;
    }

    _buildPromptGroup() {
        const group = new Adw.PreferencesGroup({
            title: 'Password prompt',
            description: 'Customize behavior when the password prompt appears',
        });

        group.add(this._buildPromptPauseRow());
        group.add(this._buildPromptGrayscaleRow());
        group.add(this._buildPromptChangeBlurRow());
        // Also used by grayscale, so not inside the blur row
        group.add(this._buildPromptAnimDurationRow());

        return group;
    }

    _buildFadeInRow() {
        const row = new Adw.SpinRow({
            title: 'Fade in',
            subtitle: 'Background fade-in animation duration',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 600000,
                step_increment: 100,
                value: this._settings.get_int(Keys.FADE_IN_DURATION),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: 'ms',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        row.connect('notify::value', r => {
            this._settings.set_int(Keys.FADE_IN_DURATION, r.get_value());
        });

        return row;
    }

    _buildVideoFadeRow() {
        const row = new Adw.ExpanderRow({
            title: 'Fade between files',
            subtitle: 'Briefly fade to black when switching to the next file',
            show_enable_switch: true,
        });
        this._settings.bind(Keys.PLAYLIST_FADE_ENABLED, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);

        const durationRow = new Adw.SpinRow({
            title: 'Fade duration',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 10000,
                step_increment: 50,
                value: this._settings.get_int(Keys.PLAYLIST_FADE_DURATION),
            }),
        });
        durationRow.add_suffix(new Gtk.Label({
            label: 'ms',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));
        durationRow.connect('notify::value', r => {
            this._settings.set_int(Keys.PLAYLIST_FADE_DURATION, r.get_value());
        });

        row.add_row(durationRow);
        return row;
    }

    _buildBlurRadiusRow() {
        const row = new Adw.SpinRow({
            title: 'Blur radius',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: this._settings.get_int(Keys.BLUR_RADIUS),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: 'px',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        return row;
    }

    _buildBlurBrightnessRow() {
        const row = new Adw.SpinRow({
            title: 'Blur brightness',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: this._settings.get_double(Keys.BLUR_BRIGHTNESS) * 100,
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        return row;
    }

    _buildPromptPauseRow() {
        const row = new Adw.SwitchRow({ title: 'Pause playback' });
        this._settings.bind(Keys.PROMPT_PAUSE, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildPromptGrayscaleRow() {
        const row = new Adw.SwitchRow({ title: 'Grayscale' });
        this._settings.bind(Keys.PROMPT_GRAYSCALE, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildPromptChangeBlurRow() {
        const row = new Adw.ExpanderRow({
            title: 'Change blur',
            show_enable_switch: true,
        });
        this._settings.bind(Keys.PROMPT_CHANGE_BLUR, row, 'enable-expansion', Gio.SettingsBindFlags.DEFAULT);

        row.add_row(this._buildPromptBlurRadiusRow());
        row.add_row(this._buildPromptBlurBrightnessRow());
        return row;
    }

    _buildPromptBlurRadiusRow() {
        const row = new Adw.SpinRow({
            title: 'Blur radius',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: this._settings.get_int(Keys.PROMPT_BLUR_RADIUS),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: 'px',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        this._settings.bind(Keys.PROMPT_BLUR_RADIUS, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildPromptBlurBrightnessRow() {
        const row = new Adw.SpinRow({
            title: 'Blur brightness',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 100,
                step_increment: 1,
                value: this._settings.get_double(Keys.PROMPT_BLUR_BRIGHTNESS) * 100,
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: '%',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        row.connect('notify::value', r => {
            this._settings.set_double(Keys.PROMPT_BLUR_BRIGHTNESS, r.get_value() / 100);
        });

        return row;
    }

    _buildPromptAnimDurationRow() {
        const row = new Adw.SpinRow({
            title: 'Animation duration',
            subtitle: 'For the grayscale and blur changes',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 600000,
                step_increment: 100,
                value: this._settings.get_int(Keys.PROMPT_BLUR_ANIM_DURATION),
            }),
        });

        row.add_suffix(new Gtk.Label({
            label: 'ms',
            valign: Gtk.Align.CENTER,
            css_classes: ['dim-label'],
        }));

        this._settings.bind(Keys.PROMPT_BLUR_ANIM_DURATION, row, 'value', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }
});
