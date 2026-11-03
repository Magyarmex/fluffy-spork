'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {patchRafStepCap,protectInputBlurCleanup}=require('../../scripts/patch-raf-step-cap.cjs');
const root=path.resolve(__dirname,'../..');
function rawShell(){
 const b=fs.readdirSync(path.join(root,'nova-gz')).filter(x=>x.endsWith('.b64')).sort()
  .map(x=>fs.readFileSync(path.join(root,'nova-gz',x),'utf8')).join('').replace(/\s+/g,'');
 return zlib.gunzipSync(Buffer.from(b,'base64')).toString('utf8');
}
function eventTarget(){
 const handlers=new Map();
 return {
  addEventListener(name,fn){if(!handlers.has(name))handlers.set(name,new Set());handlers.get(name).add(fn)},
  removeEventListener(name,fn){handlers.get(name)?.delete(fn)},
  count(name){return handlers.get(name)?.size||0},
  fire(name,event={}){for(const fn of handlers.get(name)||[])fn(event)},
  getBoundingClientRect(){return {left:0,top:0,width:320,height:500}}
 };
}
function inputClass(html,window){
 const start=html.indexOf('class Input {'),end=html.indexOf('exports.Input = Input;',start);
 assert.ok(start>=0&&end>start,'canonical composed Input class present');
 return new Function('window','return '+html.slice(start,end).trim())(window);
}
test('production Input removes blur listener on every Game teardown',()=>{
 for(const html of [rawShell(),fs.readFileSync(path.join(root,'index.html'),'utf8')]){
  const patched=patchRafStepCap(html),win=eventTarget(),canvas=eventTarget();
  const Input=inputClass(patched,win);
  for(let i=0;i<20;i++){
   const input=new Input();
   input.attach(canvas);
   assert.equal(win.count('blur'),1);
   input.keyboard.up=true;input.keyboard.right=true;input.firing=true;
   win.fire('blur');
   assert.equal(input.keyboard.up,false);
   assert.equal(input.keyboard.right,false);
   assert.equal(input.firing,false);
   input.detach();
   for(const type of ['blur','pointermove','pointerup','pointercancel','keydown','keyup'])
    assert.equal(win.count(type),0,'listener leaked: '+type+' cycle '+i);
   assert.equal(canvas.count('pointerdown'),0);
  }
  assert.equal(patchRafStepCap(patched),patched,'idempotent materialization');
 }
});
test('same Input instance may reattach without accumulating stale blur listeners',()=>{
 const win=eventTarget(),canvas=eventTarget();
 const Input=inputClass(patchRafStepCap(rawShell()),win),input=new Input();
 for(let i=0;i<10;i++){
  input.attach(canvas);assert.equal(win.count('blur'),1);
  input.detach();assert.equal(win.count('blur'),0);
 }
});
test('missing Input cleanup owner fails closed on canonical shell',()=>{
 const html=rawShell().replace("window.addEventListener('blur', () => {",
  "window.addEventListener('blur', function () {");
 assert.throws(()=>protectInputBlurCleanup(html),/Input blur lifecycle owner drift/);
});
