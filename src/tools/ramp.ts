import { applyBrush } from './brushMath';
import { Tool, ToolContext, PointerState, ToolOverlay } from './types';
import { gridToWorld, indexFor, worldToGrid } from '@core/grid';

export function createRampTool(): Tool {
  let start: [number, number] | null = null;
  let startHeight = 0;
  let end: [number, number] | null = null;
  let endHeight = 0;
  return {
    id: 'ramp',
    name: 'Ramp',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      const { terrain, tank } = ctx.project;
      const grid = worldToGrid(pointer.worldX, pointer.worldZ, terrain.resolution, tank);
      const idx = indexFor(grid.i, grid.j, terrain.resolution);
      const h = terrain.heightGrid[idx];
      start = [pointer.worldX, pointer.worldZ];
      startHeight = h;
      end = start;
      endHeight = h;
    },
    onPointerMove(ctx, pointer) {
      if (!start || !pointer.isDragging) return;
      const { terrain, tank } = ctx.project;
      const grid = worldToGrid(pointer.worldX, pointer.worldZ, terrain.resolution, tank);
      const idx = indexFor(grid.i, grid.j, terrain.resolution);
      end = [pointer.worldX, pointer.worldZ];
      endHeight = terrain.heightGrid[idx];
      applyBrush(
        ctx.project,
        pointer.worldX,
        pointer.worldZ,
        ctx.project.settings.brushRadiusCm,
        ctx.project.settings.brushStrengthMm,
        pointer.dt,
        'ramp',
        { rampStart: start, rampEnd: [pointer.worldX, pointer.worldZ], rampStartHeight: startHeight, rampEndHeight: endHeight },
        ctx.project.settings.falloff
      );
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      if (start) {
        ctx.commitStroke();
      }
      start = null;
      end = null;
      endHeight = 0;
    },
    getOverlay(): ToolOverlay | null {
      if (!start || !end) return null;
      return { type: 'ramp', rampPoints: [start, end] };
    }
  };
}
