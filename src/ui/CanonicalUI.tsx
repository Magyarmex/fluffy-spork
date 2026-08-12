import { useSyncExternalStore } from 'react';
import type { UIController } from './actions/UIController';
import { TouchControls } from './controls/TouchControls';
import type { UIStore } from './store/UIStore';

export interface CanonicalUIProps {
  readonly store: UIStore;
  readonly controller: UIController;
}

/** Thin React shell: render read models and forward intent through the application port. */
export function CanonicalUI({ store, controller }: CanonicalUIProps) {
  const ui = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const settings = ui.settings;

  return <div data-nova-ui={ui.screen}>
    {ui.screen === 'lobby' && <nav aria-label="NOVA menu">
      <button onClick={() => controller.open('match')}>PLAY</button>
      <button onClick={() => controller.open('settings')}>SETTINGS</button>
      <button onClick={() => controller.open('blackglass')}>BLACKGLASS</button>
    </nav>}

    {ui.screen === 'match' && <>
      <section aria-label="HUD">
        <output>LV {ui.hud.level ?? 0}</output>
        <output>XP {ui.hud.xp ?? 0}</output>
        <output>HP {ui.hud.health ? `${Math.ceil(ui.hud.health.current)}/${Math.ceil(ui.hud.health.max)}` : '—'}</output>
        <output>SCORE {ui.hud.score ?? 0}</output>
        {ui.tip && <aside>{ui.tip}</aside>}
        <div aria-live="polite">{ui.messages.map((message) => <p key={message.id}>{message.text}</p>)}</div>
      </section>
      <section aria-label="Swarm commands">
        {(['follow', 'attack', 'defend', 'recall'] as const).map((order) =>
          <button key={order} onClick={() => controller.swarm(order)}>{order.toUpperCase()}</button>)}
      </section>
      <TouchControls controller={controller} settings={settings}/>
    </>}

    {ui.screen === 'evolution' && ui.evolution && <section aria-label="Evolution">
      <h2>{ui.evolution.milestone ?? 'EVOLUTION'}</h2>
      {ui.evolution.choices.map((tankId) => <button key={tankId} onClick={() => controller.evolve(tankId)}>{tankId}</button>)}
    </section>}

    {ui.screen === 'blackglass' && <section aria-label="Blackglass UI"><h2>BLACKGLASS</h2></section>}

    {ui.screen === 'settings' && <section aria-label="Pilot settings">
      <label>Aim sensitivity <input type="range" min="60" max="160" value={Math.round(settings.input.aimSensitivity * 100)}
        onChange={(event) => controller.updateSettings({ aimSensitivity: Number(event.currentTarget.value) / 100 })}/></label>
      <label>Move sensitivity <input type="range" min="60" max="160" value={Math.round((settings.input.moveSensitivity ?? 1) * 100)}
        onChange={(event) => controller.updateSettings({ moveSensitivity: Number(event.currentTarget.value) / 100 })}/></label>
      <label>Joystick size <input type="range" min="80" max="130" value={Math.round(settings.presentation.stickSize * 100)}
        onChange={(event) => controller.updateSettings({ stickSize: Number(event.currentTarget.value) / 100 })}/></label>
      <label>Joystick opacity <input type="range" min="30" max="100" value={Math.round(settings.presentation.stickOpacity * 100)}
        onChange={(event) => controller.updateSettings({ stickOpacity: Number(event.currentTarget.value) / 100 })}/></label>
      <label>Screen shake <input type="range" min="0" max="100" value={Math.round(settings.presentation.screenShake * 100)}
        onChange={(event) => controller.updateSettings({ screenShake: Number(event.currentTarget.value) / 100 })}/></label>
      <button onClick={() => controller.open('match')}>DONE</button>
    </section>}

    {ui.screen === 'debug' && <pre aria-label="Debug data">{JSON.stringify(ui.debug, null, 2)}</pre>}
  </div>;
}
