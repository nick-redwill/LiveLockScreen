import Gst from 'gi://Gst';

export function initGst() {
    if (Gst.is_initialized()) return;

    try {
        if (!Gst.init(null)) throw new Error();
    } catch (_) {
        // HACK: 
        // idk why but on some machines the init function excepts utf8 argument 
        try {
            if (!Gst.init('')) throw new Error();
        } catch (_) {
            throw new Error('Unable to initialize GStreamer');
        }
    }
}
