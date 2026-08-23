import Gst from 'gi://Gst';
import GLib from 'gi://GLib';
import { initGst } from "./safe_gst.js";

export function isGtk4PaintableSinkAvailable() {
    initGst();
    return Gst.ElementFactory.find('gtk4paintablesink') !== null;
}

export function isMpvAvailable() {
    return GLib.find_program_in_path('mpv') !== null;
}