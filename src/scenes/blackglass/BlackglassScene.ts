import { DroneRegistry, TankRegistry, WeaponRegistry } from '../../content';
import type { DroneDefinition, TankDefinition, WeaponDefinition } from '../../content';
import { CombatSystem } from '../../game/combat/CombatSystem';
import type { WeaponFireResult } from '../../game/combat/types';
import { formationForOrder, formationSlot } from '../../game/entities/drones/formations';
import type { DroneState, EntityState, ProjectileState, TankState, Vector2State } from '../../game/entities/types';
import { entityId } from '../../game/simulation/types';
import { CanonicalVisualFactory, Renderer } from '../../rendering';
import type { DroneVisual, TankVisual } from '../../rendering/visualFactory';
import type { RenderFrame } from '../../rendering/types';

export interface BlackglassCanonicalSnapshot {
  readonly tankDefinition: TankDefinition;
  readonly weaponDefinition: WeaponDefinition;
  readonly droneDefinition: DroneDefinition;
  readonly tank: TankState;
  readonly drones: readonly DroneState[];
  readonly tankVisual: TankVisual;
  readonly droneVisuals: readonly DroneVisual[];
  readonly visualMuzzles: readonly Vector2State[];
}

export interface BlackglassShot {
  readonly result: WeaponFireResult;
  readonly projectiles: readonly ProjectileState[];
  readonly visualMuzzles: readonly Vector2State[];
}

const PREVIEW_TEAM = Object.freeze({ teamId: 'blackglass-preview', allegiance: 'owned' });
const PREVIEW_POSITION = Object.freeze({ x: 0, y: 0 });

/**
 * Canonical Blackglass scene model.
 *
 * This class deliberately owns presentation orchestration only. Tank, weapon,
 * projectile and drone definitions come from the canonical content graph;
 * weapon firing comes from CombatSystem; drone placement comes from the
 * canonical formation helpers; and every visible primitive comes from the
 * shared renderer/factories established by Mission 18.
 */
export class BlackglassScene {
  readonly #renderer: Renderer;
  readonly #combat: CombatSystem;
  readonly #visuals: CanonicalVisualFactory;
  #tankId: string;
  #aimRadians = 0;
  #shotSerial = 0;
  #projectiles: readonly ProjectileState[] = Object.freeze([]);

  constructor(
    tankId = 'scout',
    renderer = new Renderer(),
    combat = new CombatSystem(),
    visuals = new CanonicalVisualFactory(),
  ) {
    this.#tankId = TankRegistry.get(tankId).id;
    this.#renderer = renderer;
    this.#combat = combat;
    this.#visuals = visuals;
    this.#renderer.start();
  }

  get tankId(): string { return this.#tankId; }
  get aimRadians(): number { return this.#aimRadians; }

  selectTank(tankId: string): void {
    this.#tankId = TankRegistry.get(tankId).id;
    this.#projectiles = Object.freeze([]);
  }

  aimAt(radians: number): void {
    if (!Number.isFinite(radians)) throw new Error('Blackglass aim must be finite');
    this.#aimRadians = radians;
  }

  snapshot(): BlackglassCanonicalSnapshot {
    const tankDefinition = TankRegistry.get(this.#tankId);
    const weaponDefinition = WeaponRegistry.get(`${tankDefinition.id}:weapon`);
    const droneDefinition = DroneRegistry.get(`${tankDefinition.id}:drone`);
    const tank = this.tankState(tankDefinition);
    const tankVisual = this.#visuals.tank(tank);
    const drones = this.droneStates(tankDefinition, droneDefinition, tank);
    return Object.freeze({
      tankDefinition,
      weaponDefinition,
      droneDefinition,
      tank,
      drones,
      tankVisual,
      droneVisuals: Object.freeze(drones.map((drone) => this.#visuals.drone(drone))),
      visualMuzzles: Object.freeze(tankVisual.barrels.map((barrel) => barrel.muzzle)),
    });
  }

  fire(atSeconds: number): BlackglassShot {
    const snapshot = this.snapshot();
    const tank = snapshot.tank;
    const weapon = snapshot.weaponDefinition;
    const result = this.#combat.fire({
      shooter: {
        id: tank.id,
        teamId: tank.team.teamId,
        position: tank.position,
        velocity: { x: 0, y: 0 },
        radius: snapshot.tankDefinition.size,
        health: tank.health?.current ?? 1,
        maxHealth: tank.health?.max ?? 1,
        alive: tank.lifecycle === 'active',
      },
      weapon,
      muzzleOrigin: tank.position,
      aimRadians: this.#aimRadians,
      atSeconds,
      fireSpin: 1,
      spreadSample: () => 0,
      projectileId: (ordinal) => `blackglass:${this.#tankId}:shot-${this.#shotSerial}:${ordinal}`,
    });
    this.#shotSerial += 1;
    this.#projectiles = Object.freeze(result.projectiles.map((projectile) => this.projectileState(projectile, atSeconds)));
    return Object.freeze({ result, projectiles: this.#projectiles, visualMuzzles: snapshot.visualMuzzles });
  }

  clearProjectiles(): void { this.#projectiles = Object.freeze([]); }

  render(tick: number, elapsedMs: number): RenderFrame {
    const snapshot = this.snapshot();
    const entities: readonly EntityState[] = Object.freeze([snapshot.tank, ...snapshot.drones, ...this.#projectiles]);
    return this.#renderer.render({ tick, elapsedMs, entities });
  }

  stop(): void { this.#renderer.stop(); }

  private tankState(definition: TankDefinition): TankState {
    const maxHealth = 100 * definition.hpMultiplier;
    return Object.freeze({
      id: entityId('blackglass:tank'),
      kind: 'tank',
      lifecycle: 'active',
      position: PREVIEW_POSITION,
      rotation: 0,
      turretRotation: this.#aimRadians,
      team: PREVIEW_TEAM,
      health: Object.freeze({ current: maxHealth, max: maxHealth }),
      spawnedAtTick: 0,
      tankDefinitionId: definition.id,
    });
  }

  private droneStates(definition: TankDefinition, droneDefinition: DroneDefinition, tank: TankState): readonly DroneState[] {
    const count = Math.max(0, Math.trunc(droneDefinition.count));
    const formation = formationForOrder('follow', definition.lineage);
    return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
      id: entityId(`blackglass:drone:${index}`),
      kind: 'drone' as const,
      lifecycle: 'active' as const,
      position: Object.freeze(formationSlot(tank.position, tank.rotation, index, count, formation)),
      rotation: tank.rotation,
      team: PREVIEW_TEAM,
      health: Object.freeze({ current: droneDefinition.hp, max: droneDefinition.hp }),
      ownerId: tank.id,
      spawnedAtTick: 0,
      droneDefinitionId: droneDefinition.id,
    })));
  }

  private projectileState(projectile: WeaponFireResult['projectiles'][number], atSeconds: number): ProjectileState {
    const velocity = Object.freeze({
      x: Math.cos(projectile.angle) * projectile.speed + projectile.inheritedVelocity.x,
      y: Math.sin(projectile.angle) * projectile.speed + projectile.inheritedVelocity.y,
    });
    return Object.freeze({
      id: entityId(projectile.id),
      kind: 'projectile',
      lifecycle: 'active',
      position: Object.freeze({ ...projectile.position }),
      rotation: projectile.angle,
      team: PREVIEW_TEAM,
      ownerId: entityId(projectile.ownerId),
      spawnedAtTick: Math.max(0, Math.trunc(atSeconds * 60)),
      projectileDefinitionId: projectile.weaponId,
      velocity,
    });
  }
}
