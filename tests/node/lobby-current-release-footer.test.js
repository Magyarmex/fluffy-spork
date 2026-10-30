const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

async function boot({ offline = false } = {}) {
  const listeners = {};
  const observers = [];
  const frames = [];
  let footerWrites = 0;
  let footerText = 'NOVA TANKS v1.7.0 · OLD';
  const cls = () => ({ add(){}, remove(){}, toggle(){}, contains(){ return false; } });
  const footer = { children: [], classList: cls(), dataset: {} };
  Object.defineProperty(footer, 'textContent', {
    get(){ return footerText; },
    set(value){ footerWrites++; footerText = value; },
  });
  const shell = { classList: cls(), querySelectorAll(){ return []; } };
  const hero = { classList: cls(), dataset: {}, parentElement: shell,
    querySelector(selector){ return selector === 'p' ? tagline : null; } };
  const tagline = { textContent: '' };
  const title = { parentElement: hero };
  const menu = {
    dataset: {}, classList: cls(), isConnected: true, scrollTop: 0,
    querySelector(selector){
      if(selector === 'h1') return title;
      if(selector === '[data-nova-slot="footer"]') return footer;
      return null;
    },
    querySelectorAll(selector){ return selector === 'div' ? [footer] : []; },
  };
  shell.parentElement = menu;
  const root = {};
  const document = {
    readyState: 'loading',
    head: { appendChild(){} },
    createElement(){ return { id: '', textContent: '' }; },
    getElementById(id){ return id === 'root' ? root : null; },
    querySelector(selector){ return selector === '#root .menu-grid-bg' ? menu : null; },
    addEventListener(type, handler){ (listeners[type] ||= []).push(handler); },
  };
  const window = {
    innerHeight: 568, innerWidth: 320, devicePixelRatio: 2,
    addEventListener(){},
  };
  const context = {
    window, document,
    navigator: { onLine: !offline, serviceWorker: null, maxTouchPoints: 5 },
    console: { warn(){}, info(){}, error(){} },
    fetch: offline ? () => Promise.reject(new Error('offline')) :
      () => Promise.resolve({ json: () => Promise.resolve(JSON.parse(read('nova-updates/releases.json'))) }),
    MutationObserver: class {
      constructor(callback){ observers.push(callback); }
      observe(){}
    },
    requestAnimationFrame(callback){ frames.push(callback); },
    setTimeout(){ return 1; }, clearTimeout(){},
    setInterval(){ return 1; }, clearInterval(){},
  };
  vm.runInNewContext(read('nova-updates/lobby-history.js'), context, { filename: 'lobby-history.js' });
  vm.runInNewContext(read('nova-updates/menu-debug-motion-v1.7.8.js'), context, {
    filename: 'menu-debug-motion-v1.7.8.js',
  });
  for(const handler of listeners.DOMContentLoaded || []) handler();
  for(let i = 0; i < 6; i++) await Promise.resolve();
  function flush(){
    let count = 0;
    while(frames.length && count++ < 50) frames.shift()();
    assert.ok(count < 50, 'animation-frame callbacks must converge');
  }
  flush();
  return {
    window, footer, menu, flush,
    get writes(){ return footerWrites; },
    notify(){ for(const observer of observers) observer(); this.flush(); },
  };
}

test('actual lobby-history + Signal Flow composition displays the current release, not its menu module', async () => {
  const app = await boot();
  assert.equal(app.window.NOVALobby.version, '1.12.0');
  assert.equal(app.footer.textContent,
    'NOVA TANKS v1.12.0 · SIGNAL FLOW · EVOLVE · ADAPT · ASCEND');
  assert.equal(app.window.NOVAMenuExperience.version, '1.7.8',
    'menu module keeps its historical provenance');

  const writes = app.writes;
  for(let i = 0; i < 5; i++){
    app.notify();
    app.window.NOVALobby.refresh();
    app.window.NOVAMenuExperience.refresh();
  }
  assert.equal(app.footer.textContent,
    'NOVA TANKS v1.12.0 · SIGNAL FLOW · EVOLVE · ADAPT · ASCEND');
  assert.equal(app.writes, writes,
    'MutationObserver/refresh cycles must not rewrite an unchanged footer');
});

test('new registered releases update the footer without changing the menu module identity', async () => {
  const app = await boot();
  app.window.__NOVA_FUTURE_RELEASE__ = {
    version: '1.13.0', codename: 'Future Test', groups: {},
  };
  app.window.NOVALobby.refresh();
  app.window.NOVAMenuExperience.refresh();
  assert.equal(app.window.NOVALobby.version, '1.13.0');
  assert.match(app.footer.textContent, /^NOVA TANKS v1\.13\.0 · SIGNAL FLOW/);
  assert.equal(app.window.__NOVA_MENU_EXPERIENCE_RELEASE__.version, '1.7.8');
});

test('missing release metadata fails to a registered release rather than an empty or undefined footer', async () => {
  const app = await boot({ offline: true });
  assert.equal(app.window.NOVALobby.version, '1.7.8');
  assert.match(app.footer.textContent, /^NOVA TANKS v1\.7\.8 · SIGNAL FLOW/);
  app.notify();
  assert.match(app.footer.textContent, /^NOVA TANKS v1\.7\.8 · SIGNAL FLOW/);
});
