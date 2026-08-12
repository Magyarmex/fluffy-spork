import { Renderer } from '../../rendering';
import type { RenderFrame } from '../../rendering/types';
import { LobbyBattle, type LobbyBattleOptions, type LobbyBattleSnapshot } from './LobbyBattle';

export interface LobbySceneFrame {
  readonly battle: LobbyBattleSnapshot;
  readonly render: RenderFrame;
  readonly cameraY: number;
}

/** Presentation shell around the canonical LobbyBattle. */
export class LobbyScene {
  readonly battle: LobbyBattle;
  readonly #renderer: Renderer;
  #cameraY = 0;
  #lastRenderMs = Number.NEGATIVE_INFINITY;
  #lastFrame: RenderFrame | undefined;

  constructor(options: LobbyBattleOptions = {}, renderer = new Renderer()) {
    this.battle = new LobbyBattle(options);
    this.#renderer = renderer;
    this.#renderer.start();
  }

  step(steps = 1): LobbySceneFrame {
    const battle = this.battle.step(steps);
    this.#cameraY -= this.battle.policy.cameraVelocity * (steps / this.battle.policy.simulationHz);
    if (!this.#lastFrame || this.battle.policy.shouldRender(battle.elapsedMs, this.#lastRenderMs)) {
      this.#lastFrame = this.#renderer.render({
        tick:battle.tick,
        elapsedMs:battle.elapsedMs,
        entities:battle.entities,
        battlefieldState:{ bounds:this.battle.battlefield.bounds, terrain:this.battle.battlefield.terrain, rubble:this.battle.battlefield.rubble },
        events:this.battle.policy.capEffects(battle.events.map((event) => ({ type:event.type, tick:battle.tick, elapsedMs:battle.elapsedMs, payload:event }))),
      });
      this.#lastRenderMs = battle.elapsedMs;
    }
    return Object.freeze({ battle, render:this.#lastFrame, cameraY:this.#cameraY });
  }

  snapshot(): LobbyBattleSnapshot { return this.battle.snapshot(); }
  stop(): void { this.#renderer.stop(); }
}
