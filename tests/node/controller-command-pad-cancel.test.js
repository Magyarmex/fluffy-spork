'use strict';
// Command Pad must treat OS pointercancel as abort, not a player order.
// Exercise the actual shipping Command Weave module and its installed DOM listeners.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/controller-command-weave-v1.10.0.js'),'utf8');
const shipping=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');

function boot(){
  const padListeners=new Map(), labels={textContent:'CMD'};
  const pad={
    style:{}, setAttribute(){}, parentNode:null,
    addEventListener(name,fn){padListeners.set(name,fn);},
    removeEventListener(name){padListeners.delete(name);},
    setPointerCapture(){},hasPointerCapture(){return true;},releasePointerCapture(){},
    querySelector(sel){return sel==='[data-cw-label]'?labels:null;}
  };
  const document={
    body:{appendChild(node){node.parentNode=this;},removeChild(node){node.parentNode=null;}},
    createElement(){return pad;},addEventListener(){}
  };
  class Game{
    constructor(){
      this.time=10;this.status='playing';this.w=800;this.h=600;this.zoom=1;
      this.cam={x:0,y:0,zoom:1};this.canvas={getBoundingClientRect(){return {left:0,top:0};}};
      this.player={id:1,cls:'carrier',isPlayer:true,alive:true,x:0,y:0,angle:0};
      this.tanks=[];this.drones=[];this.bullets=[];this.sfx={orders:0,novaSwarmCommand(){this.orders++;}};
    }
    start(){return 'started';}
    update(){}
    syncHud(){}
  }
  const mods={'game/engine':m=>{m.exports={Game};}};
  const window={__novaModules:mods};
  vm.runInNewContext(source,{window,document,console:{info(){},warn(){},error(){}},
    Math,Date,Map,WeakMap,Set,Object,Array,Number,performance:{now:()=>0}},
    {filename:'controller-command-weave-v1.10.0.js'});
  const module={exports:{}};
  mods['game/engine'](module,module.exports,()=>({CLASSES:{carrier:{droneLeash:650}},
    ABILITIES:{},lineageForClass:()=> 'controller'}));
  const g=new module.exports.Game();
  assert.equal(g.start(),'started');
  assert.equal(g.__novaCommandPad,pad);
  for(const name of ['pointerdown','pointermove','pointerup','pointercancel'])
    assert.equal(typeof padListeners.get(name),'function',name);
  function emit(name,id,x=100,y=100){
    padListeners.get(name)({pointerId:id,button:0,clientX:x,clientY:y,
      cancelable:true,preventDefault(){},stopImmediatePropagation(){},stopPropagation(){}});
  }
  return {g,emit,pad,labels};
}
function state(g){
  if(!g.player.__novaCommandWeave)g.player.__novaCommandWeave={
    active:false,mode:'recall',x:g.player.x,y:g.player.y,targetId:-1,
    preview:false,changedAt:0,lastTapAt:-99,tutorialUntil:0};
  return g.player.__novaCommandWeave;
}
function setPrior(g,mode='point'){
  const c=state(g);
  Object.assign(c,{active:true,mode,x:125,y:80,targetId:mode==='target'?77:-1,
    preview:false,changedAt:4,lastTapAt:-99,tutorialUntil:7});
  return {...c};
}
function snap(c){return JSON.parse(JSON.stringify(c));}

test('shipping composition includes the live Command Pad overlay',()=>{
  assert.ok(shipping.includes('nova-updates/controller-command-weave-v1.10.0.js'));
});

