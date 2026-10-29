'use strict';
// Seven shipping Sfx overlay buffers must not consume global gameplay RNG.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const owners=[
 ['nova-updates/polish-v1.3.1.js','a1795c31'],
 ['nova-updates/sniper-v1.2.0.js','b42d09f7'],
 ['nova-updates/sniper-lineage-v1.4.1.js','c8e31265'],
 ['nova-updates/controller-v1.3.0.js','d135a9bf'],
 ['nova-updates/stability-v1.4.0.js','e2740c93'],
 ['nova-updates/precision-contact-v1.8.3.js','f3b7e521'],
 ['nova-updates/sensory-feedback-v1.9.1.js','17a9dc43']
];
test('overlay sound-buffer streams are local, repeatable and distribution-safe',()=>{
 for(const [file,salt] of owners){
  const src=fs.readFileSync(path.join(root,file),'utf8');
  assert.equal(src.split('var __novaAudioNoiseSeed =').length-1,1,file);
  assert.ok(src.includes('^ 0x'+salt),file+' local stream seed');
  assert.ok(!src.includes('data[i]=Math.random()*2-1') &&
   !src.includes('data[i] = Math.random() * 2 - 1') &&
   !src.includes('d[i]=Math.random()*2-1'),file+' shared RNG leak remains');
  const start=src.indexOf('var __novaAudioNoiseSeed =');
  const draw=src.indexOf('(__novaAudioNoiseSeed >>> 0) / 2147483648 - 1;',start);
  const end=src.indexOf('}',draw);
  assert.ok(start>=0&&draw>start&&end>draw,file+' local noise loop');
  const fill=new Function('c','n','data','d',src.slice(start,end+1));
  for(const rate of [44100,48000]){
   const n=Math.floor(rate*.35),a=new Float32Array(n),b=new Float32Array(n);
   const old=Math.random;let calls=0;
   Math.random=()=>{calls++;return .5;};
   try{fill({sampleRate:rate},n,a,a);fill({sampleRate:rate},n,b,b);}
   finally{Math.random=old;}
   assert.equal(calls,0,file+' drew gameplay RNG');
   assert.deepEqual(a,b,file+' waveform not deterministic');
   assert.ok(a.every(x=>x>=-1&&x<1),file+' sample bounds');
   const mean=a.reduce((s,x)=>s+x,0)/n;
   const rms=Math.sqrt(a.reduce((s,x)=>s+x*x,0)/n);
   assert.ok(Math.abs(mean)<.03,file+' biased noise');
   assert.ok(rms>.53&&rms<.62,file+' incorrect white-noise energy');
  }
 }
});
test('all seven audio owners are in the actual materialized runtime chain',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 for(const [file] of owners)assert.ok(html.includes('./'+file),file+' missing from shipping shell');
});
