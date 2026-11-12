'use strict';
// The shipping Fieldcraft API selects contextual lessons by "tags", not
// "contexts". Exercise both real shipping overlays, not a mocked registry.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const fieldcraft=fs.readFileSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const liveVector=fs.readFileSync(path.join(root,'nova-updates/second-body-live-vector-v1.10.7.js'),'utf8');

test('Controller Live Vector lessons participate in real Fieldcraft controls context',()=>{
 const listeners=[];
 const document={
  readyState:'loading',
  addEventListener:(type,fn)=>listeners.push({type,fn})
 };
 const window={__novaModules:{}};
 const context={window,document,console:{info(){},warn(){},error(){}},
  Date,Math,Number,Object,Array,WeakMap};
 vm.runInNewContext(fieldcraft,context,{filename:'menu-slot-compat-v1.7.8.js'});
 assert.equal(window.NOVATips?.version,'1.7.9','real Fieldcraft API must load');
 vm.runInNewContext(liveVector,context,{filename:'second-body-live-vector-v1.10.7.js'});
 assert.equal(window.__NOVA_LIVE_VECTOR_TIPS__,true,'real Live Vector registration must run');
 const expected=['controller-live-vector','controller-designation-weave','controller-deep-defense-cost'];
 const all=window.NOVATips.current();
 for(const id of expected){
  const found=all.filter(t=>t.id===id);
  assert.equal(found.length,1,id+' must register exactly once');
  const lesson=found[0];
  assert.ok(lesson.tags.includes('controller'),id+' must be tagged by its class');
  assert.ok(lesson.tags.includes('drones'),id+' must be discoverable by swarm context');
  assert.ok(lesson.tags.includes('controls'),id+' must reach the actual controls contextual tip bag');
  assert.equal(lesson.active,true);
 }
 const contextual=all.filter(t=>t.tags.some(tag=>['controls','settings','ui'].includes(tag)));
 assert.ok(expected.every(id=>contextual.some(t=>t.id===id)),
  'the real Fieldcraft controls context must contain all three Controller lessons');
 assert.equal(window.NOVATips.audit().duplicateIds.length,0);
 assert.ok(listeners.some(l=>l.type==='DOMContentLoaded'),
  'DOM startup remains deferred and untouched by this registration regression');
});
