import { ScalingMode } from '../enums.js';


function getScale(scalingMode, sourceW, sourceH, targetW, targetH) {
    switch (scalingMode) {
        case ScalingMode.STRETCH:
            return [targetW / sourceW, targetH / sourceH];
        case ScalingMode.FIT: {
            const scale = Math.min(targetW / sourceW, targetH / sourceH);
            return [scale, scale];
        }
        default: {
            const scale = Math.max(targetW / sourceW, targetH / sourceH);
            return [scale, scale];
        }
    }
}

/**
 * Size the player window should render at: the size the largest monitor needs,
 * never bigger than the source. That monitor shows the window at 1:1, the others
 * scale it down, so none of them loses detail.
 *
 * @param {Array<{width, height, pixelRatio}>} monitors - Logical sizes, and the
 *     monitor's scale factor divided by the scale factor of the window
 * @returns {number[]} [width, height] in logical pixels of the window
 */
export function getRenderSize(scalingMode, sourceW, sourceH, monitors) {
    let neededW = 0;
    let neededH = 0;

    for (const { width, height, pixelRatio } of monitors) {
        const [scaleX, scaleY] = getScale(
            scalingMode, sourceW, sourceH, 
            width * pixelRatio, height * pixelRatio
        );
        // We pick the highest screen width and height
        neededW = Math.max(neededW, sourceW * scaleX);
        neededH = Math.max(neededH, sourceH * scaleY);
    }

    if (!neededW || !neededH)
        return [sourceW, sourceH];

    // So a float error (1024.0000001) doesn't round up to a whole extra pixel,
    // that would break the exact 1:1 scale
    const ceil = value => Math.ceil(value - 1e-6);
    return [
        // We never upscale the window, only downscale
        Math.max(1, Math.min(sourceW, ceil(neededW))),
        Math.max(1, Math.min(sourceH, ceil(neededH))),
    ];
}

/**
 * Scales and positions an actor over a monitor and clips it to the monitor area.
 *
 * NOTE:
 * The scale must be on the actor that holds the effects (wrapper), never on a
 * child of it. Otherwise the image will look jagged.
 *
 * @param {Clutter.Actor} actor - The wrapper, holds the unscaled clone
 * @param {{x, y, width, height}} monitor - Area to cover, in the parent's coordinates
 */
export function applyScaling(actor, scalingMode, sourceW, sourceH, monitor) {
    // Scaling with set_size() instead of set_scale() triggers a GNOME 48
    // repaint bug, the clone only partially updates
    actor.set_size(sourceW, sourceH);

    const [scaleX, scaleY] = getScale(scalingMode, sourceW, sourceH, monitor.width, monitor.height);

    // Whole pixels, a half pixel offset would blur the image at 1:1
    const offsetX = Math.round((monitor.width - sourceW * scaleX) / 2);
    const offsetY = Math.round((monitor.height - sourceH * scaleY) / 2);

    actor.set_scale(scaleX, scaleY);
    actor.set_position(monitor.x + offsetX, monitor.y + offsetY);

    // Cuts off the overflow of COVER, in the actor's unscaled coordinates
    // NOTE: clip_to_allocation would take precedence over it
    actor.set_clip_to_allocation(false);
    actor.set_clip(
        -offsetX / scaleX,
        -offsetY / scaleY,
        monitor.width / scaleX,
        monitor.height / scaleY
    );
}
