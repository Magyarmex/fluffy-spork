/* Generated fixed60 research browser bundle. NOT enabled in production. */
(function(root){
'use strict';
const factories={"fixed-step-dom-input.cjs":function(require,module,exports){
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
        // Never move a continuous sample across ANY discrete edge, even one
        // owned by another pointer or the keyboard. Edge order is gameplay.
        if (e.kind !== 'pointermove') break;
        if (e.data.pointerId !== data.pointerId) continue;
        // Only coalesce within the SAME actual simulation tick.
        if (Math.floor((e.at - this.tickOrigin + EPS) / STEP) !==
            Math.floor((at - this.tickOrigin + EPS) / STEP)) break;
        this.events.splice(i, 1); break;
      }
    }
    if (this.events.length >= this.limit) {
      this.overflowCount++;
      // A release/cancel/blur arriving at the hard cap must clear the held
      // state without leaving input quarantined after the final release.
      const release = kind === 'pointerup' || kind === 'pointercancel' ||
        kind === 'keyup' || kind === 'blur';
      this.reset({quarantine:!release}); return false;
    }
    this.events.push({at, kind, data}); return true;
  }
  consumeThrough(end) {
    if (!Number.isFinite(end) || end < this.sampled - EPS) throw Error('nonmonotonic input sample');
    this.sampled = end;
    while (this.index < this.events.length && this.events[this.index].at <= end + EPS) {
      const e = this.events[this.index++];
      const d = e.data;
      let clientX=d.clientX,clientY=d.clientY;
      // A touch captured before a pure canvas translation must retain its
      // original local stick coordinates when replayed later. Do not apply
      // this to mouse aiming (which has separate world-target semantics),
      // or to resizes: those need their own validated policy.
      const origin=d.__novaCanvasOrigin;
      // Browser-captured touch without trustworthy geometry must not be
      // reclassified using a later canvas frame. Legacy direct timeline
      // fixtures have no capture metadata and retain their existing path.
      if(d.pointerType!=='mouse' && e.kind.startsWith('pointer') &&
         Object.prototype.hasOwnProperty.call(d,'__novaCanvasOrigin') && !origin){
        this.reset({quarantine:true});
        return;
      }
      if(origin && d.pointerType!=='mouse' && this.input.canvas &&
         typeof this.input.canvas.getBoundingClientRect==='function'){
        let rect=null;
        try{rect=this.input.canvas.getBoundingClientRect();}
        catch(_){/* Unreadable geometry invalidates this queued touch. */}
        // Never swallow a reset exception and then replay the stale event.
        // Width/height or position uncertainty invalidates old touch input.
        if(!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) ||
           !Number.isFinite(rect.left) || !Number.isFinite(rect.top) ||
           rect.width!==origin.width || rect.height!==origin.height){
          this.reset({quarantine:true});
          return;
        }
        if(Number.isFinite(clientX))clientX+=rect.left-origin.left;
        if(Number.isFinite(clientY))clientY+=rect.top-origin.top;
      }
      const evt = {type:e.kind, __novaOriginalAt:d.__novaOriginalAt,
        __novaTimestampTrusted:d.__novaTimestampTrusted,
        __novaPhysicalTimestampExact:d.__novaPhysicalTimestampExact,
        __novaReplayAt:e.at, __novaSampleAt:end,
        pointerId:d.pointerId, pointerType:d.pointerType,
        clientX, clientY, buttons:d.buttons,
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

},
"fixed-step-browser-events.cjs":function(require,module,exports){
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
  revokeForExternalReset() {
    // A lifecycle/RAF owner can reset Input without delivering a DOM blur
    // through this bridge. Old moves must not silently re-arm the sticks.
    for(const id of this.activeTouchIds)this.suppressedTouchIds.add(id);
    this.activeTouchIds.clear();
    this.activeTouchSize=null;
    this.pendingStaleTouchIds.clear();
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

},
"fixed-step-browser-capture.cjs":function(require,module,exports){
'use strict';
// RESEARCH ONLY: own DOM input while a chronological fixed-step experiment runs.
// Do not install this in Game.start() until latency and device gates pass.
// The production Input is temporarily detached, so its native mouse chord
// handlers cannot mutate firing before the queued simulation tick.
class BrowserInputCapture {
  constructor(input, canvas, timeline, bridge, {window: win, document: doc, game = null} = {}) {
    if (!input || !canvas || !timeline || !bridge || !win || !doc ||
        timeline.input !== input || bridge.timeline !== timeline ||
        typeof input.attach !== 'function' || typeof input.detach !== 'function' ||
        typeof win.addEventListener !== 'function' ||
        typeof doc.addEventListener !== 'function' || input.canvas !== canvas ||
        (game && (game.input !== input || typeof game.destroy !== 'function')))
      throw Error('invalid browser input capture owner');
    this.input = input; this.canvas = canvas; this.timeline = timeline;
    this.bridge = bridge; this.window = win; this.document = doc;
    this.listeners = []; this.active = false; this.game = game;
    this.originalDestroy = game && game.destroy;
    this.destroyHadOwn = !!(game && Object.prototype.hasOwnProperty.call(game,'destroy'));
    this.destroyWrapper = null;
    const revoke = () => {
      if(typeof this.bridge.revokeForExternalReset==='function')
        this.bridge.revokeForExternalReset();
    };
    const capture = e => {
      if (!this.active) return;
      if (this.document.hidden) { this.timeline.reset();revoke();
        if (typeof this.bridge.takeStaleTouchResetNotice === 'function')
          this.bridge.takeStaleTouchResetNotice();
        return; }
      this.bridge.capture(e);
    };
    // Native mouse events are required for button chords: Pointer Events do
    // not emit a second pointerdown when primary is pressed after secondary.
    // Map the native primary edge to the existing pointer replay contract;
    // do not invent an independent firing state or bypass Input's touch gate.
    const native = type => e => {
      if (!this.active || !e || e.button !== 0) return;
      if (this.document.hidden) { this.timeline.reset();revoke();
        if (typeof this.bridge.takeStaleTouchResetNotice === 'function')
          this.bridge.takeStaleTouchResetNotice();
        return; }
      this.bridge.capture({type, timeStamp:e.timeStamp, pointerType:'mouse',
        pointerId:1, button:e.button, buttons:e.buttons,
        clientX:e.clientX, clientY:e.clientY, target:e.target,
        defaultPrevented:e.defaultPrevented,
        sourceCapabilities:e.sourceCapabilities});
    };
    const release = () => { if (this.active) {
      this.timeline.reset();revoke();
      if (typeof this.bridge.takeStaleTouchResetNotice === 'function')
        this.bridge.takeStaleTouchResetNotice();
    } };
    const hidden = () => { if (this.document.hidden) release(); };
    const resized = () => {
      if(!this.active || typeof this.bridge.interruptForResize!=='function')return;
      if(!this.bridge.interruptForResize())return;
      // The shipping Sniper overlay interprets held -> released as a quick
      // rail. A forced resize cancellation is NOT a deliberate release.
      // Clear its focus witness before the next Game.update can fire it.
      if(this.game){
        this.game.__novaPlayerHeldFire=false;
        const p=this.game.player;
        if(p){
          p.__novaFocusStart=0;p.__novaFocus=0;
          p.__novaFocusAngle=null;p.__novaFocusLast=0;
          p.__novaChargeCue=false;
        }
      }
    };
    const spec = [
      [canvas,'pointerdown',capture],
      [win,'pointermove',capture],[win,'pointerup',capture],
      [win,'pointercancel',capture],
      [win,'keydown',capture],[win,'keyup',capture],
      [canvas,'mousedown',native('pointerdown')],
      [win,'mouseup',native('pointerup')],
      [win,'blur',release],[win,'resize',resized],
      [doc,'visibilitychange',hidden]
    ];
    this.timeline.reset();
    try{input.detach()}
    catch(error){
      // The composed Input detach may have stopped halfway through its
      // performance/DOM cleanup. Retry that idempotent teardown once before
      // reattaching, so cached geometry listeners are rebuilt as well.
      let cleanupError;
      try{input.detach()}catch(secondary){cleanupError=secondary}
      try{input.attach(canvas)}catch(secondary){
        // Failed reattachment is the most actionable cleanup failure:
        // normal controls may still be unavailable.
        cleanupError=secondary;
      }
      if(cleanupError && error && typeof error==='object'){
        try{error.cleanupError=cleanupError}catch(_ignored){}
      }
      throw error;
    }
    input.canvas = canvas; // preserve Input's original stick geometry owner
    this.active = true;
    try {
      for (const [target,type,fn] of spec) {
        target.addEventListener(type,fn);
        this.listeners.push([target,type,fn]);
      }
      if (game) {
        this.destroyWrapper = (...args) => {
          this.detach();
          return this.originalDestroy.apply(game,args);
        };
        game.destroy = this.destroyWrapper;
      }
    } catch (error) {
      // A secondary teardown failure must not hide the listener registration
      // error that caused capture activation to fail.
      try { this.detach(); }
      catch (cleanupError) {
        if (error && typeof error === 'object') {
          try { error.cleanupError = cleanupError; } catch (_ignored) {}
        }
      }
      throw error;
    }
  }
  detach() {
    if (!this.active) return;
    this.active = false;
    let failure;
    for (const [target,type,fn] of this.listeners.reverse()) {
      try { target.removeEventListener(type,fn); }
      catch (error) { if (!failure) failure = error; }
    }
    this.listeners.length = 0;
    if (this.game && this.game.destroy === this.destroyWrapper) {
      if (this.destroyHadOwn) this.game.destroy = this.originalDestroy;
      else delete this.game.destroy;
    }
    // Reattach production input even when a hostile DOM listener or a
    // game/UI reset callback fails. Never strand a live game without controls.
    try { this.timeline.reset(); }
    catch (error) { if (!failure) failure = error; }
    this.input.canvas = null;
    try { this.input.attach(this.canvas); }
    catch (error) { if (!failure) failure = error; }
    if (failure) throw failure;
  }
}
module.exports = {BrowserInputCapture};

},
"fixed-step-raf-owner.cjs":function(require,module,exports){
'use strict';
// RESEARCH ONLY. An opt-in, bounded requestAnimationFrame owner for the real
// Game and chronological Input. Never patches Game.prototype.start or shipping
// input/renderer. Production promotion requires device CPU/latency and visual
// interpolation gates.
const {STEP}=require('./fixed-step-dom-input.cjs');
const STEP_MS=STEP*1000, EPS=1e-7;
class FixedStepRafOwner {
  constructor(game,timeline,bridge,{now,request,cancel,render,maxSteps=2,backlogExtraTicks=2,isVisible=()=>true}={}) {
    if (!game || typeof game.update!=='function' || !game.sfx ||
        !timeline || timeline.input!==game.input ||
        typeof timeline.consumeThrough!=='function' ||
        !bridge || bridge.timeline!==timeline || !Number.isFinite(bridge.startMs) ||
        typeof now!=='function' || typeof request!=='function' ||
        typeof cancel!=='function' || typeof render!=='function' ||
        !Number.isInteger(maxSteps) || maxSteps<1 || maxSteps>4 ||
        !Number.isInteger(backlogExtraTicks) || backlogExtraTicks<2 || backlogExtraTicks>4)
      throw Error('invalid fixed-step RAF owner');
    this.game=game;this.timeline=timeline;this.bridge=bridge;
    this.now=now;this.request=request;this.cancel=cancel;this.render=render;
    this.isVisible=isVisible;
    this.maxSteps=maxSteps;this.backlogExtraTicks=backlogExtraTicks;this.started=false;this.raf=null;
    this.lastMs=0;this.simAtSec=0;this.lagMs=0;this.ticks=0;
    this.droppedMs=0;this.droppedFrames=0;this.paused=false;
    this.alpha=0;this.lastSteps=0;this.minimapTimer=0;
    this.lastTouchResetNoticeMs=-Infinity;
    // Every scheduled callback has a unique ticket. Cancelled callbacks may
    // still be delivered by a host after stop/restart; they must never
    // advance a newly started world or schedule a second RAF chain.
    this._generation=0;this._requestSeq=0;
    this._awaitingForwardFrame=false;
    this.originalDestroy=game.destroy;
    this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
    this.destroyWrapper=null;
    this.originalSetPaused=game.setPaused;
    this.pauseHadOwn=Object.prototype.hasOwnProperty.call(game,'setPaused');
    this.pauseWrapper=null;
    this.originalStart=game.start;
    this.startHadOwn=Object.prototype.hasOwnProperty.call(game,'start');
    this.startWrapper=null;
  }
  schedule(){
    const generation=this._generation,seq=++this._requestSeq;
    this.raf=this.request(ts=>{
      if(!this.started || generation!==this._generation ||
         seq!==this._requestSeq)return;
      this.raf=null;
      this.frame(ts);
    });
  }
  start(){
    if(this.started)throw Error('fixed-step RAF already started');
    if(this.game.raf)throw Error('production RAF already owns this game');
    if(this.game.start!==this.originalStart ||
       this.game.destroy!==this.originalDestroy ||
       this.game.setPaused!==this.originalSetPaused)
      throw Error('game lifecycle owner changed before fixed-step activation');
    const at=this.now();if(!Number.isFinite(at)||at<this.bridge.startMs-EPS)
      throw Error('invalid fixed-step start time');
    this._generation++;this.started=true;this.lastMs=at;
    this._awaitingForwardFrame=true;this.simAtSec=(at-this.bridge.startMs)/1000;
    try{
      if(typeof this.bridge.takeStaleTouchResetNotice==='function')
        this.bridge.takeStaleTouchResetNotice();
      this.timeline.reset();this.timeline.tickOrigin=this.simAtSec;
      this.timeline.consumeThrough(this.simAtSec);
      this.paused=!!this.game.paused;
      this.game.sfx.startMusic();
    }catch(error){
      this.started=false;
      try{this.timeline.reset()}catch(cleanupError){
        if(error && typeof error==='object'){
          try{error.cleanupError=cleanupError}catch(_ignored){}
        }
      }
      throw error;
    }
    const self=this;
    this.destroyWrapper=function(...args){
      // Teardown must reach the actual Game even if a host cancellation fails.
      let stopError;
      try{self.stop()}catch(error){stopError=error}
      const result=self.originalDestroy.apply(this,args);
      if(stopError)throw stopError;
      return result;
    };
    this.game.destroy=this.destroyWrapper;
    // A second production RAF would advance the same world twice and break
    // combat chronology. Reserve Game.start while the opt-in pilot owns it.
    if(typeof this.originalStart==='function'){
      this.startWrapper=function(...args){
        if(self.started)throw Error('fixed-step RAF already owns this game');
        return self.originalStart.apply(this,args);
      };
      this.game.start=this.startWrapper;
    }
    if(typeof this.originalSetPaused==='function'){
      this.pauseWrapper=function(...args){
        const was=!!this.paused;
        const out=self.originalSetPaused.apply(this,args);
        if(was!==!!this.paused && self.started)self.transition(!!this.paused,self.now());
        return out;
      };
      this.game.setPaused=this.pauseWrapper;
    }
    try{this.schedule()}
    catch(error){
      // Preserve the original RAF request failure if teardown also fails.
      try{this.stop()}catch(cleanupError){
        if(error && typeof error==='object'){
          try{error.cleanupError=cleanupError}catch(_ignored){}
        }
      }
      throw error;
    }
  }
  transition(paused,at){
    if(!Number.isFinite(at)||at<this.lastMs-EPS)throw Error('invalid pause clock');
    if(typeof this.bridge.takeStaleTouchResetNotice==='function')
      this.bridge.takeStaleTouchResetNotice();
    this.timeline.reset();
      if(typeof this.bridge.revokeForExternalReset==='function')
        this.bridge.revokeForExternalReset();
      this.lagMs=0;this.paused=paused;
    this._awaitingForwardFrame=true;this.lastMs=at;this.simAtSec=(at-this.bridge.startMs)/1000;
    // A new simulation epoch changes the tick grid used for safe pointermove coalescing.
    this.timeline.tickOrigin=this.simAtSec;
    this.timeline.consumeThrough(this.simAtSec);
  }
  frame(ts){
    if(!this.started)throw Error('fixed-step RAF is not running');
    try{
      if(!Number.isFinite(ts))throw Error('nonmonotonic RAF timestamp');
      // The first RAF timestamp may represent the beginning of a frame in
      // which performance.now() was sampled later. Never simulate backwards.
      if(ts<this.lastMs-EPS){
        if(!this._awaitingForwardFrame||this.lastMs-ts>250)
          throw Error('nonmonotonic RAF timestamp');
        ts=this.lastMs;
      }else this._awaitingForwardFrame=false;
      this.schedule();this.advance(ts);
    }catch(error){
      // Keep the initiating simulation/render failure as the primary error.
      // A hostile RAF host may also throw during cancellation; cleanup still
      // runs and the secondary failure remains available for diagnosis.
      try{this.stop()}catch(cleanupError){
        if(error && typeof error==='object'){
          try{error.cleanupError=cleanupError}catch(_ignored){}
        }
      }
      throw error;
    }
  }
  advance(ts){
    const g=this.game;
    const raw=Math.max(0,ts-this.lastMs);
    this.lastMs=ts;
    this.lastSteps=0;
    // BrowserEventTimeline may have fail-closed BEFORE this RAF, leaving no
    // owned stick for the ordinary foreground-stall warning to inspect.
    const staleTouchReset=typeof this.bridge.takeStaleTouchResetNotice==='function' &&
      this.bridge.takeStaleTouchResetNotice();
    if(staleTouchReset && !g.paused && (!g.status || g.status==='playing') &&
       this.isVisible() && typeof g.toast==='function' &&
       ts-this.lastTouchResetNoticeMs>=8000){
      this.lastTouchResetNoticeMs=ts;
      g.toast('Touch controls reset — touch again','warn');
    }
    if(g.paused){
      if(!this.paused){this.timeline.reset();
      if(typeof this.bridge.revokeForExternalReset==='function')
        this.bridge.revokeForExternalReset();
      this.lagMs=0;this.paused=true;}
      this.simAtSec=(ts-this.bridge.startMs)/1000;
    }else if(this.paused){
      // Resume without consuming the elapsed menu/evolution time. Input must
      // be re-armed by fresh browser events, never by a stale held command.
      this.timeline.reset();
      if(typeof this.bridge.revokeForExternalReset==='function')
        this.bridge.revokeForExternalReset();
      this.lagMs=0;this.paused=false;
      this.simAtSec=(ts-this.bridge.startMs)/1000;
      this.timeline.tickOrigin=this.simAtSec;
      this.timeline.consumeThrough(this.simAtSec);
    }else{
      const maxMs=this.maxSteps*STEP_MS;
      if(raw>100+EPS){
        // Genuine long stall: discard old controls and bound catch-up. A
        // healthy 30Hz frame can be a little longer than two 60Hz steps;
        // treating that ordinary jitter as a stall loses whole updates.
        this.droppedMs+=this.lagMs+raw-maxMs;this.droppedFrames++;
        // A foreground stall invalidates held touch ownership for safety.
        // Explain the involuntary reset once, without changing input state.
        const input=g.input;
        const ownedTouchIds=input && input.touchSeen && input.stickId ?
          ['move','aim'].filter(stick=>input.stickId[stick]!==-1 &&
            input[stick] && input[stick].active).map(stick=>input.stickId[stick]) : [];
        // An already-captured release is intentional. A release of one stick
        // must not conceal an involuntary reset of the OTHER held stick.
        const pending=Array.isArray(this.timeline.events) ?
          this.timeline.events.slice(this.timeline.index||0) : [];
        // Replay queued lifecycle edges only for NOTICE classification.
        // Input itself remains fail-closed: the long stall still resets it.
        // A blur clears old ownership, but a later fresh touch down can be
        // cancelled by the same stall and deserves an explicit warning.
        const stillHeld=new Set(ownedTouchIds);
        // A captured press is not necessarily an owned stick. Shipping Input
        // ignores a second press on an occupied side; counting that ignored
        // pointer as held would display a false reset warning after the real
        // owner intentionally releases. Replay the same two-slot admission.
        const slots={move:null,aim:null};
        for(const stick of ['move','aim']){
          if(input && input.stickId && input[stick] && input[stick].active &&
             stillHeld.has(input.stickId[stick]))slots[stick]=input.stickId[stick];
        }
        // A stall without queued stick presses must not force a DOM layout
        // read merely to decide whether to show a notice.
        let rect=null,hasRect=false,geometryRead=false;
        for(const e of pending){
          if(e.kind==='blur'){
            stillHeld.clear();slots.move=null;slots.aim=null;continue;
          }
          const d=e.data;
          if(!d || typeof d.pointerType!=='string' ||
             d.pointerType==='mouse' || d.pointerId==null)continue;
          if(e.kind==='pointerdown' && !d.targetIsUI){
            // Notice classification must use the stick side observed when
            // the DOM event occurred. A translated canvas can make two
            // competing aim touches look like separate move/aim owners.
            let side=d.__novaCanvasSide;
            // Direct-timeline legacy fixtures have no capture metadata.
            // Only those callers may consult current canvas geometry.
            if(side!=='move' && side!=='aim' &&
               !Object.prototype.hasOwnProperty.call(d,'__novaCanvasSide')){
              if(!geometryRead){
                geometryRead=true;
                const canvas=(input && input.canvas)||g.canvas;
                try{
                  rect=canvas && typeof canvas.getBoundingClientRect==='function' ?
                    canvas.getBoundingClientRect() : null;
                }catch(_){rect=null;}
                hasRect=!!(rect && Number.isFinite(rect.left) &&
                  Number.isFinite(rect.width) && rect.width>0);
              }
              if(hasRect && Number.isFinite(d.clientX))
                side=d.clientX-rect.left<rect.width*.45?'move':'aim';
            }
            if(side==='move'||side==='aim'){
              if(slots[side]==null){
                slots[side]=d.pointerId;stillHeld.add(d.pointerId);
              }
            }else if(stillHeld.size<2)stillHeld.add(d.pointerId);
          }else if(e.kind==='pointerup'||e.kind==='pointercancel'){
            stillHeld.delete(d.pointerId);
            if(slots.move===d.pointerId)slots.move=null;
            if(slots.aim===d.pointerId)slots.aim=null;
          }
        }
        if(stillHeld.size>0 && (!g.status || g.status==='playing') && this.isVisible() &&
           typeof g.toast==='function' && ts-this.lastTouchResetNoticeMs>=8000){
          this.lastTouchResetNoticeMs=ts;
          g.toast('Touch controls reset — touch again','warn');
        }
        this.timeline.reset();
      if(typeof this.bridge.revokeForExternalReset==='function')
        this.bridge.revokeForExternalReset();
      this.lagMs=0;
        this.simAtSec=(ts-this.bridge.startMs-maxMs)/1000;
        this.timeline.tickOrigin=this.simAtSec;
        this.timeline.consumeThrough(this.simAtSec);
        this.lagMs=maxMs;
      }else{
        this.lagMs+=raw;
        // Default: two extra full steps of backlog for transient jitter.
        // Opt-in research may allow up to four, trading more simulation phase
        // lag for fewer dropped ticks. Never silently change the default.
        // Under sustained overload, skip only whole ticks, retaining
        // chronological input edges that are still valid after the skip.
        const maxBacklog=(this.maxSteps+this.backlogExtraTicks)*STEP_MS;
        if(this.lagMs>maxBacklog+EPS){
          const skipped=Math.ceil((this.lagMs-maxBacklog-EPS)/STEP_MS)*STEP_MS;
          this.lagMs-=skipped;
          this.droppedMs+=skipped;this.droppedFrames++;
          // Keep later events: only the skipped tick is lost. Replaying
          // chronological edges through that boundary leaves the correct
          // held state for the first surviving simulation step.
          this.simAtSec+=skipped/1000;
          this.timeline.consumeThrough(this.simAtSec);
        }
      }
      while(this.lagMs+EPS>=STEP_MS && this.lastSteps<this.maxSteps && !g.paused && this.started){
        const end=this.simAtSec+STEP;
        this.timeline.consumeThrough(end);
        g.update(STEP);
        this.simAtSec=end;
        this.lagMs=Math.max(0,this.lagMs-STEP_MS);
        this.lastSteps++;this.ticks++;
      }
      if(g.paused){this.timeline.reset();
      if(typeof this.bridge.revokeForExternalReset==='function')
        this.bridge.revokeForExternalReset();
      this.lagMs=0;this.paused=true;}
    }
    if(!this.started)return; // Game.destroy may run inside Game.update.
    this.alpha=Math.max(0,Math.min(1,this.lagMs/STEP_MS));
    this.render(g,g.w,g.h,this.alpha);
    // Rendering can synchronously destroy the game (for example, a host
    // teardown). Never draw a minimap or touch game state after that.
    if(!this.started)return;
    this.minimapTimer-=this.lastSteps*STEP;
    if(this.minimapTimer<=0 && typeof g.drawMinimap==='function'){
      this.minimapTimer=.08;g.drawMinimap();
    }
  }
  stop(){
    if(!this.started)return;
    this.started=false;this._awaitingForwardFrame=false;
    this._generation++;this._requestSeq++;
    // A host may throw while cancelling a queued browser callback. Even then,
    // release all lifecycle hooks: leaving Game.start/destroy wrapped after
    // stop would strand the playable game behind an inactive research owner.
    let cancelError;
    try{if(this.raf!=null)this.cancel(this.raf)}
    catch(error){cancelError=error}
    this.raf=null;
    // Input reset may invoke game/UI hooks. Even a failing reset must never
    // leave the production lifecycle trapped behind the stopped pilot.
    let resetError;
    try{this.timeline.reset()}catch(error){resetError=error}
    if(typeof this.bridge.takeStaleTouchResetNotice==='function')
      this.bridge.takeStaleTouchResetNotice();
    this.lagMs=0;
    if(this.game.start===this.startWrapper){
      if(this.startHadOwn)this.game.start=this.originalStart;
      else delete this.game.start;
    }
    if(this.game.setPaused===this.pauseWrapper){
      if(this.pauseHadOwn)this.game.setPaused=this.originalSetPaused;
      else delete this.game.setPaused;
    }
    if(this.game.destroy===this.destroyWrapper){
      if(this.destroyHadOwn)this.game.destroy=this.originalDestroy;
      else delete this.game.destroy;
    }
    if(cancelError){
      if(resetError && cancelError && typeof cancelError==='object'){
        try{cancelError.cleanupError=resetError}catch(_ignored){}
      }
      throw cancelError;
    }
    if(resetError)throw resetError;
  }
}
// Compose the existing production Input handlers with chronological DOM
// ownership, then attach the bounded RAF. This factory remains opt-in and
// does not change the game's production startup path.
function createFixedStepBrowserPilot(game,{window:win,document:doc,clock,
    request,cancel,render,canvas=game&&game.canvas,maxSteps=2,backlogExtraTicks=2,
    shotOnlyPulseFactory=null}={}){
  if(!game || game.raf || !clock || typeof clock.now!=='function' ||
     (shotOnlyPulseFactory!==null && typeof shotOnlyPulseFactory!=='function'))
    throw Error('invalid browser fixed-step pilot');
  const {ChronologicalInput}=require('./fixed-step-dom-input.cjs');
  const {BrowserEventTimeline}=require('./fixed-step-browser-events.cjs');
  const {BrowserInputCapture}=require('./fixed-step-browser-capture.cjs');
  const timeline=new ChronologicalInput(game.input);
  const bridge=new BrowserEventTimeline(timeline,clock);
  const capture=new BrowserInputCapture(game.input,canvas,timeline,bridge,
    {window:win,document:doc,game});
  let owner,pulse=null;
  try{
    // The optional research pulse must wrap Game BEFORE FixedStepRafOwner
    // snapshots its lifecycle hooks. Installing it after the factory returns
    // fails the owner's lifecycle-integrity gate.
    if(shotOnlyPulseFactory){
      pulse=shotOnlyPulseFactory(game,timeline,bridge);
      if(!pulse || typeof pulse.detach!=='function')
        throw Error('invalid browser pulse owner');
    }
    owner=new FixedStepRafOwner(game,timeline,bridge,
      {now:()=>clock.now(),request,cancel,render,maxSteps,backlogExtraTicks,isVisible:()=>!doc.hidden});
  }catch(error){
    try{if(pulse)pulse.detach()}catch(cleanupError){
      if(error && typeof error==='object'){
        try{error.cleanupError=cleanupError}catch(_ignored){}
      }
    }
    try{capture.detach()}catch(cleanupError){
      if(error && typeof error==='object'){
        try{if(!error.cleanupError)error.cleanupError=cleanupError}catch(_ignored){}
      }
    }
    throw error;
  }
  // Fatal RAF/update/render failures call owner.stop() directly, bypassing
  // the pilot's public stop. Release every nested owner on every exit path.
  const stopOwner=owner.stop.bind(owner);
  owner.stop=function(){
    let failure;
    try{stopOwner()}catch(error){failure=error}
    try{if(pulse)pulse.detach()}catch(error){if(!failure)failure=error}
    try{capture.detach()}catch(error){if(!failure)failure=error}
    if(failure)throw failure;
  };
  return {timeline,bridge,capture,owner,pulse,
    start(){
      if(owner.started)throw Error('browser pilot already running');
      if(!capture.active)throw Error('browser pilot capture detached');
      try{owner.start()}catch(error){
        try{owner.stop()}catch(cleanupError){
          if(error && typeof error==='object'){
            try{error.cleanupError=cleanupError}catch(_ignored){}
          }
        }
        throw error;
      }
    },
    stop(){owner.stop()}};
}
module.exports={FixedStepRafOwner,createFixedStepBrowserPilot,STEP_MS};

}};
const cache=Object.create(null);
function load(name){
  if(name.startsWith('./'))name=name.slice(2);
  if(!Object.prototype.hasOwnProperty.call(factories,name))throw Error('Unknown fixed60 module: '+name);
  if(cache[name])return cache[name].exports;
  const module={exports:{}};cache[name]=module;
  try{factories[name](load,module,module.exports)}catch(error){delete cache[name];throw error}
  return module.exports;
}
const api=load('fixed-step-raf-owner.cjs');
root.__novaFixed60Research=Object.freeze({
  FixedStepRafOwner:api.FixedStepRafOwner,
  createFixedStepBrowserPilot:api.createFixedStepBrowserPilot,
  STEP_MS:api.STEP_MS
});
})(typeof window!=='undefined'?window:globalThis);
