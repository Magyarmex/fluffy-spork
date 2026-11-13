'use strict';
// FULL-GAME REGRESSION GATE: two physical pre-expiry contacts with one surviving
// tank must not depend on the order of the bullet array. Do not merge until
// the actual composed Game passes at 30/60/120/240 Hz.
const test=require('node:test');
const assert=require('node:assert/strict');
const previous=process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const {bootGame,withSeed}=require('../research/audio-rng-causal-pilot.cjs');
if(previous===undefined)delete process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL;
else process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL=previous;

function trial(hz,reverse,fullUpdate,only=null,targetX=40,mutate=null,maxFrames=20){
 return withSeed(1517802,()=>{
  const g=bootGame();
  if(!g.player)g.redeploy();
  g.sfx.muted=true;
  const p=g.player;
  p.x=targetX;p.y=0;p.cls='scout';p.gene=null;p.hp=1000;p.maxHp=1000;p.alive=true;
  p.spawnShieldT=0;p.shieldT=0;p.invulnT=0;p.bulwarkT=0;p.tauntT=0;
  p.regenDelay=10;p.droneRespawnT=999;
  p.vx=0;p.vy=0;
  const owners=[101,102].map((id,i)=>({
   kind:'tank',id,cls:'scout',x:-1200,y:i?1000:-1000,
   hp:100,maxHp:100,level:1,xp:0,score:0,kills:0,streak:0,name:'Owner '+id,alive:true,vx:0,vy:0,spawnShieldT:0,shieldT:0
  }));
  g.tanks=[p];
  g.tankById=new Map([[p.id,p]]);
  const originalGetTank=g.getTank.bind(g);
  g.getTank=id=>owners.find(t=>t.id===id)||originalGetTank(id);
  g.shapes=[];g.drones=[];g.__novaTerrain=[];
  g.hash.clear();for(const tank of g.tanks)g.hash.insert(tank);
  g.time=1;
  g.shapeTimer=999;g.powerupTimer=999;g.eliteTimer=999;
  g.powerups=[];g.orbs=[];g.aiRespawns=[];
  g.input.firing=false;g.input.autofire=false;
  g.input.moveVec=()=>({x:0,y:0});g.input.aimVec=()=>null;
  const bullets=[
   {kind:'bullet',id:201,ownerId:101,x:0,y:0,vx:6000,vy:0,
    r:3,dmg:20,ttl:.005,pen:1,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'},
   {kind:'bullet',id:202,ownerId:102,x:89,y:0,vx:-6000,vy:0,
    r:3,dmg:20,ttl:.005,pen:1,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'}
  ];
  if(mutate)mutate(g,p,bullets);
  const selected=only==null?bullets:bullets.filter(b=>b.id===only);
  g.bullets=reverse?selected.reverse():selected;
  // These pre-existing fixture projectile IDs must precede the live
  // frame-start allocation ceiling; otherwise they masquerade as newborns.
  g.nextId=Math.max(g.nextId||0,1200);
  const contacts=[],kills=[],frameTrace=[];
  const originalKill=g.killTank;
  g.killTank=function(victim,killer){
   if(victim===p)kills.push(killer&&killer.id);
   return originalKill.apply(this,arguments);
  };
  const original=g.damageTank;
  g.damageTank=function(t,damage,ownerId){
   if(t===p)contacts.push({ownerId,damage});
   return original.apply(this,arguments);
  };
  for(let frame=0;frame<maxFrames&&g.bullets.some(b=>b.id===201||b.id===202);frame++){
   if(hz===240&&frame<3)frameTrace.push({phase:'before',frame,time:g.time,
    epoch:g.__novaShapeSweepEpoch,frameStartEpoch:g.__novaFrameStartBulletEpoch,
    frameStartIdCeiling:g.__novaFrameStartBulletIdCeiling,
    bullets:g.bullets.filter(b=>b.id===201||b.id===202).map(b=>({
     id:b.id,x:b.x,ttl:b.ttl,pen:b.pen,hits:b.hits,dead:b.dead,
     victims:(b.__novaDirectVictims&&typeof b.__novaDirectVictims.values==='function')?
      [...b.__novaDirectVictims].map(t=>t&&t.id):null})),hp:p.hp});
   if(fullUpdate)g.update(1/hz);
   else {g.updateBullets(1/hz);g.time+=1/hz;}
   if(hz===240&&frame<3)frameTrace.push({phase:'after',frame,time:g.time,
    epoch:g.__novaShapeSweepEpoch,frameStartEpoch:g.__novaFrameStartBulletEpoch,
    frameStartIdCeiling:g.__novaFrameStartBulletIdCeiling,
    bullets:g.bullets.filter(b=>b.id===201||b.id===202).map(b=>({
     id:b.id,x:b.x,ttl:b.ttl,pen:b.pen,hits:b.hits,dead:b.dead,
     victims:(b.__novaDirectVictims&&typeof b.__novaDirectVictims.values==='function')?
      [...b.__novaDirectVictims].map(t=>t&&t.id):null})),hp:p.hp});
  }
  return {hp:p.hp,contacts,kills,frameTrace,ownerStats:owners.map(o=>({id:o.id,kills:o.kills,xp:o.xp,score:o.score})),remaining:g.bullets.map(b=>b.id),
   target:{x:p.x,y:p.y,alive:p.alive,shield:p.spawnShieldT,
    sweepTime:p.__novaSweepMoveTime,sweepX:p.__novaSweepPrevX},
   game:{time:g.time,status:g.status,shapeSweep:g.__novaShapeSweepActive}};
 });
}
for(const hz of [30,60,120,240])
 for(const fullUpdate of [false,true])
  test('same-victim two-shot TTL chronological parity '+hz+
       'Hz fullUpdate='+fullUpdate,()=>{
   const a=trial(hz,false,fullUpdate);
   const b=trial(hz,true,fullUpdate);
   for(const result of [a,b]){
    assert.equal(result.contacts.length,2,
      'two independently reachable nonlethal contacts must both register');
    assert.deepEqual(result.contacts.map(c=>c.ownerId).sort(),[101,102],
      'one contact from each distinct owner, never a duplicate hit');
    assert.equal(result.contacts.reduce((sum,c)=>sum+c.damage,0),40);
    assert.ok(result.hp>=959.99&&result.hp<960.5,
      'target loses 40 HP, allowing only normal end-of-update regeneration');
   }
   assert.deepEqual(
    a.contacts.map(c=>c.ownerId).sort(),
    b.contacts.map(c=>c.ownerId).sort(),
    'insertion order cannot change contact ownership');
  });

// Positive controls distinguish a broken fixture from the shared-victim
// arbitration defect. Each projectile must hit in isolation before expiry.
for(const hz of [30,60,120,240])for(const fullUpdate of [false,true])
 for(const id of [201,202])
  test('isolated full-game TTL control '+hz+'Hz update='+fullUpdate+
       ' bullet='+id,()=>{
   const result=trial(hz,false,fullUpdate,id);
   assert.equal(result.contacts.length,1,
    'an isolated pre-expiry hull contact must register: '+JSON.stringify(result));
   assert.equal(result.contacts[0].ownerId,id-100);
   assert.equal(result.contacts[0].damage,20);
  });

// Negative controls: no projectile can invent contact beyond its 5ms TTL.
for(const hz of [30,60,120,240])for(const fullUpdate of [false,true])
 test('full-game TTL no-phantom far hull '+hz+'Hz update='+fullUpdate,()=>{
  const result=trial(hz,false,fullUpdate,null,140);
  assert.equal(result.contacts.length,0);
  assert.equal(result.hp,1000);
 });

/* Adjacent safety gate: an earlier permanent wall must still intercept
 * the left shot; the independently reachable right shot must not be
 * erased by the now-dead competitor or granted a phantom wall bypass. */
for(const hz of [30,60,120,240])for(const reverse of [false,true])
 test('same-victim TTL pair preserves earlier permanent wall '+hz+
      'Hz reverse='+reverse,()=>{
  const result=trial(hz,reverse,false,null,40,g=>{
   g.__novaTerrain=[{id:-9101,shape:'rect',x:10,y:0,w:4,h:70,
    solid:true,destructible:false}];
  });
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102],
   'wall blocks left owner while right owner retains its legitimate contact');
 });

