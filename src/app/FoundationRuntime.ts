import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AudioEngine, DEFAULT_FEEDBACK_MIX, WebAudioPresenter, feedbackFromCombatEvent } from '../audio';
import { FIELDCRAFT_DISPLAY_MS } from '../content';
import type { CombatLineageId, StatUpgradeId } from '../content';
import type { MasteryPerkId } from '../game/progression/types';
import { GamepadInputAdapter } from '../input/gamepad/GamepadInputAdapter';
import { normalizeStick } from '../input/commands/GameCommand';
import type { GameCommand } from '../input/commands/GameCommand';
import { PersistenceService, browserStorage } from '../persistence/PersistenceService';
import { DEFAULT_SAVE_FILE, type SaveFile } from '../persistence/schema';
import { BlackglassScene } from '../scenes/blackglass/BlackglassScene';
import { GameplayScene } from '../scenes/gameplay/GameplayScene';
import { LobbyScene } from '../scenes/lobby/LobbyScene';
import { CanonicalUI } from '../ui/CanonicalUI';
import { UIController, type UIApplicationPort } from '../ui/actions/UIController';
import { UIStore } from '../ui/store/UIStore';
import { TipDeck } from '../ui/tips/TipDeck';
import type { UIScreen, UISettingsState } from '../ui/types';
import { CanvasPresenter, type CanvasView } from './CanvasPresenter';

type TouchChannel='move'|'aim'|'fire'|'ability'|'ultimate';

/** Browser composition root. Main gameplay, lobby and Blackglass are separate canonical scenes. */
export class FoundationRuntime implements UIApplicationPort {
  readonly #host:HTMLElement; readonly #worldHost:HTMLDivElement; readonly #uiHost:HTMLDivElement;
  readonly #presenter:CanvasPresenter; readonly #uiStore=new UIStore(); readonly #uiController=new UIController(this.#uiStore,this); readonly #reactRoot:Root;
  readonly #lobby=new LobbyScene(); readonly #blackglass=new BlackglassScene();
  #gameplay:GameplayScene;
  readonly #pressed=new Set<string>(); readonly #gamepad=new GamepadInputAdapter(()=>this.#uiStore.getSnapshot().settings.input);
  readonly #touchChannels:Record<TouchChannel,boolean>={move:false,aim:false,fire:false,ability:false,ultimate:false};
  readonly #tips=new TipDeck(); readonly #audio=new AudioEngine(DEFAULT_FEEDBACK_MIX); readonly #audioOut=new WebAudioPresenter();
  readonly #persistence?:PersistenceService; #save:SaveFile;
  #screen:UIScreen='lobby'; #animation=0; #lastTime=0; #accumulator=0; #pointerClient={x:0,y:0}; #pointerDown=false; #view:CanvasView={worldSpan:5000}; #running=false; #gamepadWasActive=false;
  #tip=''; #tipNextAt=0; #tipKey=''; #deathPersisted=false;

