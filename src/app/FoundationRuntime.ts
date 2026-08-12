import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BlackglassScene } from '../scenes/blackglass/BlackglassScene';
import { LobbyScene } from '../scenes/lobby/LobbyScene';
import type { GameCommand } from '../input/commands/GameCommand';
import { normalizeStick } from '../input/commands/GameCommand';
import { CanonicalUI } from '../ui/CanonicalUI';
import { UIController, type UIApplicationPort } from '../ui/actions/UIController';
import { UIStore } from '../ui/store/UIStore';
import type { UIScreen } from '../ui/types';
import { CanvasPresenter, type CanvasView } from './CanvasPresenter';

const ZERO_STATS = Object.freeze({ damage:0, reload:0, bulletspeed:0, penetration:0, maxhp:0, regen:0, speed:0, body:0 });
const PLAYER_TANK = 'gunner';

/**
 * Browser composition root for the Foundation production path.
 * Gameplay authority remains in canonical scene/simulation services; this class
 * only owns browser lifecycle, input sampling, scene selection and presentation.
 */
export class FoundationRuntime implements UIApplicationPort {
  readonly #host: HTMLElement;
  readonly #worldHost: HTMLDivElement;
  readonly #uiHost: HTMLDivElement;
  readonly #presenter: CanvasPresenter;
  readonly #uiStore = new UIStore();
  readonly #uiController = new UIController(this.#uiStore, this);
  readonly #reactRoot: Root;
  readonly #lobby = new LobbyScene();
  readonly #blackglass = new BlackglassScene();
  readonly #pressed = new Set<string>();
  #screen: UIScreen = 'lobby';
  #animation = 0;
  #lastTime = 0;
  #accumulator = 0;
  #pointerClient = { x:0, y:0 };
  #pointerDown = false;
  #view: CanvasView = { worldSpan:5000 };
  #running = false;

