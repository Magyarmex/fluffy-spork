'use strict';
// RESEARCH ONLY. Preserve one deliberate, aimed press/release pair that occurs
// entirely between simulation ticks. Not installed in the playable runtime.
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
      if (samePending) self.release();
      const priorAimId = input.stickId && input.stickId.aim;
      const priorFire = input.firing;
      const out = self.old.pd.call(this,e);
      if (e && e.target && typeof e.target.closest === 'function' && e.target.closest('[data-ui]')) return out;
      if (e && e.pointerType === 'mouse') {
        if (e.button === 0 && !priorFire && input.firing && !input.touchSeen)
          self.down = {type:'mouse', id:e.pointerId};
      } else if (e && input.stickId && input.stickId.aim === e.pointerId &&
                 input.aim.active && priorAimId !== e.pointerId) self.down = {type:e.pointerType, id:e.pointerId};
      return out;
    };
    input.pm = function(e) {
      if (self.pending && e && (self.pending.type === 'mouse' ? e.pointerType === 'mouse' :
        e.pointerId === self.pending.id && e.pointerType === self.pending.type)) self.release();
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
      if (same && aimValid && self.game.status === 'playing' && !self.game.paused &&
          !input.__novaInputPaused && !(self.game.__testWindow && self.game.__testWindow.document.hidden)) {
        self.pending = {event:e, type:down.type, id:down.id}; self.down = null;
        return; // Hold only through the immediately following Game.update.
      }
      if (same) self.down = null;
      return self.old.pu.call(this,e);
    };
    game.update = function() {
      const canPlay = game.status === 'playing' && !game.paused && !input.__novaInputPaused &&
        !(game.__testWindow && game.__testWindow.document.hidden);
      if (!canPlay) self.release();
      try { return self.old.update.apply(this,arguments); }
      finally { if (canPlay && self.pending) self.pulses++; self.release(); self.down = null; }
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
