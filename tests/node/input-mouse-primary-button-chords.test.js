'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
const performanceSource=fs.readFileSync(path.join(root,'nova-updates/performance-v1.7.8.js'),'utf8');
const start=html.indexOf('window.__defineModule("game/input"');
const end=html.indexOf('window.__defineModule("game/render"',start);
assert.ok(start>=0&&end>start,'real materialized Input module required');
function boot(){
  const events={window:new Map(),document:new Map(),canvas:new Map()};
  function on(place,name,fn){if(!events[place].has(name))events[place].set(name,new Set());events[place].get(name).add(fn);}
  function off(place,name,fn){events[place].get(name)?.delete(fn);}
  const window={__novaModules:{},__defineModule(id,fn){this.__novaModules[id]=fn;},
    addEventListener(name,fn){on('window',name,fn);},removeEventListener(name,fn){off('window',name,fn);}};
  const document={hidden:false,addEventListener(name,fn){on('document',name,fn);},
    removeEventListener(name,fn){off('document',name,fn);}};
  const ctx={window,document,Math,Map,Number,Object,navigator:{},performance:{now:()=>1000},
    console:{info(){},warn(){},error(){}}};
  vm.runInNewContext(html.slice(start,end),ctx);
  vm.runInNewContext(controller,ctx);
  vm.runInNewContext(performanceSource,ctx);
  const mod={exports:{}};window.__novaModules['game/input'](mod,mod.exports,()=>({}));
  const input=new mod.exports.Input();
  const canvas={getBoundingClientRect(){return {left:0,top:0,width:800,height:600};},
    addEventListener(name,fn){on('canvas',name,fn);},removeEventListener(name,fn){off('canvas',name,fn);}};
  input.attach(canvas);
  const pointer=(button,buttons,extra={})=>({pointerType:'mouse',pointerId:1,button,buttons,
    clientX:420,clientY:220,target:canvas,...extra});
  const mouse=(button,buttons)=>({button,buttons,target:canvas,preventDefault(){}});
  function fire(place,name,e){for(const fn of [...(events[place].get(name)||[])])fn(e);}
  return {input,events,pointer,mouse,fire,canvas};
}
test('secondary and middle mouse pointerdown aim without firing',()=>{
  for(const [button,buttons] of [[2,2],[1,4]]){
    const {input,pointer}=boot();
    input.pd(pointer(button,buttons));
    assert.equal(input.mouseActive,true,'cursor must still aim');
    assert.equal(input.firing,false,'non-primary button must not fire');
  }
});
test('secondary pointer release does not cancel a held primary fire',()=>{
  const {input,pointer}=boot();
  input.pd(pointer(0,1));assert.equal(input.firing,true);
  input.pu(pointer(2,1));assert.equal(input.firing,true);
  input.pu(pointer(0,0));assert.equal(input.firing,false);
});
test('left mouse release stops fire even when right mouse stays held',()=>{
  const {input,pointer}=boot();
  input.pd(pointer(0,1));assert.equal(input.firing,true);
  input.pu(pointer(0,2));assert.equal(input.firing,false);
});
test('native mousedown captures left press after right button already owns pointer',()=>{
  const {input,pointer,mouse,fire}=boot();
  input.pd(pointer(2,2));assert.equal(input.firing,false);
  // Pointer Events do not send another pointerdown for the second held button.
  fire('canvas','mousedown',mouse(0,3));
  assert.equal(input.firing,true);
  fire('window','mouseup',mouse(0,2));
  assert.equal(input.firing,false);
});
test('mouse movement clears missed release but never arms an outside-canvas drag',()=>{
  const {input,pointer}=boot();
  input.pm(pointer(0,1));
  assert.equal(input.firing,false,'press began outside the gameplay canvas');
  input.pd(pointer(0,1));assert.equal(input.firing,true);
  input.pm(pointer(0,2));assert.equal(input.firing,false,'left button no longer held');
  input.pm(pointer(0,1));assert.equal(input.firing,false,'no new canvas press');
  assert.equal(input.mouseActive,true);
});
test('mouse chord listeners do not change touch aim or persist after detach',()=>{
  const {input,pointer,mouse,fire,events}=boot();
  input.pd({pointerType:'touch',pointerId:12,clientX:700,clientY:200,target:null});
  assert.equal(input.firing,true);
  fire('canvas','mousedown',mouse(0,1));
  assert.equal(input.firing,true,'compatibility mouse event must not steal touch firing');
  input.pu({pointerType:'touch',pointerId:12});
  assert.equal(input.firing,false);
  input.detach();
  assert.equal(events.canvas.get('mousedown')?.size||0,0);
  assert.equal(events.window.get('mouseup')?.size||0,0);
});
test('legacy pointer event without button metadata remains a primary click',()=>{
  const {input}=boot();
  input.pd({pointerType:'mouse',clientX:420,clientY:220,target:null});
  assert.equal(input.firing,true);
  input.pu({pointerType:'mouse'});
  assert.equal(input.firing,false);
});

test('twenty attach/detach cycles never leak native mouse chord listeners',()=>{
  const {input,events,canvas}=boot();
  for(let i=0;i<20;i++){
    assert.equal(events.canvas.get('mousedown')?.size,1);
    assert.equal(events.window.get('mouseup')?.size,1);
    input.detach();
    assert.equal(events.canvas.get('mousedown')?.size||0,0);
    assert.equal(events.window.get('mouseup')?.size||0,0);
    input.attach(canvas);
  }
  input.detach();
  assert.equal(events.canvas.get('mousedown')?.size||0,0);
  assert.equal(events.window.get('mouseup')?.size||0,0);
});
