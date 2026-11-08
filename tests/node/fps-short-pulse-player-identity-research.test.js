'use strict';
// Research-only: a queued short firing intent must never migrate to a new
// player life when redeploy happens before the next simulation update.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');

function scenario({kind='touch',owner='shot',replace='afterRelease'}={}){
 const original={id:1,alive:true},replacement={id:2,alive:true};
 const shots=[];
 const input={touchSeen:kind!=='mouse',firing:false,mouseActive:false,
  keyboard:{},stickId:{aim:-1,move:-1},
  aim:{active:false,dx:0,dy:0},move:{active:false,dx:0,dy:0},
  pd(e){
   if(e.pointerType==='mouse'){this.mouseActive=true;this.firing=true;}
   else {this.stickId.aim=e.pointerId;this.aim.active=true;this.aim.dx=0;}
  },
  pm(e){if(this.stickId.aim===e.pointerId)this.aim.dx=e.clientX-600;},
  pu(e){
   if(e.pointerType==='mouse'){this.mouseActive=false;this.firing=false;}
   else if(this.stickId.aim===e.pointerId){
    this.stickId.aim=-1;this.aim.active=false;this.aim.dx=0;
   }
  },
  aimVec(){return {x:1,y:0};}
 };
 const game={input,player:original,status:'playing',paused:false,
  update(){if(input.firing)this.tryFire(this.player);this.updateDrones();},
  updateDrones(){},tryFire(player){shots.push(player.id);},destroy(){}};
 const timeline=new ChronologicalInput(input);
 const pulse=owner==='shot'?new ShotOnlyFirePulse(game,timeline):new SubtickFirePulse(game,timeline);
 const e=(type,x,buttons)=>({type,pointerType:kind,pointerId:22,button:0,
  buttons,clientX:x,clientY:200,target:{closest(){return null;}}});
 try{
  input.pd(e('pointerdown',600,1));
  if(kind!=='mouse')input.pm(e('pointermove',640,1));
  if(replace==='beforeRelease')game.player=replacement;
  input.pu(e('pointerup',640,0));
  assert.ok(pulse.pulse?.pending || pulse.pending,'a legal short tap must be pending');
  if(replace==='afterRelease')game.player=replacement;
  game.update(1/60);
  return {shots,shotsRecovered:pulse.shots||0,pending:!!(pulse.pulse?.pending||pulse.pending),
   firing:input.firing,aim:input.aim.active};
 }finally{pulse.detach();}
}

for(const owner of ['shot','subtick'])for(const kind of ['touch','mouse']){
 test(owner+' '+kind+' pending shot is canceled on redeploy before next tick',()=>{
  const result=scenario({owner,kind,replace:'afterRelease'});
  assert.deepEqual(result.shots,[]);
  assert.equal(result.pending,false);
  assert.equal(result.firing,false);
  assert.equal(result.aim,false);
 });
 test(owner+' '+kind+' press cannot be transferred to replacement player before release',()=>{
  const result=scenario({owner,kind,replace:'beforeRelease'});
  assert.deepEqual(result.shots,[]);
  assert.equal(result.pending,false);
  assert.equal(result.firing,false);
  assert.equal(result.aim,false);
 });
}
