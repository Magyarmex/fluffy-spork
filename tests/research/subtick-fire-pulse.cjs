'use strict';
// RESEARCH ONLY. Preserve one deliberate, aimed press/release pair that occurs
// entirely between simulation ticks. Not installed in the playable runtime.
// A trusted native PointerEvent timestamp is measured on the same monotonic
// performance clock as the queued release. An event delivered late must not
// become a fresh shot merely because its handler ran recently. Unknown event
// clocks remain unverified research input, never certified physical latency.
function physicalReleaseAt(e) {
  if (!e || e.isTrusted !== true) return null;
  // A trusted event with an unusable clock is NOT equivalent to an
  // unverified synthetic fixture. Fail closed rather than laundering it.
  return Number.isFinite(e.timeStamp) && e.timeStamp > 0 ? e.timeStamp : NaN;
}
function releaseIsFresh(p, now) {
  const queuedAge = now - p.queuedAt;
  const physicalAge = p.physicalAt === null ? null : now - p.physicalAt;
  const holdMs = p.physicalDownAt === null || p.physicalAt === null
    ? null : p.physicalAt - p.physicalDownAt;
  return (p.physicalDownAt === null) === (p.physicalAt === null) &&
    queuedAge >= 0 && queuedAge <= 50 &&
    (physicalAge === null || (physicalAge >= 0 && physicalAge <= 50)) &&
    (holdMs === null || (holdMs >= 0 && holdMs <= 50));
}
class SubtickFirePulse {
  constructor(game, timeline) {
    if (!game || !game.input || !timeline || timeline.input !== game.input ||
        typeof game.update !== 'function') throw Error('invalid pulse owner');
    this.game = game; this.timeline = timeline; this.input = game.input;
    this.down = null; this.pending = null; this.pulses = 0; this.canceled = 0;
    this.old = {pd:this.input.pd, pm:this.input.pm, pu:this.input.pu,
      update:game.update, reset:timeline.reset, releaseAll:timeline.releaseAll};
    const self = this, input = this.input;
    input.pd = function(e) {
      const samePending = self.pending && e &&
        (self.pending.type === 'mouse' ? e.pointerType === 'mouse' :
         e.pointerId === self.pending.id && e.pointerType === self.pending.type);
      // A new right-stick press supersedes a released, unsampled shot from
      // another pointer. The old pointer still owns Input.aim until release()
      // replays its deferred up, so inspect the same physical right-side
      // boundary as canonical Input.pd before processing the new down.
      // A left movement thumb or a UI button must NOT steal that shot.
      let newAimPress=false;
      if(self.pending&&e&&(e.pointerType==='touch'||e.pointerType==='pen')&&
         e.pointerId!==self.pending.id&&input.canvas&&
         Number.isFinite(e.clientX)&&!(e.target?.closest?.('[data-ui]'))){
        const rect=input.canvas.getBoundingClientRect();
        newAimPress=Number.isFinite(rect.left)&&rect.width>0&&
         e.clientX-rect.left>=rect.width*.45;
      }
      if (samePending||newAimPress) self.release();
      const priorAimId = input.stickId && input.stickId.aim;
      const priorFire = input.firing;
      const out = self.old.pd.call(this,e);
      if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('[data-ui]')) return out;
      if (e && e.pointerType === 'mouse') {
        if (e.button === 0 && !priorFire && input.firing && !input.touchSeen)
          self.down = {type:'mouse', id:e.pointerId, player:self.game.player, sampled:false,physicalDownAt:physicalReleaseAt(e)};
      } else if (e && input.stickId && input.stickId.aim === e.pointerId &&
                 input.aim.active && priorAimId !== e.pointerId) self.down = {type:e.pointerType, id:e.pointerId, player:self.game.player, sampled:false,physicalDownAt:physicalReleaseAt(e)};
      return out;
    };
    input.pm = function(e) {
      if (self.pending && e && (self.pending.type === 'mouse' ? e.pointerType === 'mouse' :
        e.pointerId === self.pending.id && e.pointerType === self.pending.type)) self.release();
      // With a secondary button held, Pointer Events report the primary-button
      // release as a pointermove(buttons=2) BEFORE native mouseup. The existing
      // Input.pm clears firing there. Preserve the deliberate short primary
      // press until one simulation tick instead of losing it to event order.
      if (self.down && !self.down.sampled && self.down.type === 'mouse' && e && e.pointerType === 'mouse' &&
          typeof e.buttons === 'number' && !(e.buttons & 1) && input.firing &&
          self.game.status === 'playing' && !self.game.paused && !input.__novaInputPaused) {
        self.pending = {event:{type:'pointerup',pointerType:'mouse',button:0,buttons:0,
          pointerId:self.down.id,__novaOriginalAt:e.__novaOriginalAt,
          __novaTimestampTrusted:e.__novaTimestampTrusted},type:'mouse',id:self.down.id,
          player:self.down.player,queuedAt:performance.now(),
          physicalAt:physicalReleaseAt(e),
          physicalDownAt:self.down.physicalDownAt};
        self.down = null;
        return; // The later native mouseup/pointerup is also suppressed.
      }
      return self.old.pm.call(this,e);
    };
    input.pu = function(e) {
      if (!e) return self.old.pu.call(this,e);
      const cancel = e.type === 'pointercancel';
      if (cancel) {
        const same = self.down && (self.down.type === 'mouse' ? e.pointerType === 'mouse' : self.down.id === e.pointerId);
        const pending = self.pending && (self.pending.type === 'mouse' ? e.pointerType === 'mouse' :
          self.pending.id === e.pointerId && self.pending.type === e.pointerType);
        if (pending) self.release(); if (same) self.down = null;
        self.canceled++; return self.old.pu.call(this,e);
      }
      if (self.pending && (self.pending.type === 'mouse' ? e.pointerType === 'mouse' :
          self.pending.id === e.pointerId && self.pending.type === e.pointerType))
        return; // Native mouseup + compatibility pointerup may both arrive.
      const down = self.down;
      const same = down && (down.type === 'mouse' ? e.pointerType === 'mouse' :
        e.pointerId === down.id && e.pointerType === down.type);
      const aimValid = down && (down.type === 'mouse' ? input.mouseActive && input.firing :
        input.aim.active && Math.hypot(input.aim.dx,input.aim.dy) >= 9);
      if (same && !down.sampled && aimValid && self.game.status === 'playing' && !self.game.paused &&
          !input.__novaInputPaused && !(self.game.__testWindow && self.game.__testWindow.document.hidden)) {
        self.pending = {event:e, type:down.type, id:down.id, player:down.player,queuedAt:performance.now(),
          physicalAt:physicalReleaseAt(e),
          physicalDownAt:down.physicalDownAt}; self.down = null;
        return; // Hold only through the immediately following Game.update.
      }
      if (same) self.down = null;
      return self.old.pu.call(this,e);
    };
    game.update = function() {
      // A queued shot belongs to the life that began the press. Redeploying
      // before the next simulation tick must never fire the replacement tank.
      if (self.pending) {
        const p=self.pending,now=performance.now();
        // The raw pulse helper must be safe on its own, not only when
        // wrapped by ExplicitShotIntent. Never replay a stale/dead release.
        if(p.player!==game.player||p.player?.alive!==true||!releaseIsFresh(p,now))
          self.release();
      }
      if (self.down && (self.down.player !== game.player || self.down.player?.alive !== true)) {
        // A held press from a dead/replaced life must not keep firing or
        // commanding the new life while waiting for a later physical release.
        const down=self.down; self.down=null;
        self.old.pu.call(input,{type:'pointercancel',pointerType:down.type,
          pointerId:down.id,button:0,buttons:0});
        // Core Input.pu clears mouse firing but deliberately retains mouse aim.
        // A replaced life must not inherit that old pointer aim ownership.
        if (down.type === 'mouse') input.mouseActive = false;
      }
      const canPlay = game.status === 'playing' && game.player?.alive === true &&
        !game.paused && !input.__novaInputPaused &&
        !(game.__testWindow && game.__testWindow.document.hidden);
      if (!canPlay) {
        self.release();
        // Death, pause and hidden/disabled input must not orphan a held
        // physical control before the next player life begins.
        if (self.down) {
          const down=self.down; self.down=null;
          self.old.pu.call(input,{type:'pointercancel',pointerType:down.type,
            pointerId:down.id,button:0,buttons:0});
          if (down.type === 'mouse') input.mouseActive = false;
        }
      }
      // Capture the actual physical firing state entering the Game tick,
      // before any update owner can change input or replace the player.
      // A centered touch is not an aimed-firing sample.
      const sampledOwner=canPlay?self.down:null,aim=input.aim;
      const sampledAim=!!sampledOwner&&(sampledOwner.type==='mouse'
        ? !!input.mouseActive&&!!input.firing
        : input.stickId?.aim===sampledOwner.id&&!!aim?.active&&!!input.firing&&
          Math.hypot(aim.dx||0,aim.dy||0)>=9);
      try { return self.old.update.apply(this,arguments); }
      finally {
        if (canPlay && self.pending) self.pulses++;
        self.release();
        // Do not mark a different press sampled if a lifecycle callback
        // replaced the owner while Game.update was executing.
        if (canPlay && self.down) {
          if(self.down===sampledOwner&&sampledAim)self.down.sampled=true;
        } else self.down = null;
      }
    };
    timeline.releaseAll = function() { self.release(); self.down = null; self.canceled++; return self.old.releaseAll.apply(this,arguments); };
    timeline.reset = function() { self.release(); self.down = null; return self.old.reset.apply(this,arguments); };
  }
  release() {
    if (!this.pending) return;
    const p = this.pending; this.pending = null;
    this.old.pu.call(this.input,p.event);
  }
  detach() {
    this.release(); this.down = null;
    this.input.pd = this.old.pd; this.input.pm = this.old.pm; this.input.pu = this.old.pu;
    this.game.update = this.old.update; this.timeline.reset = this.old.reset;
    this.timeline.releaseAll = this.old.releaseAll;
  }
}
module.exports = {SubtickFirePulse};
