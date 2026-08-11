import type { Vec2 } from '../game/simulation/math';
import type { AudioCue, FeedbackEvent, FeedbackListener, FeedbackMixSettings } from './contracts';
import { DEFAULT_FEEDBACK_MIX } from './contracts';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function spatialGain(source: Vec2 | undefined, listener: FeedbackListener | undefined, maxDistance = 900): number {
  if (!source || !listener) return 1;
  return clamp01(1 - distance(source, listener.position) / maxDistance);
}

function spatialPan(source: Vec2 | undefined, listener: FeedbackListener | undefined): number {
  if (!source || !listener) return 0;
  const dx = source.x - listener.position.x;
  return Math.max(-1, Math.min(1, dx / 420));
}

export class AudioEngine {
  constructor(private mix: FeedbackMixSettings = DEFAULT_FEEDBACK_MIX) {}

  setMix(next: FeedbackMixSettings): void {
    this.mix = Object.freeze({ ...next });
  }

  selectCues(event: FeedbackEvent, listener?: FeedbackListener): readonly AudioCue[] {
    if (this.mix.muted || this.mix.master <= 0) return Object.freeze([]);
    const cue = this.selectCue(event, listener);
    return cue ? Object.freeze([cue]) : Object.freeze([]);
  }

  private selectCue(event: FeedbackEvent, listener?: FeedbackListener): AudioCue | undefined {
    const effectGain = this.mix.master * this.mix.effects;
    const uiGain = this.mix.master * this.mix.ui;
    switch (event.type) {
      case 'ProjectileFired':
        return this.cue(`weapon:${event.weaponId}`, 'effects', effectGain * spatialGain(event.position, listener, 1050), spatialPan(event.position, listener), 1, event, event.actorId);
      case 'ProjectileFlyby': {
        const proximity = clamp01(1 - event.nearestDistance / 180);
        if (proximity <= 0) return undefined;
        return this.cue('projectile:flyby', 'effects', effectGain * proximity * spatialGain(event.position, listener, 700), spatialPan(event.position, listener), 0.96 + proximity * 0.08, event, event.projectileId);
      }
      case 'ProjectileEnteredView':
        return this.cue('projectile:presence', 'effects', effectGain * 0.18 * spatialGain(event.position, listener, 650), spatialPan(event.position, listener), 1.05, event, event.projectileId);
      case 'TankDamaged':
        return this.cue('impact:hull', 'effects', effectGain * Math.min(1, 0.35 + event.damage / 120), spatialPan(event.position, listener), 0.98, event, event.targetId);
      case 'TankDestroyed':
        return this.cue('impact:tank-destroyed', 'effects', effectGain * spatialGain(event.position, listener, 1200), spatialPan(event.position, listener), 0.9, event, event.targetId);
      case 'DroneDestroyed':
        return this.cue('impact:drone-destroyed', 'effects', effectGain * 0.75 * spatialGain(event.position, listener, 800), spatialPan(event.position, listener), 1.12, event, event.droneId);
      case 'PerfectGuard':
        return this.cue('combat:perfect-guard', 'effects', effectGain, spatialPan(event.position, listener), 1, event, event.actorId);
      case 'CombatEntered':
        return this.cue('combat:entered', 'effects', effectGain * 0.55, 0, 1, event, event.actorId);
      case 'AbilityActivated':
        return this.cue(event.isUltimate ? `ultimate:${event.abilityId}` : `ability:${event.abilityId}`, 'effects', effectGain * (event.isUltimate ? 1 : 0.82) * spatialGain(event.position, listener, 1100), spatialPan(event.position, listener), event.isUltimate ? 0.92 : 1, event, event.actorId);
      case 'EvolutionAvailable':
        return this.cue('progression:evolution-available', 'ui', uiGain * 0.9, 0, 1, event, event.actorId);
      case 'UiActivated':
        return this.cue(`ui:${event.controlId}`, 'ui', uiGain * 0.65, 0, 1, event);
    }
  }

  private cue(id: string, channel: AudioCue['channel'], gain: number, pan: number, pitch: number, event: FeedbackEvent, sourceId?: string): AudioCue | undefined {
    const bounded = clamp01(gain);
    if (bounded <= 0) return undefined;
    return Object.freeze({ id, channel, gain: bounded, pan: Math.max(-1, Math.min(1, pan)), pitch, eventType: event.type, sourceId });
  }
}
