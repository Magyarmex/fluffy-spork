import type { Battlefield } from '../../battlefield/Battlefield';
import type { SeededRandom } from '../../simulation/SeededRandom';
import type { ProjectileState, ShapeState, TankState, Vector2State } from '../types';

export type LivingFrontShapeType = 'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon' | 'star' | 'crasher';
export type LivingFrontSignalType = 'bloom' | 'migration' | 'rogue-star';

export interface LivingFrontShapeRuntime {
  state: ShapeState;
  velocity: Vector2State;
  spin: number;
  xp: number;
  radius: number;
}

export interface LivingFrontTankRuntime {
  state: TankState;
  velocity: Vector2State;
  radius: number;
  healthFraction: number;
}

export interface LivingFrontProjectileRuntime {
  state: ProjectileState;
  radius: number;
}

export interface LivingFrontSignal {
  readonly type: LivingFrontSignalType;
  readonly sector: number;
  readonly position: Readonly<Vector2State>;
  readonly direction?: Readonly<Vector2State>;
  readonly createdAtTick: number;
  readonly expiresAtTick: number;
}

export interface LivingFrontSectorSnapshot {
  readonly index: number;
  readonly maturity: number;
  readonly pressure: number;
  readonly entityCount: number;
  readonly availableXp: number;
  readonly valueScore: number;
  readonly recentHarvest: number;
  readonly recentCombatPressure: number;
  readonly inboundMigration: number;
  readonly outboundMigration: number;
}

export interface LivingFrontTelemetry {
  readonly maturityCeiling: number;
  readonly totalAvailableXp: number;
  readonly triangleEvasions: number;
  readonly crasherCharges: number;
  readonly crasherChargeHits: number;
  readonly crasherChargeMisses: number;
  readonly bountyAbsorbed: number;
  readonly bountyReleased: number;
  readonly starLifetimeTicks: number;
  readonly migrationsDetected: number;
  readonly bloomsDetected: number;
  readonly rogueStarsSpawned: number;
  readonly averageHexagonLocalPopulation: number;
  readonly planningWorkEmaMs: number;
  readonly planningWorkPeakMs: number;
}

export interface LivingFrontSnapshot {
  readonly ageMs: number;
  readonly directorEnabled: boolean;
  readonly maturityCeiling: number;
  readonly signal: LivingFrontSignal | null;
  readonly sectors: readonly LivingFrontSectorSnapshot[];
  readonly telemetry: LivingFrontTelemetry;
}

export interface LivingFrontStepFrame {
  readonly tick: number;
  readonly elapsedMs: number;
  readonly dtSeconds: number;
  readonly shapes: readonly LivingFrontShapeRuntime[];
  readonly tanks: readonly LivingFrontTankRuntime[];
  readonly projectiles: readonly LivingFrontProjectileRuntime[];
}

export interface LivingFrontStepResult {
  readonly crasherPreyKills: readonly { crasherId: string; preyId: string }[];
  readonly crasherTankHits: readonly { crasherId: string; tankId: string; damage: number }[];
  readonly spawnRogueStar: boolean;
}

interface SectorState {
  maturity: number;
  pressure: number;
  recentHarvest: number;
  recentCombat: number;
  entityCount: number;
  xp: number;
  value: number;
  centroidX: number;
  centroidY: number;
  inbound: number;
  outbound: number;
  herdSaturation: number;
}

interface BehaviorState {
  sector: number;
  previousSector: number;
  nextEvadeTick: number;
  evadeUntilTick: number;
  evadeDirection: Vector2State;
  starHeading: Vector2State;
  starRetargetTick: number;
  crasherPhase: 'track' | 'telegraph' | 'charge' | 'overshoot' | 'recover';
  crasherPhaseUntilTick: number;
  crasherTargetId?: string;
  chargeDirection: Vector2State;
  contactReadyTick: number;
  bounty: number;
  spawnedAtTick: number;
}

const GRID = 4;
const SECTOR_COUNT = GRID * GRID;
const SECTOR_HZ_TICKS = 12; // 5 Hz at the canonical 60 Hz simulation.
const BEHAVIOR_HZ_TICKS = 6; // 10 Hz.
const DIRECTOR_HZ_TICKS = 30; // 2 Hz.
const NORMAL_TARGET_TOTAL = 120;
const BOUNTY_CAP = 300;
const CRASHER_CONTACT_DAMAGE = 26;
const SIGNAL_TTL = 4 * 60;
const BLOOM_COOLDOWN = 20 * 60;
const ROGUE_STAR_COOLDOWN = 90 * 60;

const XP_BY_TYPE: Readonly<Record<LivingFrontShapeType, number>> = Object.freeze({
  circle: 10,
  triangle: 25,
  square: 50,
  pentagon: 100,
  hexagon: 200,
  star: 500,
  crasher: 60,
});

const SPEED_BY_TYPE: Readonly<Record<LivingFrontShapeType, number>> = Object.freeze({
  circle: 10,
  triangle: 16,
  square: 9,
  pentagon: 6,
  hexagon: 4,
  star: 78,
  crasher: 105,
});

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const length = (vector: Vector2State) => Math.hypot(vector.x, vector.y);
const normalize = (vector: Vector2State): Vector2State => {
  const magnitude = length(vector);
  return magnitude > 1e-6 ? { x: vector.x / magnitude, y: vector.y / magnitude } : { x: 0, y: 0 };
};
const add = (a: Vector2State, b: Vector2State): Vector2State => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (vector: Vector2State, amount: number): Vector2State => ({ x: vector.x * amount, y: vector.y * amount });
const distanceSquared = (a: Vector2State, b: Vector2State) => {
  const x = a.x - b.x;
  const y = a.y - b.y;
  return x * x + y * y;
};

