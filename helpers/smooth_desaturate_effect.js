import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';

/**
 * Clutter.DesaturateEffect that stays smooth on a scaled down actor.
 *
 * By default the effect uses NEAREST filter, which looks jagged when the actor
 * is scaled down. This picks a filter that fits the actual scale.
 */
export const SmoothDesaturateEffect = GObject.registerClass(
class LLSSmoothDesaturateEffect extends Clutter.DesaturateEffect {
    vfunc_create_texture(...args) {
        const texture = super.vfunc_create_texture(...args);

        // Mipmaps are only built when a mipmap filter is used
        texture?.set_auto_mipmap?.(true);
        return texture;
    }

    vfunc_paint_target(node, paintContext) {
        // Overrides the NEAREST set by the parent
        const filters = this._getFilters();
        if (filters)
            this.get_pipeline()?.set_layer_filters(0, ...filters);

        super.vfunc_paint_target(node, paintContext);
    }

    /**
     * [min, mag] filters for the current scale, null keeps NEAREST (exact at 1:1)
     */
    _getFilters() {
        const actor = this.get_actor();
        if (!actor)
            return null;

        // if the actor is not scaled, using default NEAREST filter 
        if (actor.scale_x == 1 && actor.scale_y == 1)
            return null;
        
        const scale = Math.min(actor.scale_x, actor.scale_y);
        // Down to half size linear is sharpest
        if (scale >= 0.5)
            return [Cogl.PipelineFilter.LINEAR, Cogl.PipelineFilter.LINEAR];

        // Below half linear skips pixels, mipmaps average them
        return [Cogl.PipelineFilter.LINEAR_MIPMAP_LINEAR, Cogl.PipelineFilter.LINEAR];
    }
});
