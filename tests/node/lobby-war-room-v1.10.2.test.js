const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../../nova-updates/lobby-war-room-v1.10.2.js'),'utf8');

function literalClasses(){
  const m=src.match(/var CLASS_IDS=\[([^\]]+)\]/);
  assert.ok(m,'CLASS_IDS roster missing');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
}

test('War Room covers the complete 36-class roster at level 30',()=>{
  const ids=literalClasses();
  assert.equal(ids.length,36);
  assert.equal(new Set(ids).size,36);
  for(const required of ['scout','tempest','clusterking','singularity','hivemind','bastion','ravager'])assert.ok(ids.includes(required),required+' missing');
  assert.match(src,/LEVEL=30/);
  assert.match(src,/level:LEVEL/);
});

test('lobby battlefield is live combat rather than a decorative particle loop',()=>{
  for(const mechanic of ['chooseTarget','fire=function','kill=function','ability=function','stepBullets','respawn'])assert.ok(src.includes(mechanic),mechanic+' missing');
  assert.match(src,/lineage==='controller'/);
  assert.match(src,/lineage==='sniper'/);
  assert.match(src,/lineage==='cannon'/);
  assert.match(src,/lineage==='guardian'/);
});

test('camera is intentionally slow and reveals a large vertical battlefield',()=>{
  assert.match(src,/PAN_SECONDS=38/);
  assert.match(src,/worldH=1500/);
  assert.match(src,/this\.cam\.y=this\.worldH\*\.77-e\*travel/);
});

test('background contract remains bounded and non-interactive',()=>{
  assert.match(src,/BOT_MOBILE=12,BOT_DESKTOP=18/);
  assert.match(src,/MAX_BULLETS=84,MAX_FX=72/);
  assert.match(src,/24:30/);
  assert.match(src,/\.68:\.82/);
  assert.match(src,/pointer-events:none!important/);
  assert.match(src,/presentationOnly:true,audio:false,input:false/);
  assert.doesNotMatch(src,/new\s+Game\s*\(/);
  assert.doesNotMatch(src,/AudioContext|createOscillator|\.play\s*\(/);
});

test('hidden tabs and reduced-motion users do not pay for continuous simulation',()=>{
  assert.match(src,/if\(document\.hidden\)/);
  assert.match(src,/if\(!REDUCED\)this\.update\(dt\)/);
  assert.match(src,/if\(REDUCED\)\{this\.raf=0;return;\}/);
  assert.match(src,/prefers-reduced-motion: reduce/);
});

test('lobby lifecycle stops the simulation when the menu leaves the DOM',()=>{
  assert.match(src,/!this\.canvas\.isConnected\|\|!this\.menu\.isConnected/);
  assert.match(src,/cancelAnimationFrame\(this\.raf\)/);
  assert.match(src,/MutationObserver\(queue\)/);
});
