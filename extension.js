import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import St from 'gi://St';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import { Keys, ScalingMode } from './enums.js';
import { PlayerProcess } from './core/player_process.js';

import { isOnBattery } from './utils/battery.js';
import { isGtk4PaintableSinkAvailable } from './utils/check_dependencies.js';
import { sendErrorNotification } from './utils/notifications.js';
import { SHELL_VERSION } from './utils/shell_version.js';
import { warn, error } from './utils/logging.js';

const MAX_DIALOG_INJECT_ATTEMPTS = 100;
const DIALOG_INJECT_INTERVAL = 100;
const WINDOW_TIMEOUT = 10000;

//TODO: Use actual video size
const VIDEO_W = 1920;
const VIDEO_H = 1080;

export default class LockscreenExtension extends Extension {
    enable() {
        this._resetLockState();
        this._settings = this.getSettings();
        this._setupForLock();
    }

    _resetLockState() {
        this._backgroundCreated = false;
        this._wrapperActors = [];
        this._windowActor = null;
        this._window = null;
        
        this._promptShown = false;
        this._injectionManager = null;
        this._player = null;
        this._tapAction = null;

        this._injectRetryId = 0;
        this._injectAttempts = 0;
        this._blurEffectTimeoutId = 0;
    }

    _setupForLock() {
        const disableOnBatter = this._settings.get_boolean(Keys.DISABLE_ON_BATTERY);
        if (disableOnBatter && isOnBattery()) {
            warn('Skipping on battery');
            return;
        }

        const videoPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (!videoPath) {
            warn('Video not set, falling back');
            return;
        }

        this._fadeInDuration  = this._settings.get_int(Keys.FADE_IN_DURATION);
        this._scalingMode = this._settings.get_int(Keys.SCALING_MODE);
        this._blurRadius = this._settings.get_int(Keys.BLUR_RADIUS);
        this._blurBrightness = this._settings.get_double(Keys.BLUR_BRIGHTNESS);
        this._forceFullscreen = this._settings.get_boolean(Keys.DEBUG_FORCE_FULLSCREEN);

        const volume = this._settings.get_int(Keys.AUDIO_VOLUME) / 100;
        const loop = this._settings.get_boolean(Keys.LOOPED);
        const useVideorate = this._settings.get_boolean(Keys.USE_VIDEORATE);
        const framerate = this._settings.get_int(Keys.FRAMERATE);
        const colorAccurate = this._settings.get_boolean(Keys.DEBUG_USE_COLOR_ACCURATE);

        this._promptSettings = {
            [Keys.PROMPT_PAUSE]:              this._settings.get_boolean(Keys.PROMPT_PAUSE),
            [Keys.PROMPT_GRAYSCALE]:          this._settings.get_boolean(Keys.PROMPT_GRAYSCALE),
            [Keys.PROMPT_CHANGE_BLUR]:        this._settings.get_boolean(Keys.PROMPT_CHANGE_BLUR),
            [Keys.PROMPT_BLUR_RADIUS]:        this._settings.get_int(Keys.PROMPT_BLUR_RADIUS),
            [Keys.PROMPT_BLUR_ANIM_DURATION]: this._settings.get_int(Keys.PROMPT_BLUR_ANIM_DURATION),
            [Keys.PROMPT_BLUR_BRIGHTNESS]:    this._settings.get_double(Keys.PROMPT_BLUR_BRIGHTNESS),
        };

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._blurRadius  *= themeContext.scale_factor;

        this._blurEffect = {
            name: 'lockscreen-extension-blur',
            radius: this._blurRadius,
            brightness: this._blurBrightness,
        };

        this._player = new PlayerProcess({
            playerPath: this.path + '/external/run.js',
            videoPath,
            scalingMode: this._scalingMode,
            loop,
            volume,
            useVideorate,
            framerate,
            colorAccurate: colorAccurate
        });

        try {
            this._player.run();
        } catch (e) {
            error('Failed to run video player! Falling back...' + e);
            this._player = null;
            return;
        }

        // Temporarily hide all animations for windows
        this._injectionManager = new InjectionManager();
        this._injectionManager.overrideMethod(
            Main.wm,
            '_shouldAnimateActor',
            (original) => {
                return function(actor, types) {
                    return false;
                };
            }
        );

        this._player.waitForWindow(WINDOW_TIMEOUT, (win) => {
            print("Window intercepted")

            this._window = win
            this._windowActor = win.get_compositor_private();
            
            //FIXME: On gnome 48 and lower this functions accepts 1 argument
            if (SHELL_VERSION > 48)
                this._window.unmaximize()                
            else
                this._window.unmaximize(true)

            this._window.move_resize_frame(true, 0, 0, VIDEO_W, VIDEO_H)

            //print(this._windowActor.get_width(), this._windowActor.get_height())
            //print(this._window.get_frame_rect().width, this._window.get_frame_rect().height)
            //print(this._window.resizeable)

            const parent = this._windowActor.get_parent();
            if (parent) parent.remove_child(this._windowActor);

            global.stage.add_child(this._windowActor);
            global.stage.set_child_below_sibling(this._windowActor, null);
            this._windowActor.opacity = 0;

            this._injectIntoDialog();
        }, (err) => {
            error(`Unable to intercept all windows: ${err}`);
        })
    }

