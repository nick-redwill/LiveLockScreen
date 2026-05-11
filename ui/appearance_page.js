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
        this.add(this._buildGroup());
    }

    _buildGroup() {
        const group = new Adw.PreferencesGroup();

        const changeFramerateRow = this._buildChangeFramerateRow();
        const fpsRow = this._buildFpsRow();

        group.add(changeFramerateRow);
        group.add(fpsRow);

        const toggleFpsRow = () => fpsRow.set_visible(changeFramerateRow.active);
        toggleFpsRow();
        changeFramerateRow.connect('notify::active', toggleFpsRow);

        group.add(this._buildFadeInRow());

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

    _buildChangeFramerateRow() {
        const row = new Adw.SwitchRow({
            title: 'Change framerate',
            subtitle: 'This may cause artifacts and performance issues due to conversion overhead',
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

    _buildFadeInRow() {
        const row = new Adw.SpinRow({
            title: 'Fade in',
            subtitle: 'Video fade-in animation duration',
            adjustment: new Gtk.Adjustment({
                lower: 0,
                upper: 600 * 1000,
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
});