for(const type of ['touch','pen']){
  test(type+': canceled tap never stamps or recalls the swarm',()=>{
    const {g,emit,labels}=boot(),prior=setPrior(g);
    emit('pointerdown',11);
    emit('pointercancel',11);
    assert.deepEqual(snap(state(g)),prior);
    assert.equal(g.sfx.orders,0);
    assert.equal(labels.textContent,'CMD');
    emit('pointerup',11);
    assert.deepEqual(snap(state(g)),prior,'late up must not commit');
  });
  test(type+': canceled drag rolls back live command preview',()=>{
    const {g,emit,labels}=boot(),prior=setPrior(g,'target');
    emit('pointerdown',17,100,100);
    emit('pointermove',17,600,350);
    assert.equal(state(g).preview,true);
    assert.equal(state(g).mode,'point');
    assert.notDeepEqual(snap(state(g)),prior);
    emit('pointercancel',17,600,350);
    assert.deepEqual(snap(state(g)),prior,'old target order must survive cancellation');
    assert.equal(g.sfx.orders,0,'cancellation must be silent');
    assert.equal(labels.textContent,'CMD');
    emit('pointerup',17,600,350);
    assert.deepEqual(snap(state(g)),prior);
  });
}

test('normal pointerup still commits a deliberate dragged command',()=>{
  const {g,emit}=boot(),prior=setPrior(g);
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  emit('pointerup',21,600,350);
  assert.equal(state(g).active,true);
  assert.equal(state(g).mode,'point');
  assert.equal(state(g).preview,false);
  assert.notDeepEqual(snap(state(g)),prior);
  assert.equal(g.sfx.orders,1);
});
test('normal tap still stamps and second tap still recalls',()=>{
  const {g,emit}=boot();setPrior(g);
  emit('pointerdown',21);emit('pointerup',21);
  assert.equal(state(g).mode,'point');
  assert.equal(g.sfx.orders,1);
  emit('pointerdown',22);emit('pointerup',22);
  assert.equal(state(g).mode,'recall');
  assert.equal(state(g).active,false);
});
test('unrelated pointercancel cannot steal the active gesture',()=>{
  const {g,emit}=boot();setPrior(g);
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  emit('pointercancel',999,600,350);
  assert.equal(state(g).preview,true);
  emit('pointerup',21,600,350);
  assert.equal(state(g).preview,false);
  assert.equal(g.sfx.orders,1);
});
test('canceled drag does not undo a newer independent order',()=>{
  const {g,emit}=boot();setPrior(g);
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  Object.assign(state(g),{mode:'guard',preview:false,x:40,y:60,changedAt:11});
  emit('pointercancel',21,600,350);
  assert.equal(state(g).mode,'guard');
  assert.equal(state(g).x,40);
});
test('canceled gesture releases pointer ownership for a fresh tap',()=>{
  const {g,emit}=boot();setPrior(g);
  emit('pointerdown',21);
  emit('pointercancel',21);
  emit('pointerdown',22);
  emit('pointerup',22);
  assert.equal(g.sfx.orders,1);
});
test('cancellation restores preview even when Controller dies during drag',()=>{
  const {g,emit}=boot(),prior=setPrior(g);
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  g.player.alive=false;
  emit('pointercancel',21,600,350);
  assert.deepEqual(snap(state(g)),prior);
  assert.equal(g.sfx.orders,0);
});

test('capture loss aborts preview without inventing a release',()=>{
  const {g,emit}=boot(),prior=setPrior(g,'target');
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  emit('lostpointercapture',21,600,350);
  assert.deepEqual(snap(state(g)),prior);
  assert.equal(g.sfx.orders,0);
  emit('pointerup',21,600,350);
  assert.deepEqual(snap(state(g)),prior);
});
test('synchronous capture-loss callback during ordinary release cannot cancel a valid command',()=>{
  const {g,emit,pad}=boot();setPrior(g);
  pad.releasePointerCapture=id=>emit('lostpointercapture',id);
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  emit('pointerup',21,600,350);
  assert.equal(g.sfx.orders,1);
  assert.equal(state(g).preview,false);
  assert.equal(state(g).mode,'point');
});
test('cancel is safe if releasing capture synchronously reports capture loss',()=>{
  const {g,emit,pad}=boot(),prior=setPrior(g,'target');
  pad.releasePointerCapture=id=>emit('lostpointercapture',id);
  emit('pointerdown',21,100,100);
  emit('pointermove',21,600,350);
  emit('pointercancel',21,600,350);
  assert.deepEqual(snap(state(g)),prior);
  assert.equal(g.sfx.orders,0);
});