    _injectIntoDialog() {
        const dialog = Main.screenShield._dialog;
        const gtype = dialog._swipeTracker.constructor.$gtype;

        if (!dialog) {
            if (this._injectAttempts >= MAX_DIALOG_INJECT_ATTEMPTS) {
                error(`_dialog never appeared after ${MAX_DIALOG_INJECT_ATTEMPTS} attempts, giving up`);
                this._injectAttempts = 0;
                return;
            }
            this._injectAttempts++;
            this._injectRetryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, DIALOG_INJECT_INTERVAL, () => {
                this._injectRetryId = 0;
                this._injectIntoDialog();
                return GLib.SOURCE_REMOVE;
            });
            return;
        }

        this._injectAttempts = 0;
        this._injectCreateBackground();

        this._injectionManager.overrideMethod(
            dialog, '_showPrompt',
            (original) => {
                const self = this;
                return function(...args) {
                    original.call(this, ...args);
                    self._onPromptShow();
                };
            }
        );
        
        // Removing the existing signal to use our custom one
        const swipeSignalId = GObject.signal_lookup('end', gtype);
        dialog._swipeTracker.disconnect(swipeSignalId);

        dialog._swipeTracker.connectObject('end', (...args) => {
            dialog._swipeEnd(...args);
            if (dialog._activePage == dialog._clock)
                this._onPromptHide();
            else
                this._onPromptShow();
        }, this);

        this._injectionManager.overrideMethod(
            dialog, '_showClock',
            (original) => {
                const self = this;
                return function(...args) {
                    original.call(this, ...args);
                    self._onPromptHide();
                };
            }
        );

        //NOTE: Replacing TapAction with a fresh one if exists (for gnome 48 and older)
        this._tapAction = (SHELL_VERSION < 49) ? new Clutter.TapAction() : null;
        if (this._tapAction) {
            this._tapAction.connectObject(
                'tap', dialog._showPrompt.bind(dialog), this
            );
        }

