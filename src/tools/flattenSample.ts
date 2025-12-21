import { applyBrush } from './brushMath';
import { Tool, ToolContext, PointerState } from './types';
import { worldToGrid, indexFor } from '@core/grid';

export function createFlattenSampleTool(): Tool {
  let sampledHeight = 0;
  return {
    id: 'flattenSample',
    name: 'Flatten (Sample)',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      const { terrain, tank } = ctx.project;
      const grid = worldToGrid(pointer.worldX, pointer.worldZ, terrain.resolution, tank);
      const idx = indexFor(grid.i, grid.j, terrain.resolution);
      sampledHeight = terrain.heightGrid[idx];
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm,
        ctx.project.settings.brushStrengthMm,
        pointer.dt,
        'flattenTo',
        { targetHeight: sampledHeight },
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
        { targetHeight: sampledHeight },
        ctx.project.settings.falloff
      );
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      ctx.commitStroke();
    }
  };
}
