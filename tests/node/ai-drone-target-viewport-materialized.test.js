'use strict';
// Exercise the exact materialized HTML core and every production overlay,
// not an isolated reimplementation of acquireDroneTarget.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .map(m=>m[1]).find(s=>s.includes('window.__defineModule("game/engine"'));
const overlays=[...html.matchAll(/<script[^>]+src=["']\.\/(nova-updates\/[^"']+)["']/g)].map(m=>m[1]);
const noop=()=>{};
function boot(){
  const document={hidden:false,addEventListener:noop,removeEventListener:noop,
    createElement:()=>({getContext:()=>({}),style:{},addEventListener:noop}),
    getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],
    body:{appendChild:noop},head:{appendChild:noop},
    documentElement:{style:{setProperty:noop},classList:{toggle:noop,add:noop,remove:noop}}};
  const window={document,devicePixelRatio:1,innerWidth:320,innerHeight:240,
    addEventListener:noop,removeEventListener:noop,
    localStorage:{getItem:()=>null,setItem:noop},setTimeout,clearTimeout,performance};
  window.window=window;
  const ctx=vm.createContext({window,document,Math,Number,Object,Array,Date,Map,Set,
    WeakMap,Uint8Array,Uint8ClampedArray,ArrayBuffer,Promise,JSON,Symbol,Error,
    TypeError,RegExp,String,Boolean,Infinity,NaN,parseInt,parseFloat,isNaN,
    performance,setTimeout,clearTimeout,setInterval:()=>0,clearInterval:noop,
    requestAnimationFrame:()=>0,cancelAnimationFrame:noop,Image:class{},
    Audio:class{},URL,Blob,TextEncoder,TextDecoder,
    navigator:{maxTouchPoints:0,onLine:false},
    matchMedia:()=>({matches:false,addListener:noop,addEventListener:noop}),
    MutationObserver:class{observe(){}disconnect(){}},
    CanvasRenderingContext2D:class{},
    fetch:async()=>({ok:true,json:async()=>({releases:[]})}),
    console:{info:noop,warn:noop,error:noop,log:noop}});
  vm.runInContext(inline,ctx,{timeout:12000});
  for(const file of overlays)vm.runInContext(
    fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file,timeout:5000});
  const Game=window.__novaMakeRequire('')('game/engine').Game;
  const g=Object.create(Game.prototype);
  const owner={id:1,kind:'tank',cls:'carrier',team:'blue',alive:true,
    hp:100,maxHp:100,x:0,y:0,ai:{state:'farm'},isPlayer:false};
  const drone={id:10,kind:'drone',ownerId:1,x:180,y:0,hp:20,r:8,role:'hunter',leash:500};
  g.w=320;g.h=240;g.cam={zoom:1};g.time=5;g.tanks=[owner];g.drones=[drone];
  g.shapes=[];g.player=null;g.tankById=new Map([[1,owner]]);
  g.tmpD=[];g.testCandidates=[];
  g.hash={query(x,y,r,out){out.length=0;out.push(...g.testCandidates);}};
  g.hasLineOfSight=()=>true;
  g.areAllies=(a,b)=>a.team===b.team;
  g.areHostile=(a,b)=>a.team!==b.team;
  return {g,owner,drone,window};
}
function tank(id,x,isPlayer=false){
  return {id,kind:'tank',cls:'basic',team:'red',alive:true,hp:100,
    maxHp:100,spawnShieldT:0,x,y:0,isPlayer};
}
for(const hz of [30,60,120,240]){
  test('materialized AI drone fair viewport '+hz+'Hz',()=>{
    const {g,owner,drone,window}=boot();
    const hidden=tank(2,200),visible=tank(3,100);
    g.tanks.push(hidden,visible);g.tankById.set(2,hidden);g.tankById.set(3,visible);
    g.testCandidates=[hidden,visible];
    assert.equal(window.__NOVA_FAIR_ENGAGEMENT__.inGameplayViewport(g,owner,hidden),false);
    assert.equal(g.acquireDroneTarget(drone,owner,500),visible,
      'offscreen native tank must not win against a legitimate visible opponent');
    g.testCandidates=[hidden];
    assert.equal(g.acquireDroneTarget(drone,owner,500),null,
      'offscreen-only tank may not become AI drone target');
    g.cam.zoom=.75;
    assert.equal(g.acquireDroneTarget(drone,owner,500),hidden,
      'zooming out reveals the same tank without changing its identity');
    g.cam.zoom=1;g.w=320;owner.isPlayer=true;owner.ai=null;
    assert.equal(g.acquireDroneTarget(drone,owner,500),hidden,
      'human Controller autonomous target behavior stays unchanged');
    void hz;
  });
}
