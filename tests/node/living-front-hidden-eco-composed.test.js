'use strict';
// Research-only #1029: exercise the *materialized 49-overlay Game* and its
// installed Living Front strategy export. A controlled public signal and
// spatial arrangement isolate hidden private AI ecology commitments.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, withSeed } = require('../research/audio-rng-causal-pilot.cjs');

test('composed Living Front strategy changes a public BLOOM decision on hidden intent alone', () => {
  withSeed(1517800, () => {
    const g = bootGame();
    try {
      const T = g.__testWindow.__NOVA_LIVING_FRONT_TEST__;
      assert.ok(T && typeof T.publicEcoBias === 'function',
        'actual materialized director must own the tested strategy');
      const bots = g.tanks.filter(t => t && t.ai && !t.isPlayer);
      assert.ok(bots.length >= 4, 'need canonical observer and three hidden bots');
      const [observer, ...hidden] = bots.slice(0, 4);
      const sector = T.sectorIndex(100, -400);
      const center = T.sectorCenter(sector);
      assert.notEqual(T.sectorIndex(-400, -400), sector,
        'public signal must be outside observer sector');
      Object.assign(observer, { x: -400, y: -400, hp: 100,
        maxHp: 100, alive: true, spawnShieldT: 0, cls: 'twin' });
      observer.ai.__v1112TargetId = -1;
      for (let i = 0; i < hidden.length; i++) {
        const q = hidden[i];
        Object.assign(q, { x: 2000 + i * 30, y: 2000, hp: 100,
          maxHp: 100, alive: true, spawnShieldT: 0 });
        q.ai.__lfEcoKey = 'none';
        q.ai.__lfEcoWeight = .25;
      }
      g.tanks = [observer, ...hidden];
      g.tankById = new Map(g.tanks.map(t => [t.id, t]));
      g.time = 10;
      g.status = 'playing';
      g.paused = false;
      g.__lfState = g.__lfState || {};
      g.__lfState.directorEnabled = true;
      g.__lfState.signal = { type: 'BLOOM', sector,
        x: center.x, y: center.y, started: 9, until: 20 };
      g.__lfState.queryScratch = g.__lfState.queryScratch || [];
      g.__lfState.queryScratch2 = g.__lfState.queryScratch2 || [];
      // Remove terrain as an experimental confounder, not from production.
      g.hasLineOfSight = () => true;
      const sample = () => T.publicEcoBias(g, observer, {}, {});
      const baseline = sample();
      assert.equal(baseline.mode, 'signal',
        'public BLOOM must be a valid candidate in the control arm');
      const publicBefore = JSON.stringify({
        positions: g.tanks.map(t => [t.id, t.x, t.y, t.hp]),
        signal: g.__lfState.signal
      });
      for (const q of hidden) q.ai.__lfEcoKey = 'BLOOM:' + sector;
      const counterfactual = sample();
      assert.notEqual(counterfactual.mode, 'signal',
        'offscreen private commitments alone vetoed the same public opportunity');
      assert.notEqual(counterfactual.key, 'BLOOM:' + sector,
        'public BLOOM must no longer own the strategic decision');
      assert.equal(JSON.stringify({
        positions: g.tanks.map(t => [t.id, t.x, t.y, t.hp]),
        signal: g.__lfState.signal
      }), publicBefore, 'public state changed during private-intent counterfactual');
      console.log('NOVA_LIVING_FRONT_HIDDEN_ECO_COMPOSED ' + JSON.stringify({
        sector, baseline: baseline.mode, privateCrowd: counterfactual.mode,
        hiddenDistance: Math.hypot(hidden[0].x - observer.x,
          hidden[0].y - observer.y)
      }));
    } finally { g.destroy(); }
  });
});
