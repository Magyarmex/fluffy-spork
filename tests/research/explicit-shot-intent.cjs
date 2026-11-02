'use strict';
/* RESEARCH ONLY: exact shipping Game source is patched solely by the opt-in
 * test harness. The production materializer and playable input remain intact.
 * A one-tick shot intent is read by player firing, not Controller drones. */
const {SubtickFirePulse}=require('./subtick-fire-pulse.cjs');
function once(source,needle,replacement,label){
 const i=source.indexOf(needle);
 if(i<0||source.indexOf(needle,i+needle.length)>=0)
  throw Error('research patch anchor missing or ambiguous: '+label);
 return source.slice(0,i)+replacement+source.slice(i+needle.length);
}
function patchEngineHtml(html){
 let result=once(html,'const aim = this.input.aimVec(mv);',
  'const shotIntent = this.input.__novaShotIntent;\n            const aim = shotIntent && shotIntent.aim ? shotIntent.aim : this.input.aimVec(mv);',
  'player aim');
 result=once(result,
  'const firing = this.input.firing || (this.input.autofire && !this.input.mouseActive && aimA !== null);',
  'const firing = this.input.firing || !!(shotIntent && shotIntent.fire === true) || (this.input.autofire && !this.input.mouseActive && aimA !== null);',
  'player fire');
 return result;
}
function patchDisciplines(js){
 return once(js,'if(t.isPlayer){\n    var a=g.input&&g.input.aim;',
  'if(t.isPlayer){\n    var shotIntent=g.input&&g.input.__novaShotIntent;\n    if(shotIntent&&Number.isFinite(shotIntent.depth))return clamp(shotIntent.depth,.08,1);\n    var a=g.input&&g.input.aim;',
  'Cannon depth');
}
class ExplicitShotIntent {
 constructor(game,timeline){
  if(!game||!game.input||!timeline||timeline.input!==game.input)throw Error('invalid intent owner');
  this.game=game;this.input=game.input;
  this.pulse=new SubtickFirePulse(game,timeline);
  this.oldUpdate=game.update;this.oldDestroy=game.destroy;
  this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
  this.intents=0;this.destroyWrapper=null;
  const self=this;
  game.update=function(...args){
   const p=self.pulse&&self.pulse.pending,input=self.input;
   const canPlay=!!p&&game.status==='playing'&&!game.paused&&!input.__novaInputPaused&&
     !(game.__testWindow&&game.__testWindow.document.hidden);
   if(!canPlay)return self.oldUpdate.apply(this,args);
   const touch=p.type==='touch'||p.type==='pen';
   const dx=input.aim.dx,dy=input.aim.dy,len=Math.hypot(dx,dy);
   const valid=touch?Number.isFinite(len)&&len>=9:p.type==='mouse';
   // Release physical controls before simulation, including drone updates.
   self.pulse.release();
   if(!valid)return self.oldUpdate.apply(this,args);
   const intent=Object.freeze({fire:true,
     aim:touch?Object.freeze({x:dx/len,y:dy/len}):null,
     depth:touch?Math.max(.08,Math.min(1,(len-5)/55)):null});
   if(input.__novaShotIntent)throw Error('shot intent already owned');
   input.__novaShotIntent=intent;
   try{const result=self.oldUpdate.apply(this,args);self.intents++;return result;}
   finally{delete input.__novaShotIntent;}
  };
  this.destroyWrapper=function(...args){self.detach();return self.oldDestroy.apply(this,args);};
  game.destroy=this.destroyWrapper;
 }
 detach(){
  if(!this.pulse)return;
  this.game.update=this.oldUpdate;
  this.pulse.detach();
  delete this.input.__novaShotIntent;
  if(this.game.destroy===this.destroyWrapper){
   if(this.destroyHadOwn)this.game.destroy=this.oldDestroy;
   else delete this.game.destroy;
  }
  this.pulse=null;
 }
}
module.exports={patchEngineHtml,patchDisciplines,ExplicitShotIntent};
