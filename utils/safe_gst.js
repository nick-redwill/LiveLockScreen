import Gst from 'gi://Gst';

export function initGst() {
    if (!Gst.is_initialized()) {
        Gst.init([]);
    }    
}