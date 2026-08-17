import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import St from 'gi://St';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';

import { Keys, ScalingMode } from './enums.js';
import { MpvPlayerProcess } from './core/mpv_player_process.js';

import { isOnBattery } from './utils/battery.js';
import { SHELL_VERSION } from './utils/shell_version.js';
import { logWarn, logError } from './utils/logging.js';
import { sleep } from './utils/base.js';

const MAX_DIALOG_INJECT_ATTEMPTS = 100;
const DIALOG_INJECT_INTERVAL = 100;
const WINDOW_TIMEOUT = 10000;

export default class LockscreenExtension extends Extension {
    enable() {
        this._resetLockState();
        this._settings = this.getSettings();

        //NOTE: Global error handler w/ cleanup
        this._setupLock().catch(err => {
            logError(err);
            this.disable();
        });
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

    async _setupLock() {
        const videoPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (!videoPath) {
            logWarn('Video not set, falling back');
            return;
        }
        
        const disableOnBatter = this._settings.get_boolean(Keys.DISABLE_ON_BATTERY);
        if (disableOnBatter && await isOnBattery()) {
            logWarn('Skipping on battery');
            return;
        }

        const volume = this._settings.get_int(Keys.AUDIO_VOLUME) / 100;
        const loop = this._settings.get_boolean(Keys.LOOPED);
        const useVideorate = this._settings.get_boolean(Keys.USE_VIDEORATE);
        const framerate = this._settings.get_int(Keys.FRAMERATE);
        const colorAccurate = this._settings.get_boolean(Keys.DEBUG_USE_COLOR_ACCURATE);

        this._player = new MpvPlayerProcess({
            videoPath,
            scalingMode: this._scalingMode,
            loop,
            volume,
            useVideorate,
            framerate,
        });

        await this._player.run();
        await this._onPlayerInit();
    }

    async _onPlayerInit() {
        this._fadeInDuration  = this._settings.get_int(Keys.FADE_IN_DURATION);
        this._scalingMode = this._settings.get_int(Keys.SCALING_MODE);
        this._blurRadius = this._settings.get_int(Keys.BLUR_RADIUS);
        this._blurBrightness = this._settings.get_double(Keys.BLUR_BRIGHTNESS);
        this._forceFullscreen = this._settings.get_boolean(Keys.DEBUG_FORCE_FULLSCREEN);

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

        const win = await this._player.waitForWindow(WINDOW_TIMEOUT); 

        this._window = win
        this._windowActor = win.get_compositor_private();
        
        //NOTE: On gnome 48 and lower this functions accepts 1 argument
        if (SHELL_VERSION > 48)
            this._window.unmaximize()                
        else
            this._window.unmaximize(true)

        const parent = this._windowActor.get_parent();
        if (parent) parent.remove_child(this._windowActor);

        global.stage.add_child(this._windowActor);
        global.stage.set_child_below_sibling(this._windowActor, null);
        this._windowActor.opacity = 0;

        await this._injectIntoDialog();
    }

    async _waitForFullLoad() {
        while (!Main.screenShield._dialog || this._player.w === 0) {
            if (this._injectAttempts >= MAX_DIALOG_INJECT_ATTEMPTS) {
                throw new Error(
                    `_dialog never appeared after ${MAX_DIALOG_INJECT_ATTEMPTS} attempts`
                );
            }

            this._injectAttempts++;
            await sleep(DIALOG_INJECT_INTERVAL);
        }

        this._injectAttempts = 0;

        return Main.screenShield._dialog;
    }

    async _injectIntoDialog() {
        let dialog = await this._waitForFullLoad();


        this._injectionManager.overrideMethod(
            dialog, '_createBackground',
            (original) => {
                const self = this;
                return function(monitorIndex) {
                    original.call(this, monitorIndex);                    
                    self._handleMonitor(monitorIndex);
                };
            }
        );
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
        
        // Removing the existing signal to use our custom one
        const gtype = dialog._swipeTracker.constructor.$gtype;
        const swipeSignalId = GObject.signal_lookup('end', gtype);
        dialog._swipeTracker.disconnect(swipeSignalId);

        dialog._swipeTracker.connectObject('end', (...args) => {
            dialog._swipeEnd(...args);
            if (dialog._activePage == dialog._clock)
                this._onPromptHide();
            else
                this._onPromptShow();
        }, this);

        //NOTE: Replacing TapAction with a fresh one if exists (for gnome 48 and older)
        if (SHELL_VERSION < 49) {
            const actions = dialog.get_actions();
            const tapAction = actions.find(a => {
                //HACK: Maybe not the most beautiful solution, but works
                return a.constructor.name.includes('TapAction')
            });
            if (tapAction) {
                dialog.remove_action(tapAction);
                
                let newAction = new Clutter.TapAction();
                newAction.connectObject('tap', dialog._showPrompt.bind(dialog), this);
                dialog.add_action(newAction);
            } 
        }

        dialog._updateBackgrounds();
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
        this._window.move_resize_frame(
            true, 0, 0, this._player.w, this._player.h
        );

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
        const W = this._player.w;
        const H = this._player.h;

        // Keep the clone at native source size always; scaling is done via
        // set_scale() (transform-based) rather than set_size()

        // since set_size()-based scaling triggers a GNOME 48 repaint bug where
        // the clone's box only partially updates when scaled up from a smaller
        // source.set_scale() does not hit this bug.
        cloneActor.set_size(W, H);

        switch (this._scalingMode) {
            case ScalingMode.STRETCH: {
                // Fill the box exactly, ignore aspect ratio
                const scaleX = targetW / W;
                const scaleY = targetH / H;

                cloneActor.set_scale(scaleX, scaleY);
                cloneActor.set_position(0, 0);
                break;
            }

            case ScalingMode.FIT: {
                // Preserve aspect ratio, letterboxed to fit entirely within the box
                const scale = Math.min(targetW / W, targetH / H);
                const w = W * scale;
                const h = H * scale;

                cloneActor.set_scale(scale, scale);
                cloneActor.set_position(
                    (targetW - w) / 2,
                    (targetH - h) / 2
                );
                break;
            }
            default: {
                // Preserve aspect ratio, scale up to fully cover the box, crop overflow
                const scale = Math.max(targetW / W, targetH / H);
                const w = W * scale;
                const h = H * scale;

                cloneActor.set_scale(scale, scale);
                cloneActor.set_position(
                    (targetW - w) / 2,
                    (targetH - h) / 2
                );
                break;
            }
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

        if (this._windowActor) {
            this._windowActor.hide();
        }

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
