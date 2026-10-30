'use strict';
// Issue #147: a nonlethal neutral contact physically before solid cover
// must win over the later wall, even when the frame endpoint lies beyond it.
// Execute the actual materialized Game.updateBullets and shipping Battlefield.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
function coreBullets(){
 const marker='    updateBullets(dt) {',start=html.indexOf(marker);
 assert.ok(start>=0,'materialized core missing');
 let pos=start+marker.length,depth=1;
 while(depth&&pos<html.length){if(html[pos]==='{')depth++;else if(html[pos]==='}')depth--;pos++;}
 assert.equal(depth,0);
 return new Function('types_1','classes_1','M',
  'return function(dt){'+html.slice(start+marker.length,pos-1)+'}')(
  {dist2:(ax,ay,bx,by)=>(ax-bx)**2+(ay-by)**2},
  {CLASSES:{scout:{size:15}}},2250);
}
function boot(optimized,full=false){
 class Game{
  constructor(){
   this.time=1;this.nextId=100;this.status='playing';
   this.bullets=[];this.tanks=[];this.shapes=[];this.drones=[];this.tmp=[];
   this.__novaTerrain=[];this.__novaBattlefield={name:'TEST',announced:true,coverBroken:0};
   this.cam={shake:0};this.sfx={};this.hits=[];this.tankById=new Map();
   this.hash={query:(_x,_y,_r,out)=>{out.length=0;out.push(...this.tanks,...this.shapes,...this.drones);}};
  }
 }
 for(const name of ['spawnPlayer','spawnShape','spawnPowerup','tryFire','updateDrones',
   'moveTank','addParticles','addRing','addFlash','addImpactDebris','splashAt',
   'initBulletIntegrity','resolveBulletCollisions','clusterBurst','weakenBullet',
   'setClass','useAbility','addText','nearestTank'])
  Game.prototype[name]=function(){};
 Game.prototype.randSpawnPos=()=>({x:1500,y:1500});
 Game.prototype.getTank=()=>null;
 Game.prototype.damageShape=function(s,dmg){this.hits.push(s.id);s.hp-=dmg;};
 Game.prototype.damageTank=function(t,dmg){this.hits.push(t.id);t.hp-=dmg;};
 Game.prototype.damageDrone=function(d,dmg){this.hits.push(d.id);d.hp-=dmg;};
 Game.prototype.updateBullets=coreBullets();
 Game.prototype.update=function(dt){this.updateBullets(dt);};
 class Sfx{resume(){}}
 const modules={'game/engine':m=>{m.exports={Game};},
  'game/audio':m=>{m.exports={Sfx};},
  'game/ai':m=>{m.exports={updateAI(){}};},
  'game/render':m=>{m.exports={render(){}};}};
 const context={window:{__novaModules:modules},console:{info(){},warn(){},error(){}},
  Math,Map,Set,Date,Number,Object,performance:{now:()=>0},
  document:{addEventListener(){}},navigator:{}};
 const overlays=full?['sniper-v1.2.0.js','polish-v1.3.1.js',
  'battlefield-v1.6.0.js','apex-disciplines-v1.7.1.js',
  'performance-v1.7.5.js','performance-v1.7.8.js',
  'precision-contact-v1.8.3.js']:['battlefield-v1.6.0.js'];
 if(optimized&&!full)overlays.push('performance-v1.7.5.js');
 for(const file of overlays)vm.runInNewContext(
  fs.readFileSync(path.join(root,'nova-updates',file),'utf8'),context,{filename:file});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>spec==='./classes'
  ?{CLASSES:{scout:{size:15}}}
  :{ARENA_HALF:2250});
 return m.exports.Game;
}
function trial(Game,{hz=30,vx=30000,squareX=40,wallX=80,
  squareY=0,wallY=0,born=false,moved=false,teleport=false,extraBullet=false,
  extraTank=false,fragile=false,pen=1,extraSquare=false,cover=false,
  dmg=12,radius=3,ttl=1,wallHeight=80,wallWidth=8,bulletY=0,linearVy=0,
  remoteBullets=0,reverseBullets=false,coverCompetitor=false,remoteShell=null}={}){
 const g=new Game();
 const square={kind:'shape',id:50,type:'square',x:squareX,y:squareY,r:20,hp:fragile?10:55};
 if(born)square.born=g.time;
 g.shapes=[square];
 if(extraSquare)g.shapes.push({kind:'shape',id:51,type:'square',
  x:squareX+9,y:squareY,r:20,hp:55});
 g.__novaTerrain=[{id:-51,shape:'rect',x:wallX,y:wallY,w:wallWidth,h:wallHeight,
  solid:true,destructible:cover,hp:cover?300:0}];
 g.bullets=[{kind:'bullet',id:10,ownerId:1,x:0,y:bulletY,vx,vy:0,
  r:radius,dmg,ttl,pen,hits:0,dead:false,shell:false,beam:false,splash:0}];
 if(extraBullet)g.bullets.push({kind:'bullet',id:11,ownerId:3,
  x:extraBullet==='remote'?1000:0,y:extraBullet==='remote'?1000:0,vx:0,vy:0,r:3,dmg:20,ttl:1,pen:0,hits:0,dead:extraBullet==='dead'});
 if(extraTank)g.tanks.push({kind:'tank',id:2,cls:'scout',alive:true,hp:100,x:30,y:0});
 /* Unrelated physical shots, spread over the actual 4,500-unit arena.
  * Their independent paths cannot reach the square, wall or each other. */
 for(let i=0;i<remoteBullets;i++)g.bullets.push({kind:'bullet',
  id:1000+i,ownerId:1000+i,x:-1900+(i%40)*95,
  y:850+Math.floor(i/40)*70,vx:0,vy:0,r:3,dmg:5,
  ttl:1,pen:0,hits:0,dead:false,shell:false,beam:false,splash:0});
 /* An unrelated round can hit a DIFFERENT face of the SAME destructible
  * barricade without approaching the focal square's narrow corridor.
  * The chronological handoff must not pre-commit the later cover hit. */
 if(coverCompetitor)g.bullets.push({kind:'bullet',id:900,ownerId:900,
  x:200,y:0,vx:-5000,vy:0,r:3,dmg:1,ttl:1,
  pen:0,hits:0,dead:false,shell:false,beam:false,splash:0});
 if(remoteShell){
  const cfg=remoteShell===true?{}:remoteShell;
  g.bullets.push({kind:'bullet',id:901,ownerId:901,
   x:cfg.x??1800,y:cfg.y??-1800,vx:cfg.vx??0,vy:cfg.vy??0,
   r:9,dmg:10,ttl:cfg.ttl??1,pen:1,hits:0,dead:false,
   shell:true,splash:100,__v17Cannon:!!cfg.cannon,
   __v17FuseDist:cfg.fuse??0,__v17SpawnX:cfg.spawnX,
   __v17SpawnY:cfg.spawnY});
 }
 if(reverseBullets)g.bullets.reverse();
 if(moved||teleport){
  const oldUpdate=g.update.bind(g);
  g.update=function(dt){square.x=squareX;square.y=teleport?120:squareY;oldUpdate(dt);};
  // Capture the actual frame-start shape, then move inside core update.
  const original=g.updateBullets.bind(g);
  g.updateBullets=function(dt){square.x=squareX;square.y=teleport?squareY:squareY+10;return original(dt);};
 }
 if(linearVy){
  /* Witnessed ordinary square integration inside the real update call,
   * not a synthetic post-frame teleport or a guessed endpoint. */
  const original=g.updateBullets.bind(g);
  g.updateBullets=function(dt){
   square.vx=0;square.vy=linearVy;square.y+=linearVy*dt;
   return original(dt);
  };
 }
 g.update(1/hz);
 return {g,square};
}
for(const optimized of [false,true]){
 const Game=boot(optimized),mode=optimized?'optimized':'baseline';
 for(const hz of [30,60,120,240]){
  test(mode+' square physically before cover is hit at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz});
   assert.deepEqual(g.hits,[50],'square must win the physical first contact');
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].solid,true);
  });
  test(mode+' square behind cover is never hit at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,squareX:120});
   assert.equal(square.hp,55);
   assert.deepEqual(g.hits,[]);
  });
 }
 /* Regression-first: a shot that reaches both contacts before its lifetime
  * ends must not be discarded merely because TTL < simulation dt.
  * At 30..240 Hz, 30,000u/s x 0.0035s = 105u, past the square
  * (first contact ~17u) and wall (~75u). Both occur before expiry. */
 for(const hz of [30,60,120,240]){
  test(mode+' expiring projectile still hits square before wall at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,ttl:.0035});
   assert.equal(square.hp,43,'first square contact precedes TTL and wall');
   assert.deepEqual(g.hits,[50]);
  });
 }
 /* Real Assassin profile (1500u/s, pen=4, 47 damage,
  * radius 5.8*(1+47*.0085)) against an ACTUAL Crossfire wall size:
  * 92x520. A grazing square (center y282, radius20) is physically
  * separated from the wall (top y260) by 2u. The shot at y262
  * contacts the square at x1.24 and the wall at x5.35, both within
  * its final 4ms (6u travel), even at 240Hz. */
 for(const hz of [30,60,120,240]){
  test(mode+' expiring Assassin grazes square before Crossfire wall at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:1500,squareX:21,squareY:282,
    wallX:55,wallWidth:92,wallHeight:520,bulletY:262,
    pen:4,dmg:47,radius:5.8*(1+47*.0085),ttl:.004});
   assert.equal(square.hp,8,'actual class weapon must not lose first contact');
   assert.deepEqual(g.hits,[50]);
  });
 }
 /* Canonical Scout (440u/s, pen=1, dmg12, launch radius 5 scaled
  * by damage) reaches a grazing square at x0.665 and actual Crossfire 180x60
  * destructible cover at x1.520 before its last 4ms expire (x1.76).
  * Square bottom y32 is 2u above Crossfire cover top y30. This is a legal
  * real-weapon, real-cover-shape case, not a 30,000u/s stress fixture. */
 for(const hz of [30,60,120,240]){
  test(mode+' expiring Scout hits square AND real-size cover at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,cover:true});
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].hp,288,'piercing shot still reaches cover before TTL');
   assert.deepEqual(g.hits,[50]);
  });
 }
 for(const hz of [30,60,120,240]){
  test(mode+' expiring Scout hits moving square then cover at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,linearVy:9});
   assert.equal(square.hp,43,'witnessed square first contact');
   assert.equal(g.__novaTerrain[0].hp,288,'later cover hit before TTL');
   assert.deepEqual(g.hits,[50]);
  });
 }
 /* Tight subframe ordering: correct 9u/s square contact at ~1.551ms,
  * cover at ~1.638ms. Incorrectly treating the square's full-frame
  * displacement as occurring within 4ms moves its predicted contact
  * behind cover at 30/60Hz. */
 for(const hz of [30,60]){
  test(mode+' moving square partial-TTL chronology beats near cover at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:93.2,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,linearVy:9});
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].hp,288);
  });
 }
 test(mode+' expiring pen=0 shot consumes itself before cover',()=>{
  const {g,square}=trial(Game,{hz:30,ttl:.0035,pen:0,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,300);
 });
 test(mode+' expiring pen=1 shot damages square then destructible cover',()=>{
  const {g,square}=trial(Game,{hz:30,ttl:.0035,pen:1,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,288);
 });
 test(mode+' expiry before wall never damages unreachable cover',()=>{
  const {g}=trial(Game,{hz:30,ttl:.0035,wallX:200,cover:true});
  assert.equal(g.__novaTerrain[0].hp,300);
 });
 test(mode+' square beyond physical TTL remains untouched',()=>{
  const {g,square}=trial(Game,{hz:30,ttl:.0035,
   squareX:150,wallX:200,cover:true});
  assert.equal(square.hp,55);
  assert.equal(g.__novaTerrain[0].hp,300);
 });
 test(mode+' competing projectile vetoes expiring square speculation',()=>{
  const {g,square}=trial(Game,{hz:30,ttl:.0035,extraBullet:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' expiring square after wall is never backdated',()=>{
  const {g,square}=trial(Game,{hz:240,vx:1500,squareX:50,squareY:282,
   wallX:55,wallWidth:92,wallHeight:520,bulletY:262,
   pen:4,dmg:47,radius:5.8*(1+47*.0085),ttl:.004});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' moving square with partial lifetime conservatively defers',()=>{
  const {g,square}=trial(Game,{hz:240,vx:1500,squareX:21,squareY:282,
   wallX:55,wallWidth:92,wallHeight:520,bulletY:262,
   pen:4,dmg:47,radius:5.8*(1+47*.0085),ttl:.004,moved:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' actual-speed nonlethal square hit precedes later cover',()=>{
  const {g,square}=trial(Game,{hz:30,vx:2000,squareX:32,wallX:65});
  assert.equal(square.hp,43);
  assert.deepEqual(g.hits,[50]);
 });
 test(mode+' newborn square cannot receive backdated contact',()=>{
  const {g,square}=trial(Game,{born:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' competing shot near square preserves original arbitration',()=>{
  const {g,square}=trial(Game,{extraBullet:true});
  assert.equal(square.hp,55);
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' remote projectile does not suppress independent square hit',()=>{
  const {g,square}=trial(Game,{extraBullet:'remote'});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' previously dead competing bullet cannot certify its old corridor',()=>{
  const {g,square}=trial(Game,{extraBullet:'dead'});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(mode+' witnessed bounded square motion receives real first contact',()=>{
  const {g,square}=trial(Game,{moved:true});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' discontinuous square teleport cannot create backdated contact',()=>{
  const {g,square}=trial(Game,{teleport:true});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(mode+' two potential square victims defer instead of choosing array order',()=>{
  const {g}=trial(Game,{extraSquare:true});
  assert.deepEqual(g.hits,[]);
 });
 test(mode+' lethal square damage defers to full chronology',()=>{
  const {g,square}=trial(Game,{fragile:true});
  assert.equal(square.hp,10);assert.deepEqual(g.hits,[]);
 });
 test(mode+' pen=1 square first then damages later destructible cover',()=>{
  const {g,square}=trial(Game,{cover:true});
  assert.equal(square.hp,43);
  assert.deepEqual(g.hits,[50]);
  assert.equal(g.__novaTerrain[0].hp,288,'surviving pen=1 bullet must still strike cover');
  assert.equal(g.__novaTerrain[0].solid,true);
 });
 test(mode+' pen=0 square first does not damage later destructible cover',()=>{
  const {g,square}=trial(Game,{pen:0,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,300,'consumed pen=0 shot never reaches cover');
 });
 test(mode+' pen=0 square hit consumes bullet before later wall',()=>{
  const {g,square}=trial(Game,{pen:0});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
  assert.equal(g.__novaTerrain[0].solid,true);
 });
 test(mode+' pen=2 round hits square then permanent wall',()=>{
  const {g,square}=trial(Game,{pen:2});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' canonical Assassin 1500u/s pen=4 hits square before permanent wall',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085)});
  assert.equal(square.hp,8);assert.deepEqual(g.hits,[50]);
 });
 test(mode+' pen=4 destructible wall retains legacy arbitration',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085),cover:true});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(mode+' competing tank before square preserves original arbitration',()=>{
  const {g,square}=trial(Game,{extraTank:true});
  assert.equal(square.hp,55);
  assert.ok(g.hits.every(id=>id!==50));
 });
}
test('actual production loads Battlefield before Performance',()=>{
 const b=html.indexOf('nova-updates/battlefield-v1.6.0.js');
 const p=html.indexOf('nova-updates/performance-v1.7.5.js');
 assert.ok(b>=0&&p>b);
});

/* Integration owner: the full shipping collision/presentation overlay stack
 * must not resurrect the wall hit or award a phantom contact behind cover. */
const FullGame=boot(true,true);
for(const hz of [30,60,120,240]){
 test('full shipping stack honors expiring square before wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,ttl:.0035});
  assert.equal(square.hp,43);assert.deepEqual(g.hits,[50]);
 });
 test('full shipping stack expiring Assassin square-before-wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,vx:1500,squareX:21,squareY:282,
   wallX:55,wallWidth:92,wallHeight:520,bulletY:262,
   pen:4,dmg:47,radius:5.8*(1+47*.0085),ttl:.004});
  assert.equal(square.hp,8);assert.deepEqual(g.hits,[50]);
 });
 test('full shipping stack expiring Scout hits square and cover at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,vx:440,squareX:16.5,squareY:52,
   wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
   pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,cover:true});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,288);
  assert.deepEqual(g.hits,[50]);
 });
 test('full shipping stack expiring Scout hits moving square and cover at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,vx:440,squareX:16.5,squareY:52,
   wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
   pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
   cover:true,linearVy:9});
  assert.equal(square.hp,43);
  assert.equal(g.__novaTerrain[0].hp,288);
  assert.deepEqual(g.hits,[50]);
 });
 if(hz===30||hz===60){
  test('full shipping stack orders moving square ahead of near cover at '+hz+'Hz',()=>{
   const {g,square}=trial(FullGame,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:93.2,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,linearVy:9});
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].hp,288);
  });
 }
 test('full shipping collision stack honors square before wall at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz});
  assert.deepEqual(g.hits,[50]);assert.equal(square.hp,43);
 });
 test('full shipping collision stack keeps wall before square at '+hz+'Hz',()=>{
  const {g,square}=trial(FullGame,{hz,squareX:120});
  assert.deepEqual(g.hits,[]);assert.equal(square.hp,55);
 });
}