/* Dense but remote fire must not change local two-shot chronology or
 * accidentally invoke a first-N budget shortcut. This is intentionally
 * below the bounded local preflight's documented 300-entity ceiling. */
for(const hz of [30,60,120,240])for(const reverse of [false,true])
 test('same-victim TTL parity with 120 remote rounds '+hz+
      'Hz reverse='+reverse,()=>{
  const result=trial(hz,reverse,false,null,40,(_g,_p,bullets)=>{
   for(let i=0;i<120;i++)bullets.push({
    kind:'bullet',id:1000+i,ownerId:101,
    x:1500+i*2,y:1500,vx:0,vy:0,r:3,dmg:5,ttl:1,
    pen:0,hits:0,dead:false,shell:false,beam:false
   });
  });
  assert.deepEqual(result.contacts.map(c=>c.ownerId).sort(),[101,102],
   'unrelated remote bullets cannot suppress either legitimate contact');
 });


/* Regression for #234: the original same-victim fast path
 * explicitly refuses lethal or defense-changing callbacks. Here two ordinary
 * hostile rounds contact one 45-HP hull before their 5ms TTL, at distinct
 * physical times. A correct chronological solver must credit the later
 * shooter with the kill, independent of bullet insertion order and FPS.
 * This preserves normal damage and kill attribution; no balance change. */
