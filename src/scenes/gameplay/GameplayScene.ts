import { Renderer } from '../../rendering';
import type { RenderFrame } from '../../rendering/types';
import { GameplayBattle, type GameplayBattleOptions, type GameplaySnapshot } from './GameplayBattle';

export interface GameplaySceneFrame {
  readonly battle: GameplaySnapshot;
  readonly render: RenderFrame;
}

/** Main player-facing NOVA scene, distinct from the background War Room lobby battle. */
export class GameplayScene {
  readonly battle: GameplayBattle;
  readonly #renderer: Renderer;

  constructor(options: GameplayBattleOptions = {}, renderer = new Renderer()) {
    this.battle = new GameplayBattle(options);
    this.#renderer = renderer;
    this.#renderer.start();
  }

  step(steps = 1): GameplaySceneFrame {
    const battle = this.battle.step(steps);
    const render = this.#renderer.render({
      tick:battle.tick,
      elapsedMs:battle.elapsedMs,
      entities:battle.entities,
      battlefieldState:{ bounds:this.battle.battlefield.bounds, terrain:this.battle.battlefield.terrain, rubble:this.battle.battlefield.rubble },
      events:battle.events.map((event) => ({ type:event.type, tick:battle.tick, elapsedMs:battle.elapsedMs, payload:event })),
    });
    return Object.freeze({ battle, render });
  }

  snapshot(): GameplaySnapshot { return this.battle.snapshot(); }
  stop(): void { this.#renderer.stop(); }
}
