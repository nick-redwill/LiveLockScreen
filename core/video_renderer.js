import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import St from 'gi://St';
import Shell from 'gi://Shell';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { Direction } from '../enums.js';
import { applyScaling, getRenderSize } from '../utils/actors.js';
import { SHELL_VERSION } from '../utils/shell_version.js';
import { logWarn } from '../utils/logging.js';
import { toColor } from '../utils/base.js';

import { ActorAnimator } from '../helpers/actor_animator.js';
import { SmoothDesaturateEffect } from '../helpers/smooth_desaturate_effect.js';

const BLUR_EFFECT_NAME = 'lockscreen-extension-blur';
const DESATURATE_EFFECT_NAME = 'lockscreen-extension-desaturate';

// NOTE: Adding small delay to prevent stuttering of video
const PROMPT_ANIM_DELAY = 5;
// Keeps the screen black a bit longer after the new video is ready,
// so video load spam doesn't cause blinking
const BLACKIN_DELAY = 100;
// Times in a row the window gets resized back before giving up, see _queueWindowSizeCheck()
const MAX_WINDOW_SIZE_RETRIES = 10;

/**
 * Shows the player window as the lock screen background.
 * Owns the window actor, one wrapper (with a clone of the window)
 * per monitor, their effects and the animations of those effects.
 *
 * Does not touch the player or the dialog. The background group
 * is passed in by whoever creates the backgrounds.
 * 
 * NOTE: 
 * Before the window would be scaled to video's native size 
 * and then downscaled by each clone to according monitors size (based on scaling mode).
 * 
 * Now the window is scaled based on monitors or kept at video size.
 * That means that 480p video remains 480p for a Full HD monitor
 * However 4K video is downscaled to Full HD
 * And in case of multiple monitors of different size we pick a width/height 
 * combination that suits all monitors
 * 
 * TODO: Split this into smaller classes
 */
export class VideoRenderer {
    constructor({
        window, w = 0, h = 0,
        scalingMode,
        fadeInDuration = 0,
        blurRadius = 0,
        blurBrightness = 1,
        promptGrayscale = false,
        promptChangeBlur = false,
        promptBlurRadius = 0,
        promptBlurBrightness = 1,
        promptAnimDuration = 0,
        blackoutDuration = 0,
        onReady,
    }) {

        // video size
        this._sourceW = w;
        this._sourceH = h;
        // window size
        //NOTE: if w/h are 0 the window is not resized and the wrapper is not scaled
        this._w = 0;
        this._h = 0;
        this._scalingMode = scalingMode;
        this._fadeInDuration = fadeInDuration;
        // Fade to and from black when switching videos, 0 to switch without it
        this._blackoutDuration = blackoutDuration;

        const themeContext = St.ThemeContext.get_for_stage(global.stage);
        this._blurRadius = blurRadius * themeContext.scale_factor;
        this._blurBrightness = blurBrightness;
        this._promptGrayscale = promptGrayscale;

        this._fadeAnim = null;
        this._grayscaleAnim = null;
        this._blurRadiusAnim = null;
        this._blurBrightnessAnim = null;
        this._blackoutAnim = null;
        this._promptChangeBlur = promptChangeBlur;

        // Called once, when backgrounds for all monitors were created for the first time
        this._onReady = onReady;

        this._wrapperActors = [];
        this._clones = [];
        // Black actors above the wrappers, see blackout()
        this._blackoutActors = [];
        this._blackoutTimeoutId = 0;
        // Pending window size check and resizes, see _queueWindowSizeCheck()
        this._sizeCheckId = 0;
        this._sizeRetries = 0;
        this._pendingOnBlack = null; // Pending blackout callbacks
        this._backgroundCreated = false;
        this._promptShown = false;

        this._initAnimators({
            promptChangeBlur, 
            promptBlurRadius: promptBlurRadius * themeContext.scale_factor,
            promptBlurBrightness, promptAnimDuration,
        });

        this._window = null;
        this._windowActor = null;
        this._updateRenderSize(window);
        this._attachWindow(window);
    }