for(const hz of [30,60,120,240])for(const reverse of [false,true])
 for(const fullUpdate of [false,true])
  test('RESEARCH lethal same-victim TTL chronology '+hz+
       'Hz reverse='+reverse+' fullUpdate='+fullUpdate,()=>{
   const result=trial(hz,reverse,fullUpdate,null,40,(_g,p,bullets)=>{
    bullets[1].dmg=30;
    p.hp=45;p.maxHp=45;p.regenDelay=999;
   });
   const expectedFirst=(40-21)/6000;
   const expectedSecond=(89-(40+21))/6000;
   assert.ok(expectedFirst>0&&expectedFirst<expectedSecond&&
     expectedSecond<.005,'both contacts must physically precede expiry');
   assert.deepEqual(result.contacts.map(c=>c.ownerId),[101,102],
     'earlier owner 101 damages first; later owner 102 must own the kill; trace='+JSON.stringify(result.frameTrace));
   assert.equal(result.contacts.reduce((sum,c)=>sum+c.damage,0),50,
     'no duplicate or missing damage across the lethal transition');
   assert.equal(result.target.alive,false,
     'the second chronological contact must kill the 45-HP hull');
   assert.deepEqual(result.kills,[102],
     'the actual kill callback must credit the later physical shooter');
   assert.equal(result.ownerStats[0].kills,0);
   assert.equal(result.ownerStats[1].kills,1);
   assert.ok(result.ownerStats[1].xp>0&&result.ownerStats[1].score>0,
     'the later shooter must receive the actual kill XP and score');
  });

/* Adversarial 240Hz carry-over controls: low HP alone must never
 * authorize a later shot that cannot physically contact before TTL,
 * or that is stopped by permanent cover. Keep the first real hit. */
for(const hz of [30,60,120,240])for(const reverse of [false,true])
 test('RESEARCH lethal carry-over refuses post-TTL contact '+hz+
      'Hz reverse='+reverse,()=>{
  const result=trial(hz,reverse,false,null,40,(_g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[1].dmg=30;bullets[1].x=100;
  });
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[101],
   'later shooter cannot receive a contact beyond physical TTL');
  assert.equal(result.target.alive,true);
  assert.deepEqual(result.kills,[]);
 });
for(const hz of [30,60,120,240])for(const reverse of [false,true])
 test('RESEARCH lethal carry-over respects permanent cover '+hz+
      'Hz reverse='+reverse,()=>{
  const result=trial(hz,reverse,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[1].dmg=30;
   g.__novaTerrain=[{id:-9102,shape:'rect',x:75,y:0,w:4,h:70,
    solid:true,destructible:false}];
  });
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[101],
   'right-hand shot must not bypass its earlier permanent wall');
  assert.equal(result.target.alive,true);
  assert.deepEqual(result.kills,[]);
 });

/* Canonical-speed analogue of the 5ms stress case: 540u/s, 420ms TTL.
 * Contact times use the actual Scout core radius (14 + bullet 3 + hull
 * padding 3 = 20). Compare a 411/415ms baseline with a 415/419ms
 * terminal-expiry case that crosses the 240Hz frame boundary.
 * Both contacts are before TTL, with no other bodies or terrain.
 * This checks that the short-TTL fix is not merely a 6000u/s artifact. */
