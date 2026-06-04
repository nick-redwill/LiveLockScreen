import Gst from 'gi://Gst';
import { initGst } from "./safe_gst.js";

export function isGtk4PaintableSinkAvailable() {
    initGst();
    return Gst.ElementFactory.find('gtk4paintablesink') !== null;
}