/* Regression-first: the legacy >128-shot and >300-combined global veto
 * suppresses a proven earlier square contact even though every extra
 * projectile is distant and independently inspected for competition.
 * Keep the 260-body/600-total ceiling and all local-interception vetoes. */
for(const [label,Game] of [['baseline',boot(false)],['optimized',boot(true)],['full shipping',FullGame]]){
 for(const hz of [30,60,120,240])for(const reverseBullets of [false,true]){
  test(label+' dense remote fire preserves Scout square->cover at '+hz+'Hz reverse='+reverseBullets,()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,remoteBullets:180,reverseBullets});
   assert.equal(square.hp,43,'distant gunfire cannot erase earlier square hit');
   assert.equal(g.__novaTerrain[0].hp,288,'remaining penetration must hit cover');
   assert.deepEqual(g.hits,[50]);
  });
 }
 test(label+' 350 remote shots preserve Assassin square before permanent wall',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
   pen:4,dmg:47,radius:5.8*(1+47*.0085),remoteBullets:350});
  assert.equal(square.hp,8);assert.deepEqual(g.hits,[50]);
 });
 test(label+' nearby competitor still vetoes dense speculative square hit',()=>{
  const {g,square}=trial(Game,{hz:30,remoteBullets:180,extraBullet:true});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(label+' beyond 600 combined checks remains conservatively unmodified',()=>{
  const {g,square}=trial(Game,{hz:30,remoteBullets:610});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
 test(label+' wall before square stays protective amid remote gunfire',()=>{
  const {g,square}=trial(Game,{hz:30,squareX:120,remoteBullets:180});
  assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
 });
}

/* Adversarial counterexample to simply deleting the global singleton veto:
 * a different projectile can hit the SAME wall from the opposite face,
 * even when it never approaches the first square. The focal Scout's
 * speculative later-cover hit must abstain, leaving only the competitor's
 * one point of structural damage. */
for(const [label,Game] of [['baseline',boot(false)],['optimized',boot(true)],['full shipping',FullGame]]){
 for(const hz of [30,240])for(const reverseBullets of [false,true]){
  test(label+' same-cover competing shot vetoes speculative TTL chain at '+hz+'Hz reverse='+reverseBullets,()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,remoteBullets:180,coverCompetitor:true,reverseBullets});
   /* Same-cover competition is not yet a complete chronological resolver.
    * Preserve the conservative old path: the first square may be hit once
    * or missed, but must never receive a duplicate speculative hit. */
   assert.ok(square.hp===43||square.hp===55,
    'contested square may have zero or one ordinary hit, never phantom damage');
   assert.ok(g.hits.filter(id=>id===50).length<=1);
   assert.equal(g.__novaTerrain[0].hp,299,
    'only opposite-face competitor may damage this wall; focal chain must abstain');
  });
 }
}

