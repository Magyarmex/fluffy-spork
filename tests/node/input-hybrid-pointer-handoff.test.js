'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const controller=fs.readFileSync(path.join(root,'nova-updates/controller-v1.3.0.js'),'utf8');
const performanceSource=fs.readFileSync(path.join(root,'nova-updates/performance-v1.7.8.js'),'utf8');
const start=html.indexOf('window.__defineModule("game/input"');
const end=html.indexOf('window.__defineModule("game/render"',start);
assert.ok(start>=0&&end>start,'shipping Input module must be materialized');
function boot(){
 let now=0;
 const listeners={window:new Map(),document:new Map(),canvas:new Map()};
 function on(which,name,fn){if(!listeners[which].has(name))listeners[which].set(name,new Set());listeners[which].get(name).add(fn)}
 function off(which,name,fn){listeners[which].get(name)?.delete(fn)}
 const window={__novaModules:{},__defineModule(id,fn){this.__novaModules[id]=fn},addEventListener(name,fn){on('window',name,fn)},removeEventListener(name,fn){off('window',name,fn)}};
 const document={hidden:false,addEventListener(name,fn){on('document',name,fn)},removeEventListener(name,fn){off('document',name,fn)}};
 const ctx={window,document,Math,Map,Number,Object,navigator:{},performance:{now:()=>now},console:{info(){},warn(){},error(){}}};
 vm.runInNewContext(html.slice(start,end),ctx);
 vm.runInNewContext(controller,ctx);
 vm.runInNewContext(performanceSource,ctx);
 const m={exports:{}};window.__novaModules['game/input'](m,m.exports,()=>({}));
 const input=new m.exports.Input();
 const canvas={getBoundingClientRect(){return {left:0,top:0,width:800,height:600}},addEventListener(name,fn){on('canvas',name,fn)},removeEventListener(name,fn){off('canvas',name,fn)}};
 input.attach(canvas);
 function event(type,id,x=100,extra={}){return {pointerType:type,pointerId:id,clientX:x,clientY:100,target:null,...extra}}
 return {input,setNow:n=>{now=n},event,listeners};
}
test('physical mouse returns immediately after touch release when capabilities identify a real mouse',()=>{
 const {input,event,setNow}=boot();
 setNow(100);input.pd(event('touch',11,100));input.pu(event('touch',11,100));
 assert.equal(input.touchSeen,true);
 setNow(120);input.pd(event('mouse',50,500,{sourceCapabilities:{firesTouchEvents:false}}));
 assert.equal(input.touchSeen,false);assert.equal(input.mouseActive,true);assert.equal(input.firing,true);
 input.pu(event('mouse',50,500));assert.equal(input.firing,false);
});
test('compatibility mouse events do not steal an actively held touch stick',()=>{
 const {input,event,setNow}=boot();
 setNow(100);input.pd(event('touch',11,100));
 input.pd(event('mouse',50,500,{sourceCapabilities:{firesTouchEvents:false}}));
 assert.equal(input.stickId.move,11);assert.equal(input.move.active,true);
 assert.equal(input.mouseActive,false);assert.equal(input.touchSeen,true);
});
test('unknown mouse capabilities require a bounded quiet period after touch',()=>{
 const {input,event,setNow}=boot();
 setNow(100);input.pd(event('touch',11,100));input.pu(event('touch',11,100));
 setNow(999);input.pd(event('mouse',50,500));assert.equal(input.mouseActive,false);
 setNow(1001);input.pd(event('mouse',50,500));assert.equal(input.mouseActive,true);
});
test('pen hover does not postpone a real mouse handoff',()=>{
 const {input,event,setNow}=boot();
 setNow(100);input.pd(event('pen',11,100,{buttons:1}));input.pu(event('pen',11,100));
 setNow(1200);input.pm(event('pen',11,100,{buttons:0}));
 setNow(1201);input.pd(event('mouse',50,500));assert.equal(input.mouseActive,true);
});
test('new touch takes ownership from an active mouse without phantom firing',()=>{
 const {input,event,setNow}=boot();
 setNow(1000);input.pd(event('mouse',50,500));assert.equal(input.mouseActive,true);
 input.pd(event('touch',11,100));assert.equal(input.mouseActive,false);
 assert.equal(input.firing,false);assert.equal(input.move.active,true);
});
test('after blur, a physical mouse can reclaim control without stale stick IDs',()=>{
 const {input,event,listeners,setNow}=boot();
 setNow(100);input.pd(event('touch',11,100));
 for(const fn of listeners.window.get('blur')||[])fn();
 assert.equal(input.stickId.move,-1);assert.equal(input.move.active,false);
 input.pd(event('mouse',50,500,{sourceCapabilities:{firesTouchEvents:false}}));
 assert.equal(input.mouseActive,true);
});
