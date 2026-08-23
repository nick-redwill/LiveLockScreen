import Gst from 'gi://Gst';
import GstPbutils from 'gi://GstPbutils';
import GLib from 'gi://GLib';
import GstController from 'gi://GstController';

import { initGst } from '../utils/safe_gst.js';

const FADE_DURATION_MS = 280;

export default class Pipeline {
    constructor({
        path, volume, loop, useVideorate, framerate, colorAccurate=true
    }) {
        this._bus = null;
        this._pipeline = null;
        this._videoSink = null;
        this._volumeElement = null;
        this._volumeControl = null;

        this._path = path;
        this._volume = volume;
        this._loop = loop;
        this._useVideorate = useVideorate;
        this._framerate = framerate;
        this._colorAccurate = colorAccurate; 
    }

    init() {
        initGst();

        try {
            this._pipeline = Gst.ElementFactory.make('playbin', 'playbin');

            if (this._colorAccurate)
                this._initVideoColorAccurate();
            else
                this._initVideoSimple();
            
            this._initAudio();
            this._initBusWatch();

            let uri = GLib.filename_to_uri(this._path, null);
            this._pipeline.set_property('uri', uri);
        }
        catch(e) {
            this.destroy();
            throw e;
        }
    }

    _initVideoSimple() {
        // Keeping this just in case users experience performance issues with
        // new color accurate pipeline
        console.log("Using simple video pipeline")

        if (this._useVideorate) {
            const videoSinkBin = Gst.parse_bin_from_description(
                `videorate skip-to-first=true ! 
                video/x-raw,framerate=${this._framerate}/1 ! 
                gtk4paintablesink name=sink`,
                true
            );
            if (!videoSinkBin)
                throw new Error('Failed to create video sink bin');

            this._videoSink = videoSinkBin.get_by_name('sink');

            if (!this._videoSink)
                throw new Error('Failed to find gtk4paintablesink in video sink bin');

            this._pipeline.set_property('video-sink', videoSinkBin);
        } else {
            this._videoSink = Gst.ElementFactory.make('gtk4paintablesink', 'video-sink');

            if (!this._videoSink)
                throw new Error('Failed to create gtk4paintablesink');

            this._pipeline.set_property('video-sink', this._videoSink);
        }
    }

    getVideoSize() {
        const uri = GLib.filename_to_uri(this._path, null);
        const discoverer = GstPbutils.Discoverer.new(1 * Gst.SECOND); // 5s timeout

        const info = discoverer.discover_uri(uri);
        const videoStreams = info.get_video_streams();

        if (videoStreams.length === 0)
            return null;

        const videoInfo = videoStreams[0];
        return {
            width: videoInfo.get_width(),
            height: videoInfo.get_height(),
        };
    }

    _initVideoColorAccurate() {
        // This pipeline utilizes gpu to add convertion to sRGB for accuracy
        console.log("Using color accurate video pipeline")

        if (this._useVideorate) {
            const videoSinkBin = Gst.parse_bin_from_description(
                `videorate skip-to-first=true ! \
                video/x-raw,framerate=${this._framerate}/1 ! \
                glupload ! glcolorconvert ! \
                video/x-raw(memory:GLMemory),format=RGBA,colorimetry=sRGB ! \
                gtk4paintablesink name=sink`,
                true
            );
            if (!videoSinkBin)
                throw new Error('Failed to create video sink bin');

            this._videoSink = videoSinkBin.get_by_name('sink');

            if (!this._videoSink)
                throw new Error('Failed to find gtk4paintablesink in video sink bin');

            this._pipeline.set_property('video-sink', videoSinkBin);
        } else {
            const videoSinkBin = Gst.parse_bin_from_description(
                `glupload ! glcolorconvert ! \
                video/x-raw(memory:GLMemory),format=RGBA,colorimetry=sRGB ! \
                gtk4paintablesink name=sink`,
                true
            );
            if (!videoSinkBin)
                throw new Error('Failed to create video sink bin');

            this._videoSink = videoSinkBin.get_by_name('sink');

            if (!this._videoSink)
                throw new Error('Failed to find gtk4paintablesink in video sink bin');

            this._pipeline.set_property('video-sink', videoSinkBin);
        }
    }