    _initAnimators({ promptChangeBlur, promptBlurRadius, promptBlurBrightness, promptAnimDuration }) {
        const dstRadius = promptBlurRadius;
        const dstBrightness = dstRadius ? promptBlurBrightness : 1;

        const srcRadius = this._blurRadius;
        const srcBrightness = srcRadius ? this._blurBrightness : 1;

        if (this._blackoutDuration > 0)
            this._blackoutAnim = new ActorAnimator({
                actors: [],
                property: 'opacity',
                from: 0,
                to: 255,
                duration: this._blackoutDuration,
            });

        if (this._fadeInDuration > 0)
            this._fadeAnim = new ActorAnimator({
                actors: [],
                property: 'opacity',
                from: 0,
                to: 255,
                duration: this._fadeInDuration
            });
        if (this._promptGrayscale)
            this._grayscaleAnim = new ActorAnimator({
                actors: [],
                property: `@effects.${DESATURATE_EFFECT_NAME}.factor`,
                from: 0,
                to: 1,
                duration: promptAnimDuration
            });
        if (promptChangeBlur) {
            this._blurRadiusAnim = new ActorAnimator({
                actors: [],
                property: `@effects.${BLUR_EFFECT_NAME}.radius`,
                from: parseFloat(srcRadius),
                to: parseFloat(dstRadius),
                duration: promptAnimDuration
            });
            this._blurBrightnessAnim = new ActorAnimator({
                actors: [],
                property: `@effects.${BLUR_EFFECT_NAME}.brightness`,
                from: parseFloat(srcBrightness),
                to: parseFloat(dstBrightness),
                duration: promptAnimDuration
            });
        }
    }

    /**
     * NOTE: Only animators of the wrappers
     */
    get _animators() {
        return [
            this._fadeAnim,
            this._grayscaleAnim,
            this._blurRadiusAnim,
            this._blurBrightnessAnim,
        ];
    }

    /**
     * Moves the player window out of the window group onto the global.stage,
     * below everything, and hides it. Only its clones are visible
     */
    _attachWindow(window) {
        this._window = window;
        this._windowActor = window.get_compositor_private();

        this._window.connectObject(
            'unmanaged', () => {
                this._resetWindowActor();
                this._window = null;
            },
            //NOTE:
            // mpv has this bug when it randomly resizes the window back to its
            // initial size even with the auto-window-resize=no flag set when
            // loading new file. Thats why we connect to this signal
            // and force our established window size 
            'size-changed', () => this._queueWindowSizeCheck(),
            this
        );
        this._windowActor?.connectObject('destroy', () => {
            this._windowActor = null;
        }, this);

        //NOTE: On gnome 48 and lower this functions accepts 1 argument
        if (SHELL_VERSION > 48)
            this._window.unmaximize();
        else
            this._window.unmaximize(true);

        this._resizeWindow();

        if (!this._windowActor) return;

        const parent = this._windowActor.get_parent();
        if (parent) parent.remove_child(this._windowActor);

        global.stage.add_child(this._windowActor);
        global.stage.set_child_below_sibling(this._windowActor, null);
        this._windowActor.opacity = 0;
    }

    _resetWindowActor() {
        //NOTE:
        // This function doesnt destroy the window actor
        // it just resets it to its initial state
        // and also hides it for convinience
        if (!this._windowActor) return;

        this._windowActor.disconnectObject(this);
        this._windowActor.hide();

        const parent = this._windowActor.get_parent();
        if (parent) parent.remove_child(this._windowActor);
        global.window_group.add_child(this._windowActor);
        this._windowActor = null;
    }

    _hasSize() {
        return this._w > 0 && this._h > 0;
    }

    clonesCreated() {
        return this._clones.length > 0;
    }

    /**
     * Scales the wrapper over its monitor, the clone inside stays unscaled.
     * NOTE: The scale must not be on the clone, see applyScaling()
     */
    _scaleWrapper(data) {
        applyScaling(
            data.wrapper, this._scalingMode, 
            this._w, this._h, data.monitor
        );
        data.clone.set_size(this._w, this._h);
    }

    /**
     * Computes the size the window renders at (_w/_h) from the video size
     * and the monitors, see getRenderSize()
     */
    _updateRenderSize(window = this._window) {
        if (!(this._sourceW > 0 && this._sourceH > 0)) {
            this._w = 0;
            this._h = 0;
            return;
        }

        const monitors = Main.layoutManager.monitors;
        // The window is rendered with the scale factor of the monitor it is on
        const windowMonitor = monitors[window?.get_monitor()] ?? Main.layoutManager.primaryMonitor;
        const windowScale = windowMonitor.geometry_scale;

        [this._w, this._h] = getRenderSize(
            this._scalingMode,
            this._sourceW, this._sourceH,
            monitors.map(m => ({
                width: m.width,
                height: m.height,
                pixelRatio: (m.geometry_scale) / windowScale,
            }))
        );
    }

    _resizeWindow() {
        if (!this._window || this._window.unmanaging || !this._hasSize())
            return;

        this._window.move_resize_frame(true, 0, 0, this._w, this._h);
    }

