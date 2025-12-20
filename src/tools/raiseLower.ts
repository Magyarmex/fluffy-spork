import { applyBrush } from './brushMath';
import { Tool, PointerState, ToolContext } from './types';

export function createRaiseLowerTool(kind: 'raise' | 'lower'): Tool {
  return {
    id: kind,
    name: kind === 'raise' ? 'Raise' : 'Lower',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm ?? 12,
        ctx.project.settings.brushStrengthMm ?? 12,
        pointer.dt,
        kind,
        {},
        ctx.project.settings.falloff
      );
      ctx.requestRender();
    },
    onPointerMove(ctx: ToolContext, pointer: PointerState) {
      if (!pointer.isDragging) return;
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm ?? 12,
        ctx.project.settings.brushStrengthMm ?? 12,
        pointer.dt,
        kind,
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
