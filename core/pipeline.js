import Gst from 'gi://Gst';
import GLib from 'gi://GLib';
import GstController from 'gi://GstController';

export default class Pipeline {
    constructor({ videoPath, volume, loop, framerate, skipFrame, dataCallback }) {
        this._videoPath = videoPath
        this._volume = volume
        this._loop = loop
        this._framerate = framerate
        this._dataCallback = dataCallback
        this._skipFrame = skipFrame ?? false
    
        this._pipeline = null;
        this._bus = null;

        this._videoSink = null;

        this._volumeElement = null;
        this._volumeControl = null;
        
        this._initialized = false;
        this._firstFrame = true;
        
        this._dataTimeoutId = null; 
        this._playbackTimeoutId = null;

        this._PLAYBACK_FADE_DUR = 400;
    }

    is_initialized() {
        return this._initialized
    }

    init() {
        if (this._initialized)
            return true;

        try {
            const videoBin   = new Gst.Bin({ name: 'video-bin' });
            const videoConvert  = Gst.ElementFactory.make('videoconvert', 'videoconvert');
            const videoSink  = Gst.ElementFactory.make('appsink', 'video-sink');

            if (!videoConvert || !videoSink) {
                throw new Error('Failed to create video elements');
            }

            videoSink.set_property('caps', Gst.Caps.from_string('video/x-raw,format=RGBA'));
            videoSink.set_property('max-buffers', 1);
            videoSink.set_property('drop', true);
            videoSink.set_property('sync', true);
            
            videoBin.add(videoConvert);
            videoBin.add(videoSink);
            videoConvert.link(videoSink);

            const videoGhostPad = Gst.GhostPad.new('sink', videoConvert.get_static_pad('sink'));
            videoBin.add_pad(videoGhostPad);

            let pipeline = Gst.ElementFactory.make('playbin', 'pipeline');
            if (!pipeline) {
                throw new Error('Failed to create playbin element')
            }
            pipeline.set_property('uri', GLib.filename_to_uri(this._videoPath, null));
            pipeline.set_property('video-sink', videoBin);

            if (this._volume > 0) {
                const audioBin      = new Gst.Bin({ name: 'audio-bin' });
                const audioQueue    = Gst.ElementFactory.make('queue', 'audio-queue');
                const audioConvert  = Gst.ElementFactory.make('audioconvert',  'audioconvert');
                const audioResample = Gst.ElementFactory.make('audioresample',  'audioresample');
                const audioSink =     Gst.ElementFactory.make('autoaudiosink', 'audio-sink');
                const volumeElement = Gst.ElementFactory.make('volume', 'volume');

                if (!audioConvert || !audioResample || !audioSink || !audioQueue || !volumeElement) {
                    throw new Error('Failed to create audio elements');
                }

                audioQueue.set_property('max-size-buffers', 0); // unlimited
                audioQueue.set_property('max-size-time', 5 * Gst.SECOND); // 2 second buffer
                audioQueue.set_property('max-size-bytes', 0); // unlimited

                audioSink.set_property('sync', true);
                
                audioBin.add(audioConvert);
                audioBin.add(audioResample);
                audioBin.add(audioQueue);
                audioBin.add(volumeElement);
                audioBin.add(audioSink);

                audioConvert.link(audioResample);
                audioResample.link(audioQueue);
                audioQueue.link(volumeElement);
                volumeElement.link(audioSink);

                const controlSource = GstController.InterpolationControlSource.new();
                controlSource.set_property(
                    'mode',
                    GstController.InterpolationMode.LINEAR
                );

                // Bind it to the volume property
                const binding = GstController.DirectControlBinding.new(
                    volumeElement,
                    'volume',
                    controlSource
                );

                volumeElement.add_control_binding(binding);
                volumeElement.set_property('volume', this._volume)

                // Save for later
                this._volumeElement = volumeElement;
                this._volumeControl = controlSource;

                const audioGhostPad = Gst.GhostPad.new('sink', audioConvert.get_static_pad('sink'));
                audioBin.add_pad(audioGhostPad);

                pipeline.set_property('audio-sink', audioBin);
            } else {
                const fakeSink = Gst.ElementFactory.make('fakesink', 'audio-fake');
                pipeline.set_property('audio-sink', fakeSink);
            }

            this._pipeline = pipeline;
            this._bus = pipeline.get_bus();
            this._videoSink = videoSink;

            this._initBusWatch();

            const interval = 1000 / this._framerate;
            this._dataTimeoutId = this._startFetchTimer(interval)
            if (!this._dataTimeoutId) {
                throw new Error('Failed to create the fetch timer')
            }

            this._initialized = true;
            return true;
        }
        catch(e) {
            console.error('Pipeline init failed: ', e.message);
            this.deinit();
            return false;
        }
    }

