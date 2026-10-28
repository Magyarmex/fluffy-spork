'use strict';
// Reproduce the real Fieldcraft IIFE with a minimal DOM mutation scheduler.
// Setting textContent to its current value still replaces text children in
// browsers, so it must not be done on every MutationObserver-triggered apply.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const full=fs.readFileSync(path.join(__dirname,'../../nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const start=full.indexOf('/* NOVA TANKS v1.7.9 — Fieldcraft');
const end=full.indexOf('/* NOVA FIELDCRAFT DEATH INSIGHT');
assert.ok(start>=0&&end>start,'canonical Fieldcraft runtime must be found');
const source=full.slice(start,end);

function boot(){
  const frames=[],mutations=[],intervals=[];
  let observers=[],writes=0,style=null;
  function changed(){for(const ob of observers)mutations.push(()=>ob.callback());}
  function element(initial=''){
    let value=initial;
    return {
      get textContent(){return value;},
      set textContent(v){value=v;writes++;changed();},
      isConnected:true,
      classList:{remove(){},add(){}},
      querySelector(){return null;}
    };
  }
  const line=element('initial'),title=element('BRIEF'),count=element('COUNT');
  const root={};
  const surface={querySelector(selector){
    if(selector==='.nv-tip-line')return null;
    if(selector==='.nova-tip-line')return line;
    if(selector==='.nv-brief-k')return title;
    if(selector==='.nv-brief-v')return count;
    return null;
  }};
  const menu={querySelector(selector){
    return selector.includes('data-nova-slot')?surface:null;
  }};
  const document={
    readyState:'complete',body:root,
    head:{appendChild(node){style=node;}},
    createElement(tag){return {tagName:tag};},
    getElementById(id){
      return id==='root'?root:id==='nova-fieldcraft-tip-style'?style:null;
    },
    querySelector(selector){
      return selector==='#root .menu-grid-bg'?menu:null;
    },
    querySelectorAll(){return [];}
  };
  class Observer {
    constructor(callback){this.callback=callback;}
    observe(){observers.push(this);}
    disconnect(){observers=observers.filter(ob=>ob!==this);}
  }
  const context={
    window:{},document,MutationObserver:Observer,
    requestAnimationFrame:callback=>frames.push(callback),
    setInterval:callback=>{intervals.push(callback);return intervals.length;},
    clearInterval(){},setTimeout(){},Math,console
  };
  vm.runInNewContext(source,context,{filename:'fieldcraft-runtime.js'});
  function pump(limit=12){
    let n=0;
    for(;n<limit;n++){
      while(mutations.length)mutations.shift()();
      if(!frames.length)break;
      frames.shift()();
    }
    return n;
  }
  return {title,count,line,context,intervals,pump,notify:changed,
    get writes(){return writes;},get queued(){return frames.length;}};
}

test('one unrelated menu DOM mutation does not cause a permanent animation-frame feedback loop',()=>{
  const h=boot();
  assert.equal(h.title.textContent,'TIPS');
  assert.equal(h.intervals.length,2,'one main rotation and one context rotation');
  const before=h.writes;
  h.notify();
  assert.equal(h.pump(12),1,'one scheduled refresh must settle, not reschedule itself');
  assert.equal(h.queued,0);
  assert.equal(h.writes,before,'idempotent refresh must not rewrite unchanged title');
  assert.equal(h.intervals.length,2,'refresh must not duplicate intervals');
});

test('externally overwritten title is repaired once without perpetual DOM writes',()=>{
  const h=boot();
  h.title.textContent='BRIEF';
  const cycles=h.pump(12);
  assert.ok(cycles>=1&&cycles<=2,'title repair may schedule one final no-op refresh');
  assert.equal(h.title.textContent,'TIPS');
  assert.equal(h.queued,0);
});

test('new tactical tips still update the count and settle after the observer refresh',()=>{
  const h=boot(),old=h.context.window.NOVATips.current().length;
  assert.equal(h.context.window.NOVATips.register({
    id:'iff-zoom-test',text:'Read the ring or diamond when drone colors blend.',
    tags:['drones']
  }),true);
  assert.equal(h.context.window.NOVATips.current().length,old+1);
  assert.match(h.count.textContent,new RegExp(String(old+1)+' CURRENT'));
  assert.equal(h.pump(12),1);
  assert.equal(h.queued,0);
});
