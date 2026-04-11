import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as LoginManager from 'resource:///org/gnome/shell/misc/loginManager.js';

import {Extension, InjectionManager} from 'resource:///org/gnome/shell/extensions/extension.js';

import St from 'gi://St';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { Keys } from './enums.js';
import { PlayerProcess } from './core/player_process.js';

import { isOnBattery } from './utils/battery.js';
import { isGtk4PaintableSinkAvailable } from './utils/check_dependencies.js';
import { sendErrorNotification } from './utils/notifications.js';


export default class LockscreenExtension extends Extension {
    enable() {
        this._resetLockState();
        this._lockActive = false;
        this._screenShieldId = 0;

        if (!isGtk4PaintableSinkAvailable()) {
            sendErrorNotification(
                'gtk4paintablesink is not available.' +
                'See README.md for installation instructions.'
            );
            return;
        }

        this._settings = this.getSettings();

        // Defer the actual player setup until the screen shield
        // reports it is active. Hooking `Main.screenShield._dialog`
        // directly at enable() time is unreliable: the dialog object
        // can be null (never locked yet), or become a dead reference
        // if GNOME recreates it between enable() and the next lock
        // cycle. Listening to `active-changed` guarantees we inject
        // into the current, live dialog on every lock.
        this._screenShieldId = Main.screenShield.connect(
            'active-changed',
            this._onActiveChanged.bind(this)
        );

        // If the shield is already active at enable() time (e.g. the
        // user just toggled the extension on from the lock screen),
        // run setup immediately.
        if (Main.screenShield.active)
            this._onActiveChanged();
    }

    _resetLockState() {
        this._backgroundCreated = false;
        this._wrapperActors = {}; // connector -> actor
        this._windowActors = {};  // connector -> actor
        this._lockPositionSignals = [];

        this._promptShown = false;
        this._injectionManager = null;
        this._player = null;

        this._injectRetryId = 0;
        this._injectAttempts = 0;
    }

    _onActiveChanged() {
        const active = Main.screenShield.active;

        if (active && !this._lockActive) {
            this._lockActive = true;
            this._setupForLock();
        } else if (!active && this._lockActive) {
            this._lockActive = false;
            this._teardownForUnlock();
        }
    }