    _initBusWatch() {
        this._bus.add_watch(GLib.PRIORITY_DEFAULT, (bus, message) => {
            // When stream reaches its end -> seek back to 0
            if (this._loop && message.type === Gst.MessageType.EOS) {
                this._pipeline.seek_simple(
                    Gst.Format.TIME,
                    Gst.SeekFlags.FLUSH | Gst.SeekFlags.KEY_UNIT,
                    0
                );
                this._firstFrame = true;
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _startFetchTimer(interval) {
        return GLib.timeout_add(GLib.PRIORITY_DEFAULT, interval, () => this._fetchData());
    }

    _easeVolume(target, durationMs = 300) {
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

    _fetchData() {
        let sample = this._videoSink.emit('try-pull-sample', 0);
        if (!sample) return GLib.SOURCE_CONTINUE;

        let buffer = sample.get_buffer();
        
        // HACK:
        // Skipping first frame because it is a green screen sometimes
        if (this._skipFrame && this._firstFrame) {
            this._firstFrame = false;
            buffer = null;
            sample = null;
            return GLib.SOURCE_CONTINUE;
        }

        let caps = sample.get_caps();
        let structure = caps.get_structure(0);
        let [, width] = structure.get_int('width');
        let [, height] = structure.get_int('height');

        let [success, mapInfo] = buffer.map(Gst.MapFlags.READ);
        if (!success) return GLib.SOURCE_CONTINUE;

        this._dataCallback(
            mapInfo.data, width, height
        )

        buffer.unmap(mapInfo);

        // Explicitly null everything to help GC
        mapInfo = null;
        buffer = null;
        caps = null;
        structure = null;
        sample = null;

        return GLib.SOURCE_CONTINUE;
    }

    play() {
        if (this._pipeline) {
            this._clearPlaybackTimeout()
            this._pipeline.set_state(Gst.State.PLAYING);
            this._easeVolume(this._volume, this._PLAYBACK_FADE_DUR);
        }
    }

    pause() {
        if (this._pipeline) {
            this._clearPlaybackTimeout()
            this._easeVolume(0, this._PLAYBACK_FADE_DUR);
            this._playbackTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT, 
                this._PLAYBACK_FADE_DUR + 50, 
                () => {
                this._pipeline.set_state(Gst.State.PAUSED);
                this._playbackTimeoutId = null;
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    _clearPlaybackTimeout() {
        if (this._playbackTimeoutId) {
            GLib.source_remove(this._playbackTimeoutId);
            this._playbackTimeoutId = null;
        }
    }

    deinit() {
        this._clearPlaybackTimeout()

        if (this._dataTimeoutId) {
            GLib.source_remove(this._dataTimeoutId);
            this._dataTimeoutId = null;
        }
        if (this._bus) {
            this._bus.remove_watch();
            this._bus = null;
        }
        if (this._pipeline) {
            this._pipeline.set_state(Gst.State.NULL);
            this._pipeline = null;
        }

        this._videoSink = null;
    }
}