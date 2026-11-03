'use strict';
// RESEARCH ONLY. Read-only decisions from existing game performance snapshots.
// Never resizes a canvas or modifies physics, input, simulation or rendering.
// Production promotion requires physical-device clarity, thermal and latency gates.
class AdaptiveDprPilot {
  constructor({initial=1.5,floor=1,ceiling=1.5,step=.25,
    dwellMs=4000,sampleMs=1000,downWindows=2,upWindows=3}={}) {
    if (![initial,floor,ceiling,step,dwellMs,sampleMs].every(Number.isFinite) ||
      floor<=0 || ceiling<floor || initial<floor || initial>ceiling ||
      step<=0 || dwellMs<0 || sampleMs<=0 ||
      !Number.isInteger(downWindows) || !Number.isInteger(upWindows) ||
      downWindows<1 || upWindows<1)
      throw Error('invalid adaptive DPR pilot configuration');
    this.dpr=initial;this.floor=floor;this.ceiling=ceiling;this.step=step;
    this.dwellMs=dwellMs;this.sampleMs=sampleMs;this.lastDecisionSample=-Infinity;
    this.downWindows=downWindows;this.upWindows=upWindows;
    this.lastChange=-Infinity;this.lastSample=-Infinity;
    this.downStreak=0;this.upStreak=0;this.changes=0;
  }
  observe(snapshot,now,{active=true}={}) {
    if(!Number.isFinite(now)||now<this.lastSample)
      throw Error('nonmonotonic DPR sample');
    this.lastSample=now;
    // Never adapt in menus, paused/hidden tabs, or incomplete/invalid windows.
    if(!active||!snapshot||!Number.isInteger(snapshot.frameSamples)||snapshot.frameSamples<60||
       !['fps','frameP95Ms','renderP95Ms','updateP95Ms','simulationPacePct']
         .every(k=>Number.isFinite(snapshot[k]))||snapshot.fps<=0||snapshot.frameP95Ms<=0||
       snapshot.renderP95Ms<0||snapshot.updateP95Ms<0||snapshot.simulationPacePct<0) {
      this.downStreak=0;this.upStreak=0;return this.dpr;
    }
    // A sliding 120-frame window is not independent evidence on every RAF.
    // Count at most one vote per sampleMs, never one vote per draw frame.
    if(now-this.lastDecisionSample<this.sampleMs)return this.dpr;
    this.lastDecisionSample=now;
    const {fps,frameP95Ms,renderP95Ms,updateP95Ms,simulationPacePct}=snapshot;
    // Lowering resolution cannot repair CPU-bound simulation.
    const renderLimited=fps<52&&frameP95Ms>19&&renderP95Ms>=8&&
      renderP95Ms>=updateP95Ms*1.5&&updateP95Ms<=1000/60;
    const healthy=fps>=57&&frameP95Ms<=19&&renderP95Ms<=7&&
      simulationPacePct>=98;
    this.downStreak=renderLimited?this.downStreak+1:0;
    this.upStreak=healthy?this.upStreak+1:0;
    if(now-this.lastChange<this.dwellMs)return this.dpr;
    let next=this.dpr;
    if(this.downStreak>=this.downWindows)next=Math.max(this.floor,this.dpr-this.step);
    else if(this.upStreak>=this.upWindows)next=Math.min(this.ceiling,this.dpr+this.step);
    next=Math.max(this.floor,Math.min(this.ceiling,Math.round(next*1000)/1000));
    if(next!==this.dpr) {
      this.dpr=next;this.lastChange=now;this.changes++;
      this.downStreak=0;this.upStreak=0;
    }
    return this.dpr;
  }
}
module.exports={AdaptiveDprPilot};
