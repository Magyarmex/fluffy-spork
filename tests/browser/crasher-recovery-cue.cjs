'use strict';
// Real shipping Chromium render acceptance for the Crasher's actionable
// recovery cue. This invokes the composed gameplay renderer, not a mock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const results = [];
  try {
    for (const viewport of [{ width: 320, height: 568 },
      { width: 568, height: 320 }]) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.stack || e)));
      try {
        await page.goto('http://127.0.0.1:8765/', {
          waitUntil: 'domcontentloaded', timeout: 45000
        });
        await page.getByRole('button', { name: /DEPLOY/i }).first()
          .waitFor({ state: 'visible', timeout: 45000 });
        await page.evaluate(() => {
          const Game = window.__novaMakeRequire('')('game/engine').Game;
          const old = Game.prototype.update;
          Game.prototype.update = function() {
            if (!this.__novaDecorativeWorld) window.__novaRecoveryGame = this;
            return old.apply(this, arguments);
          };
        });
        await page.getByRole('button', { name: /DEPLOY/i }).first().click();
        await page.waitForFunction(() =>
          window.__novaRecoveryGame?.status === 'playing' &&
          !!window.__novaRecoveryGame.__lfState, null, { timeout: 30000 });
        const sample = await page.evaluate(() => {
          const g = window.__novaRecoveryGame;
          const renderer = window.__novaMakeRequire('')('game/render');
          if (!g?.player || !renderer?.render || !g.ctx)
            throw Error('materialized gameplay renderer unavailable');
          g.setPaused(true);
          const oldIds = new Set(g.shapes.map(s => s?.id));
          g.spawnShape('crasher', true);
          const cr = g.shapes.find(s => s?.type === 'crasher' &&
            !oldIds.has(s.id));
          if (!cr) throw Error('canonical Crasher spawn unavailable');
          cr.x = g.cam.x; cr.y = g.cam.y;
          cr.hp = Math.max(cr.hp, 95); cr.__lfBounty = 0;
          const original = CanvasRenderingContext2D.prototype.arc;
          const captures = [];
          CanvasRenderingContext2D.prototype.arc = function(x, y, r, a, b) {
            if (this === g.ctx &&
              (Math.abs(a - Math.PI * .18) < 1e-6 ||
               Math.abs(a - Math.PI * 1.18) < 1e-6) &&
              (Math.abs(b - Math.PI * .78) < 1e-6 ||
               Math.abs(b - Math.PI * 1.78) < 1e-6))
              captures.push({ x, y, r, a, b });
            return original.apply(this, arguments);
          };
          const snapshots = {};
          try {
            for (const phase of ['track', 'telegraph', 'charge',
              'overshoot', 'recover']) {
              captures.length = 0;
              cr.__lfPredatorState = phase;
              cr.__lfPredatorT = .4;
              renderer.render(g, g.w, g.h);
              snapshots[phase] = captures.slice();
            }
          } finally {
            CanvasRenderingContext2D.prototype.arc = original;
          }
          return { snapshots, width: g.w, height: g.h,
            canvasWidth: g.ctx.canvas.width,
            canvasHeight: g.ctx.canvas.height,
            recovered: cr.__lfPredatorState };
        });
        assert.equal(sample.snapshots.recover.length, 2,
          'real composed renderer must draw two recovery brackets: ' +
          JSON.stringify(sample));
        for (const phase of ['track', 'telegraph', 'charge', 'overshoot'])
          assert.equal(sample.snapshots[phase].length, 0,
            'recovery cue must be phase-specific: ' + phase);
        assert.ok(sample.snapshots.recover.every(a =>
          a.r >= 6 && a.r <= 60 &&
          a.x >= 0 && a.x <= sample.width &&
          a.y >= 0 && a.y <= sample.height),
          'brackets must remain local to the visible Crasher: ' +
          JSON.stringify(sample));
        const dir = path.join('artifacts', 'browser');
        fs.mkdirSync(dir, { recursive: true });
        // Capture the real gameplay canvas separately: the pause modal
        // intentionally obscures a normal full-page screenshot.
        const dataUrl = await page.evaluate(() =>
          window.__novaRecoveryGame.ctx.canvas.toDataURL('image/png'));
        assert.match(dataUrl, /^data:image\/png;base64,/);
        fs.writeFileSync(path.join(dir,
          'crasher-recovery-canvas-' + viewport.width + 'x' + viewport.height + '.png'),
          Buffer.from(dataUrl.split(',')[1], 'base64'));
        await page.screenshot({ path: path.join(dir,
          'crasher-recovery-' + viewport.width + 'x' + viewport.height + '.png') });
        assert.deepEqual(errors, [], 'no Chromium runtime errors');
        results.push({ viewport, sample });
      } finally {
        await page.close();
      }
    }
    console.log('NOVA_CRASHER_RECOVERY_CUE ' + JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
