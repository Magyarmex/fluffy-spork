'use strict';
// Research regression: isolate the hard 760-unit resource consideration horizon.
// This documents a tactical limitation; it does not change shipping AI policy.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function harness(){
 const Game=function(){};
 Game.prototype.tryFire=function(){};
 Game.prototype.updatePowerups=function(){};
 const classes={CLASSES:{guard:{moveMult:.92,size:15}},lineageForClass:()=> 'guardian'};
 const mods={'game/engine':m=>{m.exports={Game};},'game/ai':m=>{m.exports={updateAI(){}};},'game/classes':m=>{m.exports=classes;}};
 const win={__novaModules:mods},cache={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../nova-updates/battle-sense-v1.8.1.js'),'utf8'),{window:win,console,Math});
 function req(k){if(cache[k])return cache[k].exports;const m={exports:{}};cache[k]=m;mods[k](m,m.exports,id=>id==='./classes'?req('game/classes'):null);return m.exports;}
 req('game/engine');req('game/ai');
 return {h:win.__NOVA_BATTLE_SENSE_TEST__,classes};
}
test('critical heal beyond the 760-unit horizon is not considered even if it is the only pickup',()=>{
 const {h,classes}=harness();
 const bot={id:1,cls:'guard',x:1111,y:1000,alive:true,hp:20,maxHp:100,stats:{speed:0},ai:{}};
 const safe={id:'safe',type:'heal',x:350,y:1000};
 const g={tanks:[bot],powerups:[safe],bullets:[],time:1,hasLineOfSight:()=>true,tankSpeed:()=>114.08};
 assert.equal(Math.hypot(bot.x-safe.x,bot.y-safe.y),761);
 assert.equal(h.chooseResource(g,bot,classes),null,'the 760-unit horizon currently excludes a potentially life-saving pickup');
 bot.x=1110;
 assert.equal(h.chooseResource(g,bot,classes)?.id,'safe','the same heal is considered just inside the horizon');
});

test('a one-unit horizon crossing flips a low-health tank from a safer heal to a rival-contested heal',()=>{
 const {h,classes}=harness();
 const bot={id:1,cls:'guard',x:1111,y:1000,alive:true,hp:20,maxHp:100,stats:{speed:0},ai:{}};
 const rival={id:2,cls:'guard',x:1390,y:1120,alive:true,hp:100,maxHp:100,stats:{speed:0},vx:0,vy:0};
 const contested={id:'contested',type:'heal',x:1400,y:1120};
 const safe={id:'safe',type:'heal',x:350,y:1000};
 const g={tanks:[bot,rival],powerups:[contested,safe],bullets:[],time:1,hasLineOfSight:()=>true,tankSpeed:()=>114.08};
 assert.equal(h.chooseResource(g,bot,classes)?.id,'contested',
  'the safe heal at 761 units cannot compete, despite a rival already occupying the near heal');
 bot.x=1110;
 assert.equal(h.chooseResource(g,bot,classes)?.id,'safe',
  'at exactly 760 units the safe heal wins under otherwise unchanged public geometry');
});


test('resource score threshold and hard horizon are distinct limits on healing',()=>{
 const {h,classes}=harness();
 const bot={id:1,cls:'guard',x:0,y:0,alive:true,hp:50,maxHp:100,stats:{speed:0},ai:{}};
 const heal={id:'heal',type:'heal',x:760,y:0};
 const g={tanks:[bot],powerups:[heal],bullets:[],time:1,hasLineOfSight:()=>true,tankSpeed:()=>114.08};
 assert.equal(h.chooseResource(g,bot,classes),null,
  'at half health, a heal inside the 760 horizon can still fail the utility threshold');
 heal.x=740;
 assert.equal(h.chooseResource(g,bot,classes)?.id,'heal',
  'the same heal becomes worthwhile without crossing the hard 760 horizon');
 bot.hp=20;heal.x=760;
 assert.equal(h.chooseResource(g,bot,classes)?.id,'heal',
  'critical health makes a distant in-horizon heal worthwhile');
 heal.x=850;
 assert.equal(h.chooseResource(g,bot,classes),null,
  'even a high-value critical heal is rejected outside the hard horizon');
 // Source-derived optimistic ceiling for an unoccluded heal is
 // 900 * (2.5 * (1 - hpFraction) - 0.42), before detours or contest.
 assert.ok(900*(2.5*(1-.2)-.42)>850,
  '850-unit critical heal is mathematically viable under scoring but clipped by horizon');
});