    /**
     * Resizes the window back to the render size if something else resized it.
     * Deferred, a resize requested while another one is still being applied
     * gets overridden by it
     */
    _queueWindowSizeCheck() {
        if (this._sizeCheckId) return;
        this._sizeCheckId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._sizeCheckId = 0;

            if (!this._window || this._window.unmanaging || !this._hasSize())
                return GLib.SOURCE_REMOVE;

            const rect = this._window.get_frame_rect();
            if (rect.width === this._w && rect.height === this._h) {
                this._sizeRetries = 0;
                return GLib.SOURCE_REMOVE;
            }

            // Stop if something keeps overriding the size, instead of fighting it forever
            if (this._sizeRetries >= MAX_WINDOW_SIZE_RETRIES) {
                logWarn(`VideoRenderer: window keeps losing its size ${this._w}x${this._h}, giving up`);
                return GLib.SOURCE_REMOVE;
            }

            this._sizeRetries++;
            this._resizeWindow();
            return GLib.SOURCE_REMOVE;
        });
    }

    /**
     * Updates the video size and resizes the window.
     * NOTE: Existing clones are rescaled
     */
    setSize(w, h) {
        this._sourceW = w;
        this._sourceH = h;
        this._updateRenderSize();
        // New target size, it gets its own retries
        this._sizeRetries = 0;
        this._resizeWindow();
        // Rescaling existing wrappers
        this._clones.forEach(data => this._scaleWrapper(data));
    }

    /**
     * Creates the wrapper for one monitor and adds it to the background group.
     * Meant to be called for every monitor in order, after the dialog
     * (re)created its own background for it
     * 
     * NOTE:
     * Should not be called directly. This function relies on unlockDialog
     * destroying existing backgroundGroups and containers inside of them
     * It must be connected to DialogInjector.onCreateBackgrounds callback
     * To actually update backgrounds call DialogInjector.recreateBackgrounds()
     */
    updateBackground(monitorIndex, backgroundGroup) {
        if (!this._window || this._window.unmanaging || !this._windowActor)
            return;

        const monitors = Main.layoutManager.monitors;
        const monitor = monitors[monitorIndex];
        const isLastMonitor = monitorIndex === monitors.length - 1;

        // Monitors might have changed since the last time
        if (monitorIndex === 0)
            this._updateRenderSize();
        this._resizeWindow();

        // The dialog destroys all children of the background group before
        // recreating them, so our old wrappers are already gone at this point
        if (monitorIndex === 0) {
            this._wrapperActors = [];
            this._clones = [];
            this._blackoutActors = [];
        }

        // The wrapper has the render size and is scaled and clipped to the monitor,
        // the clone inside it stays unscaled (see applyScaling)
        const wrapper = new Clutter.Actor();
        const cloneActor = new Clutter.Clone({
            source: this._windowActor
        });

        const data = {
            wrapper,
            clone: cloneActor,
            monitor,
        };

        // Destroying the wrapper destroys its clone as well, forget both
        wrapper.connectObject('destroy', () => {
            this._wrapperActors = this._wrapperActors.filter(a => a !== wrapper);
            this._clones = this._clones.filter(c => c !== data);
        }, this);

        backgroundGroup.add_child(wrapper);
        backgroundGroup.set_child_above_sibling(wrapper, null);

        this._clones.push(data);

        //NOTE: Only applying this effect when its needed
        if (this._blurRadius > 0 || this._promptChangeBlur) {
            // Continue from the current animation state, the wrapper might be recreated mid-animation
            wrapper.add_effect(new Shell.BlurEffect({
                name: BLUR_EFFECT_NAME,
                radius: this._blurRadiusAnim?.get_value() ?? this._blurRadius,
                brightness: this._blurBrightnessAnim?.get_value() ?? this._blurBrightness,
            }));
        }
        
        // Adding color desaturation effect if needed
        if (this._promptGrayscale) {
            wrapper.add_effect_with_name(
                DESATURATE_EFFECT_NAME,
                new SmoothDesaturateEffect({ factor: this._grayscaleAnim?.get_value() ?? 0.0 })
            );
        }

        if (!this._backgroundCreated && this._fadeInDuration > 0)
            wrapper.opacity = 0;

        wrapper.add_child(cloneActor);
        wrapper.set_child_above_sibling(cloneActor, null);
        this._wrapperActors.push(wrapper);

        if (this._hasSize()) {
            this._scaleWrapper(data);
        } else {
            // Unscaled over the monitor until the video size is known
            wrapper.set_position(monitor.x, monitor.y);
            wrapper.set_size(monitor.width, monitor.height);
            wrapper.set_clip_to_allocation(true);
            logWarn('VideoRenderer: video size unknown, skipping scaling');
        }

        // Only creating if relevant
        if (this._blackoutAnim)
            this._addBlackoutActor(monitor, backgroundGroup);

        if (!isLastMonitor) return;

        //NOTE: This part runs only when all monitors were updated
        this._animators.forEach(anim => anim?.rebind(this._wrapperActors));
        this._blackoutAnim?.rebind(this._blackoutActors);

        if (!this._backgroundCreated) {
            this._backgroundCreated = true;
            this._onReady?.();
        }
    }

    /**
     * Black actor covering the monitor, above the wrapper (not inside it),
     * so the wrapper effects do not apply to it. Invisible until blackout()
     */
    _addBlackoutActor(monitor, backgroundGroup) {
        const actor = new Clutter.Actor({
            x: monitor.x,
            y: monitor.y,
            width: monitor.width,
            height: monitor.height,
            background_color: toColor('#000000'),
            opacity: 0,
        });
        actor.connectObject('destroy', () => {
            this._blackoutActors = this._blackoutActors.filter(a => a !== actor);
        }, this);

        backgroundGroup.add_child(actor);
        backgroundGroup.set_child_above_sibling(actor, null);
        this._blackoutActors.push(actor);
    }

    onPromptShown() {
        if (this._promptShown) return;
        this._promptShown = true;

        this._blurRadiusAnim?.play(Direction.FORWARD, PROMPT_ANIM_DELAY);
        this._blurBrightnessAnim?.play(Direction.FORWARD, PROMPT_ANIM_DELAY);
        this._grayscaleAnim?.play(Direction.FORWARD);
    }

    onClockShown() {
        if (!this._promptShown) return;
        this._promptShown = false;

        this._blurRadiusAnim?.play(Direction.BACKWARD, PROMPT_ANIM_DELAY);
        this._blurBrightnessAnim?.play(Direction.BACKWARD, PROMPT_ANIM_DELAY);
        this._grayscaleAnim?.play(Direction.BACKWARD);
    }

    /**
     * Starts (or continues) the fade in. Call when the screen turns on
     */
    fadeIn(delay = 0) {
        this._fadeAnim?.play(Direction.FORWARD, delay);
    }

    /**
     * Pauses the fade in. Call when the screen goes blank
     */
    pauseFade() {
        this._fadeAnim?.pause();
    }

    /**
     * Fades the screen to black and once done calls the callback
     *
     * Calling it again during an ongoing blackout restarts it, 
     * a pending callback of the previous call runs right away 
     * so no switch gets lost
     *
     * @param {() => void} [onBlack] - Called once the screen is black, e.g. player.next()
     */
    blackout(onBlack) {
        this._clearBlackoutTimeout();
        this._pendingOnBlack?.();
        this._pendingOnBlack = null;

        // Fade disabled, switch right away
        if (!this._blackoutAnim) {
            onBlack?.();
            return;
        }

        this._pendingOnBlack = onBlack ?? null;
        this._blackoutAnim.play(Direction.FORWARD);

        //NOTE:
        // Timeout instead of a callback from ActorAnimator for simplicity
        this._blackoutTimeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT, this._blackoutDuration, () => {
                this._pendingOnBlack?.();
                this._pendingOnBlack = null;
                this._blackoutTimeoutId = 0;
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    blackin() {
        if (this._pendingOnBlack) return;
        this._blackoutAnim?.play(Direction.BACKWARD, BLACKIN_DELAY);
    }

    _clearBlackoutTimeout() {
        if (this._blackoutTimeoutId) {
            GLib.source_remove(this._blackoutTimeoutId);
            this._blackoutTimeoutId = 0;
        }
    }

    destroy() {
        this._clearBlackoutTimeout();
        if (this._sizeCheckId) {
            GLib.source_remove(this._sizeCheckId);
            this._sizeCheckId = 0;
        }
        this._pendingOnBlack = null;

        // Animators first, they hold transitions on the actors
        this._animators.forEach(anim => anim?.destroy());
        this._fadeAnim = null;
        this._grayscaleAnim = null;
        this._blurRadiusAnim = null;
        this._blurBrightnessAnim = null;
        this._blackoutAnim?.destroy();
        this._blackoutAnim = null;

        this._wrapperActors.forEach(actor => {
            actor.disconnectObject(this);
            actor.remove_effect_by_name(BLUR_EFFECT_NAME);
            actor.remove_effect_by_name(DESATURATE_EFFECT_NAME);
            actor.destroy();
        });
        this._wrapperActors = [];
        this._clones = [];

        this._blackoutActors.forEach(actor => {
            actor.disconnectObject(this);
            actor.destroy();
        });
        this._blackoutActors = [];
        this._resetWindowActor();

        if (this._window) {
            this._window.disconnectObject(this);
            this._window = null;
        }

        this._onReady = null;
    }
}