  constructor(host:HTMLElement){
    this.#host=host;
    const storage=browserStorage();this.#persistence=storage?new PersistenceService(storage):undefined;this.#save=this.#persistence?.load().save??DEFAULT_SAVE_FILE;
    const pilot=this.#save.preferences.pilot;this.#uiStore.settings.update({aimSensitivity:pilot.aimSensitivity,moveSensitivity:pilot.moveSensitivity,stickDeadzone:pilot.stickDeadzone,stickSize:pilot.stickSize,stickOpacity:pilot.stickOpacity,screenShake:pilot.screenShake,reducedMotion:pilot.reducedMotion});
    this.#gameplay=new GameplayScene({bestRunLevel:this.#save.progression.bestLevel});
    this.#audio.setMix({...DEFAULT_FEEDBACK_MIX,muted:this.#save.preferences.muted});this.#audioOut.setPreferences({muted:this.#save.preferences.muted,musicOff:this.#save.preferences.musicOff});

    host.replaceChildren();host.style.cssText='position:relative;width:100%;height:100%;overflow:hidden;background:#04060d;color:#dff8ff;font-family:Rajdhani,system-ui,sans-serif';
    this.#worldHost=document.createElement('div');this.#worldHost.style.cssText='position:absolute;inset:0';this.#uiHost=document.createElement('div');this.#uiHost.style.cssText='position:absolute;inset:0;pointer-events:none;display:flex;align-items:flex-start;justify-content:flex-start;padding:16px;box-sizing:border-box;overflow:auto';this.#uiHost.dataset.novaLayer='canonical-ui';host.append(this.#worldHost,this.#uiHost);this.#presenter=new CanvasPresenter(this.#worldHost);
    const style=document.createElement('style');style.textContent='[data-nova-layer="canonical-ui"] button,[data-nova-layer="canonical-ui"] input,[data-nova-layer="canonical-ui"] details,[data-touch-stick]{pointer-events:auto}[data-nova-ui]{display:grid;gap:8px;max-width:min(760px,94vw);padding:10px;border:1px solid rgba(77,227,255,.28);border-radius:10px;background:rgba(4,6,13,.70);backdrop-filter:blur(5px)}[data-nova-ui] nav,[data-nova-ui] section{display:flex;gap:8px;flex-wrap:wrap;align-items:center}[data-nova-ui] button{border:1px solid rgba(77,227,255,.38);background:#091525;color:#dff8ff;padding:8px 12px;border-radius:7px;font:700 13px Orbitron,sans-serif}[data-nova-ui] output{padding:4px 7px;background:rgba(0,0,0,.35);border-radius:5px}[data-release-archive]{max-height:32vh;overflow:auto;display:grid;gap:6px}[data-release-archive] article{display:grid;grid-template-columns:auto auto 1fr;gap:8px;padding:5px;border-left:2px solid rgba(77,227,255,.35)}[data-touch-controls]{display:none;position:fixed;inset:auto 16px 18px 16px;justify-content:space-between;align-items:flex-end;background:none!important;border:0!important;padding:0!important}[data-touch-stick]{width:124px;height:124px;border-radius:50%;display:grid;place-items:center;touch-action:none;user-select:none;border:1px solid rgba(77,227,255,.55);background:rgba(5,17,32,.38)}[data-touch-actions]{display:grid;gap:6px}@media (hover:none),(pointer:coarse){[data-touch-controls]{display:flex!important}}@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}';host.append(style);
    this.#reactRoot=createRoot(this.#uiHost);this.#reactRoot.render(createElement(CanonicalUI,{store:this.#uiStore,controller:this.#uiController}));this.installInput();this.refreshTip(performance.now(),true);
  }