    _initAudio() {
        const audioBin = new Gst.Bin({ name: 'audio-bin' });
        const audioConvert = Gst.ElementFactory.make('audioconvert', 'audioconvert');
        const audioSink = Gst.ElementFactory.make('autoaudiosink', 'audio-sink');
        this._volumeElement = Gst.ElementFactory.make('volume', 'volume');

        if (!audioConvert || !audioSink || !this._volumeElement)
            throw new Error('Failed to create audio elements');

        audioSink.set_property('sync', true);

        audioBin.add(audioConvert);
        audioBin.add(this._volumeElement);
        audioBin.add(audioSink);

        audioConvert.link(this._volumeElement);
        this._volumeElement.link(audioSink);

        this._volumeControl = GstController.InterpolationControlSource.new();
        this._volumeControl.set_property('mode', GstController.InterpolationMode.LINEAR);

        const binding = GstController.DirectControlBinding.new(
            this._volumeElement, 'volume', this._volumeControl
        );
        this._volumeElement.add_control_binding(binding);
        this._volumeElement.set_property('volume', this._volume);

        const audioGhostPad = Gst.GhostPad.new('sink', audioConvert.get_static_pad('sink'));
        audioBin.add_pad(audioGhostPad);

        this._pipeline.set_property('audio-sink', audioBin);
    }

    _initBusWatch() {
        this._bus = this._pipeline.get_bus();
        this._bus.add_signal_watch();
        this._bus.connect('message', (_, msg) => {
            if (this._loop && msg.type === Gst.MessageType.EOS) {
                this._pipeline.seek_simple(
                    Gst.Format.TIME,
                    Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
                    0
                );
            }
        });
    }

    get_paintable() {
        return this._videoSink?.paintable ?? null;   
    }

    easeVolume(target, durationMs = 300) {
        if (!this._volumeControl || !this._volumeElement)
            return;

        const clock = this._pipeline.get_clock();
        if (!clock) return;

        const now = clock.get_time();
        const base = this._pipeline.get_base_time();
        let runningTime = now - base;

        if (runningTime < 0 || runningTime === Gst.CLOCK_TIME_NONE) {
            runningTime = 0;
        }

        const startVol = this._volumeElement.volume;

        this._volumeControl.unset_all();

        const startTime = runningTime;
        const endTime = startTime + (durationMs * Gst.MSECOND);

        const safeStart = Math.max(0.0, Math.min(1.0, startVol));
        const safeTarget = Math.max(0.0, Math.min(1.0, target));

        // HACK: 
        // I have no idea why it requires me to divide the value by 10
        // But that seems to fix the issue
        this._volumeControl.set(startTime, safeStart / 10);
        this._volumeControl.set(endTime, safeTarget / 10);
    }

    preroll() {
        this._pipeline.set_state(Gst.State.PAUSED);
    }

    play() {
        this.easeVolume(this._volume, FADE_DURATION_MS);
        this._pipeline.set_state(Gst.State.PLAYING);
    }

    pause() {
        this.easeVolume(0, FADE_DURATION_MS);
        GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            FADE_DURATION_MS + 50,
            () => {
                const [ok, position] = this._pipeline.query_position(Gst.Format.TIME);
                if (ok && position > 0) {
                    this._pipeline.seek_simple(
                        Gst.Format.TIME,
                        Gst.SeekFlags.FLUSH | Gst.SeekFlags.ACCURATE,
                        position
                    );
                }

                this._pipeline.set_state(Gst.State.PAUSED);
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    destroy() {
        if (this._bus) {
            this._bus.remove_signal_watch();
            this._bus = null;
        }

        if (this._pipeline) {
            this._pipeline.set_state(Gst.State.NULL);
            this._pipeline = null;
        }

        this._videoSink = null;
        this._volumeElement = null;
        this._volumeControl = null;
    }
}