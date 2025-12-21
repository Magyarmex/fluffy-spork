import { applyBrush } from './brushMath';
import { Tool, PointerState, ToolContext } from './types';

export function createFlattenAbsoluteTool(): Tool {
  return {
    id: 'flattenAbsolute',
    name: 'Flatten (Absolute)',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm,
        ctx.project.settings.brushStrengthMm,
        pointer.dt,
        'flattenTo',
        { targetHeight: ctx.project.settings.flattenAbsoluteHeightCm },
        ctx.project.settings.falloff
      );
      ctx.requestRender();
    },
    onPointerMove(ctx, pointer) {
      if (!pointer.isDragging) return;
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm,
        ctx.project.settings.brushStrengthMm,
        pointer.dt,
        'flattenTo',
        { targetHeight: ctx.project.settings.flattenAbsoluteHeightCm },
        ctx.project.settings.falloff
      );
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      ctx.commitStroke();
    }
  };
}
