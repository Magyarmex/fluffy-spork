import { BALANCE, TankRegistry, WeaponRegistry } from '../../content';
import type { TankDefinition } from '../../content';
import { TankAIController } from '../../ai/controllers/TankAIController';
import { NavigationService } from '../../ai/navigation/NavigationService';
import { RoutePlanner } from '../../ai/navigation/RoutePlanner';
import { Battlefield } from '../../game/battlefield/Battlefield';
import type { BattlefieldTemplateId } from '../../game/battlefield/types';
import { CombatSystem } from '../../game/combat/CombatSystem';
import type { CombatSemanticEvent, ProjectileSpawnSpec } from '../../game/combat/types';
import { DroneSystem } from '../../game/entities/drones/DroneSystem';
import type { DroneSwarmOrder } from '../../game/entities/drones/types';
import type { DroneState, EntityState, ProjectileState, TankState, Vector2State } from '../../game/entities/types';
import { stepDroneVelocity } from '../../game/movement/DroneMovement';
import { stepTankMovement } from '../../game/movement/TankMovement';
import { stepProjectile, type ProjectileKinematicState } from '../../game/entities/projectiles/ProjectileKinematics';
import { BuildResolver } from '../../game/progression/BuildResolver';
import type { TankBuild } from '../../game/progression/types';
import { entityId, type EntityId } from '../../game/simulation/types';
import { PerceptionCore } from '../../game/targeting/PerceptionCore';
import type { CommandEnvelope, CommandSource, GameCommand } from '../../input/commands/GameCommand';
import { LobbyPerformancePolicy } from './LobbyPerformancePolicy';

const BASELINE_LEVEL = 30;
const ZERO_STATS = Object.freeze({ damage:0, reload:0, bulletspeed:0, penetration:0, maxhp:0, regen:0, speed:0, body:0 });
const TEAMS = Object.freeze([
  Object.freeze({ teamId:'lobby-blue', allegiance:'friendly' }),
  Object.freeze({ teamId:'lobby-red', allegiance:'hostile' }),
]);

interface TankRuntime {
  state: TankState;
  velocity: Vector2State;
  readonly definition: TankDefinition;
  readonly build: TankBuild;
  readonly ai: TankAIController;
  commands: readonly CommandEnvelope[];
}
interface DroneRuntime { state: DroneState; velocity: Vector2State; }
interface ProjectileRuntime { spec: ProjectileSpawnSpec; kinematics: ProjectileKinematicState; state: ProjectileState; }

export interface LobbyBattleSnapshot {
  readonly tick: number;
  readonly elapsedMs: number;
  /** Historical War Room baseline. Apex actors use their canonical minimum unlock level when higher. */
  readonly level: number;
  readonly actorLevels: Readonly<Record<string, number>>;
  readonly tanks: readonly TankState[];
  readonly drones: readonly DroneState[];
  readonly projectiles: readonly ProjectileState[];
  readonly entities: readonly EntityState[];
  readonly events: readonly CombatSemanticEvent[];
  readonly playerId?: EntityId;
}

export interface LobbyBattleOptions {
  readonly battlefieldTemplate?: BattlefieldTemplateId;
  readonly policy?: LobbyPerformancePolicy;
}

/**
 * Canonical background battle used by the lobby and, in Mission 25, as the
 * production arena host when player control is explicitly enabled.
 *
 * Player mode changes orchestration only: movement, perception, navigation,
 * drones, weapons, projectiles, damage and terrain remain owned by their
 * canonical systems. Normal lobby mode retains the Mission 20 AI-only behavior.
 */
export class LobbyBattle {
  readonly level = BASELINE_LEVEL;
  readonly policy: LobbyPerformancePolicy;
  readonly battlefield: Battlefield;
  readonly navigation: NavigationService;
  readonly droneSystem: DroneSystem;
  readonly combat = new CombatSystem();
  readonly perception: PerceptionCore;

  #tick = 0;
  #elapsedMs = 0;
  #shotSerial = 0;
  #commandSequence = 0;
  #tanks: TankRuntime[] = [];
  #drones: DroneRuntime[] = [];
  #projectiles: ProjectileRuntime[] = [];
  #events: CombatSemanticEvent[] = [];
  #playerTankId: EntityId | null = null;
  #playerCommands = new Map<string, CommandEnvelope>();

  constructor(options: LobbyBattleOptions = {}) {
    this.policy = options.policy ?? new LobbyPerformancePolicy();
    this.battlefield = new Battlefield({ template: options.battlefieldTemplate ?? 'crossfire' });
    this.navigation = new NavigationService(new RoutePlanner(this.battlefield));
    this.droneSystem = new DroneSystem(this.navigation);
    this.perception = new PerceptionCore({ lineOfSight: this.battlefield });
    this.seedCanonicalRoster();
  }

