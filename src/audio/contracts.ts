import type { Vec2 } from '../game/simulation/math';

export type FeedbackEvent =
  | { readonly type: 'ProjectileFired'; readonly atSeconds: number; readonly actorId: string; readonly weaponId: string; readonly projectileIds: readonly string[]; readonly position?: Vec2 }
  | { readonly type: 'ProjectileFlyby'; readonly atSeconds: number; readonly projectileId: string; readonly sourceId?: string; readonly position: Vec2; readonly velocity?: Vec2; readonly nearestDistance: number }
  | { readonly type: 'ProjectileEnteredView'; readonly atSeconds: number; readonly projectileId: string; readonly position: Vec2 }
  | { readonly type: 'TankDamaged'; readonly atSeconds: number; readonly actorId: string; readonly targetId: string; readonly damage: number; readonly remainingHealth: number; readonly position?: Vec2 }
  | { readonly type: 'TankDestroyed'; readonly atSeconds: number; readonly actorId: string; readonly targetId: string; readonly position?: Vec2 }
  | { readonly type: 'DroneDestroyed'; readonly atSeconds: number; readonly actorId?: string; readonly droneId: string; readonly position?: Vec2 }
  | { readonly type: 'PerfectGuard'; readonly atSeconds: number; readonly actorId: string; readonly targetId?: string; readonly position?: Vec2 }
  | { readonly type: 'CombatEntered'; readonly atSeconds: number; readonly actorId: string; readonly position?: Vec2 }
  | { readonly type: 'AbilityActivated'; readonly atSeconds: number; readonly actorId: string; readonly abilityId: string; readonly isUltimate?: boolean; readonly position?: Vec2 }
  | { readonly type: 'EvolutionAvailable'; readonly atSeconds: number; readonly actorId: string; readonly evolutionId?: string }
  | { readonly type: 'UiActivated'; readonly atSeconds: number; readonly controlId: string };

export interface FeedbackListener {
  readonly position: Vec2;
  readonly facingRadians?: number;
}

export interface FeedbackMixSettings {
  readonly master: number;
  readonly effects: number;
  readonly music: number;
  readonly ui: number;
  readonly muted?: boolean;
}

export interface AudioCue {
  readonly id: string;
  readonly channel: 'effects' | 'music' | 'ui';
  readonly gain: number;
  readonly pan: number;
  readonly pitch: number;
  readonly eventType: FeedbackEvent['type'];
  readonly sourceId?: string;
}

export interface VisualFeedbackCue {
  readonly id: 'muzzle-glint' | 'flyby-streak' | 'impact-spark' | 'damage-edge' | 'drone-pop' | 'perfect-guard-flash' | 'ability-pulse' | 'evolution-ready';
  readonly eventType: FeedbackEvent['type'];
  readonly position?: Vec2;
  readonly intensity: number;
}

export const DEFAULT_FEEDBACK_MIX: FeedbackMixSettings = Object.freeze({
  master: 1,
  effects: 1,
  music: 0.72,
  ui: 0.8,
  muted: false,
});
