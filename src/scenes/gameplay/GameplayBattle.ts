import {
  AbilityRegistry, BALANCE, EvolutionRegistry, GENE_OPTIONS, MasteryPerkRegistry,
  TankRegistry, WeaponRegistry,
} from '../../content';
import type { CombatLineageId, StatUpgradeId, TankDefinition } from '../../content';
import { TankAIController } from '../../ai/controllers/TankAIController';
import { NavigationService } from '../../ai/navigation/NavigationService';
import { RoutePlanner } from '../../ai/navigation/RoutePlanner';
import { Battlefield } from '../../game/battlefield/Battlefield';
import type { BattlefieldTemplateId } from '../../game/battlefield/types';
import { CombatSystem } from '../../game/combat/CombatSystem';
import type { CombatSemanticEvent, ProjectileSpawnSpec } from '../../game/combat/types';
import { DroneSystem } from '../../game/entities/drones/DroneSystem';
import type { DroneSwarmOrder } from '../../game/entities/drones/types';
import type { DroneState, EntityState, PowerupState, ProjectileState, ShapeState, TankState, Vector2State } from '../../game/entities/types';
import { stepDroneVelocity } from '../../game/movement/DroneMovement';
import { stepTankMovement } from '../../game/movement/TankMovement';
import { stepProjectile, type ProjectileKinematicState } from '../../game/entities/projectiles/ProjectileKinematics';
import { BuildResolver } from '../../game/progression/BuildResolver';
import { EvolutionSystem } from '../../game/progression/EvolutionSystem';
import { ProgressionSystem, pityStartLevel } from '../../game/progression/ProgressionSystem';
import { STAT_IDS, UpgradeSystem, ZERO_STATS } from '../../game/progression/UpgradeSystem';
import type { MasteryPerkId, ProgressionState, StatRanks, TankBuild } from '../../game/progression/types';
import { SeededRandom } from '../../game/simulation/SeededRandom';
import { entityId, type EntityId } from '../../game/simulation/types';
import { PerceptionCore } from '../../game/targeting/PerceptionCore';
import type { CommandEnvelope, CommandSource, GameCommand } from '../../input/commands/GameCommand';

export type GameplayStatus = 'playing' | 'paused' | 'dead';
export type PowerupKind = 'heal' | 'shield' | 'triple' | 'haste' | 'nuke';

const FIXED_HZ = 60;
const FIXED_STEP_MS = 1000 / FIXED_HZ;
const AI_COUNT = 8;
const SHAPE_TARGETS = Object.freeze({ circle:62, triangle:30, square:16, pentagon:8, hexagon:4, star:1 });
const SHAPE_DEFS = Object.freeze({
  circle:Object.freeze({ hp:14, xp:10, radius:12, speed:10 }),
  triangle:Object.freeze({ hp:30, xp:25, radius:16, speed:16 }),
  square:Object.freeze({ hp:55, xp:50, radius:20, speed:9 }),
  pentagon:Object.freeze({ hp:100, xp:100, radius:26, speed:6 }),
  hexagon:Object.freeze({ hp:190, xp:200, radius:33, speed:4 }),
  star:Object.freeze({ hp:340, xp:500, radius:24, speed:78 }),
  crasher:Object.freeze({ hp:95, xp:60, radius:15, speed:105 }),
});
const POWERUPS: readonly PowerupKind[] = Object.freeze(['heal','shield','triple','haste','nuke']);
const TIER1_BY_LINEAGE = Object.freeze({ gunner:'twin', cannon:'cannon', sniper:'marksman', controller:'carrier', guardian:'guard' } as const);
const AI_LINEAGES = Object.freeze(['gunner','cannon','sniper','controller','guardian'] as const);

interface TankRuntime {
  state: TankState;
  velocity: Vector2State;
  definition: TankDefinition;
  build: TankBuild;
  progression: ProgressionState;
  readonly ai: TankAIController;
  readonly isPlayer: boolean;
  commands: readonly CommandEnvelope[];
  score: number;
  kills: number;
  respawnAtTick?: number;
}
interface DroneRuntime { state: DroneState; velocity: Vector2State; }
interface ProjectileRuntime { spec: ProjectileSpawnSpec; kinematics: ProjectileKinematicState; state: ProjectileState; }
interface ShapeRuntime { state: ShapeState; velocity: Vector2State; spin: number; xp: number; radius: number; }
interface PowerupRuntime { state: PowerupState; expiresAtTick: number; }

export interface GameplaySnapshot {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly status: GameplayStatus;
  readonly playerId: EntityId;
  readonly progression: ProgressionState;
  readonly score: number;
  readonly kills: number;
  readonly tanks: readonly TankState[];
  readonly drones: readonly DroneState[];
  readonly projectiles: readonly ProjectileState[];
  readonly shapes: readonly ShapeState[];
  readonly powerups: readonly PowerupState[];
  readonly entities: readonly EntityState[];
  readonly events: readonly CombatSemanticEvent[];
  readonly leaderboard: readonly { name:string; score:number; level:number; isPlayer:boolean }[];
  readonly effects: Readonly<{ shieldSeconds:number; tripleSeconds:number; hasteSeconds:number }>;
}

export interface GameplayBattleOptions {
  readonly battlefieldTemplate?: BattlefieldTemplateId;
  readonly bestRunLevel?: number;
  readonly seed?: number;
}

