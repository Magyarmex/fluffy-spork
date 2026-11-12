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
    this.futureSkewClamps = 0;
    this.staleClamps = 0;
    this.lateClamps = 0;
    this.reorderedClamps = 0;
    this.invalidTimestamps = 0;
    // A stale DOM event can revoke a held touch before the next RAF sees it.
    // Retain only notification evidence, never the revoked input itself.
    this.pendingStaleTouchIds = new Set();
    // Capture-side resize interruption protects gestures already replayed
    // before the layout changes. Replay-side checks separately protect queued
    // gestures whose dimensions change before their first simulation tick.
    this.activeTouchIds = new Set();
    this.suppressedTouchIds = new Set();
    this.activeTouchSize = null;
    this.resizeInterruptions = 0;
  }
  interruptForResize() {
    // A resize can happen without another pointer event. Cancel queued or
    // already-applied touch ownership immediately, before the next RAF.
    const pending=Array.isArray(this.timeline.events) ?
      this.timeline.events.slice(this.timeline.index||0) : [];
    const queued=pending.filter(e=>e.kind.startsWith('pointer') && e.data &&
      e.data.pointerType!=='mouse');
    if(!this.activeTouchIds.size && !queued.length)return false;
    const input=this.timeline.input;
    let rect=null;
    try{
      if(input&&input.canvas&&typeof input.canvas.getBoundingClientRect==='function')
        rect=input.canvas.getBoundingClientRect();
    }catch(_){/* Unreadable layout is ambiguous; cancel conservatively. */}
    const size=rect&&Number.isFinite(rect.width)&&Number.isFinite(rect.height)?
      {width:rect.width,height:rect.height}:null;
    const origins=this.activeTouchSize?[this.activeTouchSize]:queued.map(e=>e.data.__novaCanvasOrigin);
    if(size&&origins.length&&origins.every(o=>o&&o.width===size.width&&o.height===size.height))
      return false;
    for(const id of this.activeTouchIds)this.suppressedTouchIds.add(id);
    for(const e of queued)if(e.kind==='pointerdown'&&e.data.pointerId!=null)
      this.suppressedTouchIds.add(e.data.pointerId);
    this.activeTouchIds.clear();
    this.activeTouchSize=null;
    this.pendingStaleTouchIds.clear();
    this.timeline.reset();
    this.resizeInterruptions++;
    return true;
  }
  takeStaleTouchResetNotice() {
    const lost = this.pendingStaleTouchIds.size > 0;
    this.pendingStaleTouchIds.clear();
    return lost;
  }
  capture(event) {
    if (!event || !KINDS.has(event.type)) throw Error('unsupported browser input event');
    // One DOM layout snapshot per touch event: avoid a second potentially
    // forced layout read when storing capture-time stick coordinates.
    let capturedCanvasOrigin=null;
    if(event.type==='blur'){
      this.activeTouchIds.clear();
      this.suppressedTouchIds.clear();
      this.activeTouchSize=null;
    }else if(event.type.startsWith('pointer') && event.pointerType!=='mouse' &&
             event.pointerId!=null){
      const id=event.pointerId;
      const released=event.type==='pointerup'||event.type==='pointercancel';
      if(this.suppressedTouchIds.has(id)){
        // Pointer IDs may be reused after an OS interruption without a
        // delivered release. A new down starts a new physical sequence;
        // moves from the interrupted sequence remain suppressed.
        if(event.type==='pointerdown')this.suppressedTouchIds.delete(id);
        else{
          if(released)this.suppressedTouchIds.delete(id);
          return false;
        }
      }
      let size=null;
      const canvas=this.timeline.input && this.timeline.input.canvas;
      if(canvas && typeof canvas.getBoundingClientRect==='function'){
        try{
          const rect=canvas.getBoundingClientRect();
          if(rect && Number.isFinite(rect.width)&&Number.isFinite(rect.height) &&
             rect.width>0 && rect.height>0){
            size={width:rect.width,height:rect.height};
            if(Number.isFinite(rect.left)&&Number.isFinite(rect.top))
              capturedCanvasOrigin={left:rect.left,top:rect.top,
                width:rect.width,height:rect.height};
          }
        }catch(_){/* Unavailable layout is not evidence of a safe resize. */}
      }
      if(this.activeTouchIds.size &&
         (!this.activeTouchSize || !size ||
          size.width!==this.activeTouchSize.width ||
          size.height!==this.activeTouchSize.height)){
        for(const heldId of this.activeTouchIds)this.suppressedTouchIds.add(heldId);
        if(!released)this.suppressedTouchIds.add(id);
        else this.suppressedTouchIds.delete(id);
        this.activeTouchIds.clear();
        this.activeTouchSize=null;
        this.pendingStaleTouchIds.clear();
        this.timeline.reset();
        this.resizeInterruptions++;
        return false;
      }
      if(event.type==='pointerdown'){
        if(!this.activeTouchIds.size)this.activeTouchSize=size;
        this.activeTouchIds.add(id);
      }else if(released){
        this.activeTouchIds.delete(id);
        if(!this.activeTouchIds.size)this.activeTouchSize=null;
      }
    }
    // A subsequent real release/blur explains the cancellation, even when
    // it arrives before the next presentation frame.
    if (event.type === 'blur') this.pendingStaleTouchIds.clear();
    else if ((event.type === 'pointerup' || event.type === 'pointercancel') &&
             typeof event.pointerType === 'string' && event.pointerType !== 'mouse')
      this.pendingStaleTouchIds.delete(event.pointerId);
    const now = this.clock.now();
    if (!Number.isFinite(now)) throw Error('invalid browser clock');
    let stamp = Number(event.timeStamp);
    let timestampTrusted = true;
    // A tolerated future-clock skew can be safe for input ordering but must
    // not masquerade as an exact physical hold duration for Sniper charge.
    let timestampExact = true;
    if (!Number.isFinite(stamp) || stamp <= 0) {
      stamp = now;
      timestampTrusted = false;timestampExact = false;
      this.invalidTimestamps++;
    } else if (stamp > 1e11) {
      // Older WebKit browsers reported Unix-epoch milliseconds. Convert only
      // with a valid clock origin; otherwise prefer delivery time.
      const origin = Number(this.clock.timeOrigin);
      if (Number.isFinite(origin) && origin > 1e11) stamp -= origin;
      else { stamp = now; timestampTrusted = false; timestampExact = false; this.invalidTimestamps++; }
    }
    if (stamp > now + this.maxFutureMs) {
      stamp = now;
      timestampTrusted = false;timestampExact = false;
      this.futureClamps++;
    } else if (stamp > now) {
      // A tolerated browser clock skew must not give a recovered shot
      // negative age or extra freshness budget. Preserve trusted provenance
      // only for bounded skew, but never claim the event occurred in future.
      stamp = now;timestampExact = false;
      this.futureSkewClamps++;
    }
    if (stamp < now - this.maxStaleMs) {
      // Do not replay a stale press or movement at delivery time: that can
      // resurrect a held control after a browser stall. Fail closed until
      // a fresh release/blur arrives.
      this.staleClamps++;
      const input=this.timeline.input;
      const held=new Set(this.pendingStaleTouchIds);
      const slots={move:null,aim:null};
      if(input && input.touchSeen && input.stickId){
        for(const stick of ['move','aim']){
          if(input[stick] && input[stick].active && input.stickId[stick]!==-1){
            slots[stick]=input.stickId[stick];
            held.add(input.stickId[stick]);
          }
        }
      }
      // Reconstruct accepted stick ownership, not merely pointer existence.
      // A queued first touch may be lost before its first simulation tick;
      // a same-side second touch is ignored by shipping Input.
      const pending=Array.isArray(this.timeline.events) ?
        this.timeline.events.slice(this.timeline.index||0) : [];
      for(const queued of pending){
        const d=queued.data;
        if(queued.kind==='blur'){
          held.clear();slots.move=null;slots.aim=null;continue;
        }
        if(!d || d.pointerId==null || typeof d.pointerType!=='string' ||
           d.pointerType==='mouse')continue;
        if(queued.kind==='pointerdown' && !d.targetIsUI){
          let side=d.__novaCanvasSide;
          // Preserve legacy direct-timeline callers that never passed through
          // browser capture. Do NOT reinterpret a captured but unavailable
          // side using later geometry: that would recreate the original bug.
          if(side!=='move'&&side!=='aim'&&
             !Object.prototype.hasOwnProperty.call(d,'__novaCanvasSide')){
            const canvas=input && input.canvas;
            if(canvas && typeof canvas.getBoundingClientRect==='function'){
              try{
                const r=canvas.getBoundingClientRect();
                if(r && Number.isFinite(r.left)&&Number.isFinite(r.width)&&
                   r.width>0&&Number.isFinite(d.clientX))
                  side=d.clientX-r.left<r.width*.45?'move':'aim';
              }catch(_){/* Fall back to bounded unknown-pointer tracking. */}
            }
          }
          if(side==='move'||side==='aim'){
            if(slots[side]==null){slots[side]=d.pointerId;held.add(d.pointerId);}
          }else if(held.size<2)held.add(d.pointerId);
        }else if(queued.kind==='pointerup'||queued.kind==='pointercancel'){
          held.delete(d.pointerId);
          if(slots.move===d.pointerId)slots.move=null;
          if(slots.aim===d.pointerId)slots.aim=null;
        }
      }
      if(event.type==='blur') held.clear();
      else if((event.type==='pointerup'||event.type==='pointercancel') &&
              typeof event.pointerType==='string' && event.pointerType!=='mouse') held.delete(event.pointerId);
      this.pendingStaleTouchIds=held;
      this.timeline.reset({quarantine:true});
      if (event.type === 'pointerup' || event.type === 'pointercancel' ||
          event.type === 'keyup' || event.type === 'blur')
        this.timeline.reset();
      return false;
    }
    // Preserve the accepted DOM occurrence time separately from the replay
    // position. Late/reordered events must not rewrite simulation history,
    // but downstream research may need their true age to reject stale shots.
    const originalAt = Math.max(0, (stamp - this.startMs) / 1000);
    let at = originalAt;
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
    // A replayed touch must use the local canvas coordinates seen at DOM
    // capture. A later layout translation must not turn aim into movement.
    // Resizes remain a separate, deliberately unpromoted safety gate.
    const canvasOrigin=capturedCanvasOrigin;
    const target = event.target;
    const data = event.type === 'blur' ? {} : {
      __novaOriginalAt: originalAt, __novaTimestampTrusted: timestampTrusted,
      __novaPhysicalTimestampExact: timestampExact,
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
        target.closest('[data-ui],[role="dialog"],[role="button"],[contenteditable="true"]')),
      __novaCanvasOrigin:canvasOrigin,
      // Preserve accepted stick ownership through stale-event quarantine.
      __novaCanvasSide:event.type==='pointerdown' && canvasOrigin &&
        Number.isFinite(event.clientX) ?
        (event.clientX-canvasOrigin.left<canvasOrigin.width*.45?'move':'aim') : null
    };
    const accepted = this.timeline.push(at, event.type, data);
    this.lastAt = at;
    return accepted;
  }
}
module.exports = {BrowserEventTimeline};