    _setupForLock() {
        const disableOnBatter = this._settings.get_boolean(Keys.DISABLE_ON_BATTERY);
        if (disableOnBatter && isOnBattery()) {
            console.warn('Skipping on battery');
            return;
        }

        const videoPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (!videoPath) {
            console.warn('Video not set, falling back');
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
            console.error('Failed to run video player! Falling back...', e);
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

        const monitorCount = Main.layoutManager.monitors.length;
        this._player.waitForWindows(monitorCount, 10000, (data) => {
            for (const win of data) {
                //NOTE: Relying on connector name for better reliability (indices are not static)
                const title = win.get_title() || '';
                const match = title.match(/^LLS-Player-(.+)$/);
                const connector = match ? match[1] : null;
                this._windowActors[connector] = win.get_compositor_private();
            }

            this._injectIntoDialog();
        }, (err) => {
            console.error(`Unable to intercept all windows: ${err}`);
        })
    }

    _injectIntoDialog() {
        // `active-changed` can fire a hair before `_dialog` is
        // populated in some GNOME versions. Poll briefly if so.
        //
        // We cap the retry loop at ~2s worth of 100ms ticks. The
        // original single-shot 100ms retry was too short on at
        // least some GNOME 49 setups, where `_dialog` appears to
        // be recreated on each lock and isn't ready yet on second
        // and subsequent locks. The retry id is tracked so
        // `_teardownForUnlock()` can cancel it and avoid firing
        // injection work into a half-torn-down state.
        const dialog = Main.screenShield._dialog;
        if (!dialog) {
            if (this._injectAttempts >= 20) {
                console.warn('LiveLockScreen: _dialog never appeared after 20 retries, giving up');
                this._injectAttempts = 0;
                return;
            }
            this._injectAttempts++;
            this._injectRetryId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                this._injectRetryId = 0;
                if (this._lockActive) this._injectIntoDialog();
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
        const actions = dialog.get_actions();
        const tapAction = actions.find(a => {
            //HACK: Maybe not the most beautiful solution, but works
            return a.constructor.name.includes('TapAction')
        });
        if (tapAction) {
            dialog.remove_action(tapAction);

            let newAction = new Clutter.TapAction();
            newAction.connect('tap', dialog._showPrompt.bind(dialog));
            dialog.add_action(newAction);
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

            Object.values(this._wrapperActors).forEach(actor => {
                actor.ease_property('@effects.lockscreen-extension-blur.radius', radius, {
                    duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
                actor.ease_property('@effects.lockscreen-extension-blur.brightness', brightness, {
                    duration: this._promptSettings[Keys.PROMPT_BLUR_ANIM_DURATION],
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            })
        }

        if (this._promptSettings[Keys.PROMPT_GRAYSCALE]) {
            Object.values(this._wrapperActors).forEach(actor => {
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

            Object.values(this._wrapperActors).forEach(actor => {
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
            Object.values(this._wrapperActors).forEach(actor => {
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
        let targetConnector = null;
        const monitorManager = global.backend.get_monitor_manager();

        for (let connector of Object.keys(this._windowActors)) {
            const idx = monitorManager.get_monitor_for_connector(connector);
            if (idx == monitorIndex) {
                targetConnector = connector;
                break;
            }
        }

        if (!targetConnector) {
            console.warn("Actor not found for this monitor! Skipping...");
            return;
        }

        if (targetConnector in this._wrapperActors) {
            console.warn(`Wrapper already exists for monitor ${monitorIndex}, skipping`);
            return;
        }

        const isLastMonitor = monitorIndex === Main.layoutManager.monitors.length - 1;
        const monitor = Main.layoutManager.monitors[monitorIndex];
        const windowActor = this._windowActors[targetConnector];

        if (windowActor) {
            const parent = windowActor.get_parent();
            if (parent) parent.remove_child(windowActor);

            const wrapper = new Clutter.Actor();

            Main.screenShield._dialog._backgroundGroup.add_child(wrapper);
            Main.screenShield._dialog._backgroundGroup.set_child_above_sibling(wrapper, null);

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

            wrapper.add_child(windowActor);
            wrapper.set_child_above_sibling(windowActor, null);

            wrapper.connect('destroy', () => {
                const p = windowActor.get_parent();
                if (p) p.remove_child(windowActor);
                global.window_group.add_child(windowActor);
                delete this._wrapperActors[targetConnector];
            });

            if (this._forceFullscreen) {
                wrapper.set_position(0, 0);

                const win = windowActor.get_meta_window();
                win.move_to_monitor(monitorIndex);
                win.make_fullscreen();

            } else {
                wrapper.set_position(monitor.x, monitor.y);
                wrapper.set_size(monitor.width, monitor.height);
                wrapper.set_clip_to_allocation(true);

                // NOTE:
                // This might look like an overkill,
                // but you really need to aggressively position actors on any
                // size/position change
                const fixPositionAndScale = () => {
                    windowActor.set_translation(
                        -windowActor.x, -windowActor.y, 0
                    );
                    windowActor.set_pivot_point(0, 0);
                    windowActor.set_scale(1, 1);
                };
                const sigX = windowActor.connect('notify::x', fixPositionAndScale);
                const sigY = windowActor.connect('notify::y', fixPositionAndScale);
                const sigW = windowActor.connect('notify::width', fixPositionAndScale);
                const sigH = windowActor.connect('notify::height', fixPositionAndScale);
                this._lockPositionSignals.push({ actor: windowActor, ids: [sigX, sigY, sigW, sigH] });

                fixPositionAndScale();
            }

            this._wrapperActors[targetConnector] = wrapper;

        } else {
            console.warn(`No window actor for monitor ${monitorIndex}, skipping`);
        }

        if (!this._backgroundCreated && isLastMonitor) {
            this._initLoginManager();
            this._startAnimation();
            this._player.play();

            this._backgroundCreated = true;
        }
    }

    _startAnimation() {
        Object.values(this._wrapperActors).forEach(actor => actor.ease({
            opacity: 255,
            duration: this._fadeInDuration,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
        }));
    }

    _initLoginManager() {
        this._loginManager = LoginManager.getLoginManager();
        this._sleepId = this._loginManager.connect('prepare-for-sleep', (_manager, aboutToSleep) => {
            if (!this._player) return;
            aboutToSleep ? this._player.pause() : this._player.play();
        });
    }

    _teardownForUnlock() {
        // Cancel any pending dialog-injection retry so it can't fire
        // into a partially torn-down state or leak across lock cycles.
        if (this._injectRetryId) {
            try { GLib.source_remove(this._injectRetryId); } catch (_) {}
            this._injectRetryId = 0;
        }
        this._injectAttempts = 0;

        for (const { actor, ids } of this._lockPositionSignals) {
            for (const id of ids) {
                try { actor.disconnect(id); } catch (_) { /* actor gone */ }
            }
        }
        this._lockPositionSignals = [];

        // Return all window actors to window_group before destroying
        for (const windowActor of Object.values(this._windowActors)) {
            try {
                const parent = windowActor.get_parent();
                if (parent) parent.remove_child(windowActor);
                global.window_group.add_child(windowActor);
                windowActor.hide();
            } catch (_) { /* actor gone */ }
        }
        this._windowActors = {};

        this._player?.destroy();
        this._player = null;

        this._injectionManager?.clear();
        this._injectionManager = null;

        if (this._sleepId && this._loginManager) {
            this._loginManager.disconnect(this._sleepId);
            this._sleepId = null;
        }
        this._loginManager = null;

        Object.values(this._wrapperActors).forEach(actor => {
            try {
                actor.remove_effect_by_name('lockscreen-extension-blur');
                actor.remove_effect_by_name('lockscreen-extension-desaturate');
                actor.destroy();
            } catch (_) { /* already destroyed */ }
        });
        this._wrapperActors = {};
        this._backgroundCreated = false;
        this._promptShown = false;
    }

    disable() {
        if (this._screenShieldId) {
            Main.screenShield.disconnect(this._screenShieldId);
            this._screenShieldId = 0;
        }

        if (this._lockActive) {
            this._teardownForUnlock();
            this._lockActive = false;
        }

        this._settings = null;
    }
}
