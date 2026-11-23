'use strict';
// Composed 49-overlay Game: strategic route pricing must not mutate a live
// movement route when the exact-goal route has already been certified.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByRole('button', { name: /DEPLOY/i }).first().waitFor({ timeout: 45000 });
    const result = await page.evaluate(() => {
      const Game = window.__novaMakeRequire('')('game/engine').Game;
      const choose = window.__NOVA_BATTLE_SENSE_TEST__?.routeDistance;
      const classes = window.__novaMakeRequire('')('game/classes');
      if (typeof choose !== 'function' ||
          typeof Game.prototype.novaReadOnlyExactRouteLength !== 'function' ||
          typeof Game.prototype.novaBattlefieldWaypoint !== 'function')
        throw Error('missing composed Battle Sense / Terrain Intelligence');
      const g = new Game();
      const t = { id: 7, cls: 'guard', x: 0, y: 0 };
      const p = { id: 'heal', x: 100, y: 0 };
      const calls = [];
      g.hasLineOfSight = () => false;
      g.isTerrainSafe = () => true;
      g.novaReadOnlyExactRouteLength = (...args) => {
        calls.push({ kind: 'certificate', args }); return 150;
      };
      g.novaBattlefieldWaypoint = () => {
        calls.push({ kind: 'live-waypoint' }); return { x: 30, y: 30 };
      };
      g.novaRouteLength = () => {
        calls.push({ kind: 'live-length' }); return 180;
      };
      const live = { gx: 900, gy: 900, index: 0, points: [{ x: 20, y: 20 }] };
      g.__v1102Routes = { '7:23': live };
      const cost = choose(g, t, p, 100, classes);
      if (cost !== 150 || calls.length !== 1 ||
          calls[0].kind !== 'certificate' || g.__v1102Routes['7:23'] !== live)
        throw Error('composed strategic route mutated live route: ' +
          JSON.stringify({ cost, calls }));
      return { cost, calls: calls.map(c => c.kind), liveRouteIntact: true };
    });
    if (errors.length) throw Error('browser errors: ' + JSON.stringify(errors));
    console.log('READONLY_EXACT_ROUTE_COMPOSED ' + JSON.stringify(result));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
