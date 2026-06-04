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

        const group = new Adw.PreferencesGroup();

        const row = new Adw.ActionRow({
            title: 'Missing dependency',
            subtitle:
                `gtk4paintablesink is not available.\n\n` +
                `Install the GStreamer GTK4 plugin for your distribution:\n` +
                `  • Fedora/RHEL: gstreamer1-plugin-gtk4\n` +
                `  • Ubuntu (24.10+)/Debian: gstreamer1.0-gtk4\n` +
                `  • Arch: gst-plugin-gtk4\n\n` +
                `See README.md for more information.`,
            icon_name: 'dialog-error-symbolic',
        });
        row.add_css_class('error');

        group.add(row);
        this.add(group);
    }
});