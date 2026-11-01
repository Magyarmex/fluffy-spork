'use strict';
// RESEARCH ONLY. Preserve an intentional sub-tick shot without keeping the
// Controller's live right-stick command active for an extra simulation step.
// Uses the existing event ownership/cancellation rules of SubtickFirePulse.
const {SubtickFirePulse} = require('./subtick-fire-pulse.cjs');
class ShotOnlyFirePulse {
  constructor(game, timeline) {
    this.game=game; this.input=game.input; this.timeline=timeline;
    this.pulse=new SubtickFirePulse(game,timeline);
    this.oldUpdate=game.update;
    this.oldDrones=game.updateDrones;
    this.oldDestroy=game.destroy;
    this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
    this.destroyWrapper=null;
    this.shots=0; this.maskDrones=false;
    const self=this;
    game.updateDrones=function(...args) {
      if (!self.maskDrones) return self.oldDrones.apply(this,args);
      const firing=self.input.firing;
      self.input.firing=false;
      try { return self.oldDrones.apply(this,args); }
      finally { self.input.firing=firing; }
    };
    game.update=function(...args) {
      const p=self.pulse.pending, input=self.input;
      const canPlay=!!p && game.status==='playing' && !game.paused &&
        !input.__novaInputPaused && !(game.__testWindow && game.__testWindow.document.hidden);
      if (!canPlay) return self.oldUpdate.apply(this,args);
      const touch=p.type==='touch'||p.type==='pen';
      const dx=input.aim.dx,dy=input.aim.dy,length=Math.hypot(dx,dy);
      const valid=touch ? length>=9 : p.type==='mouse';
      // Release the physical stick before any game logic runs, including
      // drone command and recall. Preserve only one firing opportunity.
      self.pulse.release();
      if (!valid) return self.oldUpdate.apply(this,args);
      const oldAimVec=input.aimVec;
      const hadOwnAimVec=Object.prototype.hasOwnProperty.call(input,'aimVec');
      const oldFiring=input.firing;
      if (touch) input.aimVec=function(){return {x:dx/length,y:dy/length};};
      input.firing=true;
      self.maskDrones=true;
      try { const out=self.oldUpdate.apply(this,args); self.shots++; return out; }
      finally {
        self.maskDrones=false;
        input.firing=oldFiring;
        if (hadOwnAimVec) input.aimVec=oldAimVec;
        else delete input.aimVec;
      }
    };
    this.destroyWrapper=function(...args) {
      self.detach();
      return self.oldDestroy.apply(this,args);
    };
    game.destroy=this.destroyWrapper;
  }
  detach() {
    if (!this.pulse) return;
    this.game.update=this.oldUpdate;
    this.game.updateDrones=this.oldDrones;
    this.pulse.detach();
    if (this.game.destroy===this.destroyWrapper) {
      if (this.destroyHadOwn) this.game.destroy=this.oldDestroy;
      else delete this.game.destroy;
    }
    this.pulse=null;
  }
}
module.exports={ShotOnlyFirePulse};
