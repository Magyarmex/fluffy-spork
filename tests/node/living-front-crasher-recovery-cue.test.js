'use strict';
// Recovery is the Crasher's punish window. Test the actual shipping render
// overlay rather than a screenshot or a duplicate drawing implementation.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const file = 'living-front-instincts-v1.12.0.js';
const source = fs.readFileSync(path.join(root, 'nova-updates', file), 'utf8');

function renderPhase(phase, opts = {}) {
  const arcs = [], strokes = [], intents = [], saves = [], moves = [];
  const ctx = {
    globalAlpha: 1, lineWidth: 1,
    save() { saves.push('save'); },
    restore() { saves.push('restore'); },
    setTransform() {}, beginPath() {}, moveTo(...args) { moves.push(args); }, lineTo() {},
    setLineDash() {}, fill() {},
    arc(...args) { arcs.push(args); },
    stroke() { strokes.push({ alpha: this.globalAlpha, width: this.lineWidth }); }
  };
  const render = { render() {} };
  const LF = {
    clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
    lerp: (a, b, t) => a + (b - a) * t,
    d2: (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2,
    alive: x => !!x && x.hp > 0,
    query: () => [], speed: () => 105, xp: () => 10,
    sectorIndex: () => 0, sectorCenter: () => ({ x: 0, y: 0 }),
    neighbors: () => [], TAU: Math.PI * 2, ARENA: 2250,
    BOUNTY_CAP: 100, BEHAVIOR_PERIOD: .12,
    wrap(name, fn) { if (name === 'game/render') fn(render); }
  };
  const window = {
    __NOVA_LIVING_FRONT_INTERNAL__: LF, __novaModules: {},
    NOVAVisuals: { registerMany(items) { intents.push(...items); } }
  };
  vm.runInNewContext(source, { window, Math,
    console: { info() {}, warn() {}, error() {} } }, { filename: file });
  const shape = { type: 'crasher', kind: 'shape', id: 1,
    x: opts.offscreen ? 5000 : 0, y: 0, r: 15, hp: 95,
    vx: 0, vy: 0, __lfPredatorState: phase, __lfPredatorT: opts.timer ?? .4 };
  const g = { ctx, dpr: 1, w: 800, h: 600,
    cam: { x: 0, y: 0, zoom: 1 }, time: 10,
    __lfState: {}, shapes: [shape] };
  render.render(g, 800, 600);
  return { arcs, strokes, intents, saves, moves };
}

test('recovery has a small, world-space punish cue, absent in other phases', () => {
  const recovering = renderPhase('recover');
  assert.equal(recovering.arcs.length, 2, 'two small hull brackets, not a full-screen ring');
  assert.equal(recovering.moves.length, 1,
    'second bracket must begin a new subpath, never draw a connector through the hull');
  assert.equal(recovering.strokes.length, 1);
  assert.ok(recovering.strokes[0].alpha > .10 &&
    recovering.strokes[0].alpha < .40);
  for (const phase of ['track', 'telegraph', 'charge', 'overshoot']) {
    assert.equal(renderPhase(phase).arcs.length, 0,
      'recovery cue must not obscure other attack phases: ' + phase);
  }
});

test('recovery cue fades toward the end of the vulnerability window', () => {
  const early = renderPhase('recover', { timer: .65 });
  const late = renderPhase('recover', { timer: .03 });
  assert.ok(early.strokes[0].alpha > late.strokes[0].alpha);
  assert.ok(late.strokes[0].alpha > 0);
});

test('offscreen Crashers never emit recovery geometry', () => {
  assert.equal(renderPhase('recover', { offscreen: true }).arcs.length, 0);
});

test('recovery cue declares a specific player decision and keeps materialized ownership', () => {
  const result = renderPhase('recover');
  const cue = result.intents.find(x => x.id === 'living-front-crasher-recovery');
  assert.ok(cue, 'register actionable recovery intent');
  assert.equal(cue.intent, 'state');
  assert.equal(cue.channel, 'world');
  assert.match(cue.question, /punish/i);
  assert.match(source, /NOVA_VISUAL_INTENT:/);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(html.split('src="./nova-updates/' + file + '"').length - 1, 1);
});

test('existing Crasher Fieldcraft tip explains terrain bait and the punish cue', () => {
  const director = fs.readFileSync(path.join(root, 'nova-updates',
    'living-front-director-v1.12.0.js'), 'utf8');
  const start = director.indexOf('var TIP_DEFS=[');
  const end = director.indexOf('var TIPS=', start);
  assert.ok(start >= 0 && end > start);
  const tips = director.slice(start, end);
  const crasher = tips.match(/\{id:'living-front-crasher-bounty',text:'([^']+)'/);
  assert.ok(crasher, 'reuse the existing Crasher tip, not another tip slot');
  assert.match(crasher[1],/bonus XP/);
  assert.match(crasher[1],/Bait its charge into cover/);
  assert.match(crasher[1],/recovery brackets fade/);
  assert.equal((tips.match(/\{id:'living-front-/g) || []).length, 7,
    'retain the seven-tip Fieldcraft shuffle bag');
});