/* Issue #147: a distant, provably unspent shell must not erase an earlier
 * square contact merely by existing. Use the same certified remote-shell
 * exclusion already protecting earlier tank contacts. */
for(const [label,Game] of [['baseline',boot(false)],['optimized',boot(true)],['full shipping',FullGame]]){
 for(const hz of [30,60,120,240])for(const reverseBullets of [false,true]){
  test(label+' remote unspent shell preserves square before permanent cover at '+hz+'Hz reverse='+reverseBullets,()=>{
   /* The one-frame wall proof is relevant only when the projectile actually
    * reaches the wall this frame. The real 1500u/s Assassin does at 30Hz;
    * higher rates use a fast synthetic stress shot to cross both contacts. */
   const cfg={hz,vx:hz===30?1500:30000,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085),reverseBullets};
   const control=trial(Game,cfg);
   const {g,square}=trial(Game,{...cfg,remoteShell:true});
   assert.equal(control.square.hp,8,'without shell this same physical contact must exist');
   assert.equal(square.hp,control.square.hp,'remote shell cannot suppress the physical square contact');
   assert.deepEqual(g.hits,[50],'the neutral square receives exactly one hit');
  });
 }
 for(const cfg of [{x:0,y:30},{ttl:.001}]){
  test(label+' shell hazard still vetoes speculative square chronology '+JSON.stringify(cfg),()=>{
   const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085),remoteShell:cfg});
   assert.equal(square.hp,55,'nearby or expiring shell is not certified harmless');
   assert.deepEqual(g.hits,[]);
  });
 }
}

/* The safe remote-shell exception must be a true noninterference property,
 * not just one hand-picked square. Compare identical worlds with and without
 * a shell that is unable to burst or contact the focal combat corridor. */
for(const [label,Game] of [['baseline',boot(false)],['optimized',boot(true)],['full shipping',FullGame]]){
 test(label+' 160 seeded independent-shell worlds preserve square and cover outcomes',()=>{
  let seed=0x6e0a2026;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<160;i++){
   const cfg={hz:[30,60,120,240][i%4],vx:440+Math.floor(rand()*1900),
    squareX:20+rand()*17,wallX:72+rand()*18,
    dmg:8+Math.floor(rand()*24),radius:3+rand()*3,
    pen:i%5,ttl:i%3===0?.004:1,cover:i%4===0,
    reverseBullets:i%2===0};
   const a=trial(Game,cfg),b=trial(Game,{...cfg,remoteShell:{
    x:1800,y:-1800,vx:400,vy:0,ttl:1}});
   assert.deepEqual([b.square.hp,b.g.__novaTerrain[0].hp,b.g.hits],
    [a.square.hp,a.g.__novaTerrain[0].hp,a.g.hits],
    'distant unspent shell must not alter square/cover outcome at seed '+i);
  }
 });
 for(const hz of [30,60,120,240]){
  test(label+' remote shell preserves physical Scout square then destructible cover at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,remoteShell:true});
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].hp,288);
   assert.deepEqual(g.hits,[50]);
  });
 }
}

