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
