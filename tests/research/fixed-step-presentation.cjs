'use strict';
// RESEARCH ONLY. Render-time pose interpolation for an opt-in fixed-step Game.
// Never patches the production renderer or RAF; simulation state is restored
// before returning even if a renderer throws. At 60Hz use the original render.
const TRACKED=['tanks','drones','shapes'];
const MAX_STEP={tanks:96,drones:96,shapes:96,camera:96};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function snapshot(game){
 const map=new Map();
 for(const kind of TRACKED){
  const arr=game[kind];if(!Array.isArray(arr))continue;
  for(const obj of arr){
   if(obj&&typeof obj==='object'&&finite(obj.x)&&finite(obj.y))
    map.set(obj,{x:obj.x,y:obj.y,kind});
  }
 }
 const cam=game.cam;
 if(cam&&typeof cam==='object'&&finite(cam.x)&&finite(cam.y))
  map.set(cam,{x:cam.x,y:cam.y,kind:'camera'});
 return map;
}
class FixedStepPosePresentation {
 constructor(game,{enabled=false}={}){
  if(!game||typeof game.update!=='function'||typeof game.destroy!=='function')
   throw Error('invalid fixed-step presentation game');
  this.game=game;this.enabled=enabled===true;
  this.current=snapshot(game);this.previous=this.current;
  this.originalUpdate=game.update;this.originalDestroy=game.destroy;
  this.updateHadOwn=Object.prototype.hasOwnProperty.call(game,'update');
  this.destroyHadOwn=Object.prototype.hasOwnProperty.call(game,'destroy');
  this.active=true;this.frames=0;this.interpolated=0;this.teleportSkips=0;
  const self=this;
  this.updateWrapper=function(...args){
   // A failed update is never allowed to leave a speculative visual pose.
   const out=self.originalUpdate.apply(this,args);
   if(self.active){self.previous=self.current;self.current=snapshot(this);}
   return out;
  };
  this.destroyWrapper=function(...args){
   self.stop();return self.originalDestroy.apply(this,args);
  };
  game.update=this.updateWrapper;
  game.destroy=this.destroyWrapper;
 }
 draw(render,g,w,h,alpha){
  if(!this.active||g!==this.game||typeof render!=='function')
   throw Error('invalid fixed-step presentation draw');
  this.frames++;
  if(!this.enabled||g.paused||!(alpha>0&&alpha<1))
   return render(g,w,h);
  const restored=[];
  try{
   for(const [obj,now] of this.current){
    const old=this.previous.get(obj);
    if(!old||old.kind!==now.kind||!finite(obj.x)||!finite(obj.y)||
       obj.x!==now.x||obj.y!==now.y)continue;
    const dx=now.x-old.x,dy=now.y-old.y,limit=MAX_STEP[now.kind];
    if(dx*dx+dy*dy>limit*limit){this.teleportSkips++;continue;}
    const x=old.x+dx*alpha,y=old.y+dy*alpha;
    if(x===now.x&&y===now.y)continue;
    restored.push([obj,now.x,now.y]);obj.x=x;obj.y=y;
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
  if(!this.active)return;
  this.active=false;
  const g=this.game;
  if(g.update===this.updateWrapper){
   if(this.updateHadOwn)g.update=this.originalUpdate;else delete g.update;
  }
  if(g.destroy===this.destroyWrapper){
   if(this.destroyHadOwn)g.destroy=this.originalDestroy;else delete g.destroy;
  }
  this.previous.clear();if(this.current!==this.previous)this.current.clear();
 }
}
module.exports={FixedStepPosePresentation};
