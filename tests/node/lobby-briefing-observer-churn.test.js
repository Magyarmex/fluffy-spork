'use strict';
// Reproduces the actual lobby-history enhancement against observable text
// nodes. Assigning identical textContent still creates a DOM childList
// mutation, which can re-trigger the root MutationObserver every RAF.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../../nova-updates/lobby-history.js'),'utf8');

function boot(){
  const cls=()=>({add(){},remove(){},toggle(){},contains(){return false;}});
  const writes={tag:0,badge:0,line:0,footer:0};
  function textNode(key,initial=''){
    let value=initial;
    const node={classList:cls(),dataset:{},children:[],isConnected:true};
    Object.defineProperty(node,'textContent',{
      get(){return value;},
      set(next){writes[key]++;value=next;},
    });
    return node;
  }
  const tag=textNode('tag'),badge=textNode('badge'),line=textNode('line');
  const footer=textNode('footer','NOVA TANKS v1.7.7 · OLD');
  const briefing={dataset:{},querySelector(s){return s==='.nv-brief-v'?badge:null;}};
  const shell={classList:cls(),querySelectorAll(){return [];}};
  const hero={classList:cls(),dataset:{},parentElement:shell,
    querySelector(s){return s==='p'?tag:null;}};
  const title={parentElement:hero};
  const actions={dataset:{}},rail={dataset:{}};
  const menu={
    classList:cls(),dataset:{},isConnected:true,scrollTop:0,
    querySelector(s){
      if(s==='h1')return title;
      if(s==='[data-nova-slot="briefing"]')return briefing;
      if(s==='[data-nova-slot="actions"]')return actions;
      if(s==='[data-nova-slot="feature-rail"]')return rail;
      if(s==='.nv-brief-line')return line;
      return null;
    },
    querySelectorAll(s){return s==='div'?[footer]:[];},
  };
  shell.parentElement=menu;
  const document={
    readyState:'loading',head:{appendChild(){}},
    createElement(){return {};},getElementById(){return null;},
    querySelector(s){return s==='#root .menu-grid-bg'?menu:null;},
    addEventListener(){},
  };
  const window={innerHeight:700,addEventListener(){}};
  const intervals=new Map();let nextInterval=1;
  const context={
    window,document,console:{info(){},warn(){},error(){}},
    fetch:()=>Promise.reject(new Error('offline')),
    MutationObserver:class{},requestAnimationFrame:fn=>fn(),
    setTimeout:fn=>{fn();return 1;},clearTimeout(){},
    setInterval:fn=>{const id=nextInterval++;intervals.set(id,fn);return id;},
    clearInterval:id=>intervals.delete(id),
  };
  vm.runInNewContext(source,context,{filename:'lobby-history.js'});
  return {
    window,writes,tag,badge,line,footer,intervals,
    refresh(){window.NOVALobby.refresh();},
    rotate(){const fn=[...intervals.values()][0];assert.ok(fn,'briefing timer exists');fn();},
  };
}

test('100 unrelated root refreshes do not rewrite stable hero, badge, rotating briefing or footer',()=>{
  const app=boot();
  app.refresh();
  const first={...app.writes};
  for(let i=0;i<100;i++)app.refresh();
  assert.deepEqual(app.writes,first,
    'idempotent text nodes must not cause a self-sustaining MutationObserver loop');
});

test('a real rotating briefing line survives an unrelated root refresh',()=>{
  const app=boot();
  app.refresh();
  const first=app.line.textContent;
  app.rotate();
  assert.notEqual(app.line.textContent,first,'timer advances the actual release text');
  const rotated=app.line.textContent,writes=app.writes.line;
  for(let i=0;i<10;i++)app.refresh();
  assert.equal(app.line.textContent,rotated,'root refresh must not reset rotation to headline');
  assert.equal(app.writes.line,writes,'root refresh must not rewrite the rotating text');
});

test('new release resets briefing once, starts new timer and updates badge',()=>{
  const app=boot();
  app.refresh();app.rotate();
  const before={...app.writes};
  app.window.__NOVA_FUTURE_RELEASE__={
    version:'1.13.0',codename:'Future Test',headline:'Future headline',
    groups:{'Future':['A new tactical lesson','Another tactical lesson']},
  };
  app.refresh();
  assert.equal(app.line.textContent,'Future headline');
  assert.equal(app.badge.textContent,'v1.13.0 · FUTURE TEST');
  assert.equal(app.writes.line,before.line+1);
  assert.equal(app.writes.badge,before.badge+1);
  const stable={...app.writes};
  app.refresh();
  assert.deepEqual(app.writes,stable);
  app.rotate();
  assert.equal(app.line.textContent,'A new tactical lesson');
});
