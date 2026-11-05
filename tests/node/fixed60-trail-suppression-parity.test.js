'use strict';
// Research-only invariant for the composed-browser ordinary trail intervention.
// The canonical addParticles owner is extracted from the shipping HTML, not reimplemented.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {methods}=require('../../scripts/patch-cosmetic-rng.cjs');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const start="    addParticles(x, y, color, n, speed, kind = 'spark') {";
const a=html.indexOf(start),b=html.indexOf('    addRing(',a+start.length);
assert.ok(a>0&&b>a,'shipping particle owner must be present');
const source=html.slice(a,b);
assert.match(source,/const finalN = this\.quality === 'low' \? Math\.max\(1, Math\.round\(n \* 0\.5\)\) : n/);
const Demo=new Function('types_1','return class Demo {\n'+methods+'\n'+source+'\n}')({TAU:Math.PI*2});
function game(quality){
 const g=new Demo();
 g.quality=quality;g.parts=Array.from({length:400},()=>({active:false}));
 g.partIdx=0;g.nextId=42;g.time=12;
 return g;
}
function suppressOneOrdinaryGlow(g){
 // The shipping addParticles(n=1,kind=glow) draws angle, speed, life, size.
 // Consume precisely those four isolated cosmetic draws, not gameplay RNG.
 for(let i=0;i<4;i++)g.cosmeticRandom();
}
for(const quality of ['low','high']){
 test('ordinary trail suppression preserves cosmetic stream and gameplay RNG ('+quality+')',()=>{
  const control=game(quality),suppressed=game(quality);
  const original=Math.random;let gameplayDraws=0;
  Math.random=()=>{gameplayDraws++;return 0.5};
  try{
   for(let i=0;i<1000;i++){
    control.addParticles(0,0,'#fff',1,20,'glow');
    suppressOneOrdinaryGlow(suppressed);
    assert.equal(control.__novaCosmeticRngState,suppressed.__novaCosmeticRngState);
   }
   assert.equal(gameplayDraws,0,'cosmetic effects must not touch gameplay RNG');
   assert.equal(suppressed.partIdx,0,'suppression must not overwrite the particle pool');
   assert.equal(control.partIdx,200,'control must actually create 1000 particles');
   assert.equal(control.cosmeticRandom(),suppressed.cosmeticRandom(),
    'subsequent cosmetic events must see the same random stream');
  }finally{Math.random=original}
 });
}
test('beam and impact signatures remain outside ordinary trail suppression',()=>{
 const ordinary=[0,0,'#fff',1,20,'glow'];
 const beam=[0,0,'#fff',1,30,'glow'];
 const impact=[0,0,'#fff',1,20,'spark'];
 const isOrdinary=args=>args[3]===1&&args[4]===20&&args[5]==='glow';
 assert.equal(isOrdinary(ordinary),true);
 assert.equal(isOrdinary(beam),false);
 assert.equal(isOrdinary(impact),false);
});
