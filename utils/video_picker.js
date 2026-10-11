import Gio from 'gi://Gio';

import { Keys, SourceMode } from '../enums.js';
import { logInfo, logWarn } from './logging.js';

// Lower-case extensions accepted when scanning a folder.
// GIF is included because the extension supports it.
export const VIDEO_EXTENSIONS = new Set([
    'mp4', 'm4v', 'mkv', 'webm', 'mov', 'avi', 'ogv', 'wmv', 'flv', 'gif',
]);

const MAX_DEPTH = 3;      // recursion limit (also protects against symlink loops)
const MAX_FILES = 5000;   // hard cap so a huge folder can't stall the lock screen

function _hasVideoExtension(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 && VIDEO_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/**
 * Returns a sorted array of absolute video paths found in `folderPath`.
 * Never throws: unreadable/missing folders simply yield an empty array.
 * Used by both the shell extension and the preferences window.
 */
export function listVideos(folderPath, recursive = false) {
    const results = [];
    if (!folderPath)
        return results;

    const walk = (dir, depth) => {
        let enumerator;
        try {
            enumerator = dir.enumerate_children(
                'standard::name,standard::type,standard::is-hidden',
                Gio.FileQueryInfoFlags.NONE,
                null
            );
        } catch (e) {
            logWarn(`Cannot read folder ${dir.get_path()}: ${e.message}`);
            return;
        }

        try {
            let info;
            while ((info = enumerator.next_file(null)) !== null) {
                if (results.length >= MAX_FILES)
                    return;
                if (info.get_is_hidden())
                    continue;

                const name = info.get_name();
                const type = info.get_file_type();

                if (type === Gio.FileType.DIRECTORY) {
                    if (recursive && depth < MAX_DEPTH)
                        walk(dir.get_child(name), depth + 1);
                } else if (type === Gio.FileType.REGULAR && _hasVideoExtension(name)) {
                    results.push(dir.get_child(name).get_path());
                }
            }
        } catch (e) {
            logWarn(`Error while scanning ${dir.get_path()}: ${e.message}`);
        } finally {
            try { enumerator.close(null); } catch (_e) { /* ignore */ }
        }
    };

    walk(Gio.File.new_for_path(folderPath), 0);
    results.sort();
    return results;
}

function _fileExists(path) {
    return !!path && Gio.File.new_for_path(path).query_exists(null);
}

/**
 * Decides which video to play for this lock, based on settings.
 * Returns an absolute path, or null if nothing playable is configured.
 */
export function pickVideo(settings) {
    const mode = settings.get_int(Keys.SOURCE_MODE);
    const singlePath = settings.get_string(Keys.VIDEO_PATH);

    if (mode === SourceMode.SINGLE)
        return singlePath || null;

    const folder = settings.get_string(Keys.FOLDER_PATH);
    const recursive = settings.get_boolean(Keys.FOLDER_RECURSIVE);
    const avoidRepeat = settings.get_boolean(Keys.AVOID_REPEAT);
    const last = settings.get_string(Keys.LAST_PLAYED);

    const videos = listVideos(folder, recursive);

    if (videos.length === 0) {
        logWarn(`No videos found in "${folder}"`);
        // Graceful fallback so the lock screen is never left empty
        return _fileExists(singlePath) ? singlePath : null;
    }

    let choice;
    if (mode === SourceMode.SEQUENTIAL) {
        const idx = videos.indexOf(last);
        choice = videos[(idx + 1) % videos.length];
    } else {
        let pool = videos;
        if (avoidRepeat && videos.length > 1)
            pool = videos.filter(v => v !== last);
        choice = pool[Math.floor(Math.random() * pool.length)];
    }

    logInfo(`Picked "${choice}" (${videos.length} candidates)`);

    try {
        settings.set_string(Keys.LAST_PLAYED, choice);
    } catch (e) {
        logWarn(`Could not store last played video: ${e.message}`);
    }

    return choice;
}
