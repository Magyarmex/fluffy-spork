'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/controller-v1.3.0.js'),'utf8');
const a=source.indexOf('function updatePlayerCommand('),b=source.indexOf('function updateAICommand(',a);
assert.ok(a>=0&&b>a,'canonical Controller command method present');
const fn=new Function('clamp','maxCommandRange','clampNode','return ('+source.slice(a,b).trim()+')')(
 (x,l,h)=>Math.min(h,Math.max(l,x)),()=>650,
 (o,x,y,r)=>{const d=Math.hypot(x-o.x,y-o.y);return d>r?{x:o.x+(x-o.x)*r/d,y:o.y+(y-o.y)*r/d}:{x,y}});
function run(inputs){
 let command=0,recall=0;const owner={x:0,y:0,angle:0},s={wasActive:false,angle:0,nodeX:0,nodeY:0,power:0,lastCommandCue:-99,lastRecallCue:-99};
 const states=[];for(const aim of inputs){const g={input:{aim},time:10+states.length*.1,sfx:{novaSwarmCommand(){command++},novaSwarmRecall(){recall++}}};fn(g,owner,s,{droneLeash:650},.016);states.push({active:s.active,range:Math.hypot(s.nodeX-owner.x,s.nodeY-owner.y)});}
 return {states,command,recall};
}
test('centered touch without established command is neutral',()=>{const r=run([{active:true,dx:0,dy:0},{active:false}]);assert.equal(r.command,0);assert.equal(r.recall,0);assert.equal(r.states[0].active,false)});
test('established command survives centered touch and releases once',()=>{const r=run([{active:true,dx:43,dy:0},{active:true,dx:0,dy:0},{active:true,dx:1,dy:0},{active:false}]);assert.deepEqual(r.states.map(s=>s.active),[true,true,true,false]);assert.ok(Math.abs(r.states[0].range-r.states[1].range)<1e-8);assert.equal(r.command,1);assert.equal(r.recall,1)});
