const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function load(){
  function Ctx(){this.calls=[];}
  Ctx.prototype.fillText=function(text){this.calls.push(text);};
  Ctx.prototype.save=function(){};Ctx.prototype.restore=function(){};Ctx.prototype.setTransform=function(){};
  Ctx.prototype.translate=function(){};Ctx.prototype.rotate=function(){};Ctx.prototype.beginPath=function(){};
  Ctx.prototype.moveTo=function(){};Ctx.prototype.lineTo=function(){};Ctx.prototype.stroke=function(){};
  Ctx.prototype.arc=function(){};Ctx.prototype.fill=function(){};
  function Sfx(){this.ctx=null;this.master=null;this.muted=false;} Sfx.prototype.resume=function(){};
  function Game(){this.time=1;this.status='playing';this.w=800;this.h=600;this.dpr=1;this.cam={x:0,y:0,zoom:1};this.player={id:1,isPlayer:true,alive:true,x:0,y:0};this.bullets=[];this.sfx={shot:0,swoosh:0,novaPrecisionShotCue(){this.shot++;},novaPrecisionContactSwoosh(){this.swoosh++;}};}
  Game.prototype.tryFire=function(t){this.bullets.push({ownerId:t.id,x:t.x,y:t.y,vx:-500,vy:0,dead:false,__novaSniperLineage:true,__novaRail:false,beam:false});};
  Game.prototype.updateBullets=function(){};
  const baseRender=(g)=>{g.ctx.fillText('SHOT',10,10);};
  const mods={
    'game/engine':m=>{m.exports={Game};},
    'game/audio':m=>{m.exports={Sfx};},
    'game/render':m=>{m.exports={render:baseRender};}
  };
  const window={__novaModules:mods};
  const context={window,console,Math,performance:{now:()=>1000},CanvasRenderingContext2D:Ctx};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/precision-contact-v1.8.3.js'),'utf8'),context);
  const cache={};
  function req(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;mods[id](m,m.exports,()=>null);return m.exports;}
  return{context,window,Ctx,Game:req('game/engine').Game,Sfx:req('game/audio').Sfx,render:req('game/render').render};
}

test('distance mix is monotonic and bounded',()=>{
  const {window}=load(),h=window.__NOVA_CONTACT_SPARK_TEST__;
  assert.equal(h.distanceMix(50),1);
  assert.ok(h.distanceMix(500)>h.distanceMix(1200));
  assert.equal(h.distanceMix(2500),0);
});

test('screen edge intersection finds offscreen-to-onscreen manifestation',()=>{
  const {window}=load(),h=window.__NOVA_CONTACT_SPARK_TEST__,out={};
  const hit=h.segmentRectEntry(900,300,600,300,800,600,5,out);
  assert.ok(hit);
  assert.ok(hit.x<=795.0001&&hit.x>=794.9);
  assert.equal(hit.y,300);
  assert.equal(h.segmentRectEntry(400,300,500,300,800,600,5,{}),null);
});

test('engagement swoosh resets only after the quiet gap',()=>{
  const {window}=load(),h=window.__NOVA_CONTACT_SPARK_TEST__;
  assert.equal(h.shouldSwoosh(-99,1,1.35),true);
  assert.equal(h.shouldSwoosh(1,1.8,1.35),false);
  assert.equal(h.shouldSwoosh(1,2.5,1.35),true);
});

test('post-shot SHOT word is suppressed only inside game render',()=>{
  const {Ctx,render}=load(),ctx=new Ctx(),g={ctx,player:{alive:true},time:0};
  ctx.fillText('SHOT',0,0);
  assert.deepEqual(ctx.calls,['SHOT']);
  render(g,800,600);
  assert.deepEqual(ctx.calls,['SHOT']);
  ctx.fillText('SHOT',0,0);
  assert.deepEqual(ctx.calls,['SHOT','SHOT']);
});

