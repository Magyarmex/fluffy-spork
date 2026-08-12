import { useSyncExternalStore } from 'react';
import { GeneRegistry, LATEST_RELEASE, MasteryPerkRegistry, RELEASE_HISTORY, TankRegistry, UpgradeRegistry } from '../content';
import type { CombatLineageId, StatUpgradeId } from '../content';
import type { MasteryPerkId } from '../game/progression/types';
import type { UIController } from './actions/UIController';
import { TouchControls } from './controls/TouchControls';
import type { UIStore } from './store/UIStore';

export interface CanonicalUIProps { readonly store:UIStore; readonly controller:UIController; }

function choiceLabel(id:string, milestone:string|undefined):string {
  if(milestone==='mastery') return MasteryPerkRegistry.find(id)?.name ?? id;
  if(milestone==='gene') return GeneRegistry.find(id)?.name ?? id;
  return TankRegistry.find(id)?.name ?? id;
}

/** Thin React shell: immutable read models in, explicit player intent out. */
export function CanonicalUI({ store, controller }: CanonicalUIProps) {
  const ui=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
  const settings=ui.settings;
  const evolution=ui.evolution;
  const choose=(id:string)=>{
    if(evolution?.milestone==='mastery')controller.mastery(id as MasteryPerkId);
    else if(evolution?.milestone==='gene')controller.gene(id as CombatLineageId);
    else controller.evolve(id);
  };

  return <div data-nova-ui={ui.screen}>
    {ui.screen==='lobby'&&<>
      <nav aria-label="NOVA menu">
        <button onClick={()=>{controller.redeploy();controller.open('match');}}>PLAY</button>
        <button onClick={()=>controller.open('settings')}>SETTINGS</button>
        <button onClick={()=>controller.open('blackglass')}>BLACKGLASS</button>
      </nav>
      <section aria-label="Latest release" data-release-family={LATEST_RELEASE.family}>
        <strong>NOVA {LATEST_RELEASE.version} · {LATEST_RELEASE.title}</strong><span>{LATEST_RELEASE.summary}</span>
        <details><summary>LIVING ARCHIVE</summary><div data-release-archive="true">
          {RELEASE_HISTORY.map((release)=><article key={release.version} data-release-family={release.family}>
            <b>{release.version} · {release.title}</b><small>{release.date}</small><span>{release.summary}</span>
          </article>)}
        </div></details>
      </section>
      {ui.tip&&<aside aria-label="Fieldcraft tip">FIELDCRAFT · {ui.tip}</aside>}
    </>}

    {ui.screen==='match'&&<>
      <section aria-label="HUD">
        <output>LV {ui.hud.level??0}</output><output>XP {Math.floor(ui.hud.xp??0)}</output>
        <output>HP {ui.hud.health?`${Math.ceil(ui.hud.health.current)}/${Math.ceil(ui.hud.health.max)}`:'—'}</output>
        <output>SCORE {ui.hud.score??0}</output><output>KILLS {ui.hud.kills??0}</output>
        {ui.hud.effects&&<output>BUFFS {ui.hud.effects.shieldSeconds>0?'SHIELD ':''}{ui.hud.effects.tripleSeconds>0?'TRIPLE ':''}{ui.hud.effects.hasteSeconds>0?'HASTE':''}</output>}
        <button onClick={()=>controller.togglePause()}>{ui.hud.matchStatus==='paused'?'RESUME':'PAUSE'}</button>
        {ui.tip&&<aside>{ui.tip}</aside>}
        <div aria-live="polite">{ui.messages.map((message)=><p key={message.id}>{message.text}</p>)}</div>
      </section>
      {(ui.hud.statPoints??0)>0&&<section aria-label="Upgrades"><strong>UPGRADES · {ui.hud.statPoints} POINTS</strong>
        {UpgradeRegistry.all().map((upgrade)=><button key={upgrade.id} onClick={()=>controller.spendStat(upgrade.id as StatUpgradeId)}>{upgrade.name}</button>)}
      </section>}
      {evolution?.milestone&&evolution.choices.length>0&&<section aria-label="Evolution">
        <h2>{evolution.milestone.toUpperCase()}</h2>{evolution.choices.map((id)=><button key={id} onClick={()=>choose(id)}>{choiceLabel(id,evolution.milestone)}</button>)}
      </section>}
      {ui.hud.leaderboard.length>0&&<ol aria-label="Leaderboard">{ui.hud.leaderboard.map((entry)=><li key={entry.name}><b>{entry.name}</b> · LV {entry.level} · {entry.score}</li>)}</ol>}
      {ui.hud.matchStatus==='dead'&&<section role="dialog" aria-label="Game over"><h2>RUN ENDED</h2><p>Score {ui.hud.score??0} · Kills {ui.hud.kills??0} · Level {ui.hud.level??0}</p><button onClick={()=>controller.redeploy()}>REDEPLOY</button><button onClick={()=>controller.open('lobby')}>WAR ROOM</button></section>}
      <section aria-label="Swarm commands">{(['follow','attack','defend','recall'] as const).map((order)=><button key={order} onClick={()=>controller.swarm(order)}>{order.toUpperCase()}</button>)}</section>
      <TouchControls controller={controller} settings={settings}/>
    </>}

    {ui.screen==='evolution'&&evolution&&<section aria-label="Evolution"><h2>{evolution.milestone??'EVOLUTION'}</h2>{evolution.choices.map((id)=><button key={id} onClick={()=>choose(id)}>{choiceLabel(id,evolution.milestone)}</button>)}</section>}
    {ui.screen==='blackglass'&&<section aria-label="Blackglass UI"><h2>BLACKGLASS</h2>{ui.tip&&<aside>{ui.tip}</aside>}</section>}
    {ui.screen==='settings'&&<section aria-label="Pilot settings">
      <label>Aim sensitivity <input type="range" min="60" max="160" value={Math.round(settings.input.aimSensitivity*100)} onChange={(event)=>controller.updateSettings({aimSensitivity:Number(event.currentTarget.value)/100})}/></label>
      <label>Move sensitivity <input type="range" min="60" max="160" value={Math.round((settings.input.moveSensitivity??1)*100)} onChange={(event)=>controller.updateSettings({moveSensitivity:Number(event.currentTarget.value)/100})}/></label>
      <label>Joystick size <input type="range" min="80" max="130" value={Math.round(settings.presentation.stickSize*100)} onChange={(event)=>controller.updateSettings({stickSize:Number(event.currentTarget.value)/100})}/></label>
      <label>Joystick opacity <input type="range" min="30" max="100" value={Math.round(settings.presentation.stickOpacity*100)} onChange={(event)=>controller.updateSettings({stickOpacity:Number(event.currentTarget.value)/100})}/></label>
      <label>Screen shake <input type="range" min="0" max="100" value={Math.round(settings.presentation.screenShake*100)} onChange={(event)=>controller.updateSettings({screenShake:Number(event.currentTarget.value)/100})}/></label>
      {ui.tip&&<aside>{ui.tip}</aside>}<button onClick={()=>controller.open('lobby')}>DONE</button>
    </section>}
    {ui.screen==='debug'&&<pre aria-label="Debug data">{JSON.stringify(ui.debug,null,2)}</pre>}
  </div>;
}