        dialog._updateBackgrounds();
    }

    _injectCreateBackground() {
        this._injectionManager.overrideMethod(
            Main.screenShield._dialog, '_createBackground',
            (original) => {
                const self = this;
                return function(monitorIndex) {
                    original.call(this, monitorIndex);                    
                    self._handleMonitor(monitorIndex);
                };
            }
        );
    }

    _onPromptShow() {
        if (this._promptShown) return;
        this._promptShown = true;

        if (this._promptSettings[Keys.PROMPT_CHANGE_BLUR]) {
            const radius = this._promptSettings[Keys.PROMPT_BLUR_RADIUS];
            const brightness = radius ? this._promptSettings[Keys.PROMPT_BLUR_BRIGHTNESS] : 1;

            // Adding a slight timeout helps get rid of video stutters
            this._blurEffectTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
                this._wrapperActors.forEach(actor => {
                    actor.ease_property('@effects.lockscreen-extension-blur.radius', radius, {
                        duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                    actor.ease_property('@effects.lockscreen-extension-blur.brightness', brightness, {
                        duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                    });
                })

                return GLib.SOURCE_REMOVE;
            });
        }

        if (this._promptSettings[Keys.PROMPT_GRAYSCALE]) {
            this._wrapperActors.forEach(actor => {
                actor.ease_property('@effects.lockscreen-extension-desaturate.factor', 1.0, {
                    duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            })
        }

        if (this._promptSettings[Keys.PROMPT_PAUSE])
            this._player?.pause();
            
    }

    _onPromptHide() {
        if (!this._promptShown) return;
        this._promptShown = false;

        if (this._promptSettings[Keys.PROMPT_CHANGE_BLUR]) {
            const radius = this._blurRadius;
            const brightness = radius ? this._blurBrightness : 1;

            this._wrapperActors.forEach(actor => {
                actor.ease_property('@effects.lockscreen-extension-blur.radius', radius, {
                    duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                actor.ease_property('@effects.lockscreen-extension-blur.brightness', brightness, {
                    duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            });
        }

        if (this._promptSettings[Keys.PROMPT_GRAYSCALE]) {
            this._wrapperActors.forEach(actor => {
                actor.ease_property('@effects.lockscreen-extension-desaturate.factor', 0.0, {
                    duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            })
        }

        if (this._promptSettings[Keys.PROMPT_PAUSE])
            this._player?.play();
    }

    _handleMonitor(monitorIndex) {
        const isLastMonitor = monitorIndex === Main.layoutManager.monitors.length - 1;
        const monitor = Main.layoutManager.monitors[monitorIndex];

        const wrapper = new Clutter.Actor();

        if (monitorIndex == 0) {
            this._wrapperActors = [];
        }

        Main.screenShield._dialog._backgroundGroup.add_child(wrapper);
        Main.screenShield._dialog._backgroundGroup.set_child_above_sibling(wrapper, null);

        const cloneActor = new Clutter.Clone({
            source: this._windowActor
        });

        wrapper.add_effect(new Shell.BlurEffect(this._blurEffect));

        // Adding color desaturation effect if needed
        if (this._promptSettings[Keys.PROMPT_GRAYSCALE]) {
            wrapper.add_effect_with_name(
                'lockscreen-extension-desaturate',
                new Clutter.DesaturateEffect({ factor: 0.0 })
            );
        }

        if (!this._backgroundCreated)
            wrapper.opacity = 0;

        wrapper.add_child(cloneActor);
        wrapper.set_child_above_sibling(cloneActor, null);
        this._wrapperActors.push(wrapper);

        wrapper.set_position(monitor.x, monitor.y);
        wrapper.set_size(monitor.width, monitor.height);
        wrapper.set_clip_to_allocation(true);
        
        this._applyScaling(cloneActor, monitor.width, monitor.height);

        if (!this._backgroundCreated && isLastMonitor) {
            this._initLoginManager();
            this._startAnimation();
            this._player.play();

            this._backgroundCreated = true;
        }
    }

    _applyScaling(cloneActor, targetW, targetH) {
        switch (this._scalingMode) {
            case ScalingMode.STRETCH: {
                // Fill the box exactly, ignore aspect ratio
                cloneActor.content_gravity = Clutter.ContentGravity.RESIZE_FILL;
                cloneActor.set_size(targetW, targetH);
                cloneActor.set_position(0, 0);
                break;
            }

            case ScalingMode.FIT: {
                // Preserve aspect ratio, letterboxed to fit entirely within the box
                const scale = Math.min(targetW / VIDEO_W, targetH / VIDEO_H);
                const w = VIDEO_W * scale;
                const h = VIDEO_H * scale;

                cloneActor.content_gravity = Clutter.ContentGravity.RESIZE_ASPECT;
                cloneActor.set_size(w, h);
                cloneActor.set_position(
                    (targetW - w) / 2,
                    (targetH - h) / 2
                );
                break;
            }

            case ScalingMode.COVER: {
                // Preserve aspect ratio, scale up to fully cover the box, crop overflow
                const scale = Math.max(targetW / VIDEO_W, targetH / VIDEO_H);
                const w = VIDEO_W * scale;
                const h = VIDEO_H * scale;

                cloneActor.content_gravity = Clutter.ContentGravity.RESIZE_FILL;
                cloneActor.set_size(w, h);
                cloneActor.set_position(
                    (targetW - w) / 2,
                    (targetH - h) / 2
                );
                break;
            }

            default:
                error(`_applyScaling: unknown scaling mode ${this._scalingMode}`);
                break;
        }
    }

    _startAnimation() {
        this._wrapperActors.forEach(actor => actor.ease({
            opacity: 255,
            duration: this._fadeInDuration,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        }));
    }

    _initLoginManager() {
        this._loginManager = LoginManager.getLoginManager();
        this._loginManager.connectObject('prepare-for-sleep', (_manager, aboutToSleep) => {
            if (!this._player) return;
            aboutToSleep ? this._player.pause() : this._player.play();
        }, this);
    }

    disable() {
        /* 
         * User unlocked the screen. 
         * Stopping the videoplayblack and cleaning everything up
        */
        if (this._injectRetryId) {
            GLib.source_remove(this._injectRetryId);
            this._injectRetryId = 0;
        }
        if (this._blurEffectTimeoutId) {
            GLib.source_remove(this._blurEffectTimeoutId);
            this._blurEffectTimeoutId = 0;
        }
        this._injectAttempts = 0;

        Main.screenShield._dialog._swipeTracker?.disconnectObject(this);
        this._tapAction?.disconnectObject(this);

        // Return all window actors to window_group before destroying
        const parent = this._windowActor.get_parent();
        if (parent) parent.remove_child(this._windowActor);
            
        this._windowActor.disconnectObject(this);
        global.window_group.add_child(this._windowActor);
        this._windowActor.hide();

        this._player?.destroy();
        this._player = null;

        this._injectionManager?.clear();
        this._injectionManager = null;

        this._loginManager?.disconnectObject(this);

        Object.values(this._wrapperActors).forEach(actor => {
            actor.disconnectObject(this);
            actor.remove_effect_by_name('lockscreen-extension-blur');
            actor.remove_effect_by_name('lockscreen-extension-desaturate');
            actor.destroy()
        })
        this._wrapperActors = {};
        this._settings = null;
    }
}
