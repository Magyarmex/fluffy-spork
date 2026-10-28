'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const marker='/* NOVA TANKS — Between-life front choice.';
const start=source.indexOf(marker);
assert.ok(start>=0,'shipping Fieldcraft file contains front choice');
const patch=source.slice(start);
function boot(options={}){
 const observers=[],panels=[],timers=new Map();
 let nextTimer=1;
 function element(tag){
  return {tag,style:{},attributes:{},children:[],textContent:'',title:'',
   setAttribute(k,v){this.attributes[k]=v;},
   appendChild(c){this.children.push(c);c.parentNode=this;},
   addEventListener(k,fn){this['on'+k]=fn;},
   querySelectorAll(sel){return sel==='button'?this.children.filter(c=>c.tag==='button'):[];},
   querySelector(sel){return sel==='[data-nova-front-choice]'?
    this.children.find(c=>c.attributes['data-nova-front-choice']!==undefined)||null:null;}};
 }
 const document={body:{},getElementById:()=>({}),createElement:element,
  querySelectorAll(sel){return sel==='.panel'?panels:[];},
  querySelector(sel){return sel==='[data-nova-front-choice]'?
   (panels[0]&&panels[0].choice)||null:null;}};
 class MutationObserver{
  constructor(fn){this.fn=fn;this.disconnected=false;observers.push(this);}
  observe(){this.active=true;}
  disconnect(){this.disconnected=true;}
  notify(){if(!this.disconnected)this.fn();}
 }
 class Game{
  constructor(){this.status='playing';this.player=null;this.randCalls=[];this.__novaTerrain=[{id:1}];}
  isTerrainSafe(x,y,pad){return options.safe?options.safe(x,y,pad):true;}
  randSpawnPos(dist){this.randCalls.push(dist);return {x:1900,y:1900};}
  killTank(victim){if(!victim.alive)return;victim.alive=false;this.status='dying';}
  update(){if(this.status==='dying')this.status='dead';}
  redeploy(){this.status='playing';this.player={...this.randSpawnPos(900),isPlayer:true};this.randSpawnPos(400);return 'redeployed';}
 }
 const window={__novaModules:{'game/engine':m=>{m.exports.Game=Game;}}};
 const context={window,document,MutationObserver,Math,Number,
  setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},
  clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(patch,context);
 const m={exports:{}};window.__novaModules['game/engine'](m,m.exports,()=>{throw Error('no extra imports');});
 function addPanel(){
  const redeploy={textContent:'⚡ REDEPLOY'};
  const panel={textContent:'TERMINATED SCORE REDEPLOY',choice:null,
   querySelectorAll(sel){return sel==='button'?[redeploy]:[];},
   querySelector(sel){return sel==='[data-nova-front-choice]'?this.choice:null;},
   insertBefore(node,before){assert.equal(before,redeploy);this.choice=node;node.parentNode=this;},
   removeChild(node){assert.equal(node,this.choice);this.choice=null;node.parentNode=null;}};
  panels.push(panel);return panel;
 }
 return {Game:m.exports.Game,api:window.__NOVA_FRONT_CHOICE_TEST__,addPanel,observers,timers};
}
function victim(x=0,y=0){return {id:1,isPlayer:true,alive:true,x,y};}
test('materialized production chain loads front choice before game boot',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/menu-slot-compat-v1.7.8.js'));
 assert.ok(html.indexOf('nova-updates/menu-slot-compat-v1.7.8.js')<html.search(/window\\.__bootModule\\((['\"])main\\1\\)/));
});
test('default fresh front preserves exact original spawn behavior',()=>{
 const {Game}=boot(),g=new Game();
 g.killTank(victim());g.update();
 assert.equal(g.__novaRedeployChoice,'fresh');
 assert.equal(g.redeploy(),'redeployed');
 assert.equal(g.player.x,1900);
 assert.deepEqual(g.randCalls,[900,400]);
 assert.equal(g.__novaRedeployOrigin,null);
});
test('return to front uses a bounded terrain-safe position from witnessed death',()=>{
 const {Game}=boot(),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 const d=Math.hypot(g.player.x-100,g.player.y-200);
 assert.ok(d>=420-1e-8&&d<=850+1e-8,'spawn near previous physical position');
 assert.deepEqual(g.randCalls,[400],'only player spawn intercepted; AI uses original');
 assert.equal(g.__novaFrontSpawnArmed,false);
});
test('return respects terrain rejection and falls back to original safe algorithm',()=>{
 const {Game}=boot({safe:()=>false}),g=new Game();
 g.killTank(victim());g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.equal(g.player.x,1900);
 assert.deepEqual(g.randCalls,[900,400]);
});
test('return never chooses out-of-bounds near edge',()=>{
 const {Game}=boot(),g=new Game();
 g.killTank(victim(2240,2240));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.ok(Math.abs(g.player.x)<=2050&&Math.abs(g.player.y)<=2050);
});
test('invalid or unknown death position cannot activate the override',()=>{
 const {Game,api}=boot(),g=new Game();
 assert.equal(api.validOrigin({x:Infinity,y:0}),false);
 assert.equal(api.validOrigin({x:0,y:NaN}),false);
 g.killTank(victim(NaN,0));g.update();g.__novaRedeployChoice='return';
 g.redeploy();assert.equal(g.player.x,1900);
});
test('non-player deaths and decorative worlds cannot expose a choice',()=>{
 const {Game,observers}=boot(),g=new Game();
 g.killTank({id:2,isPlayer:false,alive:true,x:0,y:0});g.update();
 assert.equal(g.__novaRedeployOrigin,undefined);
 assert.equal(observers.length,0);
 const h=new Game();h.__novaDecorativeWorld=true;h.killTank(victim());h.update();
 assert.equal(h.__novaRedeployOrigin,undefined);
});
test('death modal presents accessible mutually exclusive plans without duplicate rows',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 g.killTank(victim());g.update();
 assert.ok(panel.choice);
 const row=panel.choice,buttons=row.children[1].children;
 assert.equal(row.attributes.role,'group');
 assert.equal(buttons.length,2);
 assert.equal(buttons[0].attributes['aria-pressed'],'true');
 assert.equal(buttons[1].attributes['aria-pressed'],'false');
 buttons[1].onclick();
 assert.equal(g.__novaRedeployChoice,'return');
 assert.equal(buttons[0].attributes['aria-pressed'],'false');
 assert.equal(buttons[1].attributes['aria-pressed'],'true');
 g.update();assert.equal(panel.choice,row);
 g.redeploy();assert.equal(panel.choice,null);
});
test('React panel may mount after death; observer disconnects on success',()=>{
 const {Game,addPanel,observers}=boot(),g=new Game();
 g.killTank(victim());g.update();
 assert.equal(observers.length,1);
 const p=addPanel();observers[0].notify();
 assert.ok(p.choice);
 assert.equal(observers[0].disconnected,true);
});
test('new death does not inherit the previous plan',()=>{
 const {Game}=boot(),g=new Game();
 g.killTank(victim());g.update();g.__novaRedeployChoice='return';g.redeploy();
 g.killTank(victim(500,500));g.update();
 assert.equal(g.__novaRedeployChoice,'fresh');
});
