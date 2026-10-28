export const Keys = {
    // Keeping the old "general-disable-on-battery" name for backward compatibility
    PAUSE_ON_BATTERY: "general-disable-on-battery",
    ACTION_ON_BLANK: "general-action-on-blank",
    ACTION_ON_END: "general-action-on-end",
    MPRIS_ENABLED: "general-mpris-enabled",

    PLAYLIST_ORDER: "playlist-order",
    PLAYLIST_START: "playlist-start",
    PLAYLIST_FADE_ENABLED: "playlist-fade-enabled",
    PLAYLIST_FADE_DURATION: "playlist-fade-duration",
    PLAYLIST_LAST_PLAYED: "playlist-last-played",

    STATIC_IMAGE_ENABLED: "general-static-image-enabled",
    PHOTO_DURATION: "background-photo-duration-seconds",

    VIDEO_PATH: "background-video-path",
    SCALING_MODE: "background-video-scaling-mode",
    USE_VIDEORATE: "background-video-use-videorate",
    FRAMERATE: "background-video-framerate",
    FADE_IN_DURATION: "background-fade-in-duration",

    BLUR_RADIUS: "background-video-blur-radius",
    BLUR_BRIGHTNESS: "background-video-blur-brightness",

    AUDIO_VOLUME: "background-audio-volume",

    PROMPT_PAUSE: "prompt-pause-video",
    PROMPT_GRAYSCALE: "prompt-grayscale",
    PROMPT_CHANGE_BLUR: "prompt-change-blur",
    PROMPT_BLUR_RADIUS: "prompt-blur-radius",
    PROMPT_BLUR_BRIGHTNESS: "prompt-blur-brightness",
    PROMPT_BLUR_ANIM_DURATION: "prompt-blur-anim-duration",

    MPV_PROFILE: "mpv-profile",
    MPV_CUSTOM_ARGS: "mpv-custom-args",
};

export const ScalingMode = {
    STRETCH: 0,
    FIT: 1,
    COVER: 2,
};

export const ActionOnBlank = {
    IGNORE: 0,
    PAUSE: 1,
    RESTART: 2,
    NEXT: 3,
}

export const ActionOnEnd = {
    LOOP: 0,
    PAUSE: 1,
    NEXT: 2
}

export const PlaylistOrder = {
    SEQUENTIAL: 0,
    SHUFFLE: 1,
    RANDOM: 2,
}

export const PlaylistStart = {
    FIRST: 0,
    RANDOM: 1,
    LAST_PLAYED: 2,
}

/**
 * Profiles defined in external/mpv.conf
 */
export const MpvProfile = {
    QUALITY: 0,
    BALANCED: 1,
    EFFICIENT: 2,
}

/**
 * Playback direction for ActorAnimator
 * Matches Clutter.TimelineDirection.* values 
 */
export const Direction = Object.freeze({
    BACKWARD: 1,
    FORWARD: 0,
});