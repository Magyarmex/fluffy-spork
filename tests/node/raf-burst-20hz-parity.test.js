'use strict';
/* The 20Hz display sometimes executes two 30Hz simulation updates per draw.
 * Burst/release and aim changes must retain the same full-game outcome as
 * native 30Hz presentation when input is sampled at simulation boundaries.
 * This does not prove 60Hz cadence or real-device touch latency. */
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap}=require('../../scripts/patch-raf-step-cap.cjs');
const {bootGame,withSeed,physical}=require('../research/audio-rng-causal-pilot.cjs');
const root=path.resolve(__dirname,'../..');
const b64=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
 .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
const html=patchRafStepCap(zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8'));
const s=html.indexOf('    start() {'),e=html.indexOf('    destroy() {',s);
assert.ok(s>=0&&e>s,'canonical Game RAF owner');
const body=html.slice(s,e);
const factory=new Function('performance','requestAnimationFrame','render_1',
 'return ({start(){'+body.slice(body.indexOf('{')+1,body.indexOf('\n    }'))+'\n}}).start');
function run(cls,seed,mode,pattern){return withSeed(seed,draws=>{
 const g=bootGame();g.sfx.muted=true;g.sfx.startMusic=()=>{};
 g.setClass(g.player,cls);g.input.autofire=false;
 let ticks=0,volleys=0,now=0,raf=null,drawsCount=0;
 const fire=g.tryFire,update=g.update;
 g.tryFire=function(t){const before=this.bullets.length;
  const result=fire.apply(this,arguments);
  if(t===g.player&&this.bullets.length>before)volleys++;
  return result;};
 g.update=function(dt){
  const phase=ticks%pattern;
  this.input.firing=phase<Math.floor(pattern*3/4);
  this.input.aim.active=true;
  this.input.aim.dx=(Math.floor(ticks/15)%2===0)?40:0;
  this.input.aim.dy=this.input.aim.dx===0?40:0;
  ticks++;
  return update.call(this,dt);
 };
 try{
  if(mode==='30')for(let i=0;i<60;i++)g.update(1/30);
  else{
   const start=factory({now:()=>now},fn=>{raf=fn;return 1;},
    {render:()=>drawsCount++});
   start.call(g);for(let i=0;i<40;i++){
    now+=i%2?52:48;
    const cb=raf;assert.equal(typeof cb,'function');cb(now);
   }
  }
  return {ticks,volleys,rng:draws(),time:g.time,
   heat:g.player.__v17Heat||0,fireCd:g.player.fireCd,
   physical:physical(g),drawsCount};
 }finally{g.destroy();}
});}
test('burst/release and rotating aim preserve composed Game state at recovered 20Hz',()=>{
 const sample=bootGame();
 const classes=Object.keys(sample.__testWindow.__novaMakeRequire('')('game/classes').CLASSES);
 sample.destroy();
 for(const name of ['tempest','minigun','needlestorm'])
  assert.ok(classes.includes(name),'canonical class '+name);
 for(const cls of ['tempest','minigun','needlestorm'])
  for(const pattern of [8,15])
   for(const seed of [1517800,1517802]){
    const a=run(cls,seed,'30',pattern),b=run(cls,seed,'20',pattern);
    const label=cls+' pattern='+pattern+' seed='+seed;
    assert.equal(a.ticks,60,label+' baseline steps');
    assert.equal(b.ticks,60,label+' recovered steps');
    assert.equal(b.drawsCount,40,label+' presentation frames');
    for(const key of ['volleys','rng','time','heat','fireCd'])
     assert.deepEqual(b[key],a[key],label+' '+key);
    assert.deepEqual(b.physical,a.physical,label+' full physical state');
   }
});