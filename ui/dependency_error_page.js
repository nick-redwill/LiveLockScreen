import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

export var DependencyErrorPage = GObject.registerClass(
class ScreenSaverDependencyErrorPage extends Adw.PreferencesPage {
    _init() {
        super._init({
            title: 'Error',
            icon_name: 'dialog-error-symbolic',
            name: 'DependencyErrorPage',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Missing dependency',
            description: 'ScreenSaver requires mpv to load and rotate images on the lock screen.',
        });

        const mpvRow = new Adw.ActionRow({
            title: 'Install mpv',
            subtitle:
                `ScreenSaver uses mpv for image decoding and slideshow playback.\n\n` +
                `Install mpv for your distribution:\n` +
                `  • Fedora/RHEL: dnf install mpv\n` +
                `  • Ubuntu/Debian: apt install mpv\n` +
                `  • Arch: pacman -S mpv\n\n` +
                `See README.md for the full test command.`,
            icon_name: 'dialog-error-symbolic',
        });
        mpvRow.add_css_class('error');

        group.add(mpvRow);
        this.add(group);
    }
});