class SpatialHash<T extends { state: { position: Vector2State } }> {
  readonly #cellSize: number;
  readonly #cells = new Map<string, T[]>();
  readonly #scratch: T[] = [];

  constructor(cellSize = 240) { this.#cellSize = cellSize; }

  rebuild(items: readonly T[]): void {
    this.#cells.clear();
    for (const item of items) {
      const x = Math.floor(item.state.position.x / this.#cellSize);
      const y = Math.floor(item.state.position.y / this.#cellSize);
      const key = `${x}:${y}`;
      let bucket = this.#cells.get(key);
      if (!bucket) { bucket = []; this.#cells.set(key, bucket); }
      bucket.push(item);
    }
  }

  query(position: Vector2State, radius: number): readonly T[] {
    this.#scratch.length = 0;
    const minX = Math.floor((position.x - radius) / this.#cellSize);
    const maxX = Math.floor((position.x + radius) / this.#cellSize);
    const minY = Math.floor((position.y - radius) / this.#cellSize);
    const maxY = Math.floor((position.y + radius) / this.#cellSize);
    const radiusSquared = radius * radius;
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (const item of this.#cells.get(`${x}:${y}`) ?? []) {
          if (distanceSquared(position, item.state.position) <= radiusSquared) this.#scratch.push(item);
        }
      }
    }
    return this.#scratch;
  }
}

export interface LivingFrontSystemOptions {
  readonly battlefield: Battlefield;
  readonly random: SeededRandom;
  readonly directorEnabled?: boolean;
}

/**
 * Canonical owner of v1.11.0 neutral ecology. Planning is deliberately decimated;
 * movement remains at the simulation rate. Hidden sector state never enters AI.
 */
export class LivingFrontSystem {
  readonly #battlefield: Battlefield;
  readonly #random: SeededRandom;
  readonly #directorEnabled: boolean;
  readonly #sectors: SectorState[] = Array.from({ length: SECTOR_COUNT }, () => ({
    maturity: 0,
    pressure: 0,
    recentHarvest: 0,
    recentCombat: 0,
    entityCount: 0,
    xp: 0,
    value: 0,
    centroidX: 0,
    centroidY: 0,
    inbound: 0,
    outbound: 0,
    herdSaturation: 0,
  }));
  readonly #behavior = new Map<string, BehaviorState>();
  readonly #shapeHash = new SpatialHash<LivingFrontShapeRuntime>();
  readonly #tankHash = new SpatialHash<LivingFrontTankRuntime>();
  readonly #projectileHash = new SpatialHash<LivingFrontProjectileRuntime>();
  #ageMs = 0;
  #maturityCeiling = 0;
  #signal: LivingFrontSignal | null = null;
  #lastBloomTick = Number.NEGATIVE_INFINITY;
  #lastRogueStarTick = Number.NEGATIVE_INFINITY;
  #quietMovementTicks = 0;
  #triangleEvasions = 0;
  #crasherCharges = 0;
  #crasherChargeHits = 0;
  #crasherChargeMisses = 0;
  #bountyAbsorbed = 0;
  #bountyReleased = 0;
  #starLifetimeTicks = 0;
  #migrationsDetected = 0;
  #bloomsDetected = 0;
  #rogueStarsSpawned = 0;
  #averageHexagonLocalPopulation = 0;
  #planningWorkEmaMs = 0;
  #planningWorkPeakMs = 0;

  constructor(options: LivingFrontSystemOptions) {
    this.#battlefield = options.battlefield;
    this.#random = options.random;
    this.#directorEnabled = options.directorEnabled ?? true;
  }

  reset(): void {
    for (const sector of this.#sectors) Object.assign(sector, {
      maturity: 0, pressure: 0, recentHarvest: 0, recentCombat: 0, entityCount: 0,
      xp: 0, value: 0, centroidX: 0, centroidY: 0, inbound: 0, outbound: 0, herdSaturation: 0,
    });
    this.#behavior.clear();
    this.#ageMs = 0;
    this.#maturityCeiling = 0;
    this.#signal = null;
    this.#lastBloomTick = Number.NEGATIVE_INFINITY;
    this.#lastRogueStarTick = Number.NEGATIVE_INFINITY;
    this.#quietMovementTicks = 0;
    this.#triangleEvasions = 0;
    this.#crasherCharges = 0;
    this.#crasherChargeHits = 0;
    this.#crasherChargeMisses = 0;
    this.#bountyAbsorbed = 0;
    this.#bountyReleased = 0;
    this.#starLifetimeTicks = 0;
    this.#migrationsDetected = 0;
    this.#bloomsDetected = 0;
    this.#rogueStarsSpawned = 0;
    this.#averageHexagonLocalPopulation = 0;
    this.#planningWorkEmaMs = 0;
    this.#planningWorkPeakMs = 0;
  }

  get directorEnabled(): boolean { return this.#directorEnabled; }

  registerShape(shape: LivingFrontShapeRuntime, tick: number): void {
    const id = String(shape.state.id);
    const sector = this.sectorIndex(shape.state.position);
    const angle = shape.state.rotation;
    const existing = this.#behavior.get(id);
    if (existing) return;
    this.#behavior.set(id, {
      sector,
      previousSector: sector,
      nextEvadeTick: tick + 18,
      evadeUntilTick: -1,
      evadeDirection: { x: 0, y: 0 },
      starHeading: { x: Math.cos(angle), y: Math.sin(angle) },
      starRetargetTick: tick + 90,
      crasherPhase: 'track',
      crasherPhaseUntilTick: tick + 30,
      chargeDirection: { x: Math.cos(angle), y: Math.sin(angle) },
      contactReadyTick: tick,
      bounty: 0,
      spawnedAtTick: tick,
    });
    this.writeVisibleState(shape, tick);
  }

  unregisterShape(shape: LivingFrontShapeRuntime, tick: number): void {
    const id = String(shape.state.id);
    const state = this.#behavior.get(id);
    const sector = state?.sector ?? this.sectorIndex(shape.state.position);
    const entry = this.#sectors[sector];
    entry.recentHarvest += Math.min(1, shape.xp / 220);
    entry.pressure = clamp01(entry.pressure + Math.min(0.22, shape.xp / 1800));
    entry.maturity = Math.max(0, entry.maturity - Math.min(0.18, shape.xp / 1600));
    if (shape.state.shapeType === 'star') this.#starLifetimeTicks = Math.max(this.#starLifetimeTicks, tick - (state?.spawnedAtTick ?? tick));
    if (shape.state.shapeType === 'crasher' && state?.bounty) this.#bountyReleased += state.bounty;
    this.#behavior.delete(id);
  }

  recordGunfire(position: Vector2State, intensity = 1): void {
    const sector = this.#sectors[this.sectorIndex(position)];
    const attenuation = 1 / (1 + sector.herdSaturation * 2.5);
    const amount = Math.min(0.04, 0.009 * Math.max(0, intensity) * attenuation);
    sector.pressure = clamp01(sector.pressure + amount);
    sector.recentCombat += amount;
    sector.herdSaturation = clamp01(sector.herdSaturation + 0.08 * Math.max(0, intensity));
  }

  recordImpact(position: Vector2State, intensity = 1): void {
    const sector = this.#sectors[this.sectorIndex(position)];
    const amount = Math.min(0.08, 0.018 * Math.max(0, intensity));
    sector.pressure = clamp01(sector.pressure + amount);
    sector.recentCombat += amount;
  }

  recordTankDeath(position: Vector2State): void {
    const sector = this.#sectors[this.sectorIndex(position)];
    sector.pressure = clamp01(sector.pressure + 0.24);
    sector.recentCombat += 0.24;
    sector.maturity = Math.max(0, sector.maturity - 0.12);
  }

  desiredCounts(elapsedMs: number): Readonly<Record<'circle' | 'triangle' | 'square' | 'pentagon' | 'hexagon', number>> {
    const ageSeconds = elapsedMs / 1000;
    const pentagon = Math.round(8 * clamp01((ageSeconds - 45) / 150));
    const hexagon = Math.round(4 * clamp01((ageSeconds - 120) / 180));
    const deficit = 12 - pentagon - hexagon;
    const extraCircles = Math.round(deficit * 0.6);
    const extraTriangles = deficit - extraCircles;
    return Object.freeze({
      circle: 62 + extraCircles,
      triangle: 30 + extraTriangles,
      square: 16,
      pentagon,
      hexagon,
    });
  }

  chooseSpawnPoint(type: LivingFrontShapeType, fallback: () => Vector2State): Vector2State {
    const desired = this.chooseSectorForType(type);
    const box = this.sectorBounds(desired);
    const padding = type === 'hexagon' ? 42 : type === 'star' ? 32 : 28;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const point = {
        x: this.#random.range(box.minX + padding, box.maxX - padding),
        y: this.#random.range(box.minY + padding, box.maxY - padding),
      };
      if (this.#battlefield.isSpawnSafe(point, padding)) return point;
    }
    return fallback();
  }

  creditCrasherBounty(crasher: LivingFrontShapeRuntime, preyXp: number, tick: number): void {
    const state = this.#behavior.get(String(crasher.state.id));
    if (!state || crasher.state.shapeType !== 'crasher') return;
    const absorbed = Math.min(Math.max(0, preyXp) * 0.7, BOUNTY_CAP - state.bounty);
    if (absorbed <= 0) return;
    state.bounty += absorbed;
    crasher.xp = XP_BY_TYPE.crasher + Math.round(state.bounty);
    this.#bountyAbsorbed += absorbed;
    this.writeVisibleState(crasher, tick);
  }

  step(frame: LivingFrontStepFrame): LivingFrontStepResult {
    this.#ageMs = frame.elapsedMs;
    this.#maturityCeiling = clamp01(frame.elapsedMs / 300_000);
    if (this.#signal && this.#signal.expiresAtTick <= frame.tick) this.#signal = null;

    for (const shape of frame.shapes) this.registerShape(shape, frame.tick);
    const liveIds = new Set(frame.shapes.map((shape) => String(shape.state.id)));
    for (const id of this.#behavior.keys()) if (!liveIds.has(id)) this.#behavior.delete(id);

    if (frame.tick % BEHAVIOR_HZ_TICKS === 0) {
      const started = typeof performance !== 'undefined' ? performance.now() : 0;
      this.#shapeHash.rebuild(frame.shapes);
      this.#tankHash.rebuild(frame.tanks);
      this.#projectileHash.rebuild(frame.projectiles);
      for (const shape of frame.shapes) this.planShape(shape, frame);
      if (typeof performance !== 'undefined') {
        const elapsed = Math.max(0, performance.now() - started);
        this.#planningWorkEmaMs = this.#planningWorkEmaMs === 0 ? elapsed : this.#planningWorkEmaMs * 0.9 + elapsed * 0.1;
        this.#planningWorkPeakMs = Math.max(this.#planningWorkPeakMs, elapsed);
      }
    }

    if (frame.tick % SECTOR_HZ_TICKS === 0) this.updateSectors(frame);
    const contacts = this.integrateShapes(frame);
    let spawnRogueStar = false;
    if (frame.tick % DIRECTOR_HZ_TICKS === 0) spawnRogueStar = this.direct(frame);
    return Object.freeze({ ...contacts, spawnRogueStar });
  }

  snapshot(): LivingFrontSnapshot {
    const sectors = this.#sectors.map((sector, index) => Object.freeze({
      index,
      maturity: sector.maturity,
      pressure: sector.pressure,
      entityCount: sector.entityCount,
      availableXp: sector.xp,
      valueScore: sector.value,
      recentHarvest: sector.recentHarvest,
      recentCombatPressure: sector.recentCombat,
      inboundMigration: sector.inbound,
      outboundMigration: sector.outbound,
    }));
    const totalAvailableXp = sectors.reduce((sum, sector) => sum + sector.availableXp, 0);
    return Object.freeze({
      ageMs: this.#ageMs,
      directorEnabled: this.#directorEnabled,
      maturityCeiling: this.#maturityCeiling,
      signal: this.#signal ? Object.freeze({ ...this.#signal, position: Object.freeze({ ...this.#signal.position }), ...(this.#signal.direction ? { direction: Object.freeze({ ...this.#signal.direction }) } : {}) }) : null,
      sectors: Object.freeze(sectors),
      telemetry: Object.freeze({
        maturityCeiling: this.#maturityCeiling,
        totalAvailableXp,
        triangleEvasions: this.#triangleEvasions,
        crasherCharges: this.#crasherCharges,
        crasherChargeHits: this.#crasherChargeHits,
        crasherChargeMisses: this.#crasherChargeMisses,
        bountyAbsorbed: Math.round(this.#bountyAbsorbed),
        bountyReleased: Math.round(this.#bountyReleased),
        starLifetimeTicks: this.#starLifetimeTicks,
        migrationsDetected: this.#migrationsDetected,
        bloomsDetected: this.#bloomsDetected,
        rogueStarsSpawned: this.#rogueStarsSpawned,
        averageHexagonLocalPopulation: this.#averageHexagonLocalPopulation,
        planningWorkEmaMs: this.#planningWorkEmaMs,
        planningWorkPeakMs: this.#planningWorkPeakMs,
      }),
    });
  }

  private updateSectors(frame: LivingFrontStepFrame): void {
    const dt = SECTOR_HZ_TICKS / 60;
    for (const sector of this.#sectors) {
      sector.entityCount = 0;
      sector.xp = 0;
      sector.value = 0;
      sector.centroidX = 0;
      sector.centroidY = 0;
      sector.inbound *= 0.72;
      sector.outbound *= 0.72;
      sector.pressure = Math.max(0, sector.pressure - 0.055 * dt);
      sector.herdSaturation = Math.max(0, sector.herdSaturation - 0.18 * dt);
      sector.recentHarvest = Math.max(0, sector.recentHarvest - 0.14 * dt);
      sector.recentCombat = Math.max(0, sector.recentCombat - 0.16 * dt);
    }

    let movement = 0;
    for (const shape of frame.shapes) {
      const index = this.sectorIndex(shape.state.position);
      const sector = this.#sectors[index];
      const type = shape.state.shapeType as LivingFrontShapeType;
      sector.entityCount += 1;
      sector.xp += shape.xp;
      sector.value += shape.xp * (type === 'hexagon' ? 1.35 : type === 'star' ? 1.6 : 1);
      sector.centroidX += shape.state.position.x;
      sector.centroidY += shape.state.position.y;
      movement += length(shape.velocity);
      const behavior = this.#behavior.get(String(shape.state.id));
      if (behavior && behavior.sector !== index) {
        this.#sectors[behavior.sector].outbound += 1;
        sector.inbound += 1;
        behavior.previousSector = behavior.sector;
        behavior.sector = index;
      }
    }
    for (const sector of this.#sectors) {
      if (sector.entityCount > 0) {
        sector.centroidX /= sector.entityCount;
        sector.centroidY /= sector.entityCount;
      } else {
        const center = this.sectorCenter(this.#sectors.indexOf(sector));
        sector.centroidX = center.x;
        sector.centroidY = center.y;
      }
    }

    for (const tank of frame.tanks) {
      if (tank.state.lifecycle !== 'active') continue;
      const sector = this.#sectors[this.sectorIndex(tank.state.position)];
      sector.pressure = clamp01(sector.pressure + 0.006);
    }

    for (const sector of this.#sectors) {
      const calm = 1 - clamp01(sector.pressure * 1.25 + sector.recentHarvest * 0.35 + sector.recentCombat * 0.45);
      const rise = 0.018 * dt * calm;
      const disruption = 0.022 * dt * sector.pressure;
      sector.maturity = Math.min(this.#maturityCeiling, Math.max(0, sector.maturity + rise - disruption));
    }

    const averageMovement = frame.shapes.length ? movement / frame.shapes.length : 0;
    this.#quietMovementTicks = averageMovement < 14 ? this.#quietMovementTicks + SECTOR_HZ_TICKS : 0;
    const migrating = this.#sectors.reduce((sum, sector) => sum + Math.min(sector.inbound, sector.outbound), 0);
    if (migrating >= 8 && this.#directorEnabled && (!this.#signal || this.#signal.type !== 'migration')) {
      const target = this.#sectors.reduce((best, sector, index) => sector.inbound > this.#sectors[best].inbound ? index : best, 0);
      const source = this.#sectors.reduce((best, sector, index) => sector.outbound > this.#sectors[best].outbound ? index : best, 0);
      const from = this.sectorCenter(source);
      const to = this.sectorCenter(target);
      this.#signal = Object.freeze({ type: 'migration', sector: target, position: to, direction: normalize({ x: to.x - from.x, y: to.y - from.y }), createdAtTick: frame.tick, expiresAtTick: frame.tick + SIGNAL_TTL });
      this.#migrationsDetected += 1;
    }

    const hexagons = frame.shapes.filter((shape) => shape.state.shapeType === 'hexagon');
    this.#averageHexagonLocalPopulation = hexagons.length === 0 ? 0 : hexagons.reduce((sum, hex) => sum + this.#shapeHash.query(hex.state.position, 280).length - 1, 0) / hexagons.length;
  }

  private planShape(shape: LivingFrontShapeRuntime, frame: LivingFrontStepFrame): void {
    if (shape.state.lifecycle !== 'active') return;
    const type = shape.state.shapeType as LivingFrontShapeType;
    const behavior = this.#behavior.get(String(shape.state.id));
    if (!behavior) return;

    if (type === 'circle') this.planCircle(shape, frame);
    else if (type === 'triangle') this.planTriangle(shape, behavior, frame);
    else if (type === 'square') this.applyMigrationBias(shape, 0.16);
    else if (type === 'pentagon') this.applyMigrationBias(shape, 0.11);
    else if (type === 'hexagon') this.limitSpeed(shape, SPEED_BY_TYPE.hexagon);
    else if (type === 'star') this.planStar(shape, behavior, frame);
    else if (type === 'crasher') this.planCrasher(shape, behavior, frame);

    if (type !== 'hexagon' && type !== 'star' && type !== 'crasher') this.applyHexagonAttraction(shape);
    this.writeVisibleState(shape, frame.tick);
  }

  private planCircle(shape: LivingFrontShapeRuntime, frame: LivingFrontStepFrame): void {
    const sector = this.#sectors[this.sectorIndex(shape.state.position)];
    const towardSchool = normalize({ x: sector.centroidX - shape.state.position.x, y: sector.centroidY - shape.state.position.y });
    let danger = { x: 0, y: 0 };
    const nearbyTanks = this.#tankHash.query(shape.state.position, 180);
    for (const tank of nearbyTanks) {
      const away = normalize({ x: shape.state.position.x - tank.state.position.x, y: shape.state.position.y - tank.state.position.y });
      danger = add(danger, away);
    }
    const direction = normalize(add(scale(normalize(shape.velocity), 0.62), add(scale(towardSchool, 0.18), scale(normalize(danger), 0.36))));
    shape.velocity = scale(direction, SPEED_BY_TYPE.circle);
    this.applyMigrationBias(shape, 0.22);
  }

  private planTriangle(shape: LivingFrontShapeRuntime, behavior: BehaviorState, frame: LivingFrontStepFrame): void {
    if (frame.tick <= behavior.evadeUntilTick) {
      shape.velocity = scale(behavior.evadeDirection, 48);
      return;
    }
    this.limitSpeed(shape, SPEED_BY_TYPE.triangle);
    this.applyMigrationBias(shape, 0.25);
    if (frame.tick < behavior.nextEvadeTick) return;
    const candidates = this.#projectileHash.query(shape.state.position, 250);
    let threat: LivingFrontProjectileRuntime | undefined;
    let bestTime = Number.POSITIVE_INFINITY;
    for (const projectile of candidates) {
      const velocity = projectile.state.velocity;
      const relative = { x: shape.state.position.x - projectile.state.position.x, y: shape.state.position.y - projectile.state.position.y };
      const speedSquared = velocity.x * velocity.x + velocity.y * velocity.y;
      if (speedSquared < 1) continue;
      const t = (relative.x * velocity.x + relative.y * velocity.y) / speedSquared;
      if (t < 0.06 || t > 0.55) continue;
      const closest = { x: projectile.state.position.x + velocity.x * t, y: projectile.state.position.y + velocity.y * t };
      if (distanceSquared(closest, shape.state.position) > (shape.radius + projectile.radius + 34) ** 2) continue;
      if (t < bestTime) { bestTime = t; threat = projectile; }
    }
    if (!threat) return;
    const incoming = normalize(threat.state.velocity);
    const side = ((String(shape.state.id).length + frame.tick) & 1) === 0 ? 1 : -1;
    behavior.evadeDirection = { x: -incoming.y * side, y: incoming.x * side };
    behavior.evadeUntilTick = frame.tick + 9;
    behavior.nextEvadeTick = frame.tick + 42;
    shape.velocity = scale(behavior.evadeDirection, 48);
    this.#triangleEvasions += 1;
  }

  private planStar(shape: LivingFrontShapeRuntime, behavior: BehaviorState, frame: LivingFrontStepFrame): void {
    if (frame.tick >= behavior.starRetargetTick || length(behavior.starHeading) < 0.5) {
      const angle = this.#random.range(0, Math.PI * 2);
      behavior.starHeading = { x: Math.cos(angle), y: Math.sin(angle) };
      behavior.starRetargetTick = frame.tick + this.#random.integer(90, 181);
    }
    const probe = add(shape.state.position, scale(behavior.starHeading, 260));
    if (!this.#battlefield.contains(probe, shape.radius) || this.#battlefield.firstTerrainHit(shape.state.position, probe, shape.radius)) {
      behavior.starHeading = { x: -behavior.starHeading.y, y: behavior.starHeading.x };
      behavior.starRetargetTick = frame.tick + 45;
    }
    shape.velocity = scale(normalize(behavior.starHeading), SPEED_BY_TYPE.star);
  }

  private planCrasher(shape: LivingFrontShapeRuntime, behavior: BehaviorState, frame: LivingFrontStepFrame): void {
    if (behavior.crasherPhase === 'telegraph' && frame.tick >= behavior.crasherPhaseUntilTick) {
      behavior.crasherPhase = 'charge';
      behavior.crasherPhaseUntilTick = frame.tick + 34;
      this.#crasherCharges += 1;
    } else if (behavior.crasherPhase === 'charge' && frame.tick >= behavior.crasherPhaseUntilTick) {
      behavior.crasherPhase = 'overshoot';
      behavior.crasherPhaseUntilTick = frame.tick + 18;
      this.#crasherChargeMisses += 1;
    } else if (behavior.crasherPhase === 'overshoot' && frame.tick >= behavior.crasherPhaseUntilTick) {
      behavior.crasherPhase = 'recover';
      behavior.crasherPhaseUntilTick = frame.tick + 48;
    } else if (behavior.crasherPhase === 'recover' && frame.tick >= behavior.crasherPhaseUntilTick) {
      behavior.crasherPhase = 'track';
      behavior.crasherPhaseUntilTick = frame.tick + 24;
      behavior.crasherTargetId = undefined;
    }

    if (behavior.crasherPhase === 'charge') {
      shape.velocity = scale(behavior.chargeDirection, 185);
      return;
    }
    if (behavior.crasherPhase === 'overshoot') {
      shape.velocity = scale(behavior.chargeDirection, 122);
      return;
    }
    if (behavior.crasherPhase === 'recover') {
      shape.velocity = scale(normalize(shape.velocity), 42);
      return;
    }

    const target = this.chooseCrasherTarget(shape, frame);
    if (!target) {
      shape.velocity = scale(normalize(shape.velocity), 55);
      return;
    }
    const direction = normalize({ x: target.position.x - shape.state.position.x, y: target.position.y - shape.state.position.y });
    if (behavior.crasherPhase === 'telegraph') {
      shape.velocity = scale(direction, 18);
      return;
    }
    shape.velocity = scale(direction, SPEED_BY_TYPE.crasher * 0.72);
    behavior.crasherTargetId = target.id;
    if (distanceSquared(target.position, shape.state.position) <= 430 * 430 && frame.tick >= behavior.crasherPhaseUntilTick) {
      behavior.crasherPhase = 'telegraph';
      behavior.crasherPhaseUntilTick = frame.tick + 27;
      behavior.chargeDirection = direction;
    }
  }

  private chooseCrasherTarget(shape: LivingFrontShapeRuntime, frame: LivingFrontStepFrame): { id: string; position: Vector2State; score: number } | undefined {
    let best: { id: string; position: Vector2State; score: number } | undefined;
    for (const prey of this.#shapeHash.query(shape.state.position, 520)) {
      if (prey === shape || prey.state.lifecycle !== 'active') continue;
      const type = prey.state.shapeType as LivingFrontShapeType;
      if (type === 'crasher' || type === 'hexagon' || type === 'star') continue;
      const healthFraction = (prey.state.health?.current ?? 1) / Math.max(1, prey.state.health?.max ?? 1);
      const range = Math.sqrt(distanceSquared(shape.state.position, prey.state.position));
      const score = (1.25 - healthFraction) * 130 + Math.min(140, prey.xp) - range * 0.08;
      if (!best || score > best.score) best = { id: String(prey.state.id), position: prey.state.position, score };
    }
    for (const tank of this.#tankHash.query(shape.state.position, 520)) {
      if (tank.state.lifecycle !== 'active') continue;
      const range = Math.sqrt(distanceSquared(shape.state.position, tank.state.position));
      const score = (1 - tank.healthFraction) * 180 - range * 0.09;
      if (!best || score > best.score) best = { id: String(tank.state.id), position: tank.state.position, score };
    }
    return best;
  }

  private integrateShapes(frame: LivingFrontStepFrame): Omit<LivingFrontStepResult, 'spawnRogueStar'> {
    const preyKills: { crasherId: string; preyId: string }[] = [];
    const tankHits: { crasherId: string; tankId: string; damage: number }[] = [];
    for (const shape of frame.shapes) {
      if (shape.state.lifecycle !== 'active') continue;
      const behavior = this.#behavior.get(String(shape.state.id));
      let next = add(shape.state.position, scale(shape.velocity, frame.dtSeconds));
      const hit = this.#battlefield.firstTerrainHit(shape.state.position, next, shape.radius);
      if (!this.#battlefield.contains(next, shape.radius) || hit) {
        if (shape.state.shapeType === 'crasher' && behavior?.crasherPhase === 'charge') {
          behavior.crasherPhase = 'recover';
          behavior.crasherPhaseUntilTick = frame.tick + 48;
          shape.velocity = { x: 0, y: 0 };
        } else if (shape.state.shapeType === 'star' && behavior) {
          behavior.starHeading = { x: -behavior.starHeading.y, y: behavior.starHeading.x };
          shape.velocity = scale(behavior.starHeading, SPEED_BY_TYPE.star);
        } else {
          shape.velocity = { x: -shape.velocity.x, y: -shape.velocity.y };
        }
        next = add(shape.state.position, scale(shape.velocity, frame.dtSeconds));
        if (!this.#battlefield.isSpawnSafe(next, shape.radius)) next = shape.state.position;
      }
      shape.state = { ...shape.state, position: next, rotation: shape.state.rotation + shape.spin * frame.dtSeconds };

      if (shape.state.shapeType !== 'crasher' || !behavior || behavior.crasherPhase !== 'charge' || frame.tick < behavior.contactReadyTick) continue;
      const nearbyPrey = this.#shapeHash.query(shape.state.position, shape.radius + 30).find((prey) => prey !== shape && prey.state.lifecycle === 'active' && !['crasher', 'star', 'hexagon'].includes(prey.state.shapeType));
      if (nearbyPrey && distanceSquared(shape.state.position, nearbyPrey.state.position) <= (shape.radius + nearbyPrey.radius) ** 2) {
        preyKills.push({ crasherId: String(shape.state.id), preyId: String(nearbyPrey.state.id) });
        behavior.contactReadyTick = frame.tick + 30;
        behavior.crasherPhase = 'overshoot';
        behavior.crasherPhaseUntilTick = frame.tick + 18;
        this.#crasherChargeHits += 1;
        this.#crasherChargeMisses = Math.max(0, this.#crasherChargeMisses - 1);
        continue;
      }
      const nearbyTank = this.#tankHash.query(shape.state.position, shape.radius + 45).find((tank) => tank.state.lifecycle === 'active' && distanceSquared(shape.state.position, tank.state.position) <= (shape.radius + tank.radius) ** 2);
      if (nearbyTank) {
        tankHits.push({ crasherId: String(shape.state.id), tankId: String(nearbyTank.state.id), damage: CRASHER_CONTACT_DAMAGE });
        behavior.contactReadyTick = frame.tick + 45;
        behavior.crasherPhase = 'overshoot';
        behavior.crasherPhaseUntilTick = frame.tick + 18;
        this.#crasherChargeHits += 1;
        this.#crasherChargeMisses = Math.max(0, this.#crasherChargeMisses - 1);
      }
    }
    return Object.freeze({ crasherPreyKills: Object.freeze(preyKills), crasherTankHits: Object.freeze(tankHits) });
  }

  private direct(frame: LivingFrontStepFrame): boolean {
    if (!this.#directorEnabled) return false;
    const bestBloom = this.#sectors.reduce((best, sector, index) => sector.value > this.#sectors[best].value ? index : best, 0);
    const sector = this.#sectors[bestBloom];
    if (frame.tick - this.#lastBloomTick >= BLOOM_COOLDOWN && sector.value >= 900 && sector.maturity >= Math.min(0.6, this.#maturityCeiling)) {
      this.#signal = Object.freeze({ type: 'bloom', sector: bestBloom, position: this.sectorCenter(bestBloom), createdAtTick: frame.tick, expiresAtTick: frame.tick + SIGNAL_TTL });
      this.#lastBloomTick = frame.tick;
      this.#bloomsDetected += 1;
      return false;
    }
    const hasStar = frame.shapes.some((shape) => shape.state.lifecycle === 'active' && shape.state.shapeType === 'star');
    const eligible = frame.elapsedMs >= 120_000 && !hasStar && frame.tick - this.#lastRogueStarTick >= ROGUE_STAR_COOLDOWN && this.#quietMovementTicks >= 30 * 60;
    if (!eligible) return false;
    const targetSector = this.#sectors.reduce((best, candidate, index) => candidate.pressure < this.#sectors[best].pressure ? index : best, 0);
    this.#signal = Object.freeze({ type: 'rogue-star', sector: targetSector, position: this.sectorCenter(targetSector), createdAtTick: frame.tick, expiresAtTick: frame.tick + SIGNAL_TTL });
    this.#lastRogueStarTick = frame.tick;
    this.#rogueStarsSpawned += 1;
    this.#quietMovementTicks = 0;
    return true;
  }

  private applyMigrationBias(shape: LivingFrontShapeRuntime, strength: number): void {
    const current = this.sectorIndex(shape.state.position);
    const currentSector = this.#sectors[current];
    let best = current;
    for (const neighbor of this.neighborSectors(current)) {
      if (this.#sectors[neighbor].pressure + 0.14 < this.#sectors[best].pressure) best = neighbor;
    }
    if (best === current || currentSector.pressure < 0.18) return;
    const direction = normalize({ x: this.sectorCenter(best).x - shape.state.position.x, y: this.sectorCenter(best).y - shape.state.position.y });
    const blended = normalize(add(scale(normalize(shape.velocity), 1 - strength), scale(direction, strength)));
    shape.velocity = scale(blended, Math.max(1, length(shape.velocity)));
  }

  private applyHexagonAttraction(shape: LivingFrontShapeRuntime): void {
    const local = this.#shapeHash.query(shape.state.position, 300);
    let nearest: LivingFrontShapeRuntime | undefined;
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of local) {
      if (candidate === shape || candidate.state.shapeType !== 'hexagon' || candidate.state.lifecycle !== 'active') continue;
      const range = distanceSquared(shape.state.position, candidate.state.position);
      if (range < best) { best = range; nearest = candidate; }
    }
    if (!nearest || best < 65 * 65) return;
    const toward = normalize({ x: nearest.state.position.x - shape.state.position.x, y: nearest.state.position.y - shape.state.position.y });
    const direction = normalize(add(scale(normalize(shape.velocity), 0.92), scale(toward, 0.08)));
    shape.velocity = scale(direction, Math.max(1, length(shape.velocity)));
  }

  private limitSpeed(shape: LivingFrontShapeRuntime, speed: number): void {
    const direction = normalize(shape.velocity);
    shape.velocity = scale(length(direction) > 0 ? direction : { x: Math.cos(shape.state.rotation), y: Math.sin(shape.state.rotation) }, speed);
  }

  private writeVisibleState(shape: LivingFrontShapeRuntime, tick: number): void {
    const behavior = this.#behavior.get(String(shape.state.id));
    if (!behavior) return;
    const phase = shape.state.shapeType === 'crasher' ? behavior.crasherPhase : undefined;
    const bountyFraction = shape.state.shapeType === 'crasher' ? clamp01(behavior.bounty / BOUNTY_CAP) : 0;
    const triangleEvading = shape.state.shapeType === 'triangle' && tick <= behavior.evadeUntilTick;
    shape.state = {
      ...shape.state,
      livingFront: Object.freeze({
        sector: behavior.sector,
        ...(phase ? { crasherPhase: phase } : {}),
        bountyFraction,
        triangleEvading,
      }),
    };
  }

  private chooseSectorForType(type: LivingFrontShapeType): number {
    const weights = this.#sectors.map((sector) => {
      const calm = 0.2 + (1 - sector.pressure);
      if (type === 'pentagon') return calm * (0.1 + sector.maturity * 2.2);
      if (type === 'hexagon') return calm * (0.04 + sector.maturity * sector.maturity * 3.2);
      if (type === 'star') return calm * (0.3 + sector.maturity * 0.8);
      if (type === 'circle' || type === 'triangle') return calm * (1.25 - sector.maturity * 0.35);
      return calm;
    });
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    let roll = this.#random.range(0, Math.max(0.0001, total));
    for (let index = 0; index < weights.length; index += 1) {
      roll -= weights[index];
      if (roll <= 0) return index;
    }
    return weights.length - 1;
  }

  private sectorIndex(position: Vector2State): number {
    const bounds = this.#battlefield.bounds;
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const x = Math.max(0, Math.min(GRID - 1, Math.floor(((position.x - bounds.minX) / width) * GRID)));
    const y = Math.max(0, Math.min(GRID - 1, Math.floor(((position.y - bounds.minY) / height) * GRID)));
    return y * GRID + x;
  }

  private sectorBounds(index: number): { minX: number; maxX: number; minY: number; maxY: number } {
    const bounds = this.#battlefield.bounds;
    const width = (bounds.maxX - bounds.minX) / GRID;
    const height = (bounds.maxY - bounds.minY) / GRID;
    const x = index % GRID;
    const y = Math.floor(index / GRID);
    return { minX: bounds.minX + x * width, maxX: bounds.minX + (x + 1) * width, minY: bounds.minY + y * height, maxY: bounds.minY + (y + 1) * height };
  }

  private sectorCenter(index: number): Vector2State {
    const bounds = this.sectorBounds(index);
    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
  }

  private neighborSectors(index: number): readonly number[] {
    const x = index % GRID;
    const y = Math.floor(index / GRID);
    const result: number[] = [];
    if (x > 0) result.push(index - 1);
    if (x < GRID - 1) result.push(index + 1);
    if (y > 0) result.push(index - GRID);
    if (y < GRID - 1) result.push(index + GRID);
    return result;
  }
}

export const LIVING_FRONT_BASELINE_COUNTS = Object.freeze({ circle: 62, triangle: 30, square: 16, pentagon: 8, hexagon: 4 });
export const LIVING_FRONT_NORMAL_TARGET_TOTAL = NORMAL_TARGET_TOTAL;
export const LIVING_FRONT_BOUNTY_CAP = BOUNTY_CAP;
export const LIVING_FRONT_PLANNING_CADENCE = Object.freeze({ sectorHz: 5, behaviorHz: 10, directorHz: 2 });
