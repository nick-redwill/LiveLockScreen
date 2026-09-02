import Adw from 'gi://Adw';
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

    _buildFadeInRow() {
        const row = new Adw.SpinRow({
            title: 'Fade in',
            subtitle: 'Fade-in animation duration',
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