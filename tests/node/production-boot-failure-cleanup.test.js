'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap,protectBootCleanup}=require('../../scripts/patch-raf-step-cap.cjs');
const root=path.resolve(__dirname,'../..');
function rawShell(){
 const b=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
  .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b,'base64')).toString('utf8');
}
function bootBody(html){
 const start=html.indexOf('        let bootGame = null;');
 const end=html.indexOf('        // eslint-disable-next-line react-hooks/exhaustive-deps',start);
 assert.ok(start>=0&&end>start,'patched canonical React boot effect present');
 return html.slice(start,end);
}
function execute(html,mode){
 const events=[],errors=[],ref={current:null},screen=[];
 const game={
  input:{},sfx:{resume(){events.push('audio-resume');if(mode==='audio-throws')throw Error('audio resume failed')},
   setMuted(){},setMusicMuted(){}},
  start(){events.push('start');if(mode==='start-throws'||mode==='start-throws-real-destroy')throw Error('startup failed')},
  destroy(){events.push('destroy');if(mode==='destroy-throws')throw Error('cleanup failed')}
 };
 if(mode==='start-throws-real-destroy'){
  game.raf=9;game.resizeFn=()=>{};game.visFn=()=>{};
  game.input.detach=()=>events.push('input-detach');
  game.sfx.dispose=()=>events.push('audio-dispose');
  const begin=html.indexOf('    destroy() {');
  const end=html.indexOf('\n    resize() {',begin);
  assert.ok(begin>=0&&end>begin,'actual composed Game.destroy exists');
  const body=html.slice(begin+'    destroy() {'.length,end).replace(/\n    }\s*$/,'');
  game.destroy=new Function('cancelAnimationFrame','window','document',
   'return function destroy(){'+body+'\n}')(
   ()=>events.push('cancel-raf'),
   {removeEventListener:()=>events.push('window-detach')},
   {removeEventListener:()=>events.push('document-detach')});
 }
 const Game=class{
  constructor(){events.push('construct');if(mode==='constructor-throws')throw Error('constructor failed');return game}
 };
 if(mode==='destroy-throws')game.start=()=>{throw Error('startup failed')};
 const params=['engine_1','canvas','mm','qualityRef','gameRef','stickMove','stickAim',
  'stickRaf','setSticks','setHud','setOffer','setDead','setToast','toastId',
  'offerRef','deadRef','mutedRef','musicOffRef','setScreen','console','requestAnimationFrame'];
 const values=[{Game},{},{},{current:'high'},ref,{current:{}},{current:{}},
  {current:false},()=>{},()=>{},()=>{},()=>{},()=>{},{current:0},
  {current:null},{current:null},{current:false},{current:false},
  x=>screen.push(x),{error:(...args)=>errors.push(args)},()=>1];
 const run=new Function(...params,bootBody(html));
 run(...values);
 return {events,errors,ref,screen};
}
test('raw and materialized React boot cleanup patch is unique and idempotent',()=>{
 for(const html of [rawShell(),fs.readFileSync(path.join(root,'index.html'),'utf8')]){
  const patched=patchRafStepCap(html);
  assert.equal(patchRafStepCap(patched),patched);
  assert.equal(protectBootCleanup(patched),patched);
  assert.equal((patched.match(/bootGame\.destroy\(\)/g)||[]).length,1);
  assert.equal((patched.match(/bootGame = game;/g)||[]).length,1);
 }
});
test('startup failure tears down constructed game and returns to menu',()=>{
 const x=execute(patchRafStepCap(rawShell()),'start-throws');
 assert.deepEqual(x.events,['construct','audio-resume','start','destroy']);
 assert.equal(x.ref.current,null);
 assert.deepEqual(x.screen,['menu']);
 assert.equal(x.errors.length,1);
 assert.match(String(x.errors[0][1]),/startup failed/);
});
test('constructor failure never attempts destruction of nonexistent game',()=>{
 const x=execute(patchRafStepCap(rawShell()),'constructor-throws');
 assert.deepEqual(x.events,['construct']);
 assert.equal(x.errors.length,1);
 assert.deepEqual(x.screen,['menu']);
});
test('cleanup failure cannot mask original startup error or prevent menu recovery',()=>{
 const x=execute(patchRafStepCap(rawShell()),'destroy-throws');
 assert.deepEqual(x.events,['construct','audio-resume','destroy']);
 assert.equal(x.errors.length,2);
 assert.match(String(x.errors[0][1]),/startup failed/);
 assert.match(String(x.errors[1][1]),/cleanup failed/);
 assert.deepEqual(x.screen,['menu']);
});
test('successful boot retains live game without cleanup or menu transition',()=>{
 const x=execute(patchRafStepCap(rawShell()),'normal');
 assert.deepEqual(x.events,['construct','audio-resume','start']);
 assert.notEqual(x.ref.current,null);
 assert.deepEqual(x.screen,[]);
 assert.deepEqual(x.errors,[]);
});
test('malformed boot cleanup patch refuses silent partial materialization',()=>{
 const patched=protectBootCleanup(rawShell());
 const drift=patched.replace('            bootGame = game;','            bootGame = unknown;');
 assert.throws(()=>protectBootCleanup(drift),/boot cleanup owner drift/);
});

test('boot failure invokes actual composed Game.destroy listener/audio/RAF teardown',()=>{
 const x=execute(patchRafStepCap(rawShell()),'start-throws-real-destroy');
 assert.deepEqual(x.events,['construct','audio-resume','start','cancel-raf',
  'window-detach','document-detach','input-detach','audio-dispose']);
 assert.equal(x.errors.length,1);
 assert.deepEqual(x.screen,['menu']);
 assert.equal(x.ref.current,null);
});

test('audio resume failure before Game.start still destroys constructed Game',()=>{
 const x=execute(patchRafStepCap(rawShell()),'audio-throws');
 assert.deepEqual(x.events,['construct','audio-resume','destroy']);
 assert.equal(x.errors.length,1);
 assert.match(String(x.errors[0][1]),/audio resume failed/);
 assert.deepEqual(x.screen,['menu']);
 assert.equal(x.ref.current,null);
});

test('missing React boot error owner fails closed rather than silently skipping cleanup',()=>{
 const drift=rawShell().replace("Failed to boot game:","Unexpected boot error:");
 assert.throws(()=>protectBootCleanup(drift),/boot cleanup owner drift/);
});
