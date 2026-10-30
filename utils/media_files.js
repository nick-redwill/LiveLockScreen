import Gio from 'gi://Gio';

import { logWarn } from './logging.js';

const FILE_ATTRIBUTES = [
    'standard::name',
    'standard::fast-content-type',
    'standard::is-hidden',
].join(',');

function isSupportedMedia(contentType, includeImages) {
    if (!contentType)
        return false;

    return contentType.startsWith('video/') || contentType === 'image/gif' ||
        (includeImages && contentType.startsWith('image/'));
}

/**
 * Lists the videos and GIFs (and static images if enabled) placed directly inside a directory.
 * Sub-directories and hidden files are ignored.
 *
 * @param {string} dirPath - Absolute path of the directory
 * @param {boolean} [includeImages] - Also list static images
 * @returns {string[]} Absolute paths in natural (human) order
 */
export function listMediaFiles(dirPath, includeImages = false) {
    const dir = Gio.File.new_for_path(dirPath);
    const paths = [];
    let enumerator = null;

    try {
        enumerator = dir.enumerate_children(
            FILE_ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, null
        );

        let info;
        while ((info = enumerator.next_file(null)) !== null) {
            if (info.get_is_hidden())
                continue;

            const contentType = info.get_attribute_string('standard::fast-content-type');
            if (isSupportedMedia(contentType, includeImages))
                paths.push(dir.get_child(info.get_name()).get_path());
        }
    } catch (e) {
        logWarn(`Failed to read directory "${dirPath}": ${e.message}`);
    } finally {
        enumerator?.close(null);
    }

    return paths.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/**
 * Turns the path saved in settings into a list of files to play.
 * A directory expands to the media files inside it, a regular
 * file is returned as is if it's supported.
 *
 * @param {string} path - File or directory path
 * @param {boolean} [includeImages] - Also accept static images
 * @returns {string[]} Empty if the path is missing or has nothing to play
 */
export function resolveMediaPaths(path, includeImages = false) {
    if (!path)
        return [];

    const file = Gio.File.new_for_path(path);
    const type = file.query_file_type(Gio.FileQueryInfoFlags.NONE, null);

    if (type === Gio.FileType.DIRECTORY)
        return listMediaFiles(path, includeImages);
    if (type !== Gio.FileType.REGULAR)
        return [];

    // Full content type, the same check the file picker uses
    const contentType = file.query_info(
        'standard::content-type', Gio.FileQueryInfoFlags.NONE, null
    ).get_content_type();

    return isSupportedMedia(contentType, includeImages) ? [path] : [];
}
