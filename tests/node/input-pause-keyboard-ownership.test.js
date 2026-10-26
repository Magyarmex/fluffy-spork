'use strict';
// Regression-first: exercise the materialized Input and Game with all shipping
// overlays in HTML order. Simulated DOM checks event ownership, not pixels.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1])
  .find(s=>s.includes('window.__defineModule("game/engine"'));
const overlays=[...html.matchAll(/<script[^>]+src=["']\.\/(nova-updates\/[^"']+)["']/g)].map(m=>m[1]);
assert.ok(inline&&overlays.length>=40,'actual shipping engine and overlays are required');
const noop=()=>{};
function makeCanvas(){
  const c={clientWidth:800,clientHeight:600,width:800,height:600,
    style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop},
    setAttribute:noop,appendChild:noop,remove:noop,querySelector:()=>null,
    addEventListener:noop,removeEventListener:noop,
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
  const gradient={addColorStop:noop};
  const ctx=new Proxy({canvas:c,createLinearGradient:()=>gradient,
    createRadialGradient:()=>gradient,measureText:t=>({width:String(t).length*8}),
    getImageData:()=>({data:new Uint8ClampedArray(4)})},
    {get:(obj,key)=>key in obj?obj[key]:noop,set:(obj,key,val)=>{obj[key]=val;return true;}});
  c.getContext=()=>ctx;
  return c;
}
function boot(){
  const listeners={window:new Map(),document:new Map()};
  const add=(which,type,fn)=>{let a=listeners[which].get(type);if(!a){a=[];listeners[which].set(type,a);}a.push(fn);};
  const remove=(which,type,fn)=>listeners[which].set(type,(listeners[which].get(type)||[]).filter(x=>x!==fn));
  const store=new Map();
  const document={hidden:false,visibilityState:'visible',readyState:'loading',
    addEventListener:(k,fn)=>add('document',k,fn),
    removeEventListener:(k,fn)=>remove('document',k,fn),
    createElement:()=>makeCanvas(),getElementById:()=>null,
    querySelector:()=>null,querySelectorAll:()=>[],
    body:{appendChild:noop},head:{appendChild:noop},
    documentElement:{style:{setProperty:noop,removeProperty:noop},
      classList:{toggle:noop,add:noop,remove:noop}}};
  const window={document,devicePixelRatio:1,innerWidth:800,innerHeight:600,
    addEventListener:(k,fn)=>add('window',k,fn),
    removeEventListener:(k,fn)=>remove('window',k,fn),
    localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))},
    setTimeout,clearTimeout,performance};
  window.window=window;
  const context=vm.createContext({window,document,innerWidth:800,innerHeight:600,
    matchMedia:()=>({matches:false,addListener:noop,addEventListener:noop}),
    MutationObserver:class{observe(){}disconnect(){}},
    CanvasRenderingContext2D:class{},
    fetch:async()=>({ok:true,json:async()=>({releases:[]}),text:async()=>''}),
    navigator:{maxTouchPoints:0,onLine:false},console:{info:noop,warn:noop,log:noop,error:noop},
    Math,Number,Object,Array,Date,Map,Set,WeakMap,Uint8Array,Uint8ClampedArray,
    ArrayBuffer,Promise,JSON,Symbol,Error,TypeError,RegExp,String,Boolean,
    Infinity,NaN,parseInt,parseFloat,isNaN,performance,setTimeout,clearTimeout,
    setInterval:()=>0,clearInterval:noop,requestAnimationFrame:()=>0,
    cancelAnimationFrame:noop,Image:class{},Audio:class{},URL,Blob,TextEncoder,TextDecoder});
  vm.runInContext(inline,context,{filename:'index.html#shipping-engine',timeout:12000});
  for(const script of overlays)vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),
    context,{filename:script,timeout:5000});
  const Game=window.__novaMakeRequire('')('game/engine').Game;
  const game=new Game(makeCanvas(),makeCanvas(),{hud:noop,event:noop},'low');
  function dispatch(type,key,target,repeat=false){
    const e={type,key,repeat,target:target||{tagName:'CANVAS'},defaultPrevented:false,
      stopped:false,preventDefault(){this.defaultPrevented=true;},
      stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.stopped=true;}};
    if(target&&typeof target.onKey==='function')target.onKey(e);
    if(!e.stopped)for(const fn of listeners.document.get(type)||[])fn(e);
    if(!e.stopped)for(const fn of listeners.window.get(type)||[])fn(e);
    return e;
  }
  return {game,dispatch,dispose:()=>game.destroy(),listeners};
}
for(const hz of [30,60,120,240]){
  test('materialized pause owns E/Space/F/WASD at '+hz+' FPS',()=>{
    const {game,dispatch,dispose}=boot();
    try{
      const before=game.input.autofire;
      dispatch('keydown','w');assert.equal(game.input.keyboard.up,true);
      game.input.firing=true;game.input.abilityQueued=true;
      game.setPaused(true);
      assert.equal(game.paused,true);
      assert.equal(game.input.keyboard.up,false,'pause releases held movement');
      assert.equal(game.input.firing,false,'pause releases held fire');
      assert.equal(game.input.abilityQueued,false,'pause drops queued ultimate');
      for(const key of ['w','a','s','d','ArrowLeft','ArrowRight','e',' ','f']){
        const event=dispatch('keydown',key,{tagName:'BUTTON'});
        assert.equal(event.defaultPrevented,false,'paused modal retains native key '+key);
      }
      assert.equal(game.input.abilityQueued,false,'no ability from paused modal');
      assert.equal(game.input.autofire,before,'no autofire toggle from paused modal');
      assert.deepEqual(Object.values(game.input.keyboard),[false,false,false,false]);
      game.setPaused(false);
      let uses=0;const use=game.useAbility;game.useAbility=function(){uses++;return use.apply(this,arguments);};
      game.update(1/hz);
      assert.equal(uses,0,'first resumed simulation frame cannot consume paused E');
      assert.equal(game.input.abilityQueued,false);
    }finally{dispose();}
  });
  test('offer pause and held-key rollover are safe at '+hz+' FPS',()=>{
    const {game,dispatch,dispose}=boot();
    try{
      game.pendingOffer=1;game.openOffer();
      assert.equal(game.paused,true,'real offer API pauses simulation');
      dispatch('keydown','e');
      dispatch('keydown','f');
      assert.equal(game.input.abilityQueued,false);
      const pref=game.input.autofire;
      game.dismissOffer();
      dispatch('keydown','e',null,true);
      dispatch('keydown','f',null,true);
      assert.equal(game.input.abilityQueued,false,'held paused E must not leak on resume');
      assert.equal(game.input.autofire,pref);
      dispatch('keyup','e');dispatch('keyup','f');
      dispatch('keydown','e');
      assert.equal(game.input.abilityQueued,true,'new post-resume press must work');
    }finally{dispose();}
  });
}
test('focused gameplay UI keeps native Space/arrow behavior and never fires ability',()=>{
  const {game,dispatch,dispose}=boot();
  try{
    let native=0;const button={tagName:'BUTTON',onKey:()=>native++};
    for(const key of [' ','ArrowLeft','e','f']){
      const event=dispatch('keydown',key,button);
      assert.equal(event.defaultPrevented,false);
    }
    assert.equal(native,4);
    assert.equal(game.input.abilityQueued,false);
    assert.equal(game.input.keyboard.left,false);
    assert.equal(game.input.autofire,true);
    dispatch('keydown','e');
    assert.equal(game.input.abilityQueued,true,'canvas/game keyboard remains responsive');
  }finally{dispose();}
});
test('keyups during pause release latches; normal WASD and F return after resume',()=>{
  const {game,dispatch,dispose}=boot();
  try{
    game.setPaused(true);
    dispatch('keydown','w');dispatch('keydown','f');
    dispatch('keyup','w');dispatch('keyup','f');
    game.setPaused(false);
    dispatch('keydown','w');assert.equal(game.input.keyboard.up,true);
    dispatch('keyup','w');assert.equal(game.input.keyboard.up,false);
    const before=game.input.autofire;
    dispatch('keydown','f');assert.equal(game.input.autofire,!before);
  }finally{dispose();}
});
