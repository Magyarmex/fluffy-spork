'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/sniper-v1.2.0.js'),'utf8');
function boot(){
 let now=100;
 const CLASSES={railgun:{fireMode:'beam',barrels:[{}]},prism:{fireMode:'beam',barrels:[{},{}]},singularity:{fireMode:'beam',barrels:[{}]},gunner:{fireMode:'burst',barrels:[{}]}};
 function Sfx(){};for(const k of ['resume','shoot','novaRailIncoming','novaSniperCharge'])Sfx.prototype[k]=function(){};
 function Game(){this.bullets=[];this.tanks=[];this.time=0;this.w=800;this.h=600;this.cam={x:0,y:0,zoom:1};this.input={firing:false,autofire:false};this.sfx=new Sfx();this.paused=false}
 Game.prototype.syncHud=function(){};
 Game.prototype.setPaused=function(p){this.paused=!!p;this.syncHud()};
 Game.prototype.tryFire=function(t){this.bullets.push({ownerId:t.id,beam:true,dmg:10,vx:100,vy:0,pen:4,r:4});t.fireCd=1};
 for(const k of ['initBulletIntegrity','resolveBulletCollisions','update','weakenBullet'])Game.prototype[k]=function(){};
 const mods={'game/classes':m=>{m.exports={CLASSES}},'game/audio':m=>{m.exports={Sfx}},'game/engine':m=>{m.exports={Game}},'game/render':m=>{m.exports={render(){}}}};
 vm.runInNewContext(source,{window:{__novaModules:mods},console,Math,navigator:{vibrate(){}},performance:{now:()=>now}},{filename:'sniper-v1.2.0.js'});
 const cache={};
 function load(id){if(cache[id])return cache[id].exports;const m={exports:{}};cache[id]=m;mods[id](m,m.exports,s=>{if(s==='./classes')return load('game/classes');throw Error('unexpected '+s)});return m.exports}
 load('game/audio');const E=load('game/engine');load('game/render');
 return {Game:E.Game,setNow:n=>{now=n}};
}
function rail(id,cls,player,deadline){return {id,cls,isPlayer:player,alive:true,fireCd:0,angle:0,__novaFocusStart:50,__novaFocus:.5,__novaSuppressedUntil:deadline}}
for(const cls of ['railgun','prism','singularity']){
 test(cls+' suppression retains its remaining duration through a ten-second pause',()=>{
  const {Game,setNow}=boot(),g=new Game(),pl=rail(1,cls,true,280),ai=rail(2,cls,false,280),ordinary=rail(3,'gunner',false,280);
  g.player=pl;g.tanks=[pl,ai,ordinary];g.__novaPlayerHeldFire=true;
  setNow(100);g.setPaused(true);g.setPaused(true);setNow(10100);g.setPaused(false);
  assert.equal(pl.__novaSuppressedUntil,10280);
  assert.equal(ai.__novaSuppressedUntil,10280);
  assert.equal(ordinary.__novaSuppressedUntil,280);
  assert.equal(pl.__novaFocusStart,0);assert.equal(g.__novaPlayerHeldFire,false);
  assert.equal(ai.__novaFocusStart,50);
  g.tryFire(pl);assert.equal(g.bullets.length,0);
 });
}
test('expired suppression is never revived; redundant unpause is inert',()=>{
 const {Game,setNow}=boot(),g=new Game(),pl=rail(1,'railgun',true,90);
 g.player=pl;g.tanks=[pl];setNow(100);g.setPaused(true);setNow(10000);g.setPaused(false);
 assert.equal(pl.__novaSuppressedUntil,90);g.setPaused(false);assert.equal(pl.__novaSuppressedUntil,90);
});
test('repeated pause does not move pause origin; backwards clock cannot shorten deadline',()=>{
 const {Game,setNow}=boot(),g=new Game(),pl=rail(1,'railgun',true,280);
 g.player=pl;g.tanks=[pl];setNow(100);g.setPaused(true);setNow(150);g.setPaused(true);setNow(10100);g.setPaused(false);
 assert.equal(pl.__novaSuppressedUntil,10280);
 setNow(10300);g.setPaused(true);setNow(10200);g.setPaused(false);
 assert.equal(pl.__novaSuppressedUntil,10280);
});
test('seeded pause/deadline sweep preserves exactly the active remainder',()=>{
 const {Game,setNow}=boot();let seed=0x31415926;
 function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 for(let k=0;k<300;k++){
  const g=new Game(),start=100+Math.floor(rand()*20000),duration=Math.floor(rand()*20000),deadline=start+Math.floor(rand()*600)-200;
  const cls=['railgun','prism','singularity','gunner'][Math.floor(rand()*4)],pl=rail(1,cls,true,deadline),ai=rail(2,cls,false,deadline);
  g.player=pl;g.tanks=[pl,ai];setNow(start);g.setPaused(true);setNow(start+duration);g.setPaused(false);
  const expected=deadline+(cls!=='gunner'&&deadline>start?duration:0);
  assert.equal(pl.__novaSuppressedUntil,expected,'player case '+k);
  assert.equal(ai.__novaSuppressedUntil,expected,'AI case '+k);
 }
});


