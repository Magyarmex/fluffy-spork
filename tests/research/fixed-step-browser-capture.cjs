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
      if (this.document.hidden) { this.timeline.reset();
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
      if (this.document.hidden) { this.timeline.reset();
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
      this.timeline.reset();
      if (typeof this.bridge.takeStaleTouchResetNotice === 'function')
        this.bridge.takeStaleTouchResetNotice();
    } };
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
