import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { Keys, ActionOnBlank } from './enums.js';

import { resolveMediaPaths } from './utils/media_files.js';
import { logWarn, logError } from './utils/logging.js';
import { destroySleeps } from './utils/base.js';
import { isMpvAvailable } from './utils/check_dependencies.js';
import { sendErrorNotification } from './utils/notifications.js';

import { DialogInjector } from './core/dialog_injector.js';
import { VideoRenderer } from './core/video_renderer.js';
import { MpvPlayerProcess } from './core/mpv_player_process.js';
import { Playlist } from './core/playlist.js';

import { MprisServer } from './helpers/mpris_server.js';
import { SleepWatcher } from './helpers/sleep_watcher.js';
import { BatteryWatcher } from './helpers/battery_watcher.js';
import { ScreenBlankWatcher } from './helpers/screen_blank_watcher.js';

const WINDOW_TIMEOUT = 10000;

export default class LockscreenExtension extends Extension {
    enable() {
        this._promptShown = false;
        this._ready = false; // Whether the actors are setup and ready
        this._sleeping = false; 
        // Last applied result of _isActive(), see _updateActive()
        this._active = false;
        // Paused through media controls, nothing else resumes playback until played again
        this._userPaused = false;
        // Last pause state reported by mpv
        this._playerPaused = true;
        this._settings = this.getSettings();

        this._setup().catch((e) => {
            logError(`Unable to setup extension: ${e}`);
            this.disable();
        });
    }

    async _setup() {
        if (!this._checkMpv())
            return;

        const videoPaths = this._getVideoPaths();
        if (!videoPaths)
            return;

        this._readPlaybackSettings();
        this._setupWatchers();
        await this._setupInjector();

        this._setupPlayer(this._createPlaylist(videoPaths));
        if (this._settings.get_boolean(Keys.MPRIS_ENABLED))
            this._setupMpris();

        await this._player.run();
        const window = await this._player.waitForWindow(WINDOW_TIMEOUT);
        await this._setupRenderer(window);
    }

    _checkMpv() {
        if (isMpvAvailable())
            return true;

        sendErrorNotification(
            'Live Lock Screen needs MPV to play media. ' +
            'Install it with your package manager ' +
            '(see the README for details).'
        );
        logError('MPV not found in PATH');
        return false;
    }

    _getVideoPaths() {
        const videoPath = this._settings.get_string(Keys.VIDEO_PATH);
        if (!videoPath) {
            logWarn('Video not set, falling back');
            return null;
        }

        // The saved path can point to a single file or to a folder of media
        const includeImages = this._settings.get_boolean(Keys.STATIC_IMAGE_ENABLED);
        const videoPaths = resolveMediaPaths(videoPath, includeImages);
        if (videoPaths.length === 0) {
            sendErrorNotification(
                `No supported media found at "${videoPath}". ` +
                `Falling back to the default lock screen.`
            );
            logError(`Nothing to play at "${videoPath}"`);
            return null;
        }

        return videoPaths;
    }

    /**
     * Settings used by the watchers and callbacks during the whole lock,
     * so they have to be read before anything else is set up
     */
    _readPlaybackSettings() {
        this._actionOnBlank = this._settings.get_int(Keys.ACTION_ON_BLANK);
        this._disableOnBattery = this._settings.get_boolean(Keys.PAUSE_ON_BATTERY);
        this._promptPause = this._settings.get_boolean(Keys.PROMPT_PAUSE);
    }

    async _setupInjector() {
        this._injector = new DialogInjector({
            onCreateBackgrounds: this._onCreateBackgrounds.bind(this),
            onPromptShow: this._onPromptShown.bind(this),
            onClockShow: this._onClockShown.bind(this),
        });
        await this._injector.inject();
    }