/* Sniper suppression is hostile fire, not friendly fire. The rail focus
 * should not be cancelled by another allied tank's projectile sweeping past. */
for (const cls of ['railgun', 'prism', 'singularity']) {
  for (const allied of [true, false]) {
    test(cls + ': ' + (allied ? 'allied' : 'hostile') +
      ' projectile crossing focus radius respects allegiance', () => {
      const { Game } = boot(), g = new Game();
      const pl = rail(1, cls, true, 0);
      const shooter = { id: 2, cls: 'gunner', team: allied ? 'blue' : 'red', alive: true };
      pl.team = 'blue'; pl.x = 0; pl.y = 0; pl.hitFlash = 0;
      g.player = pl; g.tanks = [pl, shooter]; g.tankById = new Map([[1, pl], [2, shooter]]);
      g.areAllies = (a, b) => a.team === b.team;
      g.input.firing = true; g.__novaPlayerHeldFire = true;
      g.bullets = [{ ownerId: 2, x: 40, y: 0, px: -40, py: 0,
        r: 2, dead: false }];
      g.update(1 / 60);
      if (allied) {
        assert.equal(pl.__novaFocusStart, 50, 'friendly shot cannot break focus');
        assert.equal(pl.__novaSuppressedUntil, 0);
      } else {
        assert.equal(pl.__novaFocusStart, 0, 'hostile shot must break focus');
        assert.ok(pl.__novaSuppressedUntil > 100);
      }
    });
  }
}


/* The same allegiance gate must protect AI Snipers without requiring a
 * player-held fire input or a player rail-focus state. */
for (const allied of [true, false]) {
  test('AI railgun: ' + (allied ? 'allied' : 'enemy') +
    ' projectile near focus respects allegiance', () => {
    const { Game } = boot(), g = new Game();
    const ai = rail(1, 'railgun', false, 0);
    ai.team = 'blue'; ai.x = 0; ai.y = 0; ai.hitFlash = 0;
    const shooter = { id: 2, cls: 'gunner', team: allied ? 'blue' : 'red', alive: true };
    const player = { id: 3, cls: 'gunner', isPlayer: true, alive: true };
    g.player = player; g.tanks = [ai, shooter, player];
    g.tankById = new Map([[1, ai], [2, shooter], [3, player]]);
    g.areAllies = (a, b) => a.team === b.team;
    g.bullets = [{ ownerId: 2, x: 40, y: 0, px: -40, py: 0,
      r: 2, dead: false }];
    g.update(1 / 60);
    assert.equal(ai.__novaFocusStart, allied ? 50 : 0);
  });
}
