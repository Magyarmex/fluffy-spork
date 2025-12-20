import { Tool, ToolContext, PointerState } from './types';
import { applyBrush, getFalloff } from './brushMath';
import { indexFor, worldToGrid } from '@core/grid';
import { materialIndex } from '@core/project';

export function createPaintMaterialTool(): Tool {
  const strokeMask = new Set<number>();
  return {
    id: 'paintMaterial',
    name: 'Paint Material',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      strokeMask.clear();
      this.onPointerMove?.(ctx, { ...pointer, isDragging: true });
    },
    onPointerMove(ctx, pointer) {
      const { project } = ctx;
      const { terrain, tank } = project;
      const radius = project.settings.brushRadiusCm;
      const spacing = tank.widthCm / (terrain.resolution - 1);
      const center = worldToGrid(pointer.worldX, pointer.worldZ, terrain.resolution, tank);
      const radiusCells = Math.ceil(radius / spacing);
      for (let dj = -radiusCells; dj <= radiusCells; dj++) {
        for (let di = -radiusCells; di <= radiusCells; di++) {
          const i = center.i + di;
          const j = center.j + dj;
          if (i < 0 || j < 0 || i >= terrain.resolution || j >= terrain.resolution) continue;
          const idx = indexFor(i, j, terrain.resolution);
          const distX = (di * spacing);
          const distZ = (dj * spacing);
          const dist = Math.hypot(distX, distZ);
          if (dist > radius) continue;
          const falloff = getFalloff(dist / radius, project.settings.falloff);
          if (falloff <= 0) continue;
          if (!strokeMask.has(idx)) {
            terrain.materialGrid[idx] = materialIndex(project.settings.selectedMaterial);
            strokeMask.add(idx);
          }
        }
      }
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      ctx.commitStroke();
      strokeMask.clear();
    }
  } as Tool;
}
