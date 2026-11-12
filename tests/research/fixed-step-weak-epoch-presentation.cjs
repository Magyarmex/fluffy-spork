'use strict';
// RESEARCH ONLY. Alternative opt-in presenter storage for dense fixed60 scenes.
// Does not modify the shipping RAF, Game or Canvas renderer.
const KINDS=['tanks','drones','shapes','bullets'];
const MAX={tanks:96,drones:96,shapes:96,bullets:96,camera:96};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
class WeakEpochPosePresentation {
 constructor(game,{enabled=false}={}){
  if(!game||typeof game.update!=='function'||typeof game.destroy!=='function')
   throw Error('invalid weak epoch presentation game');
  this.game=game;this.enabled=enabled===true;
  this.records=new WeakMap();this.active=[];this.tick=0;
  this.playerRef=game.player;this.status=game.status;
  this.originalUpdate=game.update;this.originalDestroy=game.destroy;
  this.updateHadOwn=Object.prototype.hasOwnProperty.call(game,'update');
  this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
  this.frames=0;this.interpolated=0;this.teleportSkips=0;this.activePresenter=true;
  this.capture(true);
  const self=this;
  this.updateWrapper=function(...args){
   const out=self.originalUpdate.apply(this,args);
   if(self.activePresenter){
    const replaced=this.player!==self.playerRef||this.status!==self.status;
    self.tick++;self.capture(replaced);
    self.playerRef=this.player;self.status=this.status;
   }
   return out;
  };
  this.destroyWrapper=function(...args){
   self.stop();return self.originalDestroy.apply(this,args);
  };
  game.update=this.updateWrapper;game.destroy=this.destroyWrapper;
 }
 capture(reset){
  // Only active entities are retained strongly. WeakMap entries for expired
  // bullets and despawned drones can disappear with their objects.
  this.active.length=0;
  const add=(obj,kind)=>{
   if(!obj||typeof obj!=='object'||!finite(obj.x)||!finite(obj.y))return;
   let r=this.records.get(obj);
   if(!r){
    r={px:obj.x,py:obj.y,x:obj.x,y:obj.y,kind,tick:this.tick};
    this.records.set(obj,r);
   }else{
    const contiguous=r.tick===this.tick-1&&r.kind===kind&&!reset;
    r.px=contiguous?r.x:obj.x;r.py=contiguous?r.y:obj.y;
    r.x=obj.x;r.y=obj.y;r.kind=kind;r.tick=this.tick;
   }
   this.active.push(obj);
  };
  for(const kind of KINDS){
   const arr=this.game[kind];if(!Array.isArray(arr))continue;
   for(const obj of arr)add(obj,kind);
  }
  add(this.game.cam,'camera');
 }
 draw(render,g,w,h,alpha){
  if(!this.activePresenter||g!==this.game||typeof render!=='function')
   throw Error('invalid weak epoch presentation draw');
  this.frames++;
  if(!this.enabled||g.paused||!(alpha>=0&&alpha<=1))
   return render(g,w,h);
  const restored=[];
  try{
   for(const obj of this.active){
    const r=this.records.get(obj);
    if(!r||r.tick!==this.tick||!finite(obj.x)||!finite(obj.y)||
       obj.x!==r.x||obj.y!==r.y)continue;
    const dx=r.x-r.px,dy=r.y-r.py;
    const limit=r.kind==='bullets'&&finite(obj.vx)&&finite(obj.vy)?
     Math.max(MAX.bullets,Math.min(240,Math.hypot(obj.vx,obj.vy)*1.5/60)):
     MAX[r.kind];
    if(dx*dx+dy*dy>limit*limit){this.teleportSkips++;continue;}
    const x=r.px+dx*alpha,y=r.py+dy*alpha;
    if(x===r.x&&y===r.y)continue;
    restored.push([obj,r.x,r.y]);obj.x=x;obj.y=y;
    this.interpolated++;
   }
   return render(g,w,h);
  }finally{
   for(let i=restored.length-1;i>=0;i--){
    const [obj,x,y]=restored[i];obj.x=x;obj.y=y;
   }
  }
 }
 stop(){
  if(!this.activePresenter)return;
  this.activePresenter=false;
  const g=this.game;
  if(g.update===this.updateWrapper){
   if(this.updateHadOwn)g.update=this.originalUpdate;else delete g.update;
  }
  if(g.destroy===this.destroyWrapper){
   if(this.destroyHadOwn)g.destroy=this.originalDestroy;else delete g.destroy;
  }
  this.active.length=0;this.records=new WeakMap();
 }
}
module.exports={WeakEpochPosePresentation};
