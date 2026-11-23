'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function coreInputClass(){
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 const start=html.indexOf('class Input {');
 assert.ok(start>=0,'materialized Game must contain the real Input class');
 let depth=0,end=-1;
 for(let i=html.indexOf('{',start);i<html.length;i++){
  if(html[i]==='{')depth++;
  else if(html[i]==='}'&&--depth===0){end=i+1;break;}
 }
 assert.ok(end>start,'real Input class must be complete');
 return html.slice(start,end);
}
function fixture(){
 const listeners=new Map();
 const window={
  __novaModules:{},
  addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn);}
 };
 const context=vm.createContext({window,console});
 const Input=vm.runInContext('('+coreInputClass()+')',context);
 window.__novaModules['game/input']=module=>{module.exports={Input};};
 const overlay=fs.readFileSync(path.join(__dirname,'../../nova-updates/performance-v1.7.8.js'),'utf8');
 vm.runInContext(overlay,context,{filename:'performance-v1.7.8.js'});
 const module={exports:{}};
 window.__novaModules['game/input'](module,module.exports,()=>({}));
 const canvas={
  addEventListener(){},removeEventListener(){},
  getBoundingClientRect(){return {left:0,top:0,width:600,height:400};}
 };
 const input=new module.exports.Input();
 input.attach(canvas);
 const emit=(type,event)=>{for(const fn of [...(listeners.get(type)||[])])fn(event);};
 const count=type=>listeners.get(type)?.size||0;
 return {input,emit,count};
}
test('real Input ends left-button firing when right button stays held',()=>{
 const {input,emit,count}=fixture();
 assert.equal(count('mouseup'),1,'one native mouseup owner');
 input.pd({pointerType:'mouse',button:0,buttons:1,clientX:100,clientY:100});
 assert.equal(input.firing,true);
 // Chromium sends pointermove(buttons=2), not pointerup, at primary release.
 input.pm({pointerType:'mouse',button:0,buttons:2,clientX:100,clientY:100});
 assert.equal(input.firing,true,'legacy Input alone misses this edge');
 emit('mouseup',{button:0,buttons:2});
 assert.equal(input.firing,false,'native primary release must stop firing');
 assert.equal(input.mouseActive,true,'mouse aim must remain live');
 input.pu({pointerType:'mouse',button:2,buttons:0});
 assert.equal(input.firing,false);
 input.detach();
 assert.equal(count('mouseup'),0,'detach must release native listener');
});
test('secondary release does not cancel primary fire, touch input stays owned',()=>{
 const {input,emit,count}=fixture();
 input.pd({pointerType:'mouse',button:0,buttons:1,clientX:100,clientY:100});
 emit('mouseup',{button:2,buttons:1});
 assert.equal(input.firing,true,'secondary release cannot stop left-button firing');
 input.touchSeen=true;
 emit('mouseup',{button:0,buttons:0});
 assert.equal(input.firing,true,'mouse events cannot steal active touch input');
 input.detach();assert.equal(count('mouseup'),0);
});
test('right-first chord retains right-origin fire when left is released',()=>{
 const {input,emit}=fixture();
 input.pd({pointerType:'mouse',button:2,buttons:2,clientX:100,clientY:100});
 assert.equal(input.firing,true,'right mouse was the original fire owner');
 input.pm({pointerType:'mouse',button:0,buttons:3,clientX:100,clientY:100});
 emit('mouseup',{button:0,buttons:2});
 assert.equal(input.firing,true,'releasing a later left button must not steal right-origin fire');
 input.pu({pointerType:'mouse',button:2,buttons:0});
 assert.equal(input.firing,false,'final right release stops firing');
 input.detach();
});
test('reattach does not duplicate native mouseup owners',()=>{
 const {input,count}=fixture();
 assert.equal(count('mouseup'),1);
 input.attach(input.canvas);
 assert.equal(count('mouseup'),1);
 input.detach();
 assert.equal(count('mouseup'),0);
});
