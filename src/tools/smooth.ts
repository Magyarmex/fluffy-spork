import { applyBrush } from './brushMath';
import { Tool, PointerState, ToolContext } from './types';

export function createSmoothTool(): Tool {
  return {
    id: 'smooth',
    name: 'Smooth',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm,
        ctx.project.settings.brushStrengthMm,
        pointer.dt,
        'smooth',
        {},
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
        'smooth',
        {},
        ctx.project.settings.falloff
      );
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      ctx.commitStroke();
    }
  };
}
