'use strict';
// Regression for the actual shipping Input lifecycle, not the unwrapped core.
// Controller captures/removes the core's anonymous blur handler. The full
// composed Game must leave no per-life listeners after repeated menu exits.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).find(s=>s.includes('window.__defineModule("game/engine"'));
const overlays=[...html.matchAll(/<script[^>]+src=["']\.\/(nova-updates\/[^"']+)["']/g)]
  .map(m=>m[1]);
const noop=()=>{};
function target(){
 const listeners=new Map();
 return {addEventListener(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn)},
  removeEventListener(type,fn){listeners.get(type)?.delete(fn)},
  fire(type){for(const fn of [...(listeners.get(type)||[])])fn({type})},
  counts(){return Object.fromEntries([...listeners].filter(([,s])=>s.size)
    .map(([k,s])=>[k,s.size]).sort(([a],[b])=>a.localeCompare(b)))}
 };
}
function canvas(){
 const c=Object.assign(target(),{clientWidth:800,clientHeight:600,width:800,height:600,
  style:{setProperty:noop},classList:{add:noop,remove:noop,toggle:noop},
  setAttribute:noop,appendChild:noop,remove:noop,querySelector:()=>null,
  getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
 const gradient={addColorStop:noop};
 const ctx=new Proxy({canvas:c,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
  measureText:t=>({width:String(t).length*8}),
  getImageData:()=>({data:new Uint8ClampedArray(4)})},
  {get:(o,k)=>k in o?o[k]:noop,set:(o,k,v)=>{o[k]=v;return true}});
 c.getContext=()=>ctx;return c;
}
function boot(){
 assert.ok(inline,'materialized game module is present');
 assert.ok(overlays.length>=48,'full gameplay overlay chain is present');
 assert.equal(new Set(overlays).size,overlays.length,'no duplicate overlays');
 const document=Object.assign(target(),{hidden:false,visibilityState:'visible',
  createElement:()=>canvas(),getElementById:()=>null,querySelector:()=>null,
  querySelectorAll:()=>[],body:{appendChild:noop},head:{appendChild:noop},
  documentElement:{style:{setProperty:noop,removeProperty:noop},
   classList:{toggle:noop,add:noop,remove:noop}}});
 const store=new Map();
 const window=Object.assign(target(),{document,devicePixelRatio:1,innerWidth:800,innerHeight:600,
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))},
  setTimeout,clearTimeout,performance});window.window=window;
 const errors=[];
 const context=vm.createContext({window,document,innerWidth:800,innerHeight:600,
  matchMedia:()=>({matches:false,addListener:noop,addEventListener:noop}),
  MutationObserver:class{observe(){}disconnect(){}},CanvasRenderingContext2D:class{},
  fetch:async()=>({ok:true,json:async()=>({releases:[]}),text:async()=>''}),
  navigator:{maxTouchPoints:0,onLine:false},
  console:{info:noop,warn:noop,log:noop,error:(...args)=>errors.push(args.map(String).join(' '))},
  Math,Number,Object,Array,Date,Map,Set,WeakMap,Uint8Array,Uint8ClampedArray,
  ArrayBuffer,Promise,JSON,Symbol,Error,TypeError,RegExp,String,Boolean,Infinity,NaN,
  parseInt,parseFloat,isNaN,performance,setTimeout,clearTimeout,
  setInterval:()=>0,clearInterval:noop,requestAnimationFrame:()=>0,cancelAnimationFrame:noop,
  Image:class{},Audio:class{},URL,Blob,TextEncoder,TextDecoder});
 vm.runInContext(inline,context,{filename:'index.html#game',timeout:12000});
 for(const file of overlays)vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),
  context,{filename:file,timeout:5000});
 return {window,document,errors,Game:window.__novaMakeRequire('')('game/engine').Game};
}
test('30 real Game create/destroy cycles release all per-life input listeners',()=>{
 const {window,document,Game,errors}=boot();
 const windowBaseline=window.counts(),documentBaseline=document.counts();
 for(let cycle=0;cycle<30;cycle++){
  const gameCanvas=canvas(),g=new Game(gameCanvas,canvas(),{hud:noop,event:noop},'low');
  assert.equal(window.counts().blur,2,'core and Controller blur handlers attached');
  assert.equal(window.counts().pointermove,1);
  assert.equal(window.counts().pointerup,1);
  assert.equal(window.counts().pointercancel,1);
  assert.equal(document.counts().visibilitychange,(documentBaseline.visibilitychange||0)+2);
  g.input.keyboard.right=true;g.input.firing=true;g.input.abilityQueued=true;
  window.fire('blur');
  assert.equal(g.input.keyboard.right,false,'blur releases movement');
  assert.equal(g.input.firing,false,'blur releases firing');
  assert.equal(g.input.abilityQueued,false,'blur clears queued ability');
  g.destroy();
  assert.deepEqual(window.counts(),windowBaseline,'no per-life window listener survives');
  assert.deepEqual(document.counts(),documentBaseline,'no per-life document listener survives');
  assert.deepEqual(gameCanvas.counts(),{},'no gameplay canvas listener survives');
 }
 assert.deepEqual(errors.filter(s=>!s.includes('React hooks unavailable; interaction patch not installed')),[]);
});
