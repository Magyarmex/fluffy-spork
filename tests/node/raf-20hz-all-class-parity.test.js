'use strict';
/* Every canonical class must preserve physical game outcomes when the 20Hz
 * presentation recovery repays exactly the same 30Hz steps. This is a
 * full-composition check, not a frame-time or real-device performance claim. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const {bootGame,withSeed,physical}=require('../research/audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
const b64=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
 .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
const html=patchRafStepCap(zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8'));
const s=html.indexOf('    start() {'),e=html.indexOf('    destroy() {',s),body=html.slice(s,e);
assert.ok(s>=0&&e>s,'canonical game start owner');
const factory=new Function('performance','requestAnimationFrame','render_1',
 'return ({start(){'+body.slice(body.indexOf('{')+1,body.indexOf('\n    }'))+'\n}}).start');
function samePhysical(a,b,at){
 if(typeof a==='number'&&typeof b==='number'){
  assert.ok(Math.abs(a-b)<=1e-9,at+': '+a+' vs '+b);return;
 }
 if(Array.isArray(a)&&Array.isArray(b)){
  assert.equal(a.length,b.length,at+' length');
  for(let i=0;i<a.length;i++)samePhysical(a[i],b[i],at+'['+i+']');return;
 }
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  assert.deepEqual(Object.keys(a),Object.keys(b),at+' keys');
  for(const key of Object.keys(a))samePhysical(a[key],b[key],at+'.'+key);return;
 }
 assert.deepEqual(a,b,at);
}
function run(cls,mode){return withSeed(1517800,draws=>{
 const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
 g.setClass(g.player,cls);g.input.autofire=false;g.input.firing=true;
 g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
 let updates=0,volleys=0,drawsCount=0,now=0,raf=null;
 const fire=g.tryFire,update=g.update;
 g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
  if(t===g.player&&this.bullets.length>n)volleys++;return r;};
 g.update=function(dt){updates++;return update.apply(this,arguments);};
 if(mode==='30')for(let i=0;i<60;i++)g.update(1/30);
 else {const start=factory({now:()=>now},fn=>{raf=fn;return 1;},{render:()=>drawsCount++});
  start.call(g);for(let i=0;i<40;i++){now+=(i%2?52:48);raf(now);}}
 const out={updates,volleys,rng:draws(),time:g.time,heat:g.player.__v17Heat||0,
  fireCd:g.player.fireCd,physical:physical(g),drawsCount};
 g.destroy();return out;
});}
test('20Hz bounded recovery preserves the full 36-class 30Hz combat state',()=>{
 const sample=bootGame(),classes=Object.keys(sample.__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
 sample.destroy();assert.equal(classes.length,36,'all canonical class identities');
 for(const cls of classes){
  const a=run(cls,'30'),b=run(cls,'20');
  assert.equal(b.updates,60,cls+' recovered 30Hz updates');
  assert.equal(b.drawsCount,40,cls+' 20Hz draws');
  for(const key of ['volleys','rng','time','heat','fireCd'])
   assert.deepEqual(b[key],a[key],cls+' '+key);
  samePhysical(a.physical,b.physical,cls+' physical');
 }
});
