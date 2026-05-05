import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { Keys } from '../enums.js';

export var PromptPage = GObject.registerClass(
class LLSPromptPage extends Adw.PreferencesPage {
    _init(settings) {
        super._init({
            title: 'Prompt',
            icon_name: 'dialog-password-symbolic',
            name: 'PromptPage',
        });

        this._settings = settings;

        const group = new Adw.PreferencesGroup({
            description: 'Customize behavior when the password prompt appears',
        });

        group.add(this._buildPauseRow());
        group.add(this._buildGrayscaleRow());

        const changeBlurRow = this._buildChangeBlurRow();
        const blurRadiusRow = this._buildBlurRadiusRow();
        const blurBrightnessRow = this._buildBlurBrightnessRow();
        const animDurationRow = this._buildAnimDurationRow();

        group.add(changeBlurRow);
        group.add(blurRadiusRow);
        group.add(blurBrightnessRow);
        group.add(animDurationRow);

        const toggleBlurRows = () => {
            const enabled = changeBlurRow.active;
            blurRadiusRow.set_visible(enabled);
            blurBrightnessRow.set_visible(enabled);
            animDurationRow.set_visible(enabled);
        };
        toggleBlurRows();
        changeBlurRow.connect('notify::active', toggleBlurRows);

        this.add(group);
    }

    _buildPauseRow() {
        const row = new Adw.SwitchRow({ title: 'Pause video' });
        this._settings.bind(Keys.PROMPT_PAUSE, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildGrayscaleRow() {
        const row = new Adw.SwitchRow({ title: 'Grayscale video' });
        this._settings.bind(Keys.PROMPT_GRAYSCALE, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildChangeBlurRow() {
        const row = new Adw.SwitchRow({ title: 'Change blur' });
        this._settings.bind(Keys.PROMPT_CHANGE_BLUR, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    _buildBlurRadiusRow() {
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

    _buildBlurBrightnessRow() {
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

    _buildAnimDurationRow() {
        const row = new Adw.SpinRow({
            title: 'Animation duration',
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