'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {playPublicPrelude} = require('../research/redeploy-public-prelife.cjs');
function setup() {
  const player = {id:1,x:0,y:0,hp:100,alive:true,score:0};
  const oldMove = () => ({x:0,y:0}), oldAim = () => ({x:1,y:0});
  const game = {
    player, time:0, status:'playing', cam:{x:0,y:0},
    input:{mouseActive:true,autofire:false,firing:true,moveVec:oldMove,aimVec:oldAim},
    shapes:[{id:2,x:120,y:0,hp:5},{id:3,x:900,y:0,hp:5}],
    tanks:[player,{id:4,ai:true,x:200,y:100,hp:100}],
    __novaTerrain:[{id:5,x:500,y:0,hp:100}],
    __lfState:{stats:{playerNeutralXP:0}},
    hasLineOfSight:()=>true,
    update(dt) {
      const move=this.input.moveVec(), aim=this.input.aimVec();
      this.player.x+=move.x*dt*80;this.player.y+=move.y*dt*80;
      if(aim && this.input.autofire) {
        this.shapes[0].hp--;this.__lfState.stats.playerNeutralXP+=2;
        this.player.score+=2;
      }
      this.tanks[1].x+=dt*20;
      this.time+=dt;
    }
  };
  const fair={viewportHalfExtents:()=>({x:300,y:200})};
  return {game,player,fair,oldMove,oldAim};
}
test('prelude simulates visible-only movement and firing, then restores original input owners',()=>{
  const {game,player,fair,oldMove,oldAim}=setup();
  const result=playPublicPrelude(game,10,0.3,fair);
  assert.equal(result.ticks,3);
  assert.equal(result.naturalDeath,false);
  assert.ok(result.travelled>0);
  assert.equal(result.neutralXPEarned,6);
  assert.equal(result.changedEnemies,1);
  assert.ok(result.changedShapes>0);
  assert.deepEqual(result.origin,{x:player.x,y:player.y});
  assert.equal(game.input.moveVec,oldMove);
  assert.equal(game.input.aimVec,oldAim);
  assert.equal(game.input.autofire,false);
  assert.equal(game.input.mouseActive,true);
  assert.equal(game.input.firing,true);
});
test('natural first-life death is retained rather than overwritten by a scripted death',()=>{
  const {game,fair}=setup();
  const original=game.update;
  game.update=function(dt){original.call(this,dt);if(this.time>=0.2)this.player.alive=false;};
  const result=playPublicPrelude(game,10,1,fair);
  assert.equal(result.naturalDeath,true);
  assert.equal(result.ticks,2);
  assert.equal(result.elapsed,0.2);
  assert.equal(game.input.autofire,false);
});
test('first life can react only to a visible hostile and an approaching visible projectile',()=>{
  const {game,fair}=setup();
  game.tanks[1].x=0;game.tanks[1].y=100;
  game.bullets=[{id:9,x:80,y:0,vx:-400,vy:0,ttl:1,r:3,ownerId:999}];
  fair.inGameplayViewport=()=>true;
  const aims=[],moves=[],original=game.update;
  game.update=function(dt){
    aims.push(this.input.aimVec());
    moves.push(this.input.moveVec());
    original.call(this,dt);
  };
  playPublicPrelude(game,10,0.1,fair);
  assert.ok(aims[0].y>0.9,'hostile target must be physically visible and in the viewport');
  assert.ok(moves[0].y<0,'visible incoming projectile causes a lateral dodge');
  game.tanks[1].spawnShieldT=1;
  game.bullets=[];
  aims.length=0;
  playPublicPrelude(game,10,0.1,fair);
  assert.ok(aims[0].x>0.9,'spawn-shielded hostile cannot steal neutral aim');
});
test('invalid or unobservable prelude cannot silently use private state',()=>{
  const {game,fair}=setup();
  assert.throws(()=>playPublicPrelude(game,0,2,fair),/finite/);
  assert.throws(()=>playPublicPrelude(game,30,61,fair),/finite/);
  assert.throws(()=>playPublicPrelude(game,30,2,null),/public viewport/);
  game.player.x=Infinity;
  assert.throws(()=>playPublicPrelude(game,30,2,fair),/public viewport/);
});

test('read-only 5s-style checkpoints observe RNG and world without changing pilot input',()=>{
  const a=setup(),b=setup();
  const baseline=playPublicPrelude(a.game,10,0.3,a.fair);
  let draws=0;
  const traced=playPublicPrelude(b.game,10,0.3,b.fair,1,()=>++draws);
  assert.deepEqual(traced.origin,baseline.origin);
  assert.equal(traced.neutralXPEarned,baseline.neutralXPEarned);
  assert.equal(traced.trace.length,4,'initial plus one checkpoint per tick');
  assert.deepEqual(traced.trace.map(x=>x.rngDraws),[1,2,3,4]);
  assert.ok(traced.trace.every(x=>typeof x.enemyStateHash==='string'&&
    typeof x.neutralStateHash==='string'&&typeof x.projectileStateHash==='string'));
  assert.equal(b.game.input.moveVec,b.oldMove);
  assert.equal(b.game.input.aimVec,b.oldAim);
  assert.equal(baseline.trace,null,'ordinary prelude remains free of trace overhead');
  assert.throws(()=>playPublicPrelude(b.game,10,0.3,b.fair,4),/trace cadence/);
  assert.throws(()=>playPublicPrelude(b.game,10,0.3,b.fair,1,7),/RNG draw observer/);
});
test('early natural death records an immediate final checkpoint',()=>{
  const {game,fair}=setup(),original=game.update;
  game.update=function(dt){original.call(this,dt);if(this.time>=0.2)this.player.alive=false;};
  const result=playPublicPrelude(game,10,1,fair,5,()=>0);
  assert.equal(result.naturalDeath,true);
  assert.equal(result.trace.length,2);
  assert.equal(result.trace[1].elapsed,0.2);
  assert.equal(result.trace[1].alive,false);
});
