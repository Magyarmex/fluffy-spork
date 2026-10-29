'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/lobby-music-v1.5.1.js'),'utf8');
test('lobby score noise never consumes gameplay RNG and remains distribution-safe',()=>{
 assert.equal(source.split('var __novaLobbyNoiseSeed=').length-1,1);
 assert.ok(!source.includes('d[i]=Math.random()*2-1'));
 const start=source.indexOf('var __novaLobbyNoiseSeed=');
 const draw=source.indexOf('d[i]=(__novaLobbyNoiseSeed>>>0)/2147483648-1;',start);
 const end=source.indexOf('}',draw);
 assert.ok(start>=0&&draw>start&&end>draw);
 const fill=new Function('n','d',source.slice(start,end+1));
 for(const rate of [44100,48000]){
  const n=Math.floor(rate*.35),a=new Float32Array(n),b=new Float32Array(n);
  const orig=Math.random;let calls=0;Math.random=()=>{calls++;return .5;};
  try{fill.call({ctx:{sampleRate:rate}},n,a);fill.call({ctx:{sampleRate:rate}},n,b);}
  finally{Math.random=orig;}
  assert.equal(calls,0,'lobby music advanced combat RNG');
  assert.deepEqual(a,b,'lobby waveform must be deterministic');
  assert.ok(a.every(x=>x>=-1&&x<1),'lobby samples out of range');
  const mean=a.reduce((s,x)=>s+x,0)/n;
  const rms=Math.sqrt(a.reduce((s,x)=>s+x*x,0)/n);
  assert.ok(Math.abs(mean)<.03,'biased lobby noise');
  assert.ok(rms>.53&&rms<.62,'incorrect lobby noise energy');
 }
});
test('materialized game loads lobby score before actual game boot',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const music=html.indexOf('./nova-updates/lobby-music-v1.5.1.js');
 const boot=html.indexOf("window.__bootModule('main')");
 assert.ok(music>=0&&boot>music);
});
