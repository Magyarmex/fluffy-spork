'use strict';
// Uses the actual 48-overlay composed Game. The candidate fixture changes only
// the production renderer patch and the final simulation-owned runtime overlay.
process.env.NOVA_OVERLAY_AUDIO_RNG_CAUSAL='1';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const patch=require('../../scripts/patch-render-tank-order.cjs');
const materialized=fs.readFileSync(path.join(root,'index.html'),'utf8');
const owner='nova-updates/simulation-owned-tank-order-v1.12.1.js';
const anchor='<script src="./nova-updates/living-front-director-v1.12.0.js"></script>';
const tag=`<script src="./${owner}"></script>`;
// On post-materialization CI, reconstruct the exact historical baseline so
// the negative control still detects the old renderer mutation.
const source=materialized.includes(patch.newLoop)
 ? materialized.replace(patch.newComment,patch.oldComment).replace(patch.newLoop,patch.oldLoop).replace(tag,'')
 : materialized;
const patched=patch.patchRenderTankOrder(source);
assert.equal(patched.split(anchor).length-1,1,'canonical overlay anchor drift');
assert.ok(fs.existsSync(path.join(root,owner)),'simulation owner must exist');
const html=patched.includes(tag)?patched:patched.replace(anchor,anchor+'\n'+tag);
const fixturePath=require.resolve('../research/audio-rng-causal-pilot.cjs');
function loadFixture(sourceHtml){
 delete require.cache[fixturePath];
 const read=fs.readFileSync;
 try {
  fs.readFileSync=function(file,...args){
   if(path.resolve(String(file))===path.join(root,'index.html'))return sourceHtml;
   return read.call(this,file,...args);
  };
  return require(fixturePath);
 } finally {fs.readFileSync=read;}
}
const baseline=loadFixture(source);
const candidate=loadFixture(html);
const seeds=[1517800,1517802,1517810,1517814,1517820,1517825];
function run(fixture,seed,hz,scenario='natural',seconds=4){return baseline.withSeed(seed,draws=>{
 const g=fixture.bootGame(),render=g.__testWindow.__novaMakeRequire('')('game/render').render;
 g.sfx.muted=true;g.input.autofire=false;g.input.firing=false;
 g.input.moveVec=()=>({x:1,y:0});g.input.aimVec=()=>null;
 const initial=baseline.digest(baseline.physical(g));
 let ticks=0,renderMutations=0;
 for(let frame=1;frame<=seconds*hz;frame++){
  const goal=Math.floor(frame*60/hz+1e-9);
  while(ticks<goal){if(g.paused&&g.pendingOffer)g.dismissOffer();g.update(1/60);ticks++;
   if(ticks===121&&scenario==='redeploy')g.redeploy();
   if(ticks===121&&scenario==='spawn')g.spawnAITank(6,'brawler',false);
  }
  const before=g.tanks.map(t=>t.id).join(',');render(g,g.w,g.h);
  if(g.tanks.map(t=>t.id).join(',')!==before)renderMutations++;
 }
 return {initial,final:baseline.digest(baseline.physical(g)),draws:draws(),ticks,renderMutations};
});}
test('fail-closed renderer patch is idempotent and rejects source drift',()=>{
 assert.equal(patch.patchRenderTankOrder(patched),patched);
 assert.throws(()=>patch.patchRenderTankOrder(source.replace(patch.oldLoop,'')),/drift/);
 assert.throws(()=>patch.patchRenderTankOrder(source.replace(patch.oldLoop,patch.oldLoop+patch.oldLoop)),/drift/);
 assert.equal(html.split(tag).length-1,1);
});
test('actual composed Game preserves established 60Hz outcomes through natural play, redeploy and external spawn',()=>{
 for(const scenario of ['natural','redeploy','spawn'])for(const seed of seeds){
  const a=run(baseline,seed,60,scenario),b=run(candidate,seed,60,scenario);
  assert.deepEqual({initial:b.initial,final:b.final,draws:b.draws,ticks:b.ticks},
   {initial:a.initial,final:a.final,draws:a.draws,ticks:a.ticks},`${scenario} seed ${seed}`);
  assert.equal(b.renderMutations,0,'render must not reorder simulation tank array');
 }
});
test('fixed 60Hz simulation is invariant under 30/60/120Hz rendering',()=>{
 let oldDivergences=0;
 for(const scenario of ['natural','redeploy','spawn'])for(const seed of seeds.slice(0,3)){
  const variants=[30,60,120].map(hz=>run(candidate,seed,hz,scenario));
  for(const row of variants){assert.equal(row.final,variants[1].final,`${scenario} ${seed} cadence`);
   assert.equal(row.draws,variants[1].draws);assert.equal(row.renderMutations,0);}
  if(scenario==='natural'){
   const a=run(baseline,seed,120,scenario),b=run(baseline,seed,60,scenario);
   if(a.final!==b.final)oldDivergences++;
  }
 }
 assert.ok(oldDivergences>0,'negative control must reproduce original render-cadence defect');
});
