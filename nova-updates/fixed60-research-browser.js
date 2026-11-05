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
    this.staleClamps = 0;
    this.lateClamps = 0;
    this.reorderedClamps = 0;
    this.invalidTimestamps = 0;
  }
  capture(event) {
    if (!event || !KINDS.has(event.type)) throw Error('unsupported browser input event');
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
    const capture = e => {
      if (!this.active) return;
      if (this.document.hidden) { this.timeline.reset(); return; }
      this.bridge.capture(e);
    };
    // Native mouse events are required for button chords: Pointer Events do
    // not emit a second pointerdown when primary is pressed after secondary.
    // Map the native primary edge to the existing pointer replay contract;
    // do not invent an independent firing state or bypass Input's touch gate.
    const native = type => e => {
      if (!this.active || !e || e.button !== 0) return;
      if (this.document.hidden) { this.timeline.reset(); return; }
      this.bridge.capture({type, timeStamp:e.timeStamp, pointerType:'mouse',
        pointerId:1, button:e.button, buttons:e.buttons,
        clientX:e.clientX, clientY:e.clientY, target:e.target,
        defaultPrevented:e.defaultPrevented,
        sourceCapabilities:e.sourceCapabilities});
    };
    const release = () => { if (this.active) this.timeline.reset(); };
    const hidden = () => { if (this.document.hidden) release(); };
    const spec = [
      [canvas,'pointerdown',capture],
      [win,'pointermove',capture],[win,'pointerup',capture],
      [win,'pointercancel',capture],
      [win,'keydown',capture],[win,'keyup',capture],
      [canvas,'mousedown',native('pointerdown')],
      [win,'mouseup',native('pointerup')],
      [win,'blur',release],[doc,'visibilitychange',hidden]
    ];
    this.timeline.reset();
    input.detach();
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
      this.detach();
      throw error;
    }
  }
  detach() {
    if (!this.active) return;
    this.active = false;
    for (const [target,type,fn] of this.listeners.reverse())
      target.removeEventListener(type,fn);
    this.listeners.length = 0;
    if (this.game && this.game.destroy === this.destroyWrapper) {
      if (this.destroyHadOwn) this.game.destroy = this.originalDestroy;
      else delete this.game.destroy;
    }
    this.timeline.reset();
    this.input.canvas = null;
    this.input.attach(this.canvas); // restore original production event owners
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
  constructor(game,timeline,bridge,{now,request,cancel,render,maxSteps=2}={}) {
    if (!game || typeof game.update!=='function' || !game.sfx ||
        !timeline || timeline.input!==game.input ||
        typeof timeline.consumeThrough!=='function' ||
        !bridge || bridge.timeline!==timeline || !Number.isFinite(bridge.startMs) ||
        typeof now!=='function' || typeof request!=='function' ||
        typeof cancel!=='function' || typeof render!=='function' ||
        !Number.isInteger(maxSteps) || maxSteps<1 || maxSteps>4)
      throw Error('invalid fixed-step RAF owner');
    this.game=game;this.timeline=timeline;this.bridge=bridge;
    this.now=now;this.request=request;this.cancel=cancel;this.render=render;
    this.maxSteps=maxSteps;this.started=false;this.raf=null;
    this.lastMs=0;this.simAtSec=0;this.lagMs=0;this.ticks=0;
    this.droppedMs=0;this.droppedFrames=0;this.paused=false;
    this.alpha=0;this.lastSteps=0;this.minimapTimer=0;
    // Every scheduled callback has a unique ticket. Cancelled callbacks may
    // still be delivered by a host after stop/restart; they must never
    // advance a newly started world or schedule a second RAF chain.
    this._generation=0;this._requestSeq=0;
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
    this._generation++;this.started=true;this.lastMs=at;this.simAtSec=(at-this.bridge.startMs)/1000;
    this.timeline.reset();this.timeline.tickOrigin=this.simAtSec;
    this.timeline.consumeThrough(this.simAtSec);
    this.paused=!!this.game.paused;
    try{this.game.sfx.startMusic()}
    catch(error){this.started=false;this.timeline.reset();throw error}
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
    catch(error){this.stop();throw error}
  }
  transition(paused,at){
    if(!Number.isFinite(at)||at<this.lastMs-EPS)throw Error('invalid pause clock');
    this.timeline.reset();this.lagMs=0;this.paused=paused;
    this.lastMs=at;this.simAtSec=(at-this.bridge.startMs)/1000;
    // A new simulation epoch changes the tick grid used for safe pointermove coalescing.
    this.timeline.tickOrigin=this.simAtSec;
    this.timeline.consumeThrough(this.simAtSec);
  }
  frame(ts){
    if(!this.started)throw Error('fixed-step RAF is not running');
    if(!Number.isFinite(ts)||ts<this.lastMs-EPS)throw Error('nonmonotonic RAF timestamp');
    try{this.schedule();this.advance(ts)}
    catch(error){this.stop();throw error}
  }
  advance(ts){
    const g=this.game;
    const raw=Math.max(0,ts-this.lastMs);
    this.lastMs=ts;
    this.lastSteps=0;
    if(g.paused){
      if(!this.paused){this.timeline.reset();this.lagMs=0;this.paused=true;}
      this.simAtSec=(ts-this.bridge.startMs)/1000;
    }else if(this.paused){
      // Resume without consuming the elapsed menu/evolution time. Input must
      // be re-armed by fresh browser events, never by a stale held command.
      this.timeline.reset();this.lagMs=0;this.paused=false;
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
        this.timeline.reset();this.lagMs=0;
        this.simAtSec=(ts-this.bridge.startMs-maxMs)/1000;
        this.timeline.tickOrigin=this.simAtSec;
        this.timeline.consumeThrough(this.simAtSec);
        this.lagMs=maxMs;
      }else{
        this.lagMs+=raw;
        // Keep at most two extra full steps of backlog for transient jitter.
        // Under sustained overload, skip only whole ticks, retaining
        // chronological input edges that are still valid after the skip.
        const maxBacklog=(this.maxSteps+2)*STEP_MS;
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
      if(g.paused){this.timeline.reset();this.lagMs=0;this.paused=true;}
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
    this.started=false;this._generation++;this._requestSeq++;
    // A host may throw while cancelling a queued browser callback. Even then,
    // release all lifecycle hooks: leaving Game.start/destroy wrapped after
    // stop would strand the playable game behind an inactive research owner.
    let cancelError;
    try{if(this.raf!=null)this.cancel(this.raf)}
    catch(error){cancelError=error}
    this.raf=null;this.timeline.reset();this.lagMs=0;
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
    if(cancelError)throw cancelError;
  }
}
// Compose the existing production Input handlers with chronological DOM
// ownership, then attach the bounded RAF. This factory remains opt-in and
// does not change the game's production startup path.
function createFixedStepBrowserPilot(game,{window:win,document:doc,clock,
    request,cancel,render,canvas=game&&game.canvas,maxSteps=2}={}){
  if(!game || game.raf || !clock || typeof clock.now!=='function')
    throw Error('invalid browser fixed-step pilot');
  const {ChronologicalInput}=require('./fixed-step-dom-input.cjs');
  const {BrowserEventTimeline}=require('./fixed-step-browser-events.cjs');
  const {BrowserInputCapture}=require('./fixed-step-browser-capture.cjs');
  const timeline=new ChronologicalInput(game.input);
  const bridge=new BrowserEventTimeline(timeline,clock);
  const capture=new BrowserInputCapture(game.input,canvas,timeline,bridge,
    {window:win,document:doc,game});
  let owner;
  try{owner=new FixedStepRafOwner(game,timeline,bridge,
    {now:clock.now,request,cancel,render,maxSteps})}
  catch(error){capture.detach();throw error}
  return {timeline,bridge,capture,owner,
    start(){
      if(owner.started)throw Error('browser pilot already running');
      if(!capture.active)throw Error('browser pilot capture detached');
      try{owner.start()}catch(error){capture.detach();throw error}
    },
    stop(){
      // Release DOM ownership even when a hostile RAF host rejects cancel().
      try{owner.stop()}finally{capture.detach()}
    }};
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
