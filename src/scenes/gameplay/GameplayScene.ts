import { Renderer } from '../../rendering';
import type { RenderCommand, RenderFrame } from '../../rendering/types';
import { GameplayBattle, type GameplayBattleOptions, type GameplaySnapshot } from './GameplayBattle';

export interface GameplaySceneFrame {
  readonly battle: GameplaySnapshot;
  readonly render: RenderFrame;
}

function livingFrontCommands(battle:GameplaySnapshot):readonly RenderCommand[]{
  const signal=battle.livingFront.signal;
  if(!signal)return Object.freeze([]);
  const age=Math.max(0,battle.tick-signal.createdAtTick),fade=Math.max(0,1-age/240),label=signal.type==='bloom'?'SHAPE BLOOM':signal.type==='migration'?'MIGRATION':'ROGUE STAR';
  return Object.freeze([
    {kind:'glow',layer:'effect-under',x:signal.position.x,y:signal.position.y,radius:180,color:'#ffe066',alpha:.08+.10*fade},
    {kind:'circle',layer:'effect-over',x:signal.position.x,y:signal.position.y,radius:110+age*.18,stroke:'#ffe066',lineWidth:2,alpha:.12+.32*fade},
    ...(signal.direction?[{kind:'line' as const,layer:'effect-over' as const,x1:signal.position.x-signal.direction.x*110,y1:signal.position.y-signal.direction.y*110,x2:signal.position.x+signal.direction.x*110,y2:signal.position.y+signal.direction.y*110,width:3,color:'#ffe066',alpha:.42*fade}]:[]),
    {kind:'text',layer:'overlay',x:signal.position.x,y:signal.position.y-132,text:label,color:'#ffe066',size:14,alpha:.28+.52*fade},
  ]);
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
    const base = this.#renderer.render({
      tick:battle.tick,
      elapsedMs:battle.elapsedMs,
      entities:battle.entities,
      battlefieldState:{ bounds:this.battle.battlefield.bounds, terrain:this.battle.battlefield.terrain, rubble:this.battle.battlefield.rubble },
      events:battle.events.map((event) => ({ type:event.type, tick:battle.tick, elapsedMs:battle.elapsedMs, payload:event })),
    });
    const signalCommands=livingFrontCommands(battle);
    const render:RenderFrame=signalCommands.length===0?base:Object.freeze({...base,commands:Object.freeze([...base.commands,...signalCommands]),metrics:Object.freeze({...base.metrics,commandsBuilt:base.metrics.commandsBuilt+signalCommands.length,effectsBuilt:base.metrics.effectsBuilt+signalCommands.filter((command)=>command.layer==='effect-under'||command.layer==='effect-over').length})});
    return Object.freeze({ battle, render });
  }

  snapshot(): GameplaySnapshot { return this.battle.snapshot(); }
  stop(): void { this.#renderer.stop(); }
}
