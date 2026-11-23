'use strict';
// Research-only #1081 natural-match census. Do not freeze a particular
// incidence rate as a golden, or infer player wins from tactical classification.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL = '1';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, withSeed, digest, physical } =
  require('../research/audio-rng-causal-pilot.cjs');
const SEEDS = [1517800, 1517802, 1517810];
const TICKS = 720;
function alive(t) { return !!t && t.alive !== false && (t.hp == null || t.hp > 0); }
function hostile(g,a,b) {
  if (!a || !b || a.id === b.id) return false;
  if (typeof g.areAllies === 'function' && g.areAllies(a,b)) return false;
  return typeof g.areHostile === 'function' ? !!g.areHostile(a,b) : true;
}
function visible(g,T,C,observer,t) {
  return alive(t) && T.canPerceive(g,C,observer,t) &&
    (!g.hasLineOfSight || g.hasLineOfSight(observer.x,observer.y,t.x,t.y,3));
}
function run(seed, observe) {
  return withSeed(seed, draws => {
    const g = bootGame();
    g.sfx.muted = true; g.sfx.startMusic = () => {};
    const T = g.__testFair, C = g.__testWindow.__novaMakeRequire('')('game/classes');
    const shots = new Map();
    const count = { activeTicks:0, observedShotEvents:0, witnessedCandidatePairs:0,
      eligibleFollowupPairs:0, classificationFlips:0, falseToTrue:0,
      trueToFalse:0, newlyVisiblePairs:0, matchedPrimaryPairs:0 };
    if (observe) {
      const old = g.tryFire;
      g.tryFire = function(shooter) {
        const before = (this.bullets || []).length;
        const out = old.apply(this, arguments);
        if ((this.bullets || []).length <= before || !shooter) return out;
        for (const observer of this.tanks || []) {
          if (!observer?.ai || !alive(observer) || observer.id === shooter.id ||
              observer.ai.__v181ObservedShotId !== shooter.id ||
              observer.ai.__v181ObservedShotAt !== this.time) continue;
          const victims = new Map();
          for (const victim of this.tanks || []) {
            if (!victim || victim.id === shooter.id || victim.id === observer.id ||
                !hostile(this,shooter,victim) ||
                !visible(this,T,C,observer,victim) ||
                (this.hasLineOfSight &&
                  !this.hasLineOfSight(shooter.x,shooter.y,victim.x,victim.y,3))) continue;
            victims.set(victim.id, {ref:victim,x:victim.x,y:victim.y});
          }
          shots.set(observer.id, {
            at:this.time, observerRef:observer, shooterRef:shooter, shooterId:shooter.id,
            angle:observer.ai.__v181ObservedShotAngle,
            sx:observer.ai.__v181ObservedShotX,
            sy:observer.ai.__v181ObservedShotY, victims
          });
          count.observedShotEvents++;
          count.witnessedCandidatePairs += victims.size;
        }
        return out;
      };
    }
    try {
      g.status = 'playing'; g.paused = false;
      for (let tick = 1; tick <= TICKS; tick++) {
        g.update(1/60);
        if (g.status !== 'playing') continue;
        count.activeTicks++;
        if (!observe || tick % 6) continue;
        for (const observer of g.tanks || []) {
          const shot = shots.get(observer?.id);
          if (!shot || shot.observerRef !== observer || !alive(observer) || !observer.ai) continue;
          const age = g.time-shot.at;
          if (age < 0 || age > 1.25 ||
              observer.ai.__v181ObservedShotAt !== shot.at ||
              observer.ai.__v181ObservedShotId !== shot.shooterId) continue;
          const shooter = g.getTank(shot.shooterId);
          if (shooter !== shot.shooterRef || !visible(g,T,C,observer,shooter)) continue;
          if (observer.ai.__v1112TargetId !== shooter.id) continue;
          for (const victim of g.tanks || []) {
            if (!victim || victim.id === shooter.id || victim.id === observer.id ||
                !hostile(g,shooter,victim) ||
                !visible(g,T,C,observer,victim) ||
                (g.hasLineOfSight &&
                  !g.hasLineOfSight(shooter.x,shooter.y,victim.x,victim.y,3)) ||
                Math.hypot(victim.x-shooter.x,victim.y-shooter.y) >= 430) continue;
            count.matchedPrimaryPairs++;
            const initial = shot.victims.get(victim.id);
            if (!initial || initial.ref !== victim) { count.newlyVisiblePairs++; continue; }
            count.eligibleFollowupPairs++;
            const dx0=initial.x-shot.sx, dy0=initial.y-shot.sy;
            const dx1=victim.x-shot.sx, dy1=victim.y-shot.sy;
            const cos0=Math.cos(shot.angle-Math.atan2(dy0,dx0));
            const cos1=Math.cos(shot.angle-Math.atan2(dy1,dx1));
            if ((cos0>.75)!==(cos1>.75)) {
              count.classificationFlips++;
              if (cos1>.75) count.falseToTrue++;
              else count.trueToFalse++;
            }
          }
        }
      }
      return {seed,physicalHash:digest(physical(g)),draws:draws(),
        status:g.status,counters:count};
    } finally { g.destroy(); }
  });
}
test('natural witnessed-shot geometry census preserves physical state and RNG', () => {
  const rows = [];
  for (const seed of SEEDS) {
    const control = run(seed,false), observed = run(seed,true);
    assert.equal(observed.physicalHash,control.physicalHash,
      'read-only witness instrumentation altered composed physical state');
    assert.equal(observed.draws,control.draws,
      'read-only witness instrumentation consumed gameplay RNG');
    assert.ok(observed.counters.activeTicks>0,'must observe active gameplay');
    assert.ok(observed.counters.classificationFlips <=
      observed.counters.eligibleFollowupPairs);
    rows.push({seed,status:observed.status,...observed.counters});
  }
  console.log('NOVA_BATTLE_SENSE_WITNESSED_MOVEMENT_NATURAL '+JSON.stringify(rows));
});
