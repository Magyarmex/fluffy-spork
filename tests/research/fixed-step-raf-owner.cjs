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
    this._generation++;this.started=true;this.lastMs=at;this._awaitingForwardFrame=true;this.simAtSec=(at-this.bridge.startMs)/1000;
    this.timeline.reset();this.timeline.consumeThrough(this.simAtSec);
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
    this.timeline.consumeThrough(this.simAtSec);
  }
  frame(ts){
    if(!this.started)throw Error('fixed-step RAF is not running');
    try{
      if(!Number.isFinite(ts))throw Error('nonmonotonic RAF timestamp');
      // RAF timestamps describe frame beginnings; startup can occur later
      // within the same frame. Clamp only bounded initial skew, not later
      // backward delivery. Invalid timestamps must also release ownership.
      if(ts<this.lastMs-EPS){
        if(!this._awaitingForwardFrame || this.lastMs-ts>50)
          throw Error('nonmonotonic RAF timestamp');
        ts=this.lastMs;
      }else this._awaitingForwardFrame=false;
      this.schedule();this.advance(ts);
    }catch(error){this.stop();throw error}
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