for(const profile of [{first:.411,second:.415,label:'baseline'},
                      {first:.415,second:.419,label:'terminal-expiry'}])
 for(const hz of [30,60,120,240])for(const reverse of [false,true])
 for(const fullUpdate of [false,true])
 test('RESEARCH canonical-speed lethal same-victim '+profile.label+' '+hz+
      'Hz reverse='+reverse+' fullUpdate='+fullUpdate,()=>{
  const result=trial(hz,reverse,fullUpdate,null,40,(_g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*profile.first;
   bullets[0].vx=540;
   bullets[0].ttl=.42;
   bullets[1].x=60+540*profile.second;
   bullets[1].vx=-540;
   bullets[1].ttl=.42;
   bullets[1].dmg=30;
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[101,102],
   'both canonical-speed contacts must settle chronologically');
  assert.equal(result.target.alive,false);
  assert.deepEqual(result.kills,[102]);
  assert.equal(result.ownerStats[0].kills,0);
  assert.equal(result.ownerStats[1].kills,1);
  assert.ok(result.ownerStats[1].xp>0);
 });

/* The live-frame ordering shortcut must not promote a shot through an
 * earlier permanent wall. At canonical speed the left shot would otherwise
 * reach the hull at 411ms, while the right shot remains physically open. */
for(const hz of [60,120])for(const reverse of [false,true])
 for(const fullUpdate of [false,true])
 test('RESEARCH canonical-speed live pair respects permanent cover '+hz+
      'Hz reverse='+reverse+' fullUpdate='+fullUpdate,()=>{
  const result=trial(hz,reverse,fullUpdate,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   g.__novaTerrain=[{id:-9190,shape:'rect',x:18,y:0,w:2,h:70,
    solid:true,destructible:false}];
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102],
   'the permanent wall must absorb the earlier left-hand shot');
  assert.equal(result.target.alive,true);
  assert.deepEqual(result.kills,[]);
 });


/* #234 follow-up, deliberately RED acceptance experiment:
 * A spatially remote third round must not change the physical chronology of
 * two ordinary rounds hitting the same stationary hull in one frame.
 * Current two-shot live-order certificate abstains when bullets.length !== 2.
 * Do not merge this research gate until the real composed Game passes. */
for(const hz of [60,120])
 for(const reverse of [false,true])
 for(const fullUpdate of [false,true])
 test('RESEARCH three-shot remote-fire shared-hull chronology '+hz+
      'Hz reverse='+reverse+' fullUpdate='+fullUpdate,()=>{
  const result=trial(hz,reverse,fullUpdate,null,40,(_g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[101,102],
   'remote nonintersecting fire must not reverse the two physical hull contacts');
  assert.equal(result.target.alive,false);
  assert.deepEqual(result.kills,[102]);
  assert.equal(result.ownerStats[1].kills,1);
  assert.ok(result.ownerStats[1].xp>0);
 });


/* Fail-closed safety: a malformed third-party body radius cannot be
 * interpreted as zero clearance when certifying a remote third projectile.
 * Preserve ordinary core enumeration instead of granting a chronology proof
 * based on invalid geometry. This does not claim correct chronology when
 * the witness is malformed; it protects against a false certificate. */
for(const hz of [60,120])
 test('RESEARCH three-shot abstains on invalid body radius '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   g.shapes.push({kind:'shape',id:1300,x:1700,y:1700,r:-5,
    hp:100,maxHp:100,alive:true,dead:false,vx:0,vy:0});
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'invalid body geometry must abstain rather than certify a reorder');
 });


/* A present-but-nonfinite velocity must never become a zero-speed
 * clearance witness. NaN is falsy in JS, so e.vx||0 is unsafe here.
 * This asserts conservative abstention, not correctness of malformed
 * world-state physics. */
for(const hz of [60,120])
 test('RESEARCH three-shot abstains on nonfinite body velocity '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   g.shapes.push({kind:'shape',id:1300,x:1700,y:1700,r:5,
    hp:100,maxHp:100,alive:true,dead:false,vx:NaN,vy:0});
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'nonfinite velocity must prevent a speculative chronological reorder');
 });


/* An explicit invalid tank radius must not be replaced by the class
 * fallback through the falsy OR operator. A genuinely missing tank
 * radius may still use the canonical class size. */