    _createPlaylist(videoPaths) {
        const playlist = new Playlist({
            videos: videoPaths,
            order: this._settings.get_int(Keys.PLAYLIST_ORDER),
            start: this._settings.get_int(Keys.PLAYLIST_START),
            //NOTE: Last played is the name of the file, because keeping 
            // index is unreliable
            lastPlayed: this._settings.get_string(Keys.PLAYLIST_LAST_PLAYED),
        });
        this._saveLastPlayed(playlist.current());
        return playlist;
    }

    _setupPlayer(playlist) {
        this._player = new MpvPlayerProcess({
            playlist,
            actionOnEnd: this._settings.get_int(Keys.ACTION_ON_END),
            imageDuration: this._settings.get_int(Keys.PHOTO_DURATION),
            volume: this._settings.get_int(Keys.AUDIO_VOLUME) / 100,
            useVideorate: this._settings.get_boolean(Keys.USE_VIDEORATE),
            framerate: this._settings.get_int(Keys.FRAMERATE),
            configPath: this.dir.get_child('external').get_child('mpv.conf').get_path(),
            profile: this._settings.get_int(Keys.MPV_PROFILE),
            customArgs: this._settings.get_strv(Keys.MPV_CUSTOM_ARGS),
            onSizeChange: (w, h) => {
                if (!this._renderer) return;

                this._renderer.setSize(w, h);
                // If clones werent created till this point, create them now
                if (!this._renderer.clonesCreated())
                    this._injector.recreateBackgrounds();
            },
            onPauseChange: (paused) => {
                this._mpris?.setPlaying(!paused);
            },
            onFileChange: (path) => {
                this._mpris?.setTrack(path);
                this._saveLastPlayed(path);
            },
            onNext: () => this._switchVideo(() => this._player?.next()),
            // The new video is ready, end the blackout started by _switchVideo()
            onPlaybackRestart: () => this._renderer?.blackin(),
        });
    }

    /**
     * Fades to black and loads new video with load() callback
     * @param {() => void} load - Loads the other video, e.g. player.next()
     */
    _switchVideo(load) {
        if (this._renderer)
            this._renderer.blackout(load);
        else
            load();
    }

    async _setupRenderer(window) {
        this._renderer = new VideoRenderer({
            window,
            w: this._player.w,
            h: this._player.h,
            scalingMode: this._settings.get_int(Keys.SCALING_MODE),
            fadeInDuration: this._settings.get_int(Keys.FADE_IN_DURATION),
            blurRadius: this._settings.get_int(Keys.BLUR_RADIUS),
            blurBrightness: this._settings.get_double(Keys.BLUR_BRIGHTNESS),
            promptGrayscale: this._settings.get_boolean(Keys.PROMPT_GRAYSCALE),
            promptChangeBlur: this._settings.get_boolean(Keys.PROMPT_CHANGE_BLUR),
            promptAnimDuration: this._settings.get_int(Keys.PROMPT_BLUR_ANIM_DURATION),
            promptBlurBrightness: this._settings.get_double(Keys.PROMPT_BLUR_BRIGHTNESS),
            promptBlurRadius: this._settings.get_int(Keys.PROMPT_BLUR_RADIUS),
            blackoutDuration: this._settings.get_boolean(Keys.PLAYLIST_FADE_ENABLED)
                ? this._settings.get_int(Keys.PLAYLIST_FADE_DURATION)
                : 0,
            onReady: this._onReady.bind(this),
        });

        // Without a size yet, onSizeChange creates the backgrounds later
        if (this._player.w)
            this._injector.recreateBackgrounds();
    }

    _setupMpris() {
        const play = () => {
            this._userPaused = false;
            this.playVideo();
        };
        const pause = () => {
            this._userPaused = true;
            this._player?.pause();
        };

        this._mpris = new MprisServer({
            canGoNext: this._player.hasMultipleVideos,
            canGoPrevious: this._player.hasMultipleVideos,
            onPlay: play,
            onPause: pause,
            onStop: () => this._player?.stopImmediately(),
            onPlayPause: () => this._player?.isPaused() ? play() : pause(),
            onNext: () => this._switchVideo(() => this._player?.next()),
            onPrevious: () => this._switchVideo(() => this._player?.previous()),
        });
        this._mpris.setTrack(this._player.currentFile);
    }