  get tankCount(): number { return this.#tanks.length; }
  get canonicalTankCount(): number { return TankRegistry.size; }
  get playerTankId(): EntityId | null { return this.#playerTankId; }

  setPlayerTank(tankDefinitionId: string | null): EntityId | null {
    if (tankDefinitionId === null) {
      this.#playerTankId = null;
      this.#playerCommands.clear();
      return null;
    }
    const runtime = this.#tanks.find((entry) => entry.definition.id === tankDefinitionId);
    if (!runtime) throw new Error(`Lobby battle has no canonical tank ${tankDefinitionId}`);
    this.#playerTankId = runtime.state.id;
    this.#playerCommands.clear();
    return runtime.state.id;
  }

  issuePlayerCommand(command: GameCommand, source: CommandSource = 'keyboard'): void {
    if (!this.#playerTankId) return;
    const key = command.type === 'ability' ? `${command.type}:${command.slot}` : command.type;
    this.#playerCommands.set(key, Object.freeze({ source, sequence:this.#commandSequence++, command }));
  }

  step(steps = 1): LobbyBattleSnapshot {
    if (!Number.isInteger(steps) || steps < 0) throw new Error('Lobby battle steps must be a non-negative integer');
    const dtSeconds = 1 / this.policy.simulationHz;
    for (let step = 0; step < steps; step += 1) {
      this.#tick += 1;
      this.#elapsedMs += this.policy.fixedStepMs;
      this.#events = [];
      this.stepTanks(dtSeconds);
      this.stepDrones(dtSeconds);
      this.stepProjectiles(dtSeconds);
    }
    return this.snapshot();
  }

  snapshot(): LobbyBattleSnapshot {
    const tanks = Object.freeze(this.#tanks.map((entry) => freezeTank(entry.state)));
    const drones = Object.freeze(this.#drones.map((entry) => freezeDrone(entry.state)));
    const projectiles = Object.freeze(this.policy.capProjectiles(this.#projectiles.map((entry) => freezeProjectile(entry.state))));
    const entities: readonly EntityState[] = Object.freeze([...tanks, ...drones, ...projectiles]);
    const actorLevels = Object.freeze(Object.fromEntries(this.#tanks.map((entry) => [entry.definition.id, entry.build.level])));
    return Object.freeze({ tick:this.#tick, elapsedMs:this.#elapsedMs, level:BASELINE_LEVEL, actorLevels, tanks, drones, projectiles, entities, events:Object.freeze([...this.#events]), ...(this.#playerTankId ? { playerId:this.#playerTankId } : {}) });
  }

  private seedCanonicalRoster(): void {
    const resolver = new BuildResolver();
    const definitions = TankRegistry.all();
    this.#tanks = definitions.map((definition, index) => {
      const position = this.spawnPoint(index, definitions.length);
      const level = legalLobbyLevel(definition);
      const build = resolver.resolve({ level, xp:0, statPoints:0, stats:ZERO_STATS, tankId:definition.id });
      const maxHealth = build.maxHealth;
      const state: TankState = {
        id: entityId(`lobby:tank:${definition.id}`), kind:'tank', lifecycle:'active', position, rotation:0,
        turretRotation:0, team:TEAMS[index % TEAMS.length], health:{ current:maxHealth, max:maxHealth },
        spawnedAtTick:0, tankDefinitionId:definition.id,
      };
      return { state, velocity:{ x:0, y:0 }, definition, build, ai:new TankAIController({ navigation:this.navigation }), commands:[] };
    });

    this.#drones = this.#tanks.flatMap((owner) => {
      const drone = owner.definition.drone;
      return Array.from({ length:drone.count }, (_, index) => ({
        state: {
          id:entityId(`lobby:drone:${owner.definition.id}:${index}`), kind:'drone' as const, lifecycle:'active' as const,
          position:{ x:owner.state.position.x + (index + 1) * 12, y:owner.state.position.y }, rotation:0,
          team:owner.state.team, health:{ current:owner.build.drone.health, max:owner.build.drone.health },
          ownerId:owner.state.id, spawnedAtTick:0, droneDefinitionId:`${owner.definition.id}:drone`,
        },
        velocity:{ x:0, y:0 },
      }));
    });
  }

  private stepTanks(dtSeconds: number): void {
    const frameEntities = this.activeEntities();
    this.#tanks.forEach((runtime, index) => {
      if (runtime.state.lifecycle !== 'active') return;
      const world = this.perception.perceive({ tick:this.#tick, elapsedMs:this.#elapsedMs, observerId:runtime.state.id, entities:frameEntities });
      if (runtime.state.id === this.#playerTankId) {
        runtime.commands = Object.freeze([...this.#playerCommands.values()].sort((a,b) => a.sequence - b.sequence));
      } else if (this.policy.shouldThink(this.#tick, index)) {
        runtime.commands = runtime.ai.update({
          world, build:runtime.build, lineage:runtime.definition.lineage,
          selfHealthFraction:(runtime.state.health?.current ?? 0) / Math.max(1, runtime.state.health?.max ?? 1),
        });
      }
      const move = runtime.commands.find((entry) => entry.command.type === 'move')?.command;
      const aim = runtime.commands.find((entry) => entry.command.type === 'aim')?.command;
      const moveVector = move?.type === 'move' ? move.vector : { x:0, y:0 };
      const aimAngle = aim?.type === 'aim' && Math.hypot(aim.vector.x, aim.vector.y) > 1e-6
        ? Math.atan2(aim.vector.y, aim.vector.x) : runtime.state.turretRotation;
      const moved = stepTankMovement(
        { position:runtime.state.position, velocity:runtime.velocity, hullRotation:runtime.state.rotation, turretRotation:runtime.state.turretRotation },
        { move:moveVector, aimAngle },
        { moveMultiplier:runtime.definition.moveMultiplier, speedUpgradeLevel:runtime.build.stats.speed, radius:runtime.definition.size },
        this.battlefield, dtSeconds,
      );
      runtime.velocity = moved.velocity;
      runtime.state = { ...runtime.state, position:moved.position, rotation:moved.hullRotation, turretRotation:moved.turretRotation };

      const fire = runtime.commands.find((entry) => entry.command.type === 'fire')?.command;
      if (fire?.type === 'fire' && fire.active) this.fire(runtime);
    });
  }

  private fire(runtime: TankRuntime): void {
    const weapon = WeaponRegistry.get(`${runtime.definition.id}:weapon`);
    const health = runtime.state.health?.current ?? 0;
    const result = this.combat.fire({
      shooter:{ id:String(runtime.state.id), teamId:runtime.state.team.teamId, position:runtime.state.position, velocity:runtime.velocity,
        radius:runtime.definition.size, health, maxHealth:runtime.state.health?.max ?? health, alive:runtime.state.lifecycle === 'active' },
      weapon, muzzleOrigin:runtime.state.position, aimRadians:runtime.state.turretRotation, atSeconds:this.#elapsedMs / 1000,
      damageMultiplier:runtime.build.projectileDamage / weapon.projectile.damage,
      reloadMultiplier:runtime.build.reloadSeconds / weapon.projectile.reloadSeconds,
      projectileSpeedMultiplier:runtime.build.projectileSpeed / weapon.projectile.speed,
      fireSpin:1, spreadSample:() => 0, projectileId:(ordinal) => `lobby:shot:${this.#shotSerial}:${ordinal}`,
    });
    this.#shotSerial += 1;
    this.#events.push(...result.events);
    for (const spec of result.projectiles) {
      const velocity = { x:Math.cos(spec.angle) * spec.speed + spec.inheritedVelocity.x, y:Math.sin(spec.angle) * spec.speed + spec.inheritedVelocity.y };
      const state: ProjectileState = {
        id:entityId(spec.id), kind:'projectile', lifecycle:'active', position:spec.position, rotation:spec.angle,
        team:{ teamId:spec.ownerTeamId }, ownerId:entityId(spec.ownerId), spawnedAtTick:this.#tick,
        projectileDefinitionId:spec.weaponId, velocity,
      };
      this.#projectiles.push({ spec, state, kinematics:{ position:spec.position, velocity, radius:spec.radius, ageSeconds:0, distanceTravelled:0, ttlSeconds:spec.ttlSeconds } });
    }
    if (this.#projectiles.length > this.policy.maxVisibleProjectiles * 2) this.#projectiles.splice(0, this.#projectiles.length - this.policy.maxVisibleProjectiles * 2);
  }

  private stepDrones(dtSeconds: number): void {
    const entities = this.activeEntities();
    for (const owner of this.#tanks) {
      const owned = this.#drones.filter((entry) => entry.state.ownerId === owner.state.id);
      if (!owned.length || owner.state.lifecycle !== 'active') continue;
      const world = this.perception.perceive({ tick:this.#tick, elapsedMs:this.#elapsedMs, observerId:owner.state.id, entities });
      const swarm = owner.commands.find((entry) => entry.command.type === 'swarm-order')?.command;
      const order: DroneSwarmOrder = swarm?.type === 'swarm-order' ? swarm : { type:'swarm-order', order:'follow' };
      const result = this.droneSystem.update({
        tick:this.#tick, elapsedMs:this.#elapsedMs, dtSeconds, owner:owner.state, ownerLineage:owner.definition.lineage,
        drones:owned.map((entry) => entry.state), perceivedWorld:world, order,
      });
      for (const intent of result.intents) {
        const runtime = owned.find((entry) => entry.state.id === intent.droneId);
        if (!runtime) continue;
        const maxSpeed = Math.max(intent.minimumSpeed ?? 0, owner.build.drone.speed * intent.speedScale);
        const moved = stepDroneVelocity({ position:runtime.state.position, velocity:runtime.velocity, rotation:runtime.state.rotation }, intent.desiredDirection,
          { maxSpeed }, this.battlefield, dtSeconds);
        runtime.velocity = moved.velocity;
        const health = runtime.state.health;
        const repaired = health && intent.repairFraction > 0
          ? { current:Math.min(health.max, health.current + health.max * intent.repairFraction), max:health.max } : health;
        runtime.state = { ...runtime.state, position:moved.position, rotation:moved.rotation, ...(repaired ? { health:repaired } : {}) };
      }
    }
  }

  private stepProjectiles(dtSeconds: number): void {
    const survivors: ProjectileRuntime[] = [];
    for (const runtime of this.#projectiles) {
      const result = stepProjectile(runtime.kinematics, this.battlefield, dtSeconds);
      if (!result.active) {
        if (result.reason === 'terrain' && result.terrainId !== undefined) {
          this.#events.push(...this.combat.damageCover(this.battlefield, result.terrainId, runtime.spec, this.#elapsedMs / 1000));
        }
        continue;
      }
      runtime.kinematics = result.state;
      runtime.state = { ...runtime.state, position:result.state.position, velocity:result.state.velocity, rotation:Math.atan2(result.state.velocity.y, result.state.velocity.x) };

      if (this.#playerTankId && this.resolveArenaHit(runtime)) continue;
      survivors.push(runtime);
    }
    this.#projectiles = survivors;
  }

  private resolveArenaHit(projectile: ProjectileRuntime): boolean {
    const target = this.#tanks.find((entry) => {
      if (entry.state.lifecycle !== 'active' || entry.state.id === projectile.state.ownerId) return false;
      if (entry.state.team.teamId === projectile.spec.ownerTeamId) return false;
      return Math.hypot(entry.state.position.x - projectile.state.position.x, entry.state.position.y - projectile.state.position.y) <= entry.definition.size + projectile.spec.radius;
    });
    if (!target) return false;
    const health = target.state.health ?? { current:1, max:1 };
    const hit = this.combat.resolveDirectHit({
      projectile:projectile.spec,
      target:{ id:String(target.state.id), teamId:target.state.team.teamId, position:target.state.position, velocity:target.velocity, radius:target.definition.size, health:health.current, maxHealth:health.max, alive:true },
      atSeconds:this.#elapsedMs / 1000,
    });
    this.#events.push(...hit.events);
    target.state = { ...target.state, health:{ current:hit.target.health, max:health.max }, ...(hit.destroyed ? { lifecycle:'destroyed', destroyedAtTick:this.#tick } : {}) };
    return true;
  }

  private activeEntities(): readonly EntityState[] {
    return [...this.#tanks.map((entry) => entry.state), ...this.#drones.map((entry) => entry.state), ...this.#projectiles.map((entry) => entry.state)];
  }

  private spawnPoint(index: number, count: number): Vector2State {
    const angle = (Math.PI * 2 * index) / Math.max(1, count);
    for (const radius of [1550, 1320, 1780, 1080]) {
      const candidate = { x:Math.cos(angle) * radius, y:Math.sin(angle) * radius };
      if (this.battlefield.isSpawnSafe(candidate, 28)) return candidate;
    }
    return { x:Math.cos(angle) * 900, y:Math.sin(angle) * 900 };
  }
}

function legalLobbyLevel(definition: TankDefinition): number {
  return definition.tier === 3 ? Math.max(BASELINE_LEVEL, BALANCE.evolutionLevels.apex) : BASELINE_LEVEL;
}
function freezeTank(state: TankState): TankState { return Object.freeze({ ...state, position:Object.freeze({ ...state.position }), team:Object.freeze({ ...state.team }), ...(state.health ? { health:Object.freeze({ ...state.health }) } : {}) }); }
function freezeDrone(state: DroneState): DroneState { return Object.freeze({ ...state, position:Object.freeze({ ...state.position }), team:Object.freeze({ ...state.team }), ...(state.health ? { health:Object.freeze({ ...state.health }) } : {}) }); }
function freezeProjectile(state: ProjectileState): ProjectileState { return Object.freeze({ ...state, position:Object.freeze({ ...state.position }), velocity:Object.freeze({ ...state.velocity }), team:Object.freeze({ ...state.team }) }); }
