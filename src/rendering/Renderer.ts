import type { EntityState } from '../game/entities/types';
import { BattlefieldRenderer } from './battlefield/BattlefieldRenderer';
import { DroneRenderer } from './drones/DroneRenderer';
import { EffectRenderer } from './effects/EffectRenderer';
import { PowerupRenderer } from './powerups/PowerupRenderer';
import { ProjectileRenderer } from './projectiles/ProjectileRenderer';
import { ShapeRenderer } from './shapes/ShapeRenderer';
import { TankRenderer } from './tanks/TankRenderer';
import type { RenderCommand, RenderFrame, RenderFrameInput } from './types';

export type RendererLifecycle = 'idle' | 'running' | 'stopped';

export class Renderer {
  #lifecycle: RendererLifecycle = 'idle';

  constructor(
    private readonly tanks = new TankRenderer(),
    private readonly drones = new DroneRenderer(),
    private readonly projectiles = new ProjectileRenderer(),
    private readonly shapes = new ShapeRenderer(),
    private readonly powerups = new PowerupRenderer(),
    private readonly battlefield = new BattlefieldRenderer(),
    private readonly effects = new EffectRenderer(),
  ) {}

  get lifecycle(): RendererLifecycle { return this.#lifecycle; }
  start(): void { if (this.#lifecycle === 'stopped') throw new Error('a stopped renderer cannot be restarted'); this.#lifecycle = 'running'; }
  stop(): void { this.#lifecycle = 'stopped'; }

  render(input: RenderFrameInput): RenderFrame {
    if (this.#lifecycle !== 'running') throw new Error('renderer must be running');
    const out: RenderCommand[] = [];
    if (input.battlefield || input.battlefieldState) out.push(...this.battlefield.build(input.battlefield, input.battlefieldState));
    let rendered = 0;
    for (const entity of input.entities) {
      const built = this.entityCommands(entity);
      if (built.length) rendered += 1;
      out.push(...built);
    }
    const effects = this.effects.build(input.events ?? []);
    out.push(...effects);
    const order: Record<RenderCommand['layer'], number> = { arena:0, terrain:1, 'effect-under':2, entity:3, 'effect-over':4, overlay:5 };
    out.sort((a, b) => order[a.layer] - order[b.layer]);
    return Object.freeze({
      tick: input.tick,
      elapsedMs: input.elapsedMs,
      commands: Object.freeze(out),
      metrics: Object.freeze({ entitiesVisited:input.entities.length, entitiesRendered:rendered, commandsBuilt:out.length, effectsBuilt:effects.length }),
    });
  }

  private entityCommands(entity: EntityState): readonly RenderCommand[] {
    switch (entity.kind) {
      case 'tank': return this.tanks.build(entity);
      case 'drone': return this.drones.build(entity);
      case 'projectile': return this.projectiles.build(entity);
      case 'shape': return this.shapes.build(entity);
      case 'powerup': return this.powerups.build(entity);
      default: return [];
    }
  }
}