for(const hz of [60,120])
 test('RESEARCH three-shot abstains on explicit zero tank radius '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(_g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;p.r=0;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'explicit zero radius must not be promoted to a valid clearance witness');
 });

/* The damage callback may spawn unrelated fire while the core iterates.
 * A newborn must not be promoted into the pre-frame three-shot proof, and
 * restoring the original pair's identity order must not overwrite it. */
for(const hz of [60,120])
 for(const reverse of [false,true])
 test('RESEARCH two-shot callback birth preserves owner and newborn '+hz+
      'Hz reverse='+reverse,()=>{
  const result=trial(hz,reverse,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   const oldDamage=g.damageTank;
   let born=false;
   g.damageTank=function(){
    if(!born){
     born=true;
     this.bullets.push({
      kind:'bullet',id:this.nextId++,ownerId:103,x:1500,y:1500,
      vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
      shell:false,beam:false,color:'#fff'
     });
    }
    return oldDamage.apply(this,arguments);
   };
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[101,102],
   'callback-born remote fire cannot change certified physical hit order');
  assert.deepEqual(result.kills,[102]);
  assert.equal(result.ownerStats[1].kills,1);
  assert.ok(result.remaining.some(id=>id>=1200),
   'newborn projectile identity must survive callback array churn');
 });


/* A malformed remote projectile cannot be certified merely because NaN
 * becomes zero through a falsy default in the legacy engine. */
for(const field of ['hits','knock'])
 for(const hz of [60,120])
 test('RESEARCH three-shot abstains on nonfinite remote '+field+' '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(_g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   const remote={
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   };
   remote[field]=NaN;
   bullets.push(remote);
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'malformed remote projectile must not certify chronological reordering');
 });


/* The core still regards an alive tank as a collision body even if its
 * hp/dead bookkeeping is contradictory. Never skip such a hull while
 * certifying that the unrelated third projectile has no side effects. */
for(const state of ['zero-hp','dead-flag','nan-hp'])
 test('RESEARCH three-shot abstains on contradictory tank '+state,()=>{
  const result=trial(60,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   const t={kind:'tank',id:1300,cls:'scout',x:1700,y:1700,
    hp:100,maxHp:100,alive:true,dead:false,vx:0,vy:0};
   if(state==='zero-hp')t.hp=0;
   if(state==='dead-flag')t.dead=true;
   if(state==='nan-hp')t.hp=NaN;
   g.tanks.push(t);
  },Math.ceil(.42*60)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'contradictory live tank must veto speculative chronology');
 });


/* Shape and drone core contact predicates differ from tank predicates.
 * Contradictory bookkeeping must not hide a still-collidable body. */
for(const kind of ['shape-zero-hp','drone-dead-flag'])
 test('RESEARCH three-shot abstains on contradictory '+kind,()=>{
  const result=trial(60,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   if(kind==='shape-zero-hp')
    g.shapes.push({kind:'shape',id:1300,x:1700,y:1700,r:12,
     hp:0,alive:true,dead:false,vx:0,vy:0});
   else
    g.drones.push({kind:'drone',id:1300,ownerId:999,x:1700,y:1700,
     r:8,hp:100,alive:true,dead:true,vx:0,vy:0});
  },Math.ceil(.42*60)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'contradictory body state must veto speculative chronology');
 });


/* Core tank and drone contact radii include class-specific padding.
 * The third-shot exclusion must use those same physical hull bounds,
 * not an optional undersized visual radius. */
for(const kind of ['tank','drone'])
 test('RESEARCH three-shot clearance uses core '+kind+' radius',()=>{
  const result=trial(60,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   if(kind==='tank')
    g.tanks.push({kind:'tank',id:1300,cls:'scout',x:1615,y:1500,
     r:1,hp:100,alive:true,dead:false,vx:0,vy:0});
   else
    g.drones.push({kind:'drone',id:1300,ownerId:999,x:1610,y:1500,
     r:1,hp:100,alive:true,dead:false,vx:0,vy:0});
  },Math.ceil(.42*60)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'core collision padding must veto an under-bounded clearance proof');
 });