/**
 * Canonical main-game session. Unlike LobbyBattle this owns the run lifecycle:
 * Scout deployment, pity start, neutral resources, XP/stat progression,
 * evolution choices, rival parity, powerups, death and redeploy.
 * Physics/combat/AI/rendering remain delegated to their canonical subsystems.
 */
export class GameplayBattle {
  readonly battlefield: Battlefield;
  readonly navigation: NavigationService;
  readonly droneSystem: DroneSystem;
  readonly combat = new CombatSystem();
  readonly perception: PerceptionCore;
  readonly progressionSystem = new ProgressionSystem();
  readonly evolutionSystem = new EvolutionSystem();
  readonly upgradeSystem = new UpgradeSystem();
  readonly buildResolver = new BuildResolver();
  readonly random: SeededRandom;

  #tick = 0;
  #elapsedMs = 0;
  #shotSerial = 0;
  #commandSequence = 0;
  #status: GameplayStatus = 'playing';
  #tanks: TankRuntime[] = [];
  #drones: DroneRuntime[] = [];
  #projectiles: ProjectileRuntime[] = [];
  #shapes: ShapeRuntime[] = [];
  #powerups: PowerupRuntime[] = [];
  #events: CombatSemanticEvent[] = [];
  #player!: TankRuntime;
  #playerCommands = new Map<string, CommandEnvelope>();
  #powerupSpawnTick = FIXED_HZ * 8;
  #crasherSpawnTick = FIXED_HZ * 5;
  #shieldUntilTick = 0;
  #tripleUntilTick = 0;
  #hasteUntilTick = 0;
  #bestRunLevel: number;

  constructor(options: GameplayBattleOptions = {}) {
    this.random = new SeededRandom(options.seed ?? 0x4e4f5641);
    this.#bestRunLevel = Math.max(1, Math.floor(options.bestRunLevel ?? 1));
    this.battlefield = new Battlefield({ template: options.battlefieldTemplate ?? 'crossfire' });
    this.navigation = new NavigationService(new RoutePlanner(this.battlefield));
    this.droneSystem = new DroneSystem(this.navigation);
    this.perception = new PerceptionCore({ lineOfSight:this.battlefield });
    this.deployRun();
  }

