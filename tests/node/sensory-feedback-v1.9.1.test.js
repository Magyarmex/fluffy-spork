const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/sensory-feedback-v1.9.1.js'),'utf8');

function load(){
  const CLASSES={
    twin:{bullet:{reload:.5},fireMode:'single',size:14},
    minigun:{bullet:{reload:.16},fireMode:'minigun',size:15},
    marksman:{bullet:{reload:1.2},fireMode:'single',size:14},
    railgun:{bullet:{reload:1.55},fireMode:'beam',size:14},
    guard:{bullet:{reload:.7},fireMode:'single',size:16}
  };
  const classes={CLASSES,lineageForClass:id=>(id==='marksman'||id==='railgun')?'sniper':id==='guard'?'guardian':'gunner'};
  function Sfx(){this.ctx=null;this.master=null;this.muted=false;}
  Sfx.prototype.resume=function(){};
  function Game(){
    this.time=10;this.w=1000;this.h=700;this.cam={x:0,y:0,zoom:1,shake:0};
    this.bullets=[];this.powerups=[];this.drones=[];this.tanks=[];this.tankById=new Map();
    this.player=null;this.sfx=new Sfx();this.rings=0;this.particles=0;
  }
  Game.prototype.getTank=function(id){return this.tanks.find(t=>t.id===id)||null;};
  Game.prototype.tryFire=function(t){if((t.fireCd||0)>0)return;this.bullets.push({ownerId:t.id});t.fireCd=CLASSES[t.cls].bullet.reload;};
  Game.prototype.damageTank=function(t,dmg){if(t.block)return;t.hp=Math.max(0,t.hp-dmg);if(t.hp<=0)t.alive=false;};
  Game.prototype.damageShape=function(s,dmg){s.hp=Math.max(0,s.hp-dmg);};
  Game.prototype.damageDrone=function(d,dmg){d.hp=Math.max(0,d.hp-dmg);if(d.hp<=0)d.dead=true;};
  Game.prototype.applyPowerup=function(t,type){t.lastPower=type;};
  Game.prototype.spawnPowerup=function(){this.powerups.push({id:90+this.powerups.length,type:'shield',x:120,y:0});};
  Game.prototype.useAbility=function(t){if((t.abilityCd||0)>0)return;t.abilityCd=2;};
  Game.prototype.applyClass=function(id){if(!CLASSES[id])return;this.player.cls=id;this.player.color=id==='guard'?'#f6a':'#6ff';};
  Game.prototype.applyPerk=function(id){if(!id)return;this.player.perk=id;};
  Game.prototype.applyGene=function(id){if(!id)return;this.player.gene=id;};
  Game.prototype.update=function(dt){this.time+=dt;for(const t of this.tanks){t.fireCd=Math.max(0,(t.fireCd||0)-dt);t.abilityCd=Math.max(0,(t.abilityCd||0)-dt);}};
  Game.prototype.addRing=function(){this.rings++;};
  Game.prototype.addParticles=function(){this.particles++;};
  Game.prototype.hasLineOfSight=function(){return true;};
  const render={render(){}};
  const mods={
    'game/audio':m=>m.exports={Sfx},
    'game/classes':m=>m.exports=classes,
    'game/engine':m=>m.exports={Game},
    'game/render':m=>m.exports=render
  };
  const c={window:{__novaModules:mods},console:{info(){},error(){}},Math,Number,Date,performance:{now:()=>1000}};
  vm.runInNewContext(source,c);
  const cache={};
  function req(id){
    if(cache[id])return cache[id].exports;
    const m={exports:{}};cache[id]=m;
    mods[id](m,m.exports,s=>s==='./classes'?req('game/classes'):null);
    return m.exports;
  }
  req('game/audio');req('game/render');
  return{c,Game:req('game/engine').Game,Sfx:req('game/audio').Sfx,render:req('game/render'),classes};
}
function tank(id,cls,x=0,y=0,player=false){return{id,cls,x,y,hp:100,maxHp:100,alive:true,isPlayer:player,fireCd:0,abilityCd:0,color:player?'#6ff':'#f77'};}
function setup(){const L=load(),g=new L.Game(),p=tank(1,'twin',0,0,true),e=tank(2,'guard',100,0,false);g.player=p;g.tanks=[p,e];g.tankById.set(1,p);g.tankById.set(2,e);return{...L,g,p,e};}

test('publishes presentation-only Impact Language v1.9.1',()=>{
  const {c}=load();
  assert.equal(c.window.__NOVA_VERSION,'1.9.1');
  assert.equal(c.window.__NOVA_FEEDBACK_RELEASE__.codename,'Impact Language');
  assert.equal(c.window.__NOVA_FEEDBACK__.presentationOnly,true);
});

test('successful player fire creates a visual impulse and slow reload ready cue',()=>{
  const {g,p}=setup();let ready=0;g.sfx.novaFeedbackReady=()=>ready++;
  g.tryFire(p);const s=g.__v191Feedback;
  assert.ok(s.shotUntil>g.time);assert.equal(s.reloading,true);
  g.update(.30);assert.equal(ready,0);g.update(.25);assert.equal(ready,1);assert.ok(s.readyUntil>g.time);
});

