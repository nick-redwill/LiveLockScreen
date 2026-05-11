import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export function getShellVersion() {
    const bus = Gio.DBus.session;
    const [version] = bus.call_sync(
        'org.gnome.Shell',
        '/org/gnome/Shell',
        'org.freedesktop.DBus.Properties',
        'Get',
        new GLib.Variant('(ss)', ['org.gnome.Shell', 'ShellVersion']),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null
    ).recursiveUnpack();

    return parseInt(version);
}