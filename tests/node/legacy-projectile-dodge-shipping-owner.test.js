'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const zlib=require('node:zlib');
const {patchLegacyProjectileDodge,before,after}=require('../../scripts/patch-legacy-projectile-dodge.cjs');
const root=path.resolve(__dirname,'../..');
const encoded=fs.readdirSync(path.join(root,'nova-gz')).filter(f=>f.endsWith('.b64'))
 .sort().map(f=>fs.readFileSync(path.join(root,'nova-gz',f),'utf8')).join('').replace(/\s+/g,'');
const raw=zlib.gunzipSync(Buffer.from(encoded,'base64')).toString('utf8');
function extract(src){
 const marker='function think(t, ai, g) {';
 const start=src.indexOf(marker);
 assert.ok(start>=0,'canonical think missing');
 let pos=start+marker.length,depth=1;
 while(depth&&pos<src.length){if(src[pos]==='{')depth++;else if(src[pos]==='}')depth--;pos++;}
 assert.equal(depth,0);
 return src.slice(start,pos);
}
function run(src,{bulletX=100,vx=-600,width=280,los=true,fair=true,bulletY=0}={}){
 const window={__NOVA_FAIR_ENGAGEMENT__:fair?{
  inGameplayWorldPoint(g,t,x,y){return Math.abs(x-t.x)<=g.w/2&&Math.abs(y-t.y)<=g.h/2;}
 }:undefined};
 let draws=0,losCalls=0;
 const math=Object.create(Math);math.random=()=>{draws++;return .25;};
 const think=new Function('window','Math','setPreferredRange','return ('+extract(src)+')')
 (window,math,()=>{throw Error('unexpected preferred range');});
 const ai={state:'wander',targetId:-1,dodgeT:0,dodgeX:0,dodgeY:0,aggression:.5,isElite:false};
 const t={id:1,x:0,y:0,level:10,hp:100,maxHp:100};
 const g={w:width,h:600,bullets:[{ownerId:2,x:bulletX,y:bulletY,vx,vy:0}],
  player:null,nearestTank:()=>null,nearestShape:()=>null,
  hasLineOfSight:()=>{losCalls++;return los;}};
 think(t,ai,g);
 return {dodgeT:ai.dodgeT,draws,losCalls,state:ai.state};
}
test('canonical source contains exactly one legacy threat owner and patch is idempotent',()=>{
 assert.equal(raw.split(before).length-1,1);
 const patched=patchLegacyProjectileDodge(raw);
 assert.equal(patched.split(after).length-1,1);
 assert.equal(patchLegacyProjectileDodge(patched),patched);
 assert.throws(()=>patchLegacyProjectileDodge(raw.replace(before,'// drift')),/drift/);
});
test('legacy departing bullet defect is reproduced, corrected without changing incoming dodge',()=>{
 const fixed=patchLegacyProjectileDodge(raw);
 assert.ok(run(raw,{bulletX:100,vx:600}).dodgeT>0,'baseline must reproduce departing dodge');
 assert.equal(run(fixed,{bulletX:100,vx:600}).dodgeT,0);
 assert.equal(run(fixed,{bulletX:100,vx:600}).losCalls,0,'departing rounds must not incur terrain probes');
 assert.ok(run(fixed,{bulletX:100,vx:-600}).dodgeT>0);
 assert.equal(run(fixed,{bulletX:100,vx:-600}).draws,1);
});
test('AI cannot dodge unseen or terrain-occluded bullets at 280px portrait or wide viewport',()=>{
 const fixed=patchLegacyProjectileDodge(raw);
 assert.equal(run(fixed,{bulletX:145,vx:-600,width:280}).dodgeT,0);
 assert.ok(run(fixed,{bulletX:145,vx:-600,width:1200}).dodgeT>0);
 assert.equal(run(fixed,{bulletX:100,vx:-600,los:false}).dodgeT,0);
 assert.equal(run(fixed,{bulletX:100,vx:-600,bulletY:310}).dodgeT,0);
 assert.equal(run(fixed,{bulletX:100,vx:-600}).draws,1);
 assert.equal(run(fixed,{bulletX:145,vx:-600,width:280}).draws,0);
 assert.equal(run(fixed,{bulletX:145,vx:-600,width:280}).losCalls,0,'offscreen rounds must not incur terrain probes');
});
test('standalone base owner without Fair Engagement retains local incoming projectile reaction',()=>{
 const fixed=patchLegacyProjectileDodge(raw);
 assert.ok(run(fixed,{bulletX:100,vx:-600,fair:false}).dodgeT>0);
 assert.equal(run(fixed,{bulletX:100,vx:600,fair:false}).dodgeT,0);
});
