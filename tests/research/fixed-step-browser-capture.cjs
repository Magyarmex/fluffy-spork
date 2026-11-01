'use strict';
// RESEARCH ONLY: own DOM input while a chronological fixed-step experiment runs.
// Do not install this in Game.start() until latency and device gates pass.
// The production Input is temporarily detached, so its native mouse chord
// handlers cannot mutate firing before the queued simulation tick.
class BrowserInputCapture {
  constructor(input, canvas, timeline, bridge, {window: win, document: doc} = {}) {
    if (!input || !canvas || !timeline || !bridge || !win || !doc ||
        timeline.input !== input || bridge.timeline !== timeline ||
        typeof input.attach !== 'function' || typeof input.detach !== 'function' ||
        typeof win.addEventListener !== 'function' ||
        typeof doc.addEventListener !== 'function' || input.canvas !== canvas)
      throw Error('invalid browser input capture owner');
    this.input = input; this.canvas = canvas; this.timeline = timeline;
    this.bridge = bridge; this.window = win; this.document = doc;
    this.listeners = []; this.active = false;
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
    this.timeline.reset();
    this.input.canvas = null;
    this.input.attach(this.canvas); // restore original production event owners
  }
}
module.exports = {BrowserInputCapture};
