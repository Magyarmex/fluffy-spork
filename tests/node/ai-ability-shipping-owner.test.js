'use strict';
// Execute the real canonical AI update body, not a rewritten ability model.
// Predator's tactical owner must suppress the dormant core lottery while
// standalone fallback preserves a 60Hz-equivalent rate.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {patchAIStrafeTimebase}=require('../../scripts/patch-ai-strafe-timebase.cjs');
const root=path.resolve(__dirname,'../..');
const b64=fs.readdirSync(path.join(root,'nova-gz')).filter(f=>f.endsWith('.b64'))
 .sort().map(f=>fs.readFileSync(path.join(root,'nova-gz',f),'utf8'))
 .join('').replace(/\\s+/g,'');
const raw=zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8');
const patched=patchAIStrafeTimebase(raw);
function extractAI(html){
 const marker='function updateAI(t, g, dt) {';
 const start=html.indexOf(marker);
 assert.ok(start>=0,'real canonical AI owner missing');
 let pos=start+marker.length,depth=1;
 while(depth>0&&pos<html.length){
  if(html[pos]==='{')depth++;
  else if(html[pos]==='}')depth--;
  pos++;
 }
 assert.equal(depth,0,'unclosed canonical AI owner');
 return html.slice(start,pos);
}
function frame(src,{fps,owned,draw}){
 let calls=0,abilities=0,movement=null;
 const randomMath=Object.create(Math);
 randomMath.random=()=>{calls++;return draw;};
 const update=new Function('Math','think','types_1',
  'return ('+extractAI(src)+')')(randomMath,
  ()=>{throw Error('unexpected think call');},
  {clamp:(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),
   rnd:()=>{throw Error('unexpected random aim');},
   angleDiff:()=>0});
 const t={id:1,cls:'guard',x:0,y:0,angle:0,abilityCd:0,
  ai:{state:'flee',thinkT:10,dodgeT:0,targetId:-1,
   fireHold:1,preferredRange:200,strafe:1}};
 if(owned)t.ai.__novaPredatorAbilityOwned=true;
 const enemy={id:2,x:300,y:0};
 const g={player:enemy,tankSpeed:()=>200,nearestTank:()=>enemy,
  moveTank:(_t,x,y)=>{movement=[x,y];},
  lerpAngle:(_a,b)=>b,useAbility:()=>{abilities++;}};
 update(t,g,1/fps);
 return {calls,abilities,movement,angle:t.angle};
}
test('real materialized AI body suppresses dormant Predator ability draws at every FPS',()=>{
 for(const fps of [30,60,120,240]){
  const old=frame(raw,{fps,owned:false,draw:.5});
  const owned=frame(patched,{fps,owned:true,draw:.5});
  const fallback=frame(patched,{fps,owned:false,draw:.5});
  assert.equal(old.calls,1,'legacy draw should be reachable at '+fps+'Hz');
  assert.equal(owned.calls,0,'Predator must not draw at '+fps+'Hz');
  assert.equal(fallback.calls,1,'standalone fallback still draws at '+fps+'Hz');
  assert.equal(owned.abilities,0);
  assert.deepEqual(owned.movement,old.movement,'movement changed at '+fps+'Hz');
  assert.equal(owned.angle,old.angle,'aim changed at '+fps+'Hz');
 }
});
test('real canonical fallback ability lottery preserves 60Hz chance',()=>{
 for(const fps of [30,60,120,240]){
  const p=1-Math.pow(.98,60/fps);
  assert.equal(frame(patched,{fps,owned:false,draw:p-1e-8}).abilities,1);
  assert.equal(frame(patched,{fps,owned:false,draw:p+1e-8}).abilities,0);
  assert.equal(frame(patched,{fps,owned:true,draw:0}).abilities,0);
 }
});
