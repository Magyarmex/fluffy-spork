import { Tool, ToolContext, PointerState } from './types';
import { applyBrush, getFalloff } from './brushMath';
import { indexFor, worldToGrid } from '@core/grid';
import { materialIndex } from '@core/project';
import { recordDebug } from '@core/debug';

export function createPaintMaterialTool(): Tool {
  const strokeMask = new Set<number>();
  let paintedCells = 0;
  return {
    id: 'paintMaterial',
    name: 'Paint Material',
    onPointerDown(ctx: ToolContext, pointer: PointerState) {
      strokeMask.clear();
      paintedCells = 0;
      this.onPointerMove?.(ctx, { ...pointer, isDragging: true });
    },
    onPointerMove(ctx, pointer) {
      const { project } = ctx;
      const { terrain, tank } = project;
      const radius = project.settings.brushRadiusCm;
      const spacing = tank.widthCm / (terrain.resolution - 1);
      const center = worldToGrid(pointer.worldX, pointer.worldZ, terrain.resolution, tank);
      const radiusCells = Math.ceil(radius / spacing);
      const selectedIndex = materialIndex(project.settings.selectedMaterial);
      if (selectedIndex < 0) {
        recordDebug('error', 'Unknown material selected for painting', project.settings.selectedMaterial);
        return;
      }
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
            terrain.materialGrid[idx] = selectedIndex;
            strokeMask.add(idx);
            paintedCells++;
          }
        }
      }
      ctx.requestRender();
    },
    onPointerUp(ctx) {
      ctx.commitStroke();
      strokeMask.clear();
      recordDebug(
        'info',
        'Completed paint stroke',
        `cells:${paintedCells} radius:${ctx.project.settings.brushRadiusCm} falloff:${ctx.project.settings.falloff}`
      );
    }
  } as Tool;
}
