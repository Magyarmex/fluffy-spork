'use strict';
// Opt-in measurement infrastructure only. This does not validate input-to-photon.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,
 '../../scripts/fixed60-input-to-raf-observer.js'),'utf8');
function harness(){
 let now=1000,queue=[],nextId=0,lastCallback=null;
 const listeners=new Map();
 const docListeners=new Map();
 const document={hidden:false,
  addEventListener(k,fn){docListeners.set(k,fn)},
  removeEventListener(k,fn){if(docListeners.get(k)===fn)docListeners.delete(k)}};
 const window={document,performance:{now:()=>now},
  requestAnimationFrame(fn){lastCallback=fn;queue.push({id:++nextId,fn});return nextId},
  cancelAnimationFrame(id){queue=queue.filter(e=>e.id!==id)},
  addEventListener(k,fn){listeners.set(k,fn)},
  removeEventListener(k,fn){if(listeners.get(k)===fn)listeners.delete(k)}};
 vm.runInNewContext(source,{window},{timeout:1000});
 return {window,setTime(t){now=t},
  event(type,privateData={}){listeners.get(type)?.({type,...privateData})},
  next(t){now=t;const e=queue.shift();assert.ok(e,'expected RAF');e.fn(t)},
  hide(){document.hidden=true;docListeners.get('visibilitychange')?.()},
  get listeners(){return listeners.size+docListeners.size},
  fireStale(fn,t){now=t;fn(t)},get lastCallback(){return lastCallback},\n  get pendingRaf(){return queue.length}};
}
const local=value=>JSON.parse(JSON.stringify(value));
test('reports DOM-to-RAF opportunities only, without retaining sensitive event fields',()=>{
 const h=harness(),o=h.window.__novaInputRafObserver.create({durationMs:1000});
 o.start();
 h.setTime(1005);h.event('pointerdown',{key:'SECRET',pointerId:123,
  clientX:999,target:{id:'private'}});
 h.setTime(1010);h.event('keydown',{key:'PASSWORD'});
 h.next(1020);
 const r=local(o.snapshot());
 assert.equal(r.observedEvents,2);
 assert.equal(r.kinds.pointerdown.count,1);
 assert.equal(r.kinds.pointerdown.p50Ms,15);
 assert.equal(r.kinds.keydown.p95Ms,10);
 assert.equal(r.kinds.pointerup.count,0);
 assert.equal(r.kinds.pointerup.maxMs,null);
 assert.equal(r.pendingEvents,0);
 assert.equal(r.metric,'DOM delivery to next RAF callback');
 const json=JSON.stringify(r);
 for(const forbidden of ['SECRET','PASSWORD','clientX','pointerId','private'])
  assert.equal(json.includes(forbidden),false,forbidden);
 o.stop();
 assert.equal(h.listeners,0);
 assert.equal(h.pendingRaf,0);
});
test('visibility loss fails closed and does not attribute hidden time to input delay',()=>{
 const h=harness(),o=h.window.__novaInputRafObserver.create();
 o.start();h.setTime(1004);h.event('pointerdown');
 h.hide();
 assert.equal(o.active,false);
 assert.equal(local(o.snapshot()).observedEvents,0);
 assert.equal(h.listeners,0);
 assert.equal(h.pendingRaf,0);
});
test('bounded event cap and duration stop recording without unbounded samples',()=>{
 const h=harness(),o=h.window.__novaInputRafObserver.create({maxSamples:2});
 o.start();h.setTime(1001);
 for(let i=0;i<20;i++)h.event('keydown',{key:String(i)});
 h.next(1010);
 const r=local(o.snapshot());
 assert.equal(o.active,false);
 assert.equal(r.status,'limit');
 assert.equal(r.observedEvents,2);
 assert.equal(r.kinds.keydown.count,2);
 assert.equal(h.listeners,0);
});
test('restart cannot be advanced by a stale callback',()=>{
 const h=harness(),o=h.window.__novaInputRafObserver.create();
 o.start();h.next(1010);
 o.stop();o.start();
 h.setTime(1015);h.event('pointerup');
 h.next(1020);
 assert.equal(local(o.snapshot()).observedEvents,1);
 o.stop();assert.equal(h.listeners,0);
});
test('invalid settings, duplicate start and hidden start are rejected',()=>{
 const h=harness();
 for(const options of [{durationMs:0},{durationMs:Infinity},
  {durationMs:600001},{maxSamples:0},{maxSamples:20001}])
  assert.throws(()=>h.window.__novaInputRafObserver.create(options));
 const o=h.window.__novaInputRafObserver.create();
 o.start();assert.throws(()=>o.start(),/already active/);o.stop();
 h.window.document.hidden=true;
 assert.throws(()=>o.start(),/foreground/);
});
