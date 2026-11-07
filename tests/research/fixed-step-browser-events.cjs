'use strict';
// RESEARCH ONLY. Translate browser Event timestamps into the fixed-step input
// timeline without allowing DOM delivery cadence to advance game controls.
// This is deliberately NOT installed in the production event loop.
const KINDS = new Set(['pointerdown','pointermove','pointerup','pointercancel',
  'keydown','keyup','blur']);
class BrowserEventTimeline {
  constructor(timeline, clock, {maxFutureMs = 32, maxStaleMs = 2000} = {}) {
    if (!timeline || typeof timeline.push !== 'function' ||
        !clock || typeof clock.now !== 'function' ||
        !Number.isFinite(maxFutureMs) || maxFutureMs < 0 ||
        !Number.isFinite(maxStaleMs) || maxStaleMs < 0)
      throw Error('invalid browser event timeline');
    this.timeline = timeline;
    this.clock = clock;
    this.startMs = clock.now();
    if (!Number.isFinite(this.startMs)) throw Error('invalid browser clock');
    this.maxFutureMs = maxFutureMs;
    this.maxStaleMs = maxStaleMs;
    this.lastAt = 0;
    this.futureClamps = 0;
    this.staleClamps = 0;
    this.lateClamps = 0;
    this.reorderedClamps = 0;
    this.invalidTimestamps = 0;
    // A stale DOM event can revoke a held touch before the next RAF sees it.
    // Retain only notification evidence, never the revoked input itself.
    this.pendingStaleTouchIds = new Set();
  }
  takeStaleTouchResetNotice() {
    const lost = this.pendingStaleTouchIds.size > 0;
    this.pendingStaleTouchIds.clear();
    return lost;
  }
  capture(event) {
    if (!event || !KINDS.has(event.type)) throw Error('unsupported browser input event');
    // A subsequent real release/blur explains the cancellation, even when
    // it arrives before the next presentation frame.
    if (event.type === 'blur') this.pendingStaleTouchIds.clear();
    else if ((event.type === 'pointerup' || event.type === 'pointercancel') &&
             event.pointerType !== 'mouse')
      this.pendingStaleTouchIds.delete(event.pointerId);
    const now = this.clock.now();
    if (!Number.isFinite(now)) throw Error('invalid browser clock');
    let stamp = Number(event.timeStamp);
    if (!Number.isFinite(stamp) || stamp <= 0) {
      stamp = now;
      this.invalidTimestamps++;
    } else if (stamp > 1e11) {
      // Older WebKit browsers reported Unix-epoch milliseconds. Convert only
      // with a valid clock origin; otherwise prefer delivery time.
      const origin = Number(this.clock.timeOrigin);
      if (Number.isFinite(origin) && origin > 1e11) stamp -= origin;
      else { stamp = now; this.invalidTimestamps++; }
    }
    if (stamp > now + this.maxFutureMs) {
      stamp = now;
      this.futureClamps++;
    }
    if (stamp < now - this.maxStaleMs) {
      // Do not replay a stale press or movement at delivery time: that can
      // resurrect a held control after a browser stall. Fail closed until
      // a fresh release/blur arrives.
      this.staleClamps++;
      const input=this.timeline.input;
      const held=new Set(this.pendingStaleTouchIds);
      if(input && input.touchSeen && input.stickId){
        for(const stick of ['move','aim']){
          if(input[stick] && input[stick].active && input.stickId[stick]!==-1)
            held.add(input.stickId[stick]);
        }
      }
      // Queued intentional releases and lifecycle blur precede this stale
      // event. Do not claim that those controls were involuntarily lost.
      for(const queued of this.timeline.events.slice(this.timeline.index||0)){
        if(queued.kind==='blur') held.clear();
        else if((queued.kind==='pointerup'||queued.kind==='pointercancel') &&
                queued.data && queued.data.pointerType!=='mouse')
          held.delete(queued.data.pointerId);
      }
      if(event.type==='blur') held.clear();
      else if((event.type==='pointerup'||event.type==='pointercancel') &&
              event.pointerType!=='mouse') held.delete(event.pointerId);
      this.pendingStaleTouchIds=held;
      this.timeline.reset({quarantine:true});
      if (event.type === 'pointerup' || event.type === 'pointercancel' ||
          event.type === 'keyup' || event.type === 'blur')
        this.timeline.reset();
      return false;
    }
    let at = Math.max(0, (stamp - this.startMs) / 1000);
    // A late DOM delivery can never rewrite an already-simulated tick.
    if (at < this.timeline.sampled) {
      at = this.timeline.sampled;
      this.lateClamps++;
    }
    if (at < this.timeline.last) {
      at = this.timeline.last;
      this.reorderedClamps++;
    }
    if (at < this.lastAt) {
      at = this.lastAt;
      this.reorderedClamps++;
    }
    const target = event.target;
    const data = event.type === 'blur' ? {} : {
      pointerId: event.pointerId, pointerType: event.pointerType,
      clientX: event.clientX, clientY: event.clientY,
      button: event.button, buttons: event.buttons,
      key: event.key, repeat: !!event.repeat,
      defaultPrevented: !!event.defaultPrevented,
      sourceFiresTouchEvents: event.sourceCapabilities &&
        event.sourceCapabilities.firesTouchEvents,
      targetTagName: target && target.tagName,
      targetEditable: !!(target && target.isContentEditable),
      targetIsUI: !!(target && typeof target.closest === 'function' &&
        target.closest('[data-ui],[role="dialog"],[role="button"],[contenteditable="true"]'))
    };
    const accepted = this.timeline.push(at, event.type, data);
    this.lastAt = at;
    return accepted;
  }
}
module.exports = {BrowserEventTimeline};