    _setupWatchers() {
        if (this._disableOnBattery) {
            this._batteryWatcher = new BatteryWatcher({
                onUnplugged: () => this._player?.pause(),
                onPlugged: () => this.playVideo(),
            });
        }

        //NOTE:
        // Suspending also turns the screen off, so both watchers report the same
        // transition. To avoid duplicate calls using same _updateActive function
        this._sleepWatcher = new SleepWatcher({
            onSleep: () => {
                this._sleeping = true;
                this._updateActive();
            },
            onResume: () => {
                this._sleeping = false;
                this._updateActive();
            }
        });

        if (this._actionOnBlank != ActionOnBlank.IGNORE) {
            this._blankWatcher = new ScreenBlankWatcher({
                onScreenOn: () => this._updateActive(),
                onScreenOff: () => this._updateActive(),
            });
        }
    }

    playVideo() {
        if (!this._player) return;

        //NOTE: Checking if something prevents playback
        const preventPlay = (
            this._userPaused ||
            (this._promptPause && this._promptShown) ||
            (this._disableOnBattery && this._batteryWatcher?.isOnBattery()) ||
            !this._isActive()
        );

        if (!preventPlay)
            this._player.play();
    }

    /**
     * Whether the video should be visible and running as far as
     * sleep and screen state are concerned.
     * No blank watcher (ActionOnBlank.IGNORE) means the screen state is ignored
     */
    _isActive() {
        return !this._sleeping && (this._blankWatcher?.isOn ?? true);
    }

    _updateActive() {
        if (!this._ready) return;

        const active = this._isActive();
        // If the state hasnt changed, skip (avoiding duplicate calls)
        if (active === this._active) return;
        this._active = active;

        if (active) {
            //NOTE: Slight delay before running the animation so the screen is visible (ideally)
            this._renderer?.fadeIn(50);
            this.playVideo();
            return;
        }

        this._renderer?.pauseFade();
        if (this._actionOnBlank == ActionOnBlank.RESTART) {
            this._player?.stopImmediately();
        } else if (this._actionOnBlank == ActionOnBlank.NEXT) {
            // The next video is loaded paused and starts once the screen is back
            this._player?.pauseImmediately();
            this._player?.next();
        } else if (this._sleeping) {
            // No time for the audio fade before the system suspends
            this._player?.pauseImmediately();
        } else if (this._actionOnBlank == ActionOnBlank.PAUSE) {
            this._player?.pause();
        }
    }

    _saveLastPlayed(path) {
        if (this._settings?.get_string(Keys.PLAYLIST_LAST_PLAYED) !== path)
            this._settings?.set_string(Keys.PLAYLIST_LAST_PLAYED, path);
    }

    _onCreateBackgrounds(monitorIndex, group) {
        this._renderer?.updateBackground(monitorIndex, group);
    }

    _onReady() {
        this._ready = true;
        this._active = this._isActive();

        // If the screen is blank dont start the playback and animation,
        // _updateActive() starts them once the screen turns on
        if (!this._active)
            return;

        this._renderer?.fadeIn();
        this.playVideo();
    }

    _onPromptShown() {
        if (this._promptShown) return;
        this._promptShown = true;

        this._renderer?.onPromptShown();
        if (this._promptPause)
            this._player?.pause();
    }

    _onClockShown() {
        if (!this._promptShown) return;
        this._promptShown = false;

        this._renderer?.onClockShown();
        if (this._promptPause)
            this.playVideo();
    }

    /**
     * User unlocked the screen. 
     * Stopping the videoplayblack and cleaning everything up
    */
    disable() {
        destroySleeps();

        
        this._mpris?.destroy();
        this._batteryWatcher?.destroy();
        this._sleepWatcher?.destroy();
        this._blankWatcher?.destroy();

        this._renderer?.destroy();
        this._player?.destroy();
        this._injector?.destroy();
        this._settings = null;
    }
}