  constructor(host: HTMLElement) {
    this.#host = host;
    host.replaceChildren();
    host.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;background:#04060d;color:#dff8ff;font-family:Rajdhani,system-ui,sans-serif';

    this.#worldHost = document.createElement('div');
    this.#worldHost.style.cssText = 'position:absolute;inset:0';
    this.#uiHost = document.createElement('div');
    this.#uiHost.style.cssText = 'position:absolute;inset:0;pointer-events:none;display:flex;align-items:flex-start;justify-content:flex-start;padding:16px;box-sizing:border-box';
    this.#uiHost.dataset.novaLayer = 'canonical-ui';
    host.append(this.#worldHost, this.#uiHost);
    this.#presenter = new CanvasPresenter(this.#worldHost);

    const style = document.createElement('style');
    style.textContent = '[data-nova-layer="canonical-ui"] button,[data-nova-layer="canonical-ui"] input{pointer-events:auto}[data-nova-ui]{display:grid;gap:8px;padding:10px;border:1px solid rgba(77,227,255,.28);border-radius:10px;background:rgba(4,6,13,.70);backdrop-filter:blur(5px)}[data-nova-ui] nav,[data-nova-ui] section{display:flex;gap:8px;flex-wrap:wrap;align-items:center}[data-nova-ui] button{border:1px solid rgba(77,227,255,.38);background:#091525;color:#dff8ff;padding:8px 12px;border-radius:7px;font:700 13px Orbitron,sans-serif}[data-nova-ui] output{padding:4px 7px;background:rgba(0,0,0,.35);border-radius:5px}';
    host.append(style);

    this.#reactRoot = createRoot(this.#uiHost);
    this.#reactRoot.render(createElement(CanonicalUI, { store:this.#uiStore, controller:this.#uiController }));
    this.installInput();
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastTime = performance.now();
    this.#animation = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    cancelAnimationFrame(this.#animation);
    this.#lobby.stop();
    this.#blackglass.stop();
    this.#reactRoot.unmount();
    this.removeInput();
  }

  issue(command: GameCommand): void {
    if (this.#screen !== 'match') return;
    this.#lobby.battle.issuePlayerCommand(command, 'touch');
  }

  chooseEvolution(tankId: string): void {
    this.#lobby.battle.setPlayerTank(tankId);
  }

  private readonly frame = (now: number): void => {
    if (!this.#running) return;
    const elapsed = Math.min(100, Math.max(0, now - this.#lastTime));
    this.#lastTime = now;
    this.#screen = this.#uiStore.getSnapshot().screen;
    this.syncSceneMode();

    if (this.#screen === 'blackglass') {
      this.renderBlackglass(now);
    } else {
      this.#accumulator += elapsed;
      const stepMs = this.#lobby.battle.policy.fixedStepMs;
      this.sampleInputs();
      let steps = 0;
      while (this.#accumulator >= stepMs && steps < 4) { this.#lobby.step(1); this.#accumulator -= stepMs; steps += 1; }
      const scene = this.#lobby.step(0);
      const player = scene.battle.playerId ? scene.battle.tanks.find((tank) => tank.id === scene.battle.playerId) : undefined;
      this.#view = player && this.#screen === 'match'
        ? { centerX:player.position.x, centerY:player.position.y, worldSpan:1800 }
        : { centerX:0, centerY:scene.cameraY, worldSpan:5000 };
      this.#presenter.draw(scene.render, this.#view);
      this.#uiStore.publish({
        tick:scene.battle.tick,
        ...(player ? { playerId:String(player.id), progression:{ level:scene.battle.actorLevels[player.tankDefinitionId] ?? scene.battle.level, xp:0, statPoints:0, stats:ZERO_STATS, tankId:player.tankDefinitionId } } : {}),
        entities:{ version:1, entities:scene.battle.entities },
        score:0,
        tip:this.#screen === 'match' ? 'WASD to move · pointer to aim · hold primary fire' : 'Canonical Foundation runtime',
        debug:{ scene:this.#screen, render:scene.render.metrics, simulationHz:this.#lobby.battle.policy.simulationHz },
      });
    }
    this.#animation = requestAnimationFrame(this.frame);
  };

  private syncSceneMode(): void {
    if (this.#screen === 'match' && !this.#lobby.battle.playerTankId) this.#lobby.battle.setPlayerTank(PLAYER_TANK);
    if (this.#screen !== 'match' && this.#lobby.battle.playerTankId) this.#lobby.battle.setPlayerTank(null);
  }

  private renderBlackglass(now: number): void {
    const rect = this.#presenter.canvas.getBoundingClientRect();
    const center = { x:rect.left + rect.width/2, y:rect.top + rect.height/2 };
    const angle = Math.atan2(this.#pointerClient.y - center.y, this.#pointerClient.x - center.x);
    this.#blackglass.aimAt(Number.isFinite(angle) ? angle : 0);
    if (this.#pointerDown) this.#blackglass.fire(now / 1000);
    this.#presenter.draw(this.#blackglass.render(Math.trunc(now / 16.6667), now), { centerX:0, centerY:0, worldSpan:650 });
  }

  private sampleInputs(): void {
    if (this.#screen !== 'match') return;
    const move = normalizeStick({
      x:(this.#pressed.has('KeyD') ? 1 : 0) - (this.#pressed.has('KeyA') ? 1 : 0),
      y:(this.#pressed.has('KeyS') ? 1 : 0) - (this.#pressed.has('KeyW') ? 1 : 0),
    });
    this.#lobby.battle.issuePlayerCommand({ type:'move', vector:move }, 'keyboard');
    const player = this.#lobby.battle.snapshot().tanks.find((tank) => tank.id === this.#lobby.battle.playerTankId);
    if (player) {
      const pointer = this.#presenter.worldPoint(this.#pointerClient.x, this.#pointerClient.y, this.#view);
      this.#lobby.battle.issuePlayerCommand({ type:'aim', vector:normalizeStick({ x:pointer.x-player.position.x, y:pointer.y-player.position.y }) }, 'mouse');
    }
    this.#lobby.battle.issuePlayerCommand({ type:'fire', active:this.#pointerDown || this.#pressed.has('Space') }, 'mouse');
    this.#lobby.battle.issuePlayerCommand({ type:'ability', slot:0, active:this.#pressed.has('KeyE') }, 'keyboard');
    this.#lobby.battle.issuePlayerCommand({ type:'ultimate', active:this.#pressed.has('KeyQ') }, 'keyboard');
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => { this.#pressed.add(event.code); };
  private readonly onKeyUp = (event: KeyboardEvent): void => { this.#pressed.delete(event.code); };
  private readonly onPointerMove = (event: PointerEvent): void => { this.#pointerClient = { x:event.clientX, y:event.clientY }; };
  private readonly onPointerDown = (event: PointerEvent): void => { this.#pointerDown = event.button === 0; this.#pointerClient = { x:event.clientX, y:event.clientY }; };
  private readonly onPointerUp = (): void => { this.#pointerDown = false; };

  private installInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.#presenter.canvas.addEventListener('pointermove', this.onPointerMove);
    this.#presenter.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private removeInput(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.#presenter.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.#presenter.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
  }
}
