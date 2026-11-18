'use strict';
// Research-only composed-game witness for #1025. Characterizes a known
// information leak; it does not assert that the behavior is desirable.
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:8765/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.getByRole('button', { name: /DEPLOY/i }).first().waitFor({ timeout: 45000 });
    await page.evaluate(() => {
      const Game = window.__novaMakeRequire('')('game/engine').Game;
      const old = Game.prototype.update;
      Game.prototype.update = function() {
        if (!this.__novaDecorativeWorld) window.__novaSaturationResearchGame = this;
        return old.apply(this, arguments);
      };
    });
    await page.getByRole('button', { name: /DEPLOY/i }).first().click();
    await page.waitForFunction(() => window.__novaSaturationResearchGame?.status === 'playing', { timeout: 30000 });
    const report = await page.evaluate(() => {
      const g = window.__novaSaturationResearchGame;
      g.setPaused(true);
      const ai = window.__novaMakeRequire('')('game/ai');
      const T = window.__NOVA_FAIR_ENGAGEMENT_TEST__;
      if (!ai?.updateAI || !T?.chooseTarget) throw Error('shipping Fair Engagement AI/test owner unavailable');
      const bots = g.tanks.filter(t => t && t.ai && !t.isPlayer);
      if (bots.length < 4) throw Error('need four real composed AI tanks');
      const [observer, a, b, hidden] = bots;
      const original = { tanks: g.tanks, powerups: g.powerups, bullets: g.bullets,
        w: g.w, h: g.h, time: g.time, player: g.player };
      const saved = [observer, a, b, hidden].map(t => ({ tank: t, state: { ...t }, ai: t.ai }));
      try {
        Object.assign(observer, { x: 0, y: 0, hp: 100, maxHp: 100, alive: true, spawnShieldT: 0 });
        Object.assign(a, { x: 120, y: 0, hp: 100, maxHp: 100, alive: true, spawnShieldT: 0 });
        Object.assign(b, { x: -120, y: 0, hp: 100, maxHp: 100, alive: true, spawnShieldT: 0 });
        Object.assign(hidden, { x: 2000, y: 2000, hp: 100, maxHp: 100, alive: true, spawnShieldT: 0 });
        // Keep the actual Game hostility authority. This is a default FFA fixture.
        if (typeof g.areAllies === 'function' && (g.areAllies(observer, a) || g.areAllies(observer, b)))
          throw Error('selected bots are allied; cannot use FFA fixture');
        g.tanks = [observer, a, b, hidden];
        g.powerups = []; g.bullets = []; g.w = 1000; g.h = 700; g.time = 10;
        const C = window.__novaMakeRequire('')('game/classes');
        const arms = [];
        for (const id of [a.id, b.id]) {
          observer.ai = { ...saved[0].ai, state: 'hunt', targetId: -1,
            __v1112TargetId: -1, __v1105TargetId: -1, __v180TargetId: -1,
            __v1112NextThink: 0 };
          a.ai = { ...saved[1].ai, state: 'wander', targetId: -1,
            __v1112TargetId: -1, __v1105TargetId: -1, __v180TargetId: -1 };
          b.ai = { ...saved[2].ai, state: 'wander', targetId: -1,
            __v1112TargetId: -1, __v1105TargetId: -1, __v180TargetId: -1 };
          hidden.ai = { ...saved[3].ai, state: 'hunt', targetId: id,
            __v1112TargetId: id, __v1105TargetId: id, __v180TargetId: id };
          const direct = T.chooseTarget(g, C, observer, observer.ai, g.time)?.id;
          ai.updateAI(observer, g, 1/60);
          const composed = observer.ai.__v1112TargetId;
          if (composed !== direct) throw Error('composed AI disagrees with Fair Engagement direct choice: '+JSON.stringify({direct,composed}));
          arms.push({ hiddenPrivateTarget: id, direct, composed });
        }
        if (![a.id, b.id].includes(arms[0].composed) || ![a.id, b.id].includes(arms[1].composed))
          throw Error('chosen target outside visible alternatives: '+JSON.stringify(arms));
        /* Diagnostic, not a regression that enshrines the known information leak.
         * A future fair fix should make leakObserved false without breaking CI. */
        return { arms, leakObserved: arms[0].composed !== arms[1].composed,
          hiddenDistance: Math.hypot(hidden.x-observer.x,hidden.y-observer.y),
          observerViewport: [g.w, g.h], originalTankCount: original.tanks.length,
          shippingAI: !!ai.updateAI.__novaFairEngagement };
      } finally {
        for (const { tank, state, ai: originalAI } of saved) {
          Object.assign(tank, state); tank.ai = originalAI;
        }
        Object.assign(g, original);
      }
    });
    if (errors.length) throw Error('browser errors: '+JSON.stringify(errors));
    console.log('NOVA_FAIR_SATURATION_HIDDEN_INTENT_COMPOSED '+JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
