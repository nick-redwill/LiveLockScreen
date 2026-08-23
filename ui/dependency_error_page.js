import Adw from 'gi://Adw';
import GObject from 'gi://GObject';

export var DependencyErrorPage = GObject.registerClass(
class LLSDependencyErrorPage extends Adw.PreferencesPage {
    _init() {
        super._init({
            title: 'Error',
            icon_name: 'dialog-error-symbolic',
            name: 'DependencyErrorPage',
        });

        const group = new Adw.PreferencesGroup({
            title: 'Missing dependencies',
            description: 'Live Lock Screen needs a playback backend to work. MPV is recommended.',
        });

        const mpvRow = new Adw.ActionRow({
            title: 'MPV backend (recommended)',
            subtitle:
                `Better reliability, GIF support, and smoother playback.\n\n` +
                `Install MPV for your distribution:\n` +
                `  • Fedora/RHEL: dnf install mpv\n` +
                `  • Ubuntu/Debian: apt install mpv\n` +
                `  • Arch: pacman -S mpv`,
            icon_name: 'starred-symbolic',
        });
        mpvRow.add_css_class('accent');

        const gstreamerRow = new Adw.ActionRow({
            title: 'GStreamer backend',
            subtitle:
                `Alternatively, you can use the GStreamer backend.\n\n` +
                `Install the GStreamer GTK4 plugin for your distribution:\n` +
                `  • Fedora/RHEL: gstreamer1-plugin-gtk4\n` +
                `  • Ubuntu (24.10+)/Debian: gstreamer1.0-gtk4\n` +
                `  • Arch: gst-plugin-gtk4\n\n` +
                `See README.md for more information.`,
            icon_name: 'dialog-error-symbolic',
        });
        gstreamerRow.add_css_class('error');

        group.add(mpvRow);
        group.add(gstreamerRow);

        this.add(group);
    }
});