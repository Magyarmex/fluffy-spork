'use strict';
// RESEARCH ONLY: the real composed Input receives chronological browser-shaped
// events, and the real Game receives canonical 1/60 simulation updates.
// This is NOT installed in production or the game's requestAnimationFrame loop.
const STEP = 1 / 60;
const EPS = 1e-9;
class ChronologicalInput {
  constructor(input, limit = 128) {
    if (!input || !Number.isInteger(limit) || limit < 2) throw Error('invalid input timeline');
    this.input = input; this.limit = limit; this.events = []; this.index = 0;
    this.last = -Infinity; this.sampled = -Infinity; this.tickOrigin = 0; this.quarantined = false;
    this.overflowCount = 0; this.applied = 0;
  }
  releaseAll() {
    if (typeof this.input.__novaBlurReset === 'function') this.input.__novaBlurReset();
    else {
      this.input.firing = false; this.input.abilityQueued = false;
      for (const key of Object.keys(this.input.keyboard || {})) this.input.keyboard[key] = false;
      for (const stick of ['move', 'aim']) {
        if (this.input[stick]) Object.assign(this.input[stick], {active:false, dx:0, dy:0});
        if (this.input.stickId) this.input.stickId[stick] = -1;
      }
    }
  }
  reset({quarantine = false} = {}) {
    this.events.length = 0; this.index = 0; this.releaseAll();
    this.quarantined = quarantine;
  }
  push(at, kind, data = {}) {
    if (!Number.isFinite(at) || at < this.last - EPS || at < this.sampled - EPS ||
        !data || typeof data !== 'object') throw Error('invalid chronological input');
    this.last = at;
    if (this.quarantined) {
      // An overflow must never resurrect held fire or movement. Explicit
      // release/cancel/blur can clear the quarantine for fresh input.
      if (kind === 'pointerup' || kind === 'pointercancel' || kind === 'keyup' || kind === 'blur') {
        this.releaseAll(); this.quarantined = false;
      }
      return false;
    }
    if (this.index > 0) { this.events.splice(0, this.index); this.index = 0; }
    if (kind === 'pointermove' && this.events.length >= this.limit - 1) {
      // A superseded continuous sample can be dropped, but never a discrete
      // press/release/ability edge. Preserve chronological order after removal.
      for (let i = this.events.length - 1; i >= 0; i--) {
        const e = this.events[i];
        if (e.data.pointerId !== data.pointerId) continue;
        // Only coalesce within the SAME simulation tick. Replacing a
        // movement sample from an earlier tick changes actual gameplay.
        if (Math.floor((e.at - this.tickOrigin + EPS) / STEP) !==
            Math.floor((at - this.tickOrigin + EPS) / STEP)) break;
        if (e.kind === 'pointerdown' || e.kind === 'pointerup' || e.kind === 'pointercancel') break;
        if (e.kind === 'pointermove') { this.events.splice(i, 1); break; }
      }
    }
    if (this.events.length >= this.limit) {
      this.overflowCount++; this.reset({quarantine:true}); return false;
    }
    this.events.push({at, kind, data}); return true;
  }
  consumeThrough(end) {
    if (!Number.isFinite(end) || end < this.sampled - EPS) throw Error('nonmonotonic input sample');
    this.sampled = end;
    while (this.index < this.events.length && this.events[this.index].at <= end + EPS) {
      const e = this.events[this.index++];
      const d = e.data;
      const evt = {type:e.kind, pointerId:d.pointerId, pointerType:d.pointerType,
        clientX:d.clientX, clientY:d.clientY, buttons:d.buttons,
        button:d.button, key:d.key, repeat:!!d.repeat,
        defaultPrevented:!!d.defaultPrevented,
        target:{tagName:d.targetTagName || '', isContentEditable:!!d.targetEditable,
          closest:()=>d.targetIsUI ? {} : null},
        sourceCapabilities:d.sourceFiresTouchEvents == null ? undefined :
          {firesTouchEvents:!!d.sourceFiresTouchEvents}, preventDefault() {}};
      if (e.kind === 'pointerdown') this.input.pd(evt);
      else if (e.kind === 'pointermove') this.input.pm(evt);
      else if (e.kind === 'pointerup' || e.kind === 'pointercancel') this.input.pu(evt);
      else if (e.kind === 'keydown') this.input.kd(evt);
      else if (e.kind === 'keyup') this.input.ku(evt);
      else if (e.kind === 'blur') this.releaseAll();
      else throw Error('unsupported input event: ' + e.kind);
      this.applied++;
    }
    if (this.index >= 64) { this.events.splice(0, this.index); this.index = 0; }
  }
}
class FixedStepPresentation {
  constructor(game, timeline, {maxSteps = 2, render = null, strictPause = false} = {}) {
    if (!game || !timeline || !Number.isInteger(maxSteps) || maxSteps < 1)
      throw Error('invalid fixed-step presentation');
    this.game = game; this.timeline = timeline; this.maxSteps = maxSteps;
    this.render = render; this.strictPause = !!strictPause;
    this.ticks = 0; this.lastFrame = 0;
    this.droppedTicks = 0; this.paused = false; this.epoch = 0;
  }
  frame(at, {naiveFrameInput = false} = {}) {
    if (!Number.isFinite(at) || at < this.lastFrame - EPS) throw Error('nonmonotonic frame');
    this.lastFrame = at;
    if (this.paused || this.game.paused) return;
    // Test schedules are measured against a common simulation epoch. In a
    // shipping implementation this must be an accumulator, pause-aware clock.
    const target = Math.floor((at - this.epoch) / STEP + EPS);
    const due = Math.max(0, target - this.ticks);
    if (due > this.maxSteps) {
      // Fail bounded: never execute unbounded work on one rendered frame.
      // This deliberately drops simulation time; not production semantics.
      this.droppedTicks += due - this.maxSteps;
      this.ticks += due - this.maxSteps;
      this.timeline.consumeThrough(this.epoch + this.ticks * STEP);
    }
    if (naiveFrameInput) this.timeline.consumeThrough(at);
    while (this.ticks < target) {
      if (!naiveFrameInput) this.timeline.consumeThrough(this.epoch + (this.ticks + 1) * STEP);
      if (this.strictPause && this.game.paused) break;
      if (!this.strictPause && this.game.paused && this.game.pendingOffer)
        this.game.dismissOffer();
      this.game.update(STEP); this.ticks++;
      if (this.strictPause && this.game.paused) break;
    }
    if (this.render) this.render(this.game, this.game.w, this.game.h);
  }
  pause() {
    this.paused = true; this.timeline.reset();
    if (!this.game.paused) this.game.setPaused(true);
  }
  resume(at) {
    if (!Number.isFinite(at) || at < this.lastFrame - EPS) throw Error('invalid resume');
    if (this.strictPause && this.game.pendingOffer)
      throw Error('cannot resume before player resolves evolution offer');
    this.timeline.reset(); this.timeline.last = at; this.timeline.sampled = at;
    this.lastFrame = at; this.epoch = at - this.ticks * STEP;
    this.timeline.tickOrigin = this.epoch; this.paused = false;
    if (this.game.paused) this.game.setPaused(false);
  }
}
module.exports = {ChronologicalInput, FixedStepPresentation, STEP};
