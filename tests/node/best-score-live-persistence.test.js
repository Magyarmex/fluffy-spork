'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=fs.readFileSync(path.join(__dirname,'../../nova-updates/living-front-core-v1.12.0.js'),'utf8');
function boot(initial=100,storageFails=false){
 const store=new Map([['novatanks_best',String(initial)]]);
 const writes=[],timers=new Map(),listeners={},docListeners={};
 let nextTimer=1;
 class Game{
  constructor(){this.best=initial;this.status='playing';this.player={id:1,isPlayer:true,score:initial,level:1};this.orbs=[];}
  gainXP(t,amt){t.score+=amt;}
  updateOrbs(){this.gainXP(this.player,25);}
  pityStartLevel(){return 9;}
  redeploy(){return 'redeployed';}
  destroy(){return 'destroyed';}
 }
 const modules={'game/engine':m=>{m.exports={Game};}};
 const window={__novaModules:modules,localStorage:{
  getItem:key=>store.get(key)||null,
  setItem:(key,value)=>{if(storageFails)throw Error('blocked');writes.push([key,value]);store.set(key,String(value));}},
  addEventListener:(key,fn)=>{listeners[key]=fn;}};
 const document={hidden:false,addEventListener:(key,fn)=>{docListeners[key]=fn;}};
 const context=vm.createContext({window,document,
  console:{info(){},warn(){},error(){}},
  Math,Number,Object,Array,Date,Set,
  setTimeout:fn=>{const id=nextTimer++;timers.set(id,fn);return id;},
  clearTimeout:id=>timers.delete(id)});
 vm.runInContext(core,context,{filename:'living-front-core-v1.12.0.js'});
 const m={exports:{}};modules['game/engine'](m,m.exports,()=>({SHAPE_DEFS:{}}));
 function tick(){const callbacks=[...timers.values()];timers.clear();for(const fn of callbacks)fn();}
 return{Game:m.exports.Game,store,writes,timers,tick,listeners,document,docListeners};
}
test('new best score survives without death, but legacy pity remains disabled',()=>{
 const b=boot(),g=new b.Game();
 assert.equal(g.pityStartLevel(),1);
 g.gainXP(g.player,23.8);
 assert.equal(b.store.get('novatanks_best'),'100','debounced write');
 assert.equal(g.best,100,'game-over record detection must still compare prior best');
 b.tick();
 assert.equal(b.store.get('novatanks_best'),'124');
 assert.equal(g.best,100);
});
test('rapid XP gains coalesce to one write of highest rounded score',()=>{
 const b=boot(),g=new b.Game();
 for(let i=0;i<100;i++)g.gainXP(g.player,1);
 assert.equal(b.timers.size,1);
 b.tick();assert.deepEqual(b.writes,[['novatanks_best','200']]);
 g.gainXP(g.player,0);
 assert.equal(b.timers.size,0,'unchanged score does not reschedule storage');
});
test('pagehide and visibilitychange flush pending best before a tab closes',()=>{
 const b=boot(),g=new b.Game();
 g.gainXP(g.player,10);b.listeners.pagehide();
 assert.equal(b.store.get('novatanks_best'),'110');
 assert.equal(b.timers.size,0);
 g.gainXP(g.player,5);b.document.hidden=true;b.docListeners.visibilitychange();
 assert.equal(b.store.get('novatanks_best'),'115');
});
test('redeploy and teardown flush without changing game lifecycle result',()=>{
 const b=boot(),g=new b.Game();
 g.gainXP(g.player,10);assert.equal(g.redeploy(),'redeployed');
 assert.equal(b.store.get('novatanks_best'),'110');
 g.gainXP(g.player,5);assert.equal(g.destroy(),'destroyed');
 assert.equal(b.store.get('novatanks_best'),'115');
});
test('AI, impostor, decorative world and non-playing states cannot write records',()=>{
 const b=boot(),g=new b.Game();
 g.gainXP({id:2,isPlayer:false,score:999},500);
 g.gainXP({id:3,isPlayer:true,score:999},500);
 g.__novaDecorativeWorld=true;g.gainXP(g.player,10);
 g.__novaDecorativeWorld=false;g.status='dead';g.gainXP(g.player,10);
 b.tick();assert.equal(b.writes.length,0);
});
test('unavailable localStorage never interrupts XP, and newer records are never downgraded',()=>{
 const b=boot(100,true),g=new b.Game();
 assert.doesNotThrow(()=>{g.gainXP(g.player,20);b.tick();});
 const c=boot(100),h=new c.Game();
 c.store.set('novatanks_best','500');
 h.gainXP(h.player,20);c.tick();
 assert.equal(c.store.get('novatanks_best'),'500');
 assert.equal(c.writes.length,0);
});
test('production path still includes the Living Front progression owner before boot',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
 assert.match(html,/nova-updates\/living-front-core-v1\.12\.0\.js/);
 assert.match(core,/Game\.prototype\.pityStartLevel=function\(\)\{return 1;\}/);
 assert.match(core,/novatanks_best/);
});

test('the Living Front neutral-orb gainXP wrapper also saves earned records',()=>{
 const b=boot(),g=new b.Game();
 g.updateOrbs(.1);
 b.tick();
 assert.equal(b.store.get('novatanks_best'),'125');
});