test('offscreen hostile precision volley gets one contact spark and one swoosh',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0,__novaLineageRevealUntil:5};
  g.tryFire(enemy);
  assert.equal(g.sfx.shot,1);
  assert.ok(g.__v183Contact);
  assert.equal(g.__v183Contact.volleys.length,1);
  assert.equal(g.bullets[0].__novaPrecisionFlyby,true,'legacy flyby audio is ceded to entry swoosh');
  g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length,1);
  assert.equal(g.sfx.swoosh,1);
  assert.equal(enemy.__novaLineageRevealUntil,g.time,'source glint yields when the projectile enters');
  g.updateBullets(1.3);
  assert.equal(g.sfx.swoosh,1,'same volley cannot replay combat onset');
});


test('incoming precision contact does not signal a shot stopped by permanent cover before the viewport',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  let checks=0;
  g.firstTerrainHit=(ax,ay,bx,by,pad)=>{
    checks++;
    assert.equal(ax,1000); assert.equal(bx,350);
    return {solid:{shape:'rect',destructible:false,solid:true},hit:{t:.5}};
  };
  g.tryFire(enemy);
  g.updateBullets(1.3);
  assert.equal(checks,1,'only a crossing shot needs a terrain check');
  assert.equal(g.__v183Contact.sparks.length,0,'wall must suppress the false edge spark');
  assert.equal(g.sfx.swoosh,0,'wall must suppress the false incoming swoosh');
});

test('precision contact still announces a shot reaching the viewport before later permanent cover',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.firstTerrainHit=()=>({solid:{destructible:false,solid:true},hit:{t:.99}});
  g.tryFire(enemy);g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length,1);
  assert.equal(g.sfx.swoosh,1);
});

for(const [name,cover,shouldEnter] of [
  ['unbroken barricade',{destructible:true,solid:true,hp:100},false],
  ['spent penetration',{destructible:true,solid:true,hp:10},false],
  ['breached barricade',{destructible:true,solid:true,hp:10},true],
]){
  test('precision contact handles '+name+' before screen entry',()=>{
    const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
    g.firstTerrainHit=()=>({solid:cover,hit:{t:.5}});
    g.tryFire(enemy);
    const b=g.bullets[0];b.dmg=20;b.pen=name==='spent penetration'?1:3;
    g.updateBullets(1.3);
    assert.equal(g.__v183Contact.sparks.length,shouldEnter?1:0);
    assert.equal(g.sfx.swoosh,shouldEnter?1:0);
  });
}

test('terrain check is skipped when incoming shot does not approach the viewport this frame',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.firstTerrainHit=()=>{throw new Error('unnecessary terrain check');};
  g.tryFire(enemy);g.updateBullets(.1);
  assert.equal(g.__v183Contact.sparks.length,0);
});

test('precision contact without Battlefield terrain API retains original edge behavior',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.tryFire(enemy);g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length,1);
});


test('a blocked first round does not suppress an unobstructed second round in the same volley',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.firstTerrainHit=(ax,ay)=>ay===0?
   {solid:{destructible:false,solid:true},hit:{t:.4}}:null;
  g.tryFire(enemy);
  const second={...g.bullets[0],id:11,y:100};
  g.bullets.push(second);
  g.__v183Contact.volleys[0].bullets.push(second);
  g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length,1);
  assert.equal(g.sfx.swoosh,1);
});

test('terrain cue API errors fail open without interrupting combat',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.firstTerrainHit=()=>{throw Error('injected terrain error');};
  g.tryFire(enemy);
  assert.doesNotThrow(()=>g.updateBullets(1.3));
  assert.equal(g.__v183Contact.sparks.length,1);
  assert.equal(g.sfx.swoosh,1);
  assert.equal(g.__novaContactTerrainWarning,true);
});


test('precision contact never announces a projectile that expires before the frame is rendered',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.tryFire(enemy);
  g.bullets[0].ttl=.2;
  g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length,0,'expired projectile has no visible arrival');
  assert.equal(g.sfx.swoosh,0);
});
test('precision contact still announces a projectile with sufficient lifetime',()=>{
  const {Game}=load(),g=new Game(),enemy={id:7,isPlayer:false,alive:true,x:1000,y:0};
  g.tryFire(enemy);
  g.bullets[0].ttl=1.31;
  g.updateBullets(1.3);
  assert.equal(g.__v183Contact.sparks.length,1);
  assert.equal(g.sfx.swoosh,1);
});
