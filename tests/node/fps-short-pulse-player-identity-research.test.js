'use strict';
// Research-only: a queued short firing intent must never migrate to a new
// player life when redeploy happens before the next simulation update.
const test=require('node:test');
const assert=require('node:assert/strict');
const {ChronologicalInput}=require('../research/fixed-step-dom-input.cjs');
const {SubtickFirePulse}=require('../research/subtick-fire-pulse.cjs');
const {ShotOnlyFirePulse}=require('../research/shot-only-fire-pulse.cjs');
const {ExplicitShotIntent}=require('../research/explicit-shot-intent.cjs');

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
  update(){if(input.firing||input.__novaShotIntent?.fire)this.tryFire(this.player);this.updateDrones();},
  updateDrones(){},tryFire(player){shots.push(player.id);},destroy(){}};
 const timeline=new ChronologicalInput(input);
 const pulse=owner==='shot'?new ShotOnlyFirePulse(game,timeline):
  owner==='explicit'?new ExplicitShotIntent(game,timeline):new SubtickFirePulse(game,timeline);
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

for(const owner of ['shot','subtick','explicit'])for(const kind of ['touch','mouse']){
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

for(const owner of ['shot','subtick','explicit']){
 test(owner+' mouse-chord synthetic release cannot fire replacement player',()=>{
  const shots=[];
  const input={touchSeen:false,mouseActive:false,firing:false,
   aim:{active:false,dx:0,dy:0},stickId:{aim:-1},
   pd(){this.mouseActive=true;this.firing=true;},
   pm(){this.firing=false;},pu(){this.mouseActive=false;this.firing=false;},
   aimVec(){return{x:1,y:0};}
  };
  const old={id:1},fresh={id:2};
  const game={input,player:old,status:'playing',paused:false,
   update(){if(input.firing)this.tryFire(this.player);this.updateDrones();},
   updateDrones(){},tryFire(p){shots.push(p.id);},destroy(){}};
  const timeline={input,reset(){},releaseAll(){}};
  const pulse=owner==='shot'?new ShotOnlyFirePulse(game,timeline):new SubtickFirePulse(game,timeline);
  try{
   input.pd({type:'pointerdown',pointerType:'mouse',pointerId:1,button:0,buttons:1,
    target:{closest(){return null;}}});
   input.pm({type:'pointermove',pointerType:'mouse',pointerId:1,button:-1,buttons:2,
    __novaOriginalAt:.005,__novaTimestampTrusted:true});
   assert.ok(pulse.pulse?.pending||pulse.pending);
   game.player=fresh;
   game.update(1/60);
   assert.deepEqual(shots,[]);
   assert.equal(!!(pulse.pulse?.pending||pulse.pending),false);
   assert.equal(input.firing,false);
  }finally{pulse.detach();}
 });
}

for(const owner of ['shot','subtick','explicit'])for(const kind of ['touch','mouse']){
 test(owner+' '+kind+' held old-life input is canceled before new-life update',()=>{
  const shots=[];
  const input={touchSeen:kind!=='mouse',firing:false,mouseActive:false,
   aim:{active:false,dx:0,dy:0},stickId:{aim:-1},
   pd(e){if(e.pointerType==='mouse'){this.mouseActive=true;this.firing=true;}
    else{this.stickId.aim=e.pointerId;this.aim.active=true;}},
   pm(e){if(this.stickId.aim===e.pointerId)this.aim.dx=e.clientX-600;},
   pu(e){if(e.pointerType==='mouse'){this.mouseActive=false;this.firing=false;}
    else if(this.stickId.aim===e.pointerId){this.stickId.aim=-1;
     this.aim.active=false;this.aim.dx=0;}},
   aimVec(){return{x:1,y:0};}
  };
  const old={id:1},fresh={id:2};
  const game={input,player:old,status:'playing',paused:false,
   update(){if(input.firing||input.__novaShotIntent?.fire)this.tryFire(this.player);this.updateDrones();},
   updateDrones(){},tryFire(p){shots.push(p.id);},destroy(){}};
  const timeline={input,reset(){},releaseAll(){}};
  const pulse=owner==='shot'?new ShotOnlyFirePulse(game,timeline):
   owner==='explicit'?new ExplicitShotIntent(game,timeline):new SubtickFirePulse(game,timeline);
  try{
   input.pd({type:'pointerdown',pointerType:kind,pointerId:22,button:0,
    target:{closest(){return null;}}});
   if(kind==='touch')input.pm({type:'pointermove',pointerType:kind,pointerId:22,clientX:640});
   game.player=fresh;
   game.update(1/60);
   assert.deepEqual(shots,[]);
   assert.equal(input.firing,false);
   assert.equal(input.aim.active,false);
   assert.equal(input.mouseActive,false);
   assert.equal(!!(pulse.pulse?.down||pulse.down),false);
  }finally{pulse.detach();}
 });
}


// A held press can outlive several simulation updates. Its life ownership
// must survive those updates, but an already-sampled release must not create
// a second firing opportunity.
for(const owner of ['shot','subtick','explicit'])for(const kind of ['touch','mouse']){
 for(const redeploy of [false,true]){
  test(owner+' '+kind+' sampled held input '+(redeploy?'cannot transfer on redeploy':'cannot fire again on release'),()=>{
   const shots=[],original={id:1},replacement={id:2};
   const input={touchSeen:kind!=='mouse',firing:false,mouseActive:false,
    aim:{active:false,dx:0,dy:0},stickId:{aim:-1},
    pd(e){if(e.pointerType==='mouse'){this.mouseActive=true;this.firing=true;}
     else{this.stickId.aim=e.pointerId;this.aim.active=true;this.aim.dx=40;this.firing=true;}},
    pm(){},pu(e){if(e.pointerType==='mouse'){this.mouseActive=false;this.firing=false;}
     else if(this.stickId.aim===e.pointerId){this.stickId.aim=-1;
      this.aim.active=false;this.firing=false;}},
    aimVec(){return{x:1,y:0};}
   };
   const game={input,player:original,status:'playing',paused:false,
    update(){if(input.firing||input.__novaShotIntent?.fire)this.tryFire(this.player);this.updateDrones();},
    updateDrones(){},tryFire(p){shots.push(p.id);},destroy(){}};
   const timeline={input,reset(){},releaseAll(){}};
   const pulse=owner==='shot'?new ShotOnlyFirePulse(game,timeline):
    owner==='explicit'?new ExplicitShotIntent(game,timeline):new SubtickFirePulse(game,timeline);
   const event=(type)=>({type,pointerType:kind,pointerId:22,button:0,buttons:type==='pointerup'?0:1,
    target:{closest(){return null;}}});
   try{
    input.pd(event('pointerdown'));
    game.update(1/60);
    assert.deepEqual(shots,[1],'the original life receives the first sampled shot');
    if(redeploy){
     game.player=replacement;
     game.update(1/60);
     assert.deepEqual(shots,[1],'the new life must not inherit held fire');
     assert.equal(input.firing,false);
     assert.equal(input.aim.active,false);
     assert.equal(input.mouseActive,false);
    }else{
     input.pu(event('pointerup'));
     assert.equal(!!(pulse.pulse?.pending||pulse.pending),false,
      'a sampled press must not become a new short pulse');
     game.update(1/60);
     assert.deepEqual(shots,[1],'release cannot duplicate the sampled shot');
    }
   }finally{pulse.detach();}
  });
 }
}