  get fixedStepMs(): number { return FIXED_STEP_MS; }
  get simulationHz(): number { return FIXED_HZ; }
  get status(): GameplayStatus { return this.#status; }
  get playerId(): EntityId { return this.#player.state.id; }
  get playerProgression(): ProgressionState { return this.#player.progression; }
  get bestRunLevel(): number { return this.#bestRunLevel; }

  issuePlayerCommand(command: GameCommand, source: CommandSource = 'keyboard'): void {
    if (this.#status !== 'playing') return;
    const key = command.type === 'ability' ? `${command.type}:${command.slot}` : command.type;
    this.#playerCommands.set(key, Object.freeze({ source, sequence:this.#commandSequence++, command:Object.freeze(command) }));
  }

  togglePause(): GameplayStatus {
    if (this.#status === 'dead') return this.#status;
    this.#status = this.#status === 'paused' ? 'playing' : 'paused';
    return this.#status;
  }

  redeploy(): void {
    this.deployRun();
  }

  spendStat(id: StatUpgradeId): void {
    this.#player.progression = this.upgradeSystem.spend(this.#player.progression, id);
    this.refit(this.#player);
  }

  chooseEvolution(tankId: string): void {
    this.#player.progression = this.evolutionSystem.evolve(this.#player.progression, tankId);
    this.refit(this.#player);
    this.refitDrones(this.#player);
  }

  chooseMastery(perkId: MasteryPerkId): void {
    this.#player.progression = this.evolutionSystem.chooseMastery(this.#player.progression, perkId);
    this.refit(this.#player);
  }

  chooseGene(geneId: CombatLineageId): void {
    this.#player.progression = this.evolutionSystem.chooseGene(this.#player.progression, geneId);
    this.refit(this.#player);
    this.refitDrones(this.#player);
  }

  step(steps = 1): GameplaySnapshot {
    if (!Number.isInteger(steps) || steps < 0) throw new Error('Gameplay steps must be a non-negative integer');
    if (this.#status !== 'playing') return this.snapshot();
    for (let index = 0; index < steps; index += 1) {
      this.#tick += 1;
      this.#elapsedMs += FIXED_STEP_MS;
      this.#events = [];
      this.stepRespawns();
      this.stepTanks(1 / FIXED_HZ);
      this.stepDrones(1 / FIXED_HZ);
      this.stepShapes(1 / FIXED_HZ);
      this.stepProjectiles(1 / FIXED_HZ);
      this.stepPowerups();
      this.stepNeutralSpawns();
      if (this.#player.state.lifecycle !== 'active') this.#status = 'dead';
    }
    return this.snapshot();
  }

  snapshot(): GameplaySnapshot {
    const tanks = Object.freeze(this.#tanks.filter((entry) => entry.state.lifecycle !== 'despawned').map((entry) => freezeTank(entry.state)));
    const drones = Object.freeze(this.#drones.filter((entry) => entry.state.lifecycle === 'active').map((entry) => freezeDrone(entry.state)));
    const projectiles = Object.freeze(this.#projectiles.map((entry) => freezeProjectile(entry.state)));
    const shapes = Object.freeze(this.#shapes.map((entry) => freezeShape(entry.state)));
    const powerups = Object.freeze(this.#powerups.map((entry) => freezePowerup(entry.state)));
    const entities: readonly EntityState[] = Object.freeze([...tanks, ...drones, ...projectiles, ...shapes, ...powerups]);
    const leaderboard = Object.freeze(this.#tanks
      .filter((entry) => entry.state.lifecycle === 'active')
      .map((entry, index) => ({ name:entry.isPlayer ? 'YOU' : `RIVAL ${index}`, score:Math.round(entry.score), level:entry.progression.level, isPlayer:entry.isPlayer }))
      .sort((a,b) => b.score - a.score).slice(0,8));
    return Object.freeze({
      tick:this.#tick, elapsedMs:this.#elapsedMs, status:this.#status, playerId:this.#player.state.id,
      progression:Object.freeze(cloneProgression(this.#player.progression)), score:Math.round(this.#player.score), kills:this.#player.kills,
      tanks, drones, projectiles, shapes, powerups, entities, events:Object.freeze([...this.#events]), leaderboard,
      effects:Object.freeze({
        shieldSeconds:Math.max(0,(this.#shieldUntilTick-this.#tick)/FIXED_HZ),
        tripleSeconds:Math.max(0,(this.#tripleUntilTick-this.#tick)/FIXED_HZ),
        hasteSeconds:Math.max(0,(this.#hasteUntilTick-this.#tick)/FIXED_HZ),
      }),
    });
  }

  private deployRun(): void {
    this.#tick = 0; this.#elapsedMs = 0; this.#shotSerial = 0; this.#commandSequence = 0; this.#status = 'playing';
    this.#tanks = []; this.#drones = []; this.#projectiles = []; this.#shapes = []; this.#powerups = []; this.#events = [];
    this.#playerCommands.clear(); this.#shieldUntilTick = 3 * FIXED_HZ; this.#tripleUntilTick = 0; this.#hasteUntilTick = 0;
    this.#powerupSpawnTick = 8 * FIXED_HZ; this.#crasherSpawnTick = 5 * FIXED_HZ;

    const pity = pityStartLevel(this.#bestRunLevel);
    const progression: ProgressionState = Object.freeze({ level:pity, xp:0, statPoints:pity-1, stats:ZERO_STATS, tankId:'scout' });
    this.#player = this.createTank('player', progression, true, this.safeSpawn(0, AI_COUNT + 1));
    this.#tanks.push(this.#player);
    for (let index = 0; index < AI_COUNT; index += 1) {
      const rival = this.createTank(`rival:${index}`, this.aiProgressionFor(pity, index), false, this.safeSpawn(index + 1, AI_COUNT + 1));
      this.#tanks.push(rival);
    }
    for (const [shapeType, count] of Object.entries(SHAPE_TARGETS) as [keyof typeof SHAPE_TARGETS, number][]) {
      for (let index = 0; index < count; index += 1) this.spawnShape(shapeType, true);
    }
    this.refitAllDrones();
  }

  private createTank(id: string, progression: ProgressionState, isPlayer: boolean, position: Vector2State): TankRuntime {
    const definition = TankRegistry.get(progression.tankId);
    const build = this.buildResolver.resolve(progression);
    const state: TankState = {
      id:entityId(`game:tank:${id}`), kind:'tank', lifecycle:'active', position, rotation:0, turretRotation:0,
      team:{ teamId:isPlayer ? 'player' : id, allegiance:isPlayer ? 'friendly' : 'hostile' },
      health:{ current:build.maxHealth, max:build.maxHealth }, spawnedAtTick:this.#tick, tankDefinitionId:definition.id,
    };
    return { state, velocity:{x:0,y:0}, definition, build, progression, ai:new TankAIController({ navigation:this.navigation }), isPlayer, commands:[], score:0, kills:0 };
  }

  private stepTanks(dtSeconds: number): void {
    const entities = this.activeEntities();
    this.#tanks.forEach((runtime, index) => {
      if (runtime.state.lifecycle !== 'active') return;
      const world = this.perception.perceive({ tick:this.#tick, elapsedMs:this.#elapsedMs, observerId:runtime.state.id, entities });
      if (runtime.isPlayer) runtime.commands = Object.freeze([...this.#playerCommands.values()].sort((a,b)=>a.sequence-b.sequence));
      else if ((this.#tick + index) % 4 === 0) runtime.commands = runtime.ai.update({
        world, build:runtime.build, lineage:runtime.definition.lineage,
        selfHealthFraction:(runtime.state.health?.current ?? 0)/Math.max(1,runtime.state.health?.max ?? 1),
      });

      const move = runtime.commands.find((entry)=>entry.command.type==='move')?.command;
      const aim = runtime.commands.find((entry)=>entry.command.type==='aim')?.command;
      const moveVector = move?.type==='move' ? move.vector : {x:0,y:0};
      const aimAngle = aim?.type==='aim' && Math.hypot(aim.vector.x,aim.vector.y)>1e-6 ? Math.atan2(aim.vector.y,aim.vector.x) : runtime.state.turretRotation;
      const effects = this.combat.effectsFor(String(runtime.state.id), this.#elapsedMs/1000);
      const statusSpeed = effects.reduce((value,effect)=>value*(effect.moveSpeedMultiplier ?? 1),1);
      const haste = runtime.isPlayer && this.#tick < this.#hasteUntilTick ? 1.35 : 1;
      const moved = stepTankMovement(
        { position:runtime.state.position, velocity:runtime.velocity, hullRotation:runtime.state.rotation, turretRotation:runtime.state.turretRotation },
        { move:moveVector, aimAngle },
        { moveMultiplier:runtime.definition.moveMultiplier*statusSpeed*haste, speedUpgradeLevel:runtime.build.stats.speed, radius:runtime.definition.size },
        this.battlefield, dtSeconds,
      );
      runtime.velocity = moved.velocity;
      runtime.state = { ...runtime.state, position:moved.position, rotation:moved.hullRotation, turretRotation:moved.turretRotation };

      const health = runtime.state.health;
      if (health && health.current > 0 && health.current < health.max) {
        runtime.state = { ...runtime.state, health:{ current:Math.min(health.max,health.current+runtime.build.regenPerSecond*dtSeconds), max:health.max } };
      }

      const fire = runtime.commands.find((entry)=>entry.command.type==='fire')?.command;
      if (fire?.type==='fire' && fire.active) this.fire(runtime);
      const ability = runtime.commands.some((entry)=>entry.command.type==='ability' && entry.command.active);
      const ultimate = runtime.commands.some((entry)=>entry.command.type==='ultimate' && entry.command.active);
      if (ability || ultimate) this.activateAbility(runtime);
    });
  }

  private fire(runtime: TankRuntime): void {
    const weapon = WeaponRegistry.get(`${runtime.definition.id}:weapon`);
    const health = runtime.state.health?.current ?? 0;
    const result = this.combat.fire({
      shooter:this.combatant(runtime), weapon, muzzleOrigin:runtime.state.position, aimRadians:runtime.state.turretRotation,
      atSeconds:this.#elapsedMs/1000, damageMultiplier:runtime.build.projectileDamage/weapon.projectile.damage,
      reloadMultiplier:runtime.build.reloadSeconds/weapon.projectile.reloadSeconds,
      projectileSpeedMultiplier:runtime.build.projectileSpeed/weapon.projectile.speed,
      fireSpin:1, spreadSample:()=>this.random.range(-1,1), projectileId:(ordinal)=>`game:shot:${this.#shotSerial}:${ordinal}`,
    });
    this.#shotSerial += 1;
    this.#events.push(...result.events);
    if (!result.fired || health<=0) return;
    this.spawnProjectiles(result.projectiles);
    if (runtime.isPlayer && this.#tick < this.#tripleUntilTick) {
      const extras = result.projectiles.flatMap((spec,index)=>[-0.16,0.16].map((offset,side)=>({ ...spec, id:`${spec.id}:triple:${index}:${side}`, angle:spec.angle+offset })));
      this.spawnProjectiles(extras);
    }
  }

  private activateAbility(runtime: TankRuntime): void {
    const abilityId = runtime.definition.abilityId;
    if (!abilityId) return;
    const ability = AbilityRegistry.get(abilityId);
    const weapon = WeaponRegistry.get(`${runtime.definition.id}:weapon`);
    const result = this.combat.activateAbility({
      actor:this.combatant(runtime), ability, atSeconds:this.#elapsedMs/1000, aimRadians:runtime.state.turretRotation, weapon,
      projectileId:(ordinal)=>`game:ability:${this.#shotSerial}:${ordinal}`,
      damageMultiplier:runtime.build.projectileDamage/weapon.projectile.damage,
      projectileSpeedMultiplier:runtime.build.projectileSpeed/weapon.projectile.speed,
      battlefieldHalfExtent:BALANCE.arenaHalfExtent,
    });
    if (!result.activated) return;
    this.#shotSerial += 1;
    this.#events.push(...result.events);
    for (const action of result.actions) {
      if (action.type==='spawn-projectiles') this.spawnProjectiles(action.projectiles);
      else if (action.type==='blink') runtime.state = { ...runtime.state, position:action.destination };
      else if (action.type==='temporary-drone-capacity') this.ensureDroneCount(runtime, runtime.build.drone.count+action.additionalDrones);
    }
  }

  private spawnProjectiles(specs: readonly ProjectileSpawnSpec[]): void {
    for (const spec of specs) {
      const velocity={x:Math.cos(spec.angle)*spec.speed+spec.inheritedVelocity.x,y:Math.sin(spec.angle)*spec.speed+spec.inheritedVelocity.y};
      const state: ProjectileState={ id:entityId(spec.id),kind:'projectile',lifecycle:'active',position:spec.position,rotation:spec.angle,
        team:{teamId:spec.ownerTeamId},ownerId:entityId(spec.ownerId),spawnedAtTick:this.#tick,projectileDefinitionId:spec.weaponId,velocity };
      this.#projectiles.push({spec,state,kinematics:{position:spec.position,velocity,radius:spec.radius,ageSeconds:0,distanceTravelled:0,ttlSeconds:spec.ttlSeconds}});
    }
    if (this.#projectiles.length>240) this.#projectiles.splice(0,this.#projectiles.length-240);
  }

  private stepDrones(dtSeconds: number): void {
    const entities=this.activeEntities();
    for (const owner of this.#tanks) {
      const owned=this.#drones.filter((entry)=>entry.state.ownerId===owner.state.id && entry.state.lifecycle==='active');
      if (!owned.length || owner.state.lifecycle!=='active') continue;
      const world=this.perception.perceive({tick:this.#tick,elapsedMs:this.#elapsedMs,observerId:owner.state.id,entities});
      const swarm=owner.commands.find((entry)=>entry.command.type==='swarm-order')?.command;
      const order: DroneSwarmOrder=swarm?.type==='swarm-order'?swarm:{type:'swarm-order',order:'follow'};
      const result=this.droneSystem.update({tick:this.#tick,elapsedMs:this.#elapsedMs,dtSeconds,owner:owner.state,ownerLineage:owner.definition.lineage,drones:owned.map((entry)=>entry.state),perceivedWorld:world,order});
      for (const intent of result.intents) {
        const runtime=owned.find((entry)=>entry.state.id===intent.droneId); if(!runtime)continue;
        const maxSpeed=Math.max(intent.minimumSpeed??0,owner.build.drone.speed*intent.speedScale);
        const moved=stepDroneVelocity({position:runtime.state.position,velocity:runtime.velocity,rotation:runtime.state.rotation},intent.desiredDirection,{maxSpeed},this.battlefield,dtSeconds);
        runtime.velocity=moved.velocity;
        const health=runtime.state.health;
        const repaired=health&&intent.repairFraction>0?{current:Math.min(health.max,health.current+health.max*intent.repairFraction),max:health.max}:health;
        runtime.state={...runtime.state,position:moved.position,rotation:moved.rotation,...(repaired?{health:repaired}:{})};
      }
    }
  }

  private stepProjectiles(dtSeconds: number): void {
    const survivors: ProjectileRuntime[]=[];
    for(const runtime of this.#projectiles){
      const result=stepProjectile(runtime.kinematics,this.battlefield,dtSeconds);
      if(!result.active){
        if(result.reason==='terrain'&&result.terrainId!==undefined)this.#events.push(...this.combat.damageCover(this.battlefield,result.terrainId,runtime.spec,this.#elapsedMs/1000));
        if(runtime.spec.clusterCount>0)this.spawnProjectiles(this.combat.spawnCluster(runtime.spec,result.state.position,(ordinal)=>`${runtime.spec.id}:cluster:${ordinal}`));
        continue;
      }
      runtime.kinematics=result.state;
      runtime.state={...runtime.state,position:result.state.position,velocity:result.state.velocity,rotation:Math.atan2(result.state.velocity.y,result.state.velocity.x)};
      if(this.resolveShapeHit(runtime) || this.resolveTankHit(runtime)) continue;
      survivors.push(runtime);
    }
    this.#projectiles=survivors;
  }

  private resolveTankHit(projectile: ProjectileRuntime): boolean {
    const target=this.#tanks.find((entry)=>entry.state.lifecycle==='active'&&entry.state.id!==projectile.state.ownerId&&entry.state.team.teamId!==projectile.spec.ownerTeamId&&Math.hypot(entry.state.position.x-projectile.state.position.x,entry.state.position.y-projectile.state.position.y)<=entry.definition.size+projectile.spec.radius);
    if(!target)return false;
    if(target.isPlayer&&this.#tick<this.#shieldUntilTick)return true;
    const health=target.state.health??{current:1,max:1};
    const hit=this.combat.resolveDirectHit({projectile:projectile.spec,target:{...this.combatant(target),health:health.current,maxHealth:health.max},atSeconds:this.#elapsedMs/1000});
    this.#events.push(...hit.events);
    target.state={...target.state,health:{current:hit.target.health,max:health.max},...(hit.destroyed?{lifecycle:'destroyed',destroyedAtTick:this.#tick}:{})};
    if(hit.destroyed)this.onTankDestroyed(target,projectile.spec.ownerId);
    if(projectile.spec.splashRadius>0)this.resolveSplash(projectile,target);
    return true;
  }

  private resolveSplash(projectile: ProjectileRuntime, direct: TankRuntime): void {
    const targets=this.#tanks.filter((entry)=>entry!==direct&&entry.state.lifecycle==='active'&&entry.state.team.teamId!==projectile.spec.ownerTeamId&&Math.hypot(entry.state.position.x-projectile.state.position.x,entry.state.position.y-projectile.state.position.y)<=projectile.spec.splashRadius+entry.definition.size);
    const results=this.combat.resolveSplash(projectile.spec,targets.map((entry)=>({combatant:this.combatant(entry),exposure:this.battlefield.hasLineOfSight(projectile.state.position,entry.state.position)?1:0})),this.#elapsedMs/1000);
    this.#events.push(...results.events);
    for(const result of results.results){
      const runtime=this.#tanks.find((entry)=>String(entry.state.id)===result.target.id); if(!runtime)continue;
      const max=runtime.state.health?.max??result.target.maxHealth;
      runtime.state={...runtime.state,health:{current:result.target.health,max},...(result.destroyed?{lifecycle:'destroyed',destroyedAtTick:this.#tick}:{})};
      if(result.destroyed)this.onTankDestroyed(runtime,projectile.spec.ownerId);
    }
  }

  private resolveShapeHit(projectile: ProjectileRuntime): boolean {
    const shape=this.#shapes.find((entry)=>entry.state.lifecycle==='active'&&Math.hypot(entry.state.position.x-projectile.state.position.x,entry.state.position.y-projectile.state.position.y)<=entry.radius+projectile.spec.radius);
    if(!shape)return false;
    const health=shape.state.health??{current:1,max:1};
    const next=Math.max(0,health.current-projectile.spec.damage);
    shape.state={...shape.state,health:{current:next,max:health.max},...(next<=0?{lifecycle:'destroyed',destroyedAtTick:this.#tick}:{})};
    if(next<=0)this.onShapeDestroyed(shape,projectile.spec.ownerId);
    return true;
  }

  private onTankDestroyed(victim: TankRuntime, killerId: string): void {
    const killer=this.#tanks.find((entry)=>String(entry.state.id)===killerId);
    if(killer&&killer!==victim){
      const reward=220+victim.progression.level*40;
      killer.score+=reward; killer.kills+=1;
      if(killer.isPlayer)this.awardPlayerXp(reward);
      const health=killer.state.health;if(health)killer.state={...killer.state,health:{current:Math.min(health.max,health.current+40),max:health.max}};
    }
    this.#drones=this.#drones.filter((entry)=>entry.state.ownerId!==victim.state.id);
    if(victim.isPlayer){this.#bestRunLevel=Math.max(this.#bestRunLevel,victim.progression.level);this.#status='dead';}
    else victim.respawnAtTick=this.#tick+this.random.integer(270,541);
  }

  private onShapeDestroyed(shape: ShapeRuntime, killerId: string): void {
    const killer=this.#tanks.find((entry)=>String(entry.state.id)===killerId);
    if(killer){killer.score+=shape.xp;if(killer.isPlayer)this.awardPlayerXp(shape.xp);}
    this.#shapes=this.#shapes.filter((entry)=>entry!==shape);
    if(shape.state.shapeType==='pentagon'||shape.state.shapeType==='hexagon'){
      const child=shape.state.shapeType==='pentagon'?'triangle':'pentagon';
      for(let i=0;i<3;i++)this.spawnShape(child,false,shape.state.position);
    }
  }

  private awardPlayerXp(amount: number): void {
    const before=this.#player.progression.level;
    this.#player.progression=this.progressionSystem.gainXp(this.#player.progression,amount).state;
    this.#player.score+=amount;
    if(this.#player.progression.level!==before){
      this.#bestRunLevel=Math.max(this.#bestRunLevel,this.#player.progression.level);
      this.refit(this.#player);
      this.syncRivalsToPlayer();
    }
  }

  private stepShapes(dtSeconds: number): void {
    for(const runtime of this.#shapes){
      const type=runtime.state.shapeType as keyof typeof SHAPE_DEFS;
      if(type==='crasher'){
        const active=this.#tanks.filter((entry)=>entry.state.lifecycle==='active');
        const target=active.reduce<TankRuntime|undefined>((best,entry)=>!best||distance(runtime.state.position,entry.state.position)<distance(runtime.state.position,best.state.position)?entry:best,undefined);
        if(target){const dx=target.state.position.x-runtime.state.position.x,dy=target.state.position.y-runtime.state.position.y,len=Math.hypot(dx,dy)||1;runtime.velocity={x:dx/len*SHAPE_DEFS.crasher.speed,y:dy/len*SHAPE_DEFS.crasher.speed};}
      }
      let next={x:runtime.state.position.x+runtime.velocity.x*dtSeconds,y:runtime.state.position.y+runtime.velocity.y*dtSeconds};
      if(!this.battlefield.contains(next,runtime.radius)){runtime.velocity={x:-runtime.velocity.x,y:-runtime.velocity.y};next={x:runtime.state.position.x+runtime.velocity.x*dtSeconds,y:runtime.state.position.y+runtime.velocity.y*dtSeconds};}
      runtime.state={...runtime.state,position:next,rotation:runtime.state.rotation+runtime.spin*dtSeconds};
    }
  }

  private stepPowerups(): void {
    this.#powerups=this.#powerups.filter((runtime)=>runtime.expiresAtTick>this.#tick);
    if(this.#status!=='playing'||this.#player.state.lifecycle!=='active')return;
    for(const runtime of [...this.#powerups]){
      if(distance(runtime.state.position,this.#player.state.position)>46)continue;
      this.applyPowerup(runtime.state.powerupType as PowerupKind);
      this.#powerups=this.#powerups.filter((entry)=>entry!==runtime);
    }
  }

  private applyPowerup(type: PowerupKind): void {
    const health=this.#player.state.health;
    if(type==='heal'&&health)this.#player.state={...this.#player.state,health:{current:health.max,max:health.max}};
    else if(type==='shield')this.#shieldUntilTick=this.#tick+5*FIXED_HZ;
    else if(type==='triple')this.#tripleUntilTick=this.#tick+6*FIXED_HZ;
    else if(type==='haste')this.#hasteUntilTick=this.#tick+6*FIXED_HZ;
    else if(type==='nuke'){
      for(const shape of [...this.#shapes]){if(distance(shape.state.position,this.#player.state.position)<=290){shape.state={...shape.state,health:{current:0,max:shape.state.health?.max??1},lifecycle:'destroyed',destroyedAtTick:this.#tick};this.onShapeDestroyed(shape,String(this.#player.state.id));}}
      for(const rival of this.#tanks){if(rival.isPlayer||rival.state.lifecycle!=='active'||distance(rival.state.position,this.#player.state.position)>290)continue;const healthState=rival.state.health??{current:1,max:1};const next=Math.max(0,healthState.current-150);rival.state={...rival.state,health:{current:next,max:healthState.max},...(next<=0?{lifecycle:'destroyed',destroyedAtTick:this.#tick}:{})};if(next<=0)this.onTankDestroyed(rival,String(this.#player.state.id));}
    }
  }

  private stepNeutralSpawns(): void {
    if(this.#tick>=this.#powerupSpawnTick){this.#powerupSpawnTick=this.#tick+8*FIXED_HZ;if(this.#powerups.length<4)this.spawnPowerup();}
    if(this.#tick>=this.#crasherSpawnTick){this.#crasherSpawnTick=this.#tick+5*FIXED_HZ;if(this.#shapes.filter((entry)=>entry.state.shapeType==='crasher').length<4)this.spawnShape('crasher');}
    for(const [type,target] of Object.entries(SHAPE_TARGETS) as [keyof typeof SHAPE_TARGETS,number][]){const count=this.#shapes.filter((entry)=>entry.state.shapeType===type).length;if(count<target)this.spawnShape(type);}
  }

  private stepRespawns(): void {
    for(let index=0;index<this.#tanks.length;index++){
      const runtime=this.#tanks[index];if(runtime.isPlayer||runtime.respawnAtTick===undefined||runtime.respawnAtTick>this.#tick)continue;
      const progression=this.aiProgressionFor(this.#player.progression.level,index-1);
      const replacement=this.createTank(`rival:${index-1}`,progression,false,this.safeSpawn(index,AI_COUNT+1));
      this.#tanks[index]=replacement;this.ensureDroneCount(replacement,replacement.build.drone.count);
    }
  }

  private syncRivalsToPlayer(): void {
    this.#tanks.forEach((runtime,index)=>{if(runtime.isPlayer||runtime.state.lifecycle!=='active')return;runtime.progression=this.aiProgressionFor(this.#player.progression.level,index-1);this.refit(runtime);this.refitDrones(runtime);});
  }

  private aiProgressionFor(level: number, ordinal: number): ProgressionState {
    const bounded=Math.max(1,Math.min(45,Math.floor(level)));
    const stats=spendAiStats(bounded-1,ordinal);
    let state: ProgressionState={level:bounded,xp:0,statPoints:0,stats,tankId:'scout'};
    if(bounded>=BALANCE.evolutionLevels.tier1){const lineage=AI_LINEAGES[Math.abs(ordinal)%AI_LINEAGES.length];state={...state,tankId:TIER1_BY_LINEAGE[lineage]};}
    if(bounded>=BALANCE.evolutionLevels.tier2){const edge=EvolutionRegistry.from(state.tankId);if(edge)state={...state,tankId:edge.toTankIds[Math.abs(ordinal)%edge.toTankIds.length]};}
    if(bounded>=BALANCE.evolutionLevels.mastery){const perks=MasteryPerkRegistry.all();state={...state,perkId:perks[Math.abs(ordinal)%perks.length].id as MasteryPerkId};}
    if(bounded>=BALANCE.evolutionLevels.gene){const lineage=TankRegistry.get(state.tankId).lineage;const choices=GENE_OPTIONS.filter((entry)=>entry!==lineage);state={...state,geneId:choices[Math.abs(ordinal)%choices.length]};}
    if(bounded>=BALANCE.evolutionLevels.apex){const edge=EvolutionRegistry.from(state.tankId);if(edge)state={...state,tankId:edge.toTankIds[Math.abs(ordinal)%edge.toTankIds.length]};}
    return Object.freeze(state);
  }

  private refit(runtime: TankRuntime): void {
    const oldMax=runtime.state.health?.max??1, oldCurrent=runtime.state.health?.current??oldMax, fraction=Math.max(0,Math.min(1,oldCurrent/oldMax));
    runtime.definition=TankRegistry.get(runtime.progression.tankId);runtime.build=this.buildResolver.resolve(runtime.progression);
    runtime.state={...runtime.state,tankDefinitionId:runtime.definition.id,health:{current:runtime.state.lifecycle==='active'?Math.max(1,Math.round(runtime.build.maxHealth*fraction)):0,max:runtime.build.maxHealth}};
  }

  private refitAllDrones(): void {this.#drones=[];for(const owner of this.#tanks)this.ensureDroneCount(owner,owner.build.drone.count);}
  private refitDrones(owner: TankRuntime): void {this.#drones=this.#drones.filter((entry)=>entry.state.ownerId!==owner.state.id);this.ensureDroneCount(owner,owner.build.drone.count);}
  private ensureDroneCount(owner: TankRuntime,count:number): void {
    const existing=this.#drones.filter((entry)=>entry.state.ownerId===owner.state.id).length;
    for(let index=existing;index<count;index++){
      const angle=(Math.PI*2*index)/Math.max(1,count),position={x:owner.state.position.x+Math.cos(angle)*52,y:owner.state.position.y+Math.sin(angle)*52};
      this.#drones.push({state:{id:entityId(`game:drone:${owner.state.id}:${index}:${this.#tick}`),kind:'drone',lifecycle:'active',position,rotation:angle,team:owner.state.team,health:{current:owner.build.drone.health,max:owner.build.drone.health},ownerId:owner.state.id,spawnedAtTick:this.#tick,droneDefinitionId:`${owner.definition.id}:drone`},velocity:{x:0,y:0}});
    }
  }

  private spawnShape(type: keyof typeof SHAPE_DEFS, anywhere=false, origin?:Vector2State): void {
    const definition=SHAPE_DEFS[type];const position=origin?{x:origin.x+this.random.range(-20,20),y:origin.y+this.random.range(-20,20)}:anywhere?this.randomOpenPoint(120):this.safeOpenPoint(420);
    const angle=this.random.range(0,Math.PI*2),speed=definition.speed;
    const state: ShapeState={id:entityId(`game:shape:${type}:${this.#tick}:${this.random.nextUint32()}`),kind:'shape',lifecycle:'active',position,rotation:angle,team:{teamId:'neutral'},health:{current:definition.hp,max:definition.hp},spawnedAtTick:this.#tick,shapeType:type};
    this.#shapes.push({state,velocity:{x:Math.cos(angle)*speed,y:Math.sin(angle)*speed},spin:this.random.range(-1.5,1.5),xp:definition.xp,radius:definition.radius});
  }

  private spawnPowerup(): void {
    const type=POWERUPS[this.random.integer(0,POWERUPS.length)],position=this.safeOpenPoint(650);
    const state: PowerupState={id:entityId(`game:powerup:${this.#tick}:${type}`),kind:'powerup',lifecycle:'active',position,rotation:0,team:{teamId:'neutral'},spawnedAtTick:this.#tick,powerupType:type};
    this.#powerups.push({state,expiresAtTick:this.#tick+20*FIXED_HZ});
  }

  private combatant(runtime: TankRuntime){const health=runtime.state.health??{current:0,max:1};return{id:String(runtime.state.id),teamId:runtime.state.team.teamId,position:runtime.state.position,velocity:runtime.velocity,radius:runtime.definition.size,health:health.current,maxHealth:health.max,baseDamageReduction:runtime.build.passiveDamageReduction,alive:runtime.state.lifecycle==='active'};}
  private activeEntities(): readonly EntityState[]{return[...this.#tanks.map((entry)=>entry.state),...this.#drones.map((entry)=>entry.state),...this.#projectiles.map((entry)=>entry.state),...this.#shapes.map((entry)=>entry.state),...this.#powerups.map((entry)=>entry.state)];}
  private safeSpawn(index:number,count:number):Vector2State{const angle=(Math.PI*2*index)/Math.max(1,count);for(const radius of [1250,1550,900,1780]){const p={x:Math.cos(angle)*radius,y:Math.sin(angle)*radius};if(this.battlefield.isSpawnSafe(p,32))return p;}return this.safeOpenPoint(0);}
  private safeOpenPoint(minPlayerDistance:number):Vector2State{for(let i=0;i<24;i++){const p=this.randomOpenPoint(120);if(this.#player&&distance(p,this.#player.state.position)<minPlayerDistance)continue;if(this.battlefield.isSpawnSafe(p,30))return p;}return{x:0,y:0};}
  private randomOpenPoint(margin:number):Vector2State{const half=Math.max(100,BALANCE.arenaHalfExtent-margin);return{x:this.random.range(-half,half),y:this.random.range(-half,half)};}
}

function spendAiStats(points:number,ordinal:number):StatRanks{const stats={...ZERO_STATS};for(let i=0;i<points;i++){for(let offset=0;offset<STAT_IDS.length;offset++){const id=STAT_IDS[(i+ordinal+offset+STAT_IDS.length)%STAT_IDS.length];if(stats[id]<8){stats[id]+=1;break;}}}return Object.freeze(stats);}
function cloneProgression(state:ProgressionState):ProgressionState{return{...state,stats:{...state.stats}};}
function distance(a:Vector2State,b:Vector2State):number{return Math.hypot(a.x-b.x,a.y-b.y);}
function freezeTank(state:TankState):TankState{return Object.freeze({...state,position:Object.freeze({...state.position}),team:Object.freeze({...state.team}),...(state.health?{health:Object.freeze({...state.health})}:{})});}
function freezeDrone(state:DroneState):DroneState{return Object.freeze({...state,position:Object.freeze({...state.position}),team:Object.freeze({...state.team}),...(state.health?{health:Object.freeze({...state.health})}:{})});}
function freezeProjectile(state:ProjectileState):ProjectileState{return Object.freeze({...state,position:Object.freeze({...state.position}),velocity:Object.freeze({...state.velocity}),team:Object.freeze({...state.team})});}
function freezeShape(state:ShapeState):ShapeState{return Object.freeze({...state,position:Object.freeze({...state.position}),team:Object.freeze({...state.team}),...(state.health?{health:Object.freeze({...state.health})}:{})});}
function freezePowerup(state:PowerupState):PowerupState{return Object.freeze({...state,position:Object.freeze({...state.position}),team:Object.freeze({...state.team})});}
