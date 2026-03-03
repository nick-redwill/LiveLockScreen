import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import St from 'gi://St';
import Gst from 'gi://Gst';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GLib from 'gi://GLib';
import GstPbutils from 'gi://GstPbutils';

import Pipeline from './core/pipeline.js';

import { Keys } from "./enums.js";
import { setImageData } from './utils/set_image_data.js';

import { createActor } from './core/scalers.js';

export default class LockscreenExtension extends Extension {
    /* Called when screen is locked */
    enable() {
        if (!Main.screenShield._dialog) {
            console.error('Failed to get screenShield._dialog object')
            return;
        }

        if (!Gst.is_initialized()) {
            if (!Gst.init(null)) {
                console.error('Failed to initialize Gstreamer')
                return;
            }
        }

        this._promptShown = false;

        this._actors = [];
        this._images = [];

        this._injectionManager = null;
        this._settings = this.getSettings();

        // If not video set, fallback to default handler
        const videoPath = this._settings.get_string(Keys.VIDEO_PATH)
        if (!videoPath) {
            console.warning('Video not set, falling back')
            return;
        }

        let discoverer = new GstPbutils.Discoverer({ timeout: 3 * Gst.SECOND });
        let info = discoverer.discover_uri(GLib.filename_to_uri(
            videoPath, null
        ));
        let videoStreams = info.get_video_streams();
        if (videoStreams.length > 0) {
            let stream = videoStreams[0];
            this.width = stream.get_width();
            this.height = stream.get_height();
            console.log('video size:', this.width, this.height);
        }
        
        // These settings are common for all monitors
        this._fadeInDuration = this._settings.get_int(Keys.FADE_IN_DURATION);
        this._scalingMode = this._settings.get_int(Keys.SCALING_MODE);
        this._blurRadius = this._settings.get_int(Keys.BLUR_RADIUS);
        this._blurBrightness = this._settings.get_double(Keys.BLUR_BRIGHTNESS);

        this._volume = this._settings.get_int(Keys.AUDIO_VOLUME) / 100

        this._promptSettings = {
            [Keys.PROMPT_PAUSE]: 
                this._settings.get_boolean(Keys.PROMPT_PAUSE),
            [Keys.PROMPT_CHANGE_BLUR]: 
                this._settings.get_boolean(Keys.PROMPT_CHANGE_BLUR),

            [Keys.PROMPT_BLUR_RADIUS]: 
                this._settings.get_int(Keys.PROMPT_BLUR_RADIUS),
            [Keys.PROMPT_BLUR_ANIM_DURATION]: 
                this._settings.get_int(Keys.PROMPT_BLUR_ANIM_DURATION),
            [Keys.PROMPT_BLUR_BRIGHTNESS]: 
                this._settings.get_double(Keys.PROMPT_BLUR_BRIGHTNESS),
        }

        const loop = this._settings.get_boolean(Keys.LOOPED);
        const framerate = this._settings.get_int(Keys.FRAMERATE);
        const skipFrame = this._settings.get_boolean(Keys.DEBUG_SKIP_FIRST_FRAME)

        this._pipeline = new Pipeline({
            videoPath: videoPath,
            volume: this._volume,
            loop: loop,
            framerate: framerate,
            skipFrame: skipFrame,
            dataCallback: this._drawImages.bind(this)
        })
        
        // Creating blur effect
        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._blurRadius *= themeContext.scale_factor
        this._promptSettings[Keys.BLUR_RADIUS] *= themeContext.scale_factor

        this._blurEffect = {
            name: 'lockscreen-extension-blur',
            radius: this._blurRadius,
            brightness: this._blurBrightness,
        };

        const backend = Clutter.get_default_backend();
        this._coglContext = backend.get_cogl_context();

        // Monkey-patching _createBackground method of Main.screenShield._dialog
        this._injectionManager = new InjectionManager();
        this._injectionManager.overrideMethod(Main.screenShield._dialog, '_createBackground',
            (original) => {
                const self = this;
                return function(monitorIndex) {
                    original.call(this, monitorIndex);
                    self._handleMonitor(monitorIndex);
            };
        });

        Main.screenShield._dialog._updateBackgrounds();

        // Monkey-patching showPrompt (password prompt)
        this._injectionManager.overrideMethod(Main.screenShield._dialog, '_showPrompt',
            (original) => {
                const self = this;
                return function(...args) {
                    original.call(this, ...args);
                    self._onPromptShow();
                };
            }
        );

        // Monkey-patching showClock (hide password prompt)
        this._injectionManager.overrideMethod(Main.screenShield._dialog, '_showClock',
            (original) => {
                const self = this;
                return function(...args) {
                    original.call(this, ...args);
                    self._onPromptHide();
                };
            }
        );
    }

