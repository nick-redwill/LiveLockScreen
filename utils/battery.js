import Gio from 'gi://Gio';

Gio._promisify(Gio.DBusProxy, 'new_for_bus', 'new_for_bus_finish');

export async function isOnBattery() {
    try {
        const upower = await Gio.DBusProxy.new_for_bus(
            Gio.BusType.SYSTEM,
            Gio.DBusProxyFlags.NONE,
            null,
            'org.freedesktop.UPower',
            '/org/freedesktop/UPower',
            'org.freedesktop.UPower',
            null
        );
        return upower.get_cached_property('OnBattery')?.unpack() ?? false;
    } catch (e) {
        return false;
    }
}