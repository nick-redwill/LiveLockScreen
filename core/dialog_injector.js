import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { InjectionManager } from 'resource:///org/gnome/shell/extensions/extension.js';

import Clutter from 'gi://Clutter';

import { SHELL_VERSION } from '../utils/shell_version.js';
import { logWarn } from '../utils/logging.js';
import { sleep } from '../utils/base.js';

const MAX_DIALOG_INJECT_ATTEMPTS = 100;
const DIALOG_INJECT_INTERVAL = 100;

/**
 * Hooks into the unlock dialog and reports what happens there.
 * Does not touch the player or any effects, only calls the callbacks:
 *  - onCreateBackgrounds(monitorIndex, backgroundGroup)
 *  - onPromptShow()
 *  - onClockShow()
 *
 * NOTE: Callbacks may fire repeatedly for the same state
 * (e.g. tap + _showPrompt), deduplicate on the receiving side
 */
export class DialogInjector {
    constructor({
        onCreateBackgrounds,
        onPromptShow,
        onClockShow,
    }) {
        this._onCreateBackgrounds = onCreateBackgrounds;
        this._onPromptShow = onPromptShow;
        this._onClockShow = onClockShow;

        this._dialog = null;
        this._authPrompt = null;
        this._tapAction = null;
        this._injectionManager = new InjectionManager();
    }

    /**
     * Waits for the unlock dialog to appear and injects into it.
     * Throws if the dialog never appears
     */
    async inject() {
        this._dialog = await this._waitForDialog();
        this._dialog.connectObject('destroy', () => {
            this._dialog = null;
            this._authPrompt = null;
            this._tapAction = null;
        }, this);

        this._injectBase();
        this._injectSwipe();
        this._injectTap();
        this._injectFingerprint();
    }

    async _waitForDialog() {
        let attempts = 0;
        while (!Main.screenShield._dialog) {
            if (attempts >= MAX_DIALOG_INJECT_ATTEMPTS) {
                throw new Error(
                    `_dialog never appeared after ${MAX_DIALOG_INJECT_ATTEMPTS} attempts`
                );
            }

            attempts++;
            await sleep(DIALOG_INJECT_INTERVAL);
        }

        return Main.screenShield._dialog;
    }

    _injectBase() {
        const self = this;

        this._injectionManager.overrideMethod(
            this._dialog, '_createBackground',
            (original) => {
                return function(monitorIndex) {
                    //TODO: Move original.call out of here for default background change
                    original.call(this, monitorIndex);
                    self._onCreateBackgrounds?.(monitorIndex, this._backgroundGroup);
                };
            }
        );
        this._injectionManager.overrideMethod(
            this._dialog, '_showPrompt',
            (original) => {
                return function(...args) {
                    original.call(this, ...args);
                    self._onPromptShow?.();
                };
            }
        );
        this._injectionManager.overrideMethod(
            this._dialog, '_showClock',
            (original) => {
                return function(...args) {
                    original.call(this, ...args);
                    self._onClockShow?.();
                };
            }
        );
    }

    _injectSwipe() {
        //NOTE:
        // The dialog connects its own 'end' handler in the constructor,
        // so ours runs after it. _swipeEnd sets _activePage synchronously,
        // no need to disconnect the original handler
        const dialog = this._dialog;
        dialog._swipeTracker?.connectObject('end', () => {
            if (dialog._activePage === dialog._clock)
                this._onClockShow?.();
            else
                this._onPromptShow?.();
        }, this);
    }

    _injectTap() {
        //NOTE: 
        // Using the existing TapAction to connect it's tap signal to onPromptShow
        // for GNOME 48 and older
        if (SHELL_VERSION >= 49) return;

        this._tapAction = this._dialog.get_actions()
            .find(a => a instanceof Clutter.TapAction) ?? null;

        this._tapAction?.connectObject('tap', () => {
            this._onPromptShow?.();
        }, this);
    }

    _injectFingerprint() {
        //NOTE:
        // AuthPrompt is created lazily in _ensureAuthPrompt and destroyed
        // when the clock is shown again, so (re)connect every time it is ensured
        const self = this;

        this._injectionManager.overrideMethod(
            this._dialog, '_ensureAuthPrompt',
            (original) => {
                return function(...args) {
                    original.call(this, ...args);
                    self._connectAuthPrompt(this._authPrompt);
                };
            }
        );

        // Already exists if the prompt was shown before injection
        this._connectAuthPrompt(this._dialog._authPrompt);
    }

    _connectAuthPrompt(authPrompt) {
        if (!authPrompt || authPrompt === this._authPrompt) return;

        this._authPrompt?.disconnectObject(this);
        this._authPrompt = authPrompt;

        // When a fingerprint verification message is shown (e.g. "Place your finger")
        // treat it as a prompt being shown so blur/pause effects apply
        //NOTE: 
        // I'll be honest, I have no idea if this works or not
        // I dont have a fingerprint scanner to test
        // But it should :) 
        authPrompt.connectObject(
            'next', () => this._onPromptShow?.(),
            'destroy', () => {
                if (this._authPrompt === authPrompt)
                    this._authPrompt = null;
            },
            this
        );
    }

    recreateBackgrounds() {
        if (!this._dialog) {
            logWarn('DialogInjector: dialog not available, cannot recreate backgrounds');
            return;
        }
        this._dialog._updateBackgrounds();
    }

    destroy() {
        this._injectionManager?.clear();
        this._injectionManager = null;

        this._authPrompt?.disconnectObject(this);
        this._authPrompt = null;

        this._tapAction?.disconnectObject(this);
        this._tapAction = null;

        if (this._dialog) {
            this._dialog._swipeTracker?.disconnectObject(this);
            this._dialog.disconnectObject(this);
            this._dialog = null;
        }

        this._onCreateBackgrounds = null;
        this._onPromptShow = null;
        this._onClockShow = null;
    }
}
