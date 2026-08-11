import type { BattlefieldDefinition, TerrainPrimitiveDefinition } from '../../content';
import type { RubbleState, TerrainGeometry, TerrainState } from '../../game/battlefield/types';
import type { BattlefieldRenderSnapshot, RenderCommand } from '../types';

function terrainColor(type: 'wall'|'pillar'|'cover') { if (type === 'cover') return '#285064'; if (type === 'pillar') return '#26394c'; return '#1b2d3d'; }
function staticCommand(t: TerrainPrimitiveDefinition): RenderCommand { return t.shape === 'circle'
  ? { kind:'circle', layer:'terrain', x:t.x, y:t.y, radius:t.radius ?? 0, fill:terrainColor(t.type), stroke:t.type === 'cover' ? '#68d5e9' : '#70869a', lineWidth:1.2 }
  : { kind:'rect', layer:'terrain', x:t.x, y:t.y, width:t.width ?? 0, height:t.height ?? 0, fill:terrainColor(t.type), stroke:t.type === 'cover' ? '#68d5e9' : '#70869a', lineWidth:1.2 }; }
function geometryCommand(geometry: TerrainGeometry, fill: string, stroke: string, alpha = 1): RenderCommand { return geometry.shape === 'circle'
  ? { kind:'circle', layer:'terrain', x:geometry.x, y:geometry.y, radius:geometry.radius, fill, stroke, lineWidth:1.2, alpha }
  : { kind:'rect', layer:'terrain', x:geometry.x, y:geometry.y, width:geometry.width, height:geometry.height, fill, stroke, lineWidth:1.2, alpha }; }
function liveTerrainCommand(t: Readonly<TerrainState>): RenderCommand | undefined { if (!t.solid) return undefined; const health = t.destructible && t.maxHealth > 0 ? Math.max(0, Math.min(1, t.health / t.maxHealth)) : 1; return geometryCommand(t.geometry, terrainColor(t.type), t.type === 'cover' ? '#68d5e9' : '#70869a', .58 + .42 * health); }
function rubbleCommand(rubble: RubbleState): RenderCommand { return geometryCommand(rubble.geometry, '#071015', '#305363', .42); }

export class BattlefieldRenderer {
  build(definition?: BattlefieldDefinition, state?: BattlefieldRenderSnapshot): readonly RenderCommand[] {
    const out: RenderCommand[] = [];
    if (state) {
      const width = state.bounds.maxX - state.bounds.minX, height = state.bounds.maxY - state.bounds.minY;
      out.push({ kind:'rect', layer:'arena', x:(state.bounds.minX + state.bounds.maxX)/2, y:(state.bounds.minY + state.bounds.maxY)/2, width, height, fill:'#07121e', stroke:'#34758f', lineWidth:2 });
      for (const terrain of state.terrain) { const command = liveTerrainCommand(terrain); if (command) out.push(command); }
      for (const rubble of state.rubble) out.push(rubbleCommand(rubble));
      return Object.freeze(out);
    }
    if (!definition) return Object.freeze(out);
    out.push({ kind:'rect', layer:'arena', x:0, y:0, width:definition.mapLimit*2, height:definition.mapLimit*2, fill:'#07121e', stroke:'#34758f', lineWidth:2 });
    for (const terrain of definition.terrain) out.push(staticCommand(terrain));
    return Object.freeze(out);
  }
}
