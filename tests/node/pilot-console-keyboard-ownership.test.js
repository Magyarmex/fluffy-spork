'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const settings=fs.readFileSync(path.join(root,'nova-updates/settings-v1.7.7.js'),'utf8');
const start=html.indexOf('window.__defineModule("game/input"');
const end=html.indexOf('window.__defineModule("game/render"',start);
assert.ok(start>=0&&end>start,'real shipping Input module required');
function boot(){
  const windowListeners=new Map(),documentListeners=new Map();
  const on=(m,k,fn)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(fn);};
  const off=(m,k,fn)=>{m.set(k,(m.get(k)||[]).filter(x=>x!==fn));};
  function el(tag){
    return {tagName:tag.toUpperCase(),children:[],style:{setProperty(){}},
      listeners:new Map(),hidden:false,disabled:false,
      appendChild(child){this.children.push(child);return child;},
      setAttribute(){},addEventListener(k,fn){on(this.listeners,k,fn);},
      removeEventListener(k,fn){off(this.listeners,k,fn);},
      querySelector(q){const choices=q.split(',').map(x=>x.trim().toUpperCase());
        function find(e){if(choices.includes(e.tagName))return e;
          for(const c of e.children){const got=find(c);if(got)return got;}return null;}
        for(const c of this.children){const got=find(c);if(got)return got;}return null;},
      focus(){this.focused=true;},
      getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}};
  }
  const body=el('body'),head=el('head'),rootEl=el('div'),canvas=el('canvas');
  function findId(node,id){if(node.id===id)return node;
    for(const child of node.children){const got=findId(child,id);if(got)return got;}return null;}
  const document={readyState:'complete',hidden:false,body,head,
    documentElement:{style:{setProperty(){}},requestFullscreen:null},
    createElement:el,getElementById(id){return id==='root'?rootEl:findId(body,id)||findId(head,id);},
    querySelector(sel){return sel==='#root canvas.absolute.inset-0'?canvas:null;},
    addEventListener(k,fn,capture){on(documentListeners,capture===true?k+'-capture':k,fn);},
    removeEventListener(k,fn,capture){off(documentListeners,capture===true?k+'-capture':k,fn);}};
  const store=new Map(),localStorage={getItem(k){return store.get(k)||null;},
    setItem(k,v){store.set(k,String(v));}};
  const window={__novaModules:{},__defineModule(id,fn){this.__novaModules[id]=fn;},
    addEventListener(k,fn){on(windowListeners,k,fn);},
    removeEventListener(k,fn){off(windowListeners,k,fn);}};
  const context={window,document,localStorage,Math,Number,Object,Map,JSON,
    performance:{now:()=>1000},navigator:{},setTimeout(){return 0;},
    console:{info(){},warn(){},error(){}}};
  vm.runInNewContext(html.slice(start,end),context);
  let InputClass;
  window.__novaModules['game/engine']=function(module){
    function Game(){
      this.input=new InputClass();this.input.attach(canvas);
      this.paused=false;this.resetCount=0;
      this.input.__novaBlurReset=()=>{
        this.resetCount++;this.input.firing=false;this.input.abilityQueued=false;
        for(const k of Object.keys(this.input.keyboard))this.input.keyboard[k]=false;
      };
    }
    Game.prototype.start=function(){};
    Game.prototype.destroy=function(){this.input.detach();};
    Game.prototype.setPaused=function(v){this.paused=!!v;};
    module.exports.Game=Game;
  };
  vm.runInNewContext(settings,context);
  const im={exports:{}};window.__novaModules['game/input'](im,im.exports,()=>({}));
  InputClass=im.exports.Input;
  const gm={exports:{}};window.__novaModules['game/engine'](gm,gm.exports,()=>({}));
  const game=new gm.exports.Game();game.start();
  const gear=document.getElementById('nova-pilot-gear');
  const overlay=document.getElementById('nova-pilot-overlay');
  function click(element){for(const fn of element.listeners.get('click')||[])fn({
    target:element,preventDefault(){},stopPropagation(){}});}
  function key(k,target=overlay){
    const event={key:k,target,repeat:false,defaultPrevented:false,stopped:false,
      preventDefault(){this.defaultPrevented=true;},
      stopPropagation(){this.stopped=true;},
      stopImmediatePropagation(){this.stopped=true;}};
    for(const fn of documentListeners.get('keydown-capture')||[])fn(event);
    if(!event.stopped)for(const fn of target.listeners?.get('keydown')||[])fn(event);
    if(!event.stopped)for(const fn of documentListeners.get('keydown')||[])fn(event);
    if(!event.stopped)for(const fn of windowListeners.get('keydown')||[])fn(event);
    return event;
  }
  return {game,gear,overlay,click,key,document};
}
test('Pilot Console keyboard focus never activates combat keys while modal is visible',()=>{
  const {game,gear,overlay,click,key}=boot();
  click(gear);assert.equal(overlay.hidden,false);assert.equal(game.paused,true);
  const slider=overlay.querySelector('input,button'),received=[];
  slider.addEventListener('keydown',e=>received.push(e.key));
  for(const k of ['w','a','s','d','ArrowLeft','ArrowRight','e',' ','f']){
    const before=game.input.autofire;
    const e=key(k,slider);
    assert.equal(e.defaultPrevented,false,'native slider/button key handling must survive '+k);
    assert.equal(received.at(-1),k,'focused control must receive its keydown before gameplay isolation');
    assert.equal(game.input.abilityQueued,false,'modal key must not queue an ultimate');
    assert.equal(game.input.autofire,before,'modal key must not toggle autofire');
    assert.deepEqual(Object.values(game.input.keyboard),[false,false,false,false],
      'modal key must not move tank');
  }
});
test('opening Pilot Console releases held gameplay state and Escape restores previous pause',()=>{
  const {game,gear,overlay,click,key}=boot();
  game.input.keyboard.up=true;game.input.firing=true;game.input.abilityQueued=true;
  click(gear);
  assert.equal(game.resetCount,1,'opening a modal must release held gameplay input');
  assert.equal(game.input.firing,false);assert.equal(game.input.abilityQueued,false);
  assert.equal(game.input.keyboard.up,false);
  const escape=key('Escape');
  assert.equal(escape.defaultPrevented,true);
  assert.equal(overlay.hidden,true);assert.equal(game.paused,false);
});
test('normal gameplay hotkeys still work when Pilot Console is closed',()=>{
  const {game,key}=boot();
  key('w');assert.equal(game.input.keyboard.up,true);
  key('e');assert.equal(game.input.abilityQueued,true);
  const before=game.input.autofire;key('f');assert.equal(game.input.autofire,!before);
});
test('Pilot Console does not unpause a run that was already paused',()=>{
  const {game,gear,overlay,click,key}=boot();
  game.setPaused(true);click(gear);
  assert.equal(overlay.hidden,false);
  key('Escape');assert.equal(game.paused,true);
});

test('closing Pilot Console returns keyboard ownership without changing autofire preference',()=>{
  const {game,gear,click,key}=boot();
  game.input.autofire=false;
  click(gear);
  key('f');assert.equal(game.input.autofire,false);
  key('Escape');
  key('f');assert.equal(game.input.autofire,true);
  key('w');assert.equal(game.input.keyboard.up,true);
});