test('rapid-fire and beam weapons do not create repetitive reload-ready spam',()=>{
  const {Game}=load();
  for(const cls of ['minigun','marksman','railgun']){
    const g=new Game(),p=tank(1,cls,0,0,true);g.player=p;g.tanks=[p];g.tankById.set(1,p);let ready=0;g.sfx.novaFeedbackReady=()=>ready++;
    g.tryFire(p);g.update(2);assert.equal(ready,0,cls+' should not emit ready spam');
  }
});

test('confirmed player damage and kills are distinguished without altering damage',()=>{
  const {g,p,e}=setup();let hit=[];g.sfx.novaFeedbackHit=(pan,power,kill)=>hit.push(kill);
  g.damageTank(e,20,p.id,0,0);assert.equal(e.hp,80);assert.equal(g.__v191Feedback.hitKill,false);assert.deepEqual(hit,[false]);
  g.damageTank(e,90,p.id,0,0);assert.equal(e.hp,0);assert.equal(e.alive,false);assert.equal(g.__v191Feedback.hitKill,true);assert.deepEqual(hit,[false,true]);
});

test('incoming damage stores source direction, severity, and critical state',()=>{
  const {g,p,e}=setup();e.x=100;e.y=0;let damage=0;g.sfx.novaFeedbackDamage=()=>damage++;
  g.damageTank(p,75,e.id,0,0);const s=g.__v191Feedback;
  assert.equal(p.hp,25);assert.ok(Math.abs(s.damageAngle)<1e-9);assert.equal(s.damageCritical,true);assert.equal(damage,1);
});

test('zero-damage canonical outcomes do not produce false hit confirmation',()=>{
  const {g,p,e}=setup();let hits=0;g.sfx.novaFeedbackHit=()=>hits++;e.block=true;g.damageTank(e,50,p.id,0,0);assert.equal(e.hp,100);assert.equal(hits,0);assert.equal(g.__v191Feedback,undefined);
});

test('player bullet hits on farm shapes join the same restrained hit language',()=>{
  const {g,p}=setup();let hits=0;g.sfx.novaFeedbackHit=()=>hits++;const sh={id:30,type:'circle',x:45,y:0,r:12,hp:14,maxHp:14};g.bullets.push({ownerId:p.id,x:43,y:0,r:5,dead:false});g.damageShape(sh,7,400,0);assert.equal(sh.hp,7);assert.equal(hits,1);assert.equal(g.__v191Feedback.hitColor,'#5ad1ff');assert.equal(g.__v191Feedback.hitKill,false);
});

test('powerups, abilities and evolution each create distinct acknowledgements',()=>{
  const {g,p}=setup();let pickup=0,ability=0,evolve=0;
  g.sfx.novaFeedbackPickup=()=>pickup++;g.sfx.novaFeedbackAbility=()=>ability++;g.sfx.novaFeedbackEvolve=()=>evolve++;
  g.applyPowerup(p,'heal');assert.equal(p.lastPower,'heal');assert.equal(pickup,1);assert.equal(g.__v191Feedback.powerColor,'#75f0a3');
  g.useAbility(p);assert.equal(p.abilityCd,2);assert.equal(ability,1);assert.ok(g.__v191Feedback.abilityUntil>g.time);
  g.applyClass('guard');g.applyPerk('x');g.applyGene('y');assert.equal(evolve,3);assert.ok(g.__v191Feedback.evolveUntil>g.time);
});

test('invalid evolution calls do not create false celebration cues',()=>{
  const {g}=setup();let evolve=0;g.sfx.novaFeedbackEvolve=()=>evolve++;
  g.applyClass('not-a-class');g.applyPerk(null);g.applyGene(null);
  assert.equal(evolve,0);assert.equal(g.__v191Feedback,undefined);
});

test('nearby spawned powerups get spatial world pings',()=>{
  const {g}=setup();let pings=0;g.sfx.novaFeedbackPowerSpawn=()=>pings++;g.spawnPowerup();assert.equal(pings,1);assert.ok(g.rings>0);
});

test('friendly drone loss and hostile drone kill get different link-break feedback',()=>{
  const {g,p,e}=setup();let cues=[];g.sfx.novaFeedbackDrone=(pan,friendly)=>cues.push(friendly);
  const fd={id:7,ownerId:p.id,x:10,y:0,hp:10},hd={id:8,ownerId:e.id,x:20,y:0,hp:10};g.drones=[fd,hd];
  g.damageDrone(fd,20,e.id);g.damageDrone(hd,20,p.id);assert.deepEqual(cues,[true,false]);assert.equal(g.__v191Feedback.droneFriendly,false);
});

test('critical health heartbeat is throttled by gameplay time and stops after recovery',()=>{
  const {g,p}=setup();let beats=0;g.sfx.novaFeedbackHeartbeat=()=>beats++;p.hp=20;g.update(.01);assert.equal(beats,1);g.update(.2);assert.equal(beats,1);p.hp=80;g.update(.1);assert.equal(g.__v191Feedback.critical,false);
});
