'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../browser/render-clarity-aa-b-research.cjs'),'utf8');
const match=source.match(/g\.tryFire=(function\(t\)\{[\s\S]*?\n   \});/);
assert.ok(match,'extract the actual measured-game tryFire wrapper');

test('browser research counts successful player volleys separately from projectile payload',()=>{
 const ctx={shots:0,volleys:0,Math,oldFire:function(t){
  if(t.throw)throw Error('fire failure');
  for(let i=0;i<(t.emitCount||0);i++)this.bullets.push({});
  return 'original-return';
 }};
 const wrapper=vm.runInNewContext('('+match[1]+')',ctx);
 const player={emitCount:5},enemy={emitCount:3},game={player,bullets:[]};
 assert.equal(wrapper.call(game,player),'original-return');
 assert.equal(ctx.shots,5);
 assert.equal(ctx.volleys,1,'five projectiles are one successful firing invocation');
 player.emitCount=0;
 wrapper.call(game,player);
 assert.equal(ctx.volleys,1,'failed cooldown attempt is not a volley');
 wrapper.call(game,enemy);
 assert.equal(ctx.shots,5,'enemy projectiles are not player payload');
 assert.equal(ctx.volleys,1);
 player.emitCount=1;
 wrapper.call(game,player);
 assert.equal(ctx.shots,6);
 assert.equal(ctx.volleys,2);
 assert.throws(()=>wrapper.call(game,{throw:true}),/fire failure/);
 assert.equal(ctx.volleys,2,'exception must not manufacture a successful volley');
});