    _onPromptShow() {
        if (this._promptShown) return;
        this._promptShown = true;

        this._actors.forEach(actor => {
            if (this._promptSettings[Keys.PROMPT_CHANGE_BLUR]) {
                let radius = this._promptSettings[Keys.PROMPT_BLUR_RADIUS];
                let brightness = radius ? this._promptSettings[Keys.PROMPT_BLUR_BRIGHTNESS] : 1; 

                actor.ease_property(
                    '@effects.lockscreen-extension-blur.radius', 
                    this._promptSettings[Keys.PROMPT_BLUR_RADIUS], 
                    {
                        duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    }
                );
                actor.ease_property(
                    '@effects.lockscreen-extension-blur.brightness', 
                    brightness, 
                    {
                        duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    }
                );
            }
        })

        if (this._promptSettings[Keys.PROMPT_PAUSE]) {
            this._pipeline.pause()
        }
    }

    _onPromptHide() {
        if (!this._promptShown) return;
        this._promptShown = false;

        this._actors.forEach(actor => {
            if (this._promptSettings[Keys.PROMPT_CHANGE_BLUR]) {
                let radius = this._blurRadius;
                let brightness = radius ? this._blurBrightness : 1; 

                actor.ease_property(
                    '@effects.lockscreen-extension-blur.radius', 
                    this._blurRadius, 
                    {
                        duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    }
                );
                actor.ease_property(
                    '@effects.lockscreen-extension-blur.brightness', 
                    brightness, 
                    {
                        duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    }
                );
            }
        })

        if (this._promptSettings[Keys.PROMPT_PAUSE]) {
            this._pipeline.play()
        }
    }

    _handleMonitor(monitorIndex) {
        const monitor = Main.layoutManager.monitors[monitorIndex];
        const isLastMonitor = monitorIndex === Main.layoutManager.monitors.length - 1;

        const { actor, container, image } = createActor({
            monitor,
            video_width: this.width, 
            video_height: this.height,
            scaling_mode: this._scalingMode,
        })

        let mainActor = container ? container : actor;

        this._actors.push(mainActor);
        this._images.push(image);
        
        mainActor.add_effect(new Shell.BlurEffect(this._blurEffect));
        Main.screenShield._dialog._backgroundGroup.add_child(mainActor);
        Main.screenShield._dialog._backgroundGroup.set_child_above_sibling(mainActor, null);

        if (this._fadeInDuration > 0) {
            mainActor.opacity = 0;
        }

        if (isLastMonitor) {
            this._initPipeline();
            this._initLoginManager();
            this._startAnimation();
        }
    }

    _startAnimation() {
        this._actors.forEach(actor => actor.ease({
            opacity: 255,
            duration: this._fadeInDuration,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        }))
    }

    _initLoginManager() {
        this._loginManager = LoginManager.getLoginManager();
        this._sleepId = this._loginManager.connect('prepare-for-sleep', (manager, aboutToSleep) => {
            if (!this._pipeline) return;
            aboutToSleep ? this._pipeline.pause() : this._pipeline.play();
        });
    }

    _initPipeline() {
        if (!this._pipeline.is_initialized()) {
            if (this._pipeline.init()) {
                this._pipeline.play()
            }
        }
    }

    _drawImages(data, width, height) {
        this._images.forEach(image => {
            setImageData(
                image,
                this._coglContext,
                data,
                Cogl.PixelFormat.BGRA_8888,
                width,
                height,
                width * 4
            )
        })
    }

    /* Called when screen is unlocked */
    disable() {
        if (this._injectionManager) {
            this._injectionManager.clear();
            this._injectionManager = null;
        }

        if (this._sleepId) {
            this._loginManager.disconnect(this._sleepId);
            this._sleepId = null;
        }
        
        if (this._pipeline) {
            this._pipeline.destroy();
            this._pipeline = null;
        }

        this._coglContext = null;
        this._actors.forEach(a => {
            a.remove_effect_by_name('lockscreen-extension-blur');
            a.destroy()
        });
        this._actors = [];
        this._images = [];
    }
}
