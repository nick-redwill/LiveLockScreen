import GLib from 'gi://GLib';

export function isMpvAvailable() {
    return GLib.find_program_in_path('mpv') !== null;
}
