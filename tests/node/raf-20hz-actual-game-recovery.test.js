'use strict';
/* Actual composed NOVA Game: 20Hz jitter must advance the same physical
 * 30Hz simulation, not an approximate scheduler model. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const {bootGame,withSeed,digest,physical}=require('../research/audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
function raw(){return zlib.gunzipSync(Buffer.from(fs.readdirSync(path.join(root,'nova-gz'))
 .filter(x=>x.endsWith('.b64')).sort().map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8'))
 .join('').replace(/\s+/g,''),'base64')).toString('utf8');}
const html=patchRafStepCap(raw());
function startFactory(){const s=html.indexOf('    start() {'),e=html.indexOf('    destroy() {',s),body=html.slice(s,e),a=body.indexOf('{'),b=body.indexOf('\n    }',a);
 assert.ok(s>=0&&e>s&&b>a);return new Function('performance','requestAnimationFrame','render_1',
  'return ({start(){'+body.slice(a+1,b)+'\n}}).start');}
const factory=startFactory();
function run(seed,cls,mode){return withSeed(seed,draws=>{
 const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
 g.setClass(g.player,cls);g.input.autofire=false;g.input.firing=true;
 g.input.aim.active=true;g.input.aim.dx=40;g.input.aim.dy=0;
 let volleys=0,updates=0,now=0,raf=null,drawsCount=0;
 const fire=g.tryFire,update=g.update;
 g.tryFire=function(t){const n=this.bullets.length,r=fire.apply(this,arguments);
  if(t===g.player&&this.bullets.length>n)volleys++;return r;};
 g.update=function(dt){updates++;return update.apply(this,arguments);};
 if(mode==='native30')for(let i=0;i<60;i++)g.update(1/30);
 else{
  const start=factory({now:()=>now},fn=>{raf=fn;return 1;},{render:()=>drawsCount++});
  start.call(g);
  for(let i=0;i<40;i++){now+=(i%2?52:48);raf(now);}
 }
 const out={hash:digest(physical(g)),rng:draws(),volleys,updates,drawsCount,
  time:g.time,heat:g.player.__v17Heat,fireCd:g.player.fireCd};g.destroy();return out;
});}
for(const cls of ['tempest','minigun','carrier'])for(const seed of [1517800,1517802,1517810]){
 test('real '+cls+' 20Hz jitter matches 30Hz physical game, seed '+seed,()=>{
  const a=run(seed,cls,'native30'),b=run(seed,cls,'20hz');
  assert.equal(b.updates,60);assert.equal(b.drawsCount,40);
  for(const key of ['hash','rng','volleys','time','heat','fireCd'])assert.equal(b[key],a[key],key);
 });
}