/* Adversarial Live Vector witness: the drone controller can integrate
 * __lvVX independently of vx. A remote round must not be certified
 * interaction-free using only vx=0 and a generic 96-unit allowance.
 * This is deliberately a RED research gate until the movement proof
 * accounts for controller-driven motion or conservatively abstains. */
for(const channel of ['__lvVX','__novaVX','__novaIdleVX'])
 for(const hz of [60,120])
 test('RESEARCH three-shot abstains on unwitnessed drone '+channel+' '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   g.drones.push({kind:'drone',id:1300,ownerId:999,
    x:1700,y:1500,r:8,hp:100,alive:true,dead:false,
    vx:0,vy:0,[channel]:-12000});
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'unwitnessed Live Vector movement must veto speculative reordering');
 });


/* A Phase Shift relocates without traversing the intervening chord and
 * resets ordinary sweep coordinates. Its explicit same-frame marker must
 * veto the third-shot side-effect certificate. */
for(const hz of [60,120])
 test('RESEARCH three-shot abstains after Phase Shift '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   g.tanks.push({kind:'tank',id:1300,cls:'scout',x:1700,y:1700,
    hp:100,maxHp:100,alive:true,vx:0,vy:0,
    __novaSweepMoveTime:g.time,__novaSweepPrevX:1700,
    __novaSweepPrevY:1700});
   const phased=g.tanks[g.tanks.length-1];
   const priorUpdate=g.updateBullets;
   g.updateBullets=function(dt){
    // Emulate the real Phase Shift marker being stamped in this frame.
    phased.__novaPhaseShiftEpoch=this.time;
    return priorUpdate.call(this,dt);
   };
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'same-frame Phase Shift marker must veto remote-shot clearance');
 });

/* A moving shape can cross the remote shot's path during this frame.
 * Velocity times dt plus a guessed margin is not proof of its swept
 * trajectory; the research certificate must abstain on moving bodies. */
for(const hz of [60,120])
 test('RESEARCH three-shot abstains on moving remote shape '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   g.shapes.push({kind:'shape',id:1300,x:1700,y:1700,r:12,
    hp:100,maxHp:100,alive:true,dead:false,vx:-20,vy:0});
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'moving shape without a verified corridor must veto the reorder');
 });

/* A remote projectile with malformed damage or lifetime must not authorize
 * chronological reordering of the two unrelated local hull contacts.
 * These are abstention tests, not claims about malformed projectile physics. */
for(const field of ['dmg','ttl'])
 for(const value of [NaN,Infinity,-Infinity,0])
 test('RESEARCH three-shot abstains on malformed remote '+field+'='+value,()=>{
  const result=trial(60,false,false,null,40,(_g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   const remote={
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   };
   remote[field]=value;
   bullets.push(remote);
  },Math.ceil(.42*60)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'malformed remote damage/lifetime must veto speculative ordering');
 });

/* Current vx=0 does not establish a stationary tank. The existing
 * same-frame sweep origin is stronger evidence of actual displacement.
 * Preserve the core's original order rather than certify an unrelated
 * projectile harmless on the basis of a zero terminal velocity. */
for(const hz of [60,120])
 test('RESEARCH three-shot abstains on zero-velocity displaced tank '+hz+'Hz',()=>{
  const result=trial(hz,false,false,null,40,(g,p,bullets)=>{
   p.hp=45;p.maxHp=45;p.regenDelay=999;
   bullets[0].x=20-540*.411;bullets[0].vx=540;bullets[0].ttl=.42;
   bullets[1].x=60+540*.415;bullets[1].vx=-540;
   bullets[1].ttl=.42;bullets[1].dmg=30;
   bullets.push({
    kind:'bullet',id:1100,ownerId:103,x:1500,y:1500,
    vx:540,vy:0,r:3,dmg:5,ttl:1,pen:0,hits:0,dead:false,
    shell:false,beam:false,color:'#fff'
   });
   g.tanks.push({kind:'tank',id:1300,cls:'scout',x:1700,y:1700,
    hp:100,maxHp:100,alive:true,dead:false,vx:0,vy:0,
    __novaSweepMoveTime:g.time,__novaSweepPrevX:1600,
    __novaSweepPrevY:1700});
  },Math.ceil(.42*hz)+3);
  assert.deepEqual(result.contacts.map(c=>c.ownerId),[102,101],
   'witnessed tank displacement must veto zero-velocity clearance');
 });