  start(){if(this.#running)return;this.#running=true;this.#lastTime=performance.now();this.#animation=requestAnimationFrame(this.frame);}
  stop(){if(!this.#running)return;this.#running=false;cancelAnimationFrame(this.#animation);this.#lobby.stop();this.#gameplay.stop();this.#blackglass.stop();this.#reactRoot.unmount();this.#audioOut.dispose();this.removeInput();}
  issue(command:GameCommand){if(this.#screen!=='match')return;this.trackTouchActivity(command);this.#gameplay.battle.issuePlayerCommand(command,'touch');}
  chooseEvolution(tankId:string){this.#gameplay.battle.chooseEvolution(tankId);}
  chooseMastery(perkId:MasteryPerkId){this.#gameplay.battle.chooseMastery(perkId);}
  chooseGene(geneId:CombatLineageId){this.#gameplay.battle.chooseGene(geneId);}
  spendStat(statId:StatUpgradeId){this.#gameplay.battle.spendStat(statId);}
  togglePause(){this.#gameplay.battle.togglePause();}
  redeploy(){this.persistRun();this.#gameplay.stop();this.#gameplay=new GameplayScene({bestRunLevel:Math.max(this.#save.progression.bestLevel,this.#gameplay.battle.bestRunLevel)});this.#deathPersisted=false;}
  settingsChanged(settings:UISettingsState){this.#save={...this.#save,preferences:{...this.#save.preferences,pilot:{aimSensitivity:settings.input.aimSensitivity,moveSensitivity:settings.input.moveSensitivity??1,stickDeadzone:settings.input.stickDeadzone,stickSize:settings.presentation.stickSize,stickOpacity:settings.presentation.stickOpacity,screenShake:settings.presentation.screenShake,reducedMotion:settings.presentation.reducedMotion}}};this.#persistence?.save(this.#save);}

  private readonly frame=(now:number)=>{if(!this.#running)return;const elapsed=Math.min(100,Math.max(0,now-this.#lastTime));this.#lastTime=now;const nextScreen=this.#uiStore.getSnapshot().screen;if(nextScreen!==this.#screen)this.#accumulator=0;this.#screen=nextScreen;this.refreshTip(now);
    if(this.#screen==='debug'){this.#animation=requestAnimationFrame(this.frame);return;}
    if(this.#screen==='blackglass')this.renderBlackglass(now);else if(this.#screen==='match')this.renderGameplay(elapsed);else this.renderLobby(elapsed);
    this.#animation=requestAnimationFrame(this.frame);
  };

  private renderGameplay(elapsed:number){this.#accumulator+=elapsed;const stepMs=this.#gameplay.battle.fixedStepMs;this.sampleInputs();let steps=0;while(this.#accumulator>=stepMs&&steps<6){this.#gameplay.step(1);this.#accumulator-=stepMs;steps++;}const scene=this.#gameplay.step(0),battle=scene.battle;const player=battle.tanks.find((tank)=>tank.id===battle.playerId);this.#view=player?{centerX:player.position.x,centerY:player.position.y,worldSpan:1800}:{centerX:0,centerY:0,worldSpan:1800};this.#presenter.draw(scene.render,this.#view);this.playFeedback(battle);if(battle.status==='dead')this.persistRun();this.#uiStore.publish({tick:battle.tick,playerId:String(battle.playerId),entities:{version:1,entities:battle.entities},progression:battle.progression,score:battle.score,kills:battle.kills,bestScore:this.#save.scores.best,matchStatus:battle.status,leaderboard:battle.leaderboard,effects:battle.effects,tip:this.#tip,debug:{scene:'gameplay',simulationHz:this.#gameplay.battle.simulationHz,shapes:battle.shapes.length,powerups:battle.powerups.length,legacyRuntime:false,livingFront:battle.livingFront}});}
  private renderLobby(elapsed:number){this.#accumulator+=elapsed;const stepMs=this.#lobby.battle.policy.fixedStepMs;let steps=0;while(this.#accumulator>=stepMs&&steps<4){this.#lobby.step(1);this.#accumulator-=stepMs;steps++;}const scene=this.#lobby.step(0);this.#view={centerX:0,centerY:scene.cameraY,worldSpan:5000};this.#presenter.draw(scene.render,this.#view);this.#uiStore.publish({tick:scene.battle.tick,entities:{version:1,entities:scene.battle.entities},score:this.#save.scores.best,bestScore:this.#save.scores.best,tip:this.#tip,debug:{scene:'lobby-war-room',simulationHz:this.#lobby.battle.policy.simulationHz}});}
  private renderBlackglass(now:number){const rect=this.#presenter.canvas.getBoundingClientRect(),center={x:rect.left+rect.width/2,y:rect.top+rect.height/2},angle=Math.atan2(this.#pointerClient.y-center.y,this.#pointerClient.x-center.x);this.#blackglass.aimAt(Number.isFinite(angle)?angle:0);if(this.#pointerDown)this.#blackglass.fire(now/1000);this.#presenter.draw(this.#blackglass.render(Math.trunc(now/16.6667),now),{centerX:0,centerY:0,worldSpan:650});this.#uiStore.publish({tick:Math.trunc(now/16.6667),entities:{version:1,entities:[]},tip:this.#tip,debug:{scene:'blackglass'}});}

  private sampleInputs(){if(this.#screen!=='match'||this.#gameplay.battle.status!=='playing'||this.hasActiveTouchInput())return;if(this.sampleGamepad())return;const move=normalizeStick({x:(this.#pressed.has('KeyD')?1:0)-(this.#pressed.has('KeyA')?1:0),y:(this.#pressed.has('KeyS')?1:0)-(this.#pressed.has('KeyW')?1:0)});this.#gameplay.battle.issuePlayerCommand({type:'move',vector:move},'keyboard');const player=this.#gameplay.battle.snapshot().tanks.find((tank)=>tank.id===this.#gameplay.battle.playerId);if(player){const pointer=this.#presenter.worldPoint(this.#pointerClient.x,this.#pointerClient.y,this.#view);this.#gameplay.battle.issuePlayerCommand({type:'aim',vector:normalizeStick({x:pointer.x-player.position.x,y:pointer.y-player.position.y})},'mouse');}this.#gameplay.battle.issuePlayerCommand({type:'fire',active:this.#pointerDown||this.#pressed.has('Space')},this.#pointerDown?'mouse':'keyboard');this.#gameplay.battle.issuePlayerCommand({type:'ability',slot:0,active:this.#pressed.has('KeyE')},'keyboard');this.#gameplay.battle.issuePlayerCommand({type:'ultimate',active:this.#pressed.has('KeyQ')},'keyboard');}
  private sampleGamepad(){const pads=typeof navigator.getGamepads==='function'?navigator.getGamepads():[],pad=Array.from(pads).find((candidate):candidate is Gamepad=>Boolean(candidate?.connected));if(!pad){this.#gamepadWasActive=false;return false;}const left={x:pad.axes[0]??0,y:pad.axes[1]??0},right={x:pad.axes[2]??0,y:pad.axes[3]??0},fire=Boolean(pad.buttons[7]?.pressed||pad.buttons[0]?.pressed),ability=Boolean(pad.buttons[1]?.pressed),ultimate=Boolean(pad.buttons[3]?.pressed||pad.buttons[4]?.pressed),active=Math.hypot(left.x,left.y)>0.12||Math.hypot(right.x,right.y)>0.12||fire||ability||ultimate;if(!active&&!this.#gamepadWasActive)return false;this.#gamepad.ingest({leftStick:left,rightStick:right,fire,ability,ultimate});for(const envelope of this.#gamepad.poll())this.#gameplay.battle.issuePlayerCommand(envelope.command,envelope.source);this.#gamepadWasActive=active;return true;}
  private playFeedback(battle:ReturnType<GameplayScene['snapshot']>){const player=battle.tanks.find((tank)=>tank.id===battle.playerId);const listener=player?{position:player.position}:undefined;for(const event of battle.events)for(const feedback of feedbackFromCombatEvent(event))for(const cue of this.#audio.selectCues(feedback,listener))this.#audioOut.play(cue);}
  private persistRun(){if(this.#deathPersisted&&this.#gameplay.battle.status==='dead')return;const snapshot=this.#gameplay.battle.snapshot(),best=Math.max(this.#save.scores.best,snapshot.score),bestLevel=Math.max(this.#save.progression.bestLevel,this.#gameplay.battle.bestRunLevel,snapshot.progression.level);this.#save={...this.#save,scores:{best},progression:{bestLevel}};this.#persistence?.save(this.#save);if(snapshot.status==='dead')this.#deathPersisted=true;}
  private refreshTip(now:number,force=false){const key=this.#screen; if(!force&&now<this.#tipNextAt&&this.#tipKey===key)return;const tags=this.#screen==='match'?['battlefield','combat']:this.#screen==='settings'?['settings','controls']:this.#screen==='blackglass'?['blackglass']:['general','ui'];this.#tip=this.#tips.next(key,tags)?.text??this.#tips.next(key)?.text??'';this.#tipNextAt=now+FIELDCRAFT_DISPLAY_MS;this.#tipKey=key;}
  private trackTouchActivity(command:GameCommand){switch(command.type){case'move':this.#touchChannels.move=Math.hypot(command.vector.x,command.vector.y)>0.001;break;case'aim':this.#touchChannels.aim=Math.hypot(command.vector.x,command.vector.y)>0.001;break;case'fire':this.#touchChannels.fire=command.active;break;case'ability':this.#touchChannels.ability=command.active;break;case'ultimate':this.#touchChannels.ultimate=command.active;break;default:break;}}
  private hasActiveTouchInput(){return Object.values(this.#touchChannels).some(Boolean);}
  private readonly onKeyDown=(event:KeyboardEvent)=>{this.#pressed.add(event.code);};private readonly onKeyUp=(event:KeyboardEvent)=>{this.#pressed.delete(event.code);};private readonly onPointerMove=(event:PointerEvent)=>{if(event.pointerType!=='touch')this.#pointerClient={x:event.clientX,y:event.clientY};};private readonly onPointerDown=(event:PointerEvent)=>{if(event.pointerType==='touch')return;this.#pointerDown=event.button===0;this.#pointerClient={x:event.clientX,y:event.clientY};};private readonly onPointerUp=(event:PointerEvent)=>{if(event.pointerType!=='touch')this.#pointerDown=false;};
  private installInput(){window.addEventListener('keydown',this.onKeyDown);window.addEventListener('keyup',this.onKeyUp);this.#presenter.canvas.addEventListener('pointermove',this.onPointerMove);this.#presenter.canvas.addEventListener('pointerdown',this.onPointerDown);window.addEventListener('pointerup',this.onPointerUp);}
  private removeInput(){window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);this.#presenter.canvas.removeEventListener('pointermove',this.onPointerMove);this.#presenter.canvas.removeEventListener('pointerdown',this.onPointerDown);window.removeEventListener('pointerup',this.onPointerUp);}
}