/* Dense remote gunfire and programmed Cannon fuses are separate hazards.
 * Preserve first-contact order only if the existing shell certificate
 * proves that the fuse cannot fire during this frame. */
for(const [label,Game] of [['baseline',boot(false)],['optimized',boot(true)],['full shipping',FullGame]]){
 for(const hz of [30,60,120,240]){
  test(label+' remote shell and 180 independent rounds preserve Scout square/cover at '+hz+'Hz',()=>{
   const {g,square}=trial(Game,{hz,vx:440,squareX:16.5,squareY:52,
    wallX:94,wallWidth:180,wallHeight:60,bulletY:32,
    pen:1,dmg:12,radius:5*(1+12*.0085),ttl:.004,
    cover:true,remoteBullets:180,remoteShell:true});
   assert.equal(square.hp,43);
   assert.equal(g.__novaTerrain[0].hp,288);
   assert.deepEqual(g.hits,[50]);
  });
 }
 test(label+' remote Cannon shell with future programmed fuse preserves square contact',()=>{
  const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
   pen:4,dmg:47,radius:5.8*(1+47*.0085),
   remoteShell:{x:1800,y:-1800,vx:420,cannon:true,fuse:350,
    spawnX:1800,spawnY:-1800}});
  assert.equal(square.hp,8);assert.deepEqual(g.hits,[50]);
 });
 for(const cfg of [
  {x:1800,y:-1800,vx:420,cannon:true,fuse:1,spawnX:1800,spawnY:-1800},
  {x:1800,y:-1800,vx:420,cannon:true,fuse:350}]){
  test(label+' uncertified Cannon fuse keeps conservative square path '+JSON.stringify(cfg),()=>{
   const {g,square}=trial(Game,{hz:30,vx:1500,squareX:30,wallX:57,
    pen:4,dmg:47,radius:5.8*(1+47*.0085),remoteShell:cfg});
   assert.equal(square.hp,55);assert.deepEqual(g.hits,[]);
  });
 }
}
