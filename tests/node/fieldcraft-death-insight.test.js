'use strict';
// Production-loaded Fieldcraft extension: killer identity is authoritative,
// while matchup advice must not guess which weapon or mechanic caused death.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'nova-updates/menu-slot-compat-v1.7.8.js'),'utf8');
const marker='/* NOVA FIELDCRAFT DEATH INSIGHT';
const start=source.indexOf(marker);
assert.ok(start>=0,'Fieldcraft death insight must exist in shipping overlay');
const patch=source.slice(start);
function boot(){
 const panels=[],observers=[],timeouts=new Map();
 let nextTimer=1;
 function element(tag){
  return {tag,style:{},children:[],attributes:{},textContent:'',
   setAttribute(k,v){this.attributes[k]=v;},
   appendChild(child){this.children.push(child);child.parentNode=this;},
   querySelector(){return null;}};
 }
 const document={
  body:{},getElementById:()=>({}),
  querySelectorAll(sel){return sel==='.panel'?panels:[];},
  querySelector(sel){return sel==='[data-nova-death-insight]'?
    (panels.find(p=>p.note)||{}).note||null:null;},
  createElement:element
 };
 class MutationObserver{
  constructor(callback){this.callback=callback;this.disconnected=false;observers.push(this);}
  observe(){this.observing=true;}
  disconnect(){this.disconnected=true;}
  notify(){if(!this.disconnected)this.callback();}
 }
 class Game{
  constructor(){this.status='playing';}
  killTank(victim){if(victim.alive===false)return;victim.alive=false;this.status='dying';}
  update(){if(this.status==='dying')this.status='dead';}
  redeploy(){this.status='playing';this.redeploys=(this.redeploys||0)+1;}
 }
 const classes={
  CLASSES:{marksman:{name:'Marksman'},carrier:{name:'Carrier'},
   twin:{name:'Twin'},guard:{name:'Guard'},cannon:{name:'Cannon'},scout:{name:'Scout'}},
  lineageForClass(id){return {marksman:'sniper',carrier:'controller',
   twin:'gunner',guard:'guardian',cannon:'cannon',scout:null}[id]||null;}
 };
 const modules={'game/engine':m=>{m.exports.Game=Game;}};
 const window={__novaModules:modules};
 vm.runInNewContext(patch,{window,document,MutationObserver,
  setTimeout(fn){const id=nextTimer++;timeouts.set(id,fn);return id;},
  clearTimeout(id){timeouts.delete(id);},
  console:{},Math,Number,String,Array,Object});
 const m={exports:{}};
 modules['game/engine'](m,m.exports,spec=>{
  assert.equal(spec,'./classes','require path must resolve from game/engine');
  return classes;
 });
 function addPanel(){
  const redeploy={textContent:'⚡ REDEPLOY'};
  const menu={textContent:'MAIN MENU'};
  const panel={textContent:'TERMINATED SCORE LEVEL CLASS KILLS SURVIVED BEST ⚡ REDEPLOY MAIN MENU',
   note:null,querySelectorAll(sel){return sel==='button'?[redeploy,menu]:[];},
   querySelector(sel){return sel==='[data-nova-death-insight]'?this.note:null;},
   insertBefore(node,before){assert.equal(before,redeploy);this.note=node;node.parentNode=this;},
   removeChild(node){assert.equal(this.note,node);this.note=null;node.parentNode=null;}};
  panels.push(panel);return panel;
 }
 return {Game:m.exports.Game,api:window.__NOVA_DEATH_INSIGHT_TEST__,
  addPanel,panels,observers,timeouts};
}
function victim(){return{id:1,alive:true,isPlayer:true,cls:'scout'};}
function killer(cls='marksman'){return{id:2,alive:true,cls};}
test('actual materialized shipping path loads the Fieldcraft owner before boot',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/menu-slot-compat-v1.7.8.js'));
 const boot=html.search(/window\.__bootModule\((['"])main\1\)/);
 assert.ok(boot>=0,'materialized boot marker exists');
 assert.ok(html.indexOf('nova-updates/menu-slot-compat-v1.7.8.js')<boot,
  'Fieldcraft owner must load before the playable game boot');
});
test('only verified killer class produces matchup advice',()=>{
 const {api}=boot(),v=victim();
 const s=api.choose(v,killer(),{CLASSES:{marksman:{name:'Marksman'}},
  lineageForClass:()=> 'sniper'});
 assert.equal(s.name,'Marksman');
 assert.match(s.lesson,/sightline/);
 assert.equal(api.choose(v,null,{}),null);
 assert.equal(api.choose(v,{id:1,cls:'marksman'},{}),null);
 assert.equal(api.choose(v,{id:2,cls:'unknown'},
  {CLASSES:{},lineageForClass:()=>null}),null);
});
test('last-opponent note appears on existing death modal without new controls',()=>{
 const {Game,addPanel,observers}=boot(),g=new Game(),v=victim();
 g.killTank(v,killer('carrier'));g.update();
 assert.equal(g.status,'dead');
 assert.equal(observers.length,1);
 const panel=addPanel();observers[0].notify();
 assert.ok(panel.note,'note is inserted only when React modal exists');
 assert.equal(panel.note.attributes.role,'note');
 assert.ok(panel.note.attributes['data-nova-death-insight']!==undefined);
 assert.match(panel.note.children[0].textContent,/LAST OPPONENT: CARRIER/);
 assert.match(panel.note.children[1].textContent,/drone approach/);
 assert.equal(observers[0].disconnected,true);
 g.update();assert.equal(panel.note.children.length,2);
 assert.equal(observers.length,1,'no repeated DOM observers');
});
test('unknown and environmental deaths make no causal claim',()=>{
 const {Game,addPanel,observers}=boot(),g=new Game(),v=victim(),p=addPanel();
 g.killTank(v,null);g.update();
 assert.equal(p.note,null);
 assert.equal(observers.length,0);
});
test('non-player deaths do not trigger player Fieldcraft',()=>{
 const {Game,addPanel,observers}=boot(),g=new Game(),p=addPanel();
 g.killTank({id:7,alive:true,isPlayer:false},killer());g.update();
 assert.equal(p.note,null);assert.equal(observers.length,0);
});
test('redeploy removes old insight and accepts a new authoritative killer',()=>{
 const {Game,addPanel,observers}=boot(),g=new Game(),p=addPanel();
 let v=victim();g.killTank(v,killer('marksman'));g.update();
 assert.match(p.note.children[0].textContent,/MARKSMAN/);
 g.redeploy();assert.equal(g.status,'playing');
 assert.equal(p.note,null);assert.equal(g.__novaDeathInsight,null);
 v=victim();g.killTank(v,killer('guard'));g.update();
 assert.match(p.note.children[0].textContent,/GUARD/);
 assert.match(p.note.children[1].textContent,/frontal trade/);
 assert.equal(observers.length,0);
});
test('missing React panel times out rather than observing forever',()=>{
 const {Game,observers,timeouts}=boot(),g=new Game();
 g.killTank(victim(),killer());g.update();
 assert.equal(observers.length,1);
 assert.equal(timeouts.size,1);
 const cb=[...timeouts.values()][0];cb();
 assert.equal(observers[0].disconnected,true);
 assert.equal(g.__novaDeathInsightObserver,null);
});
test('failed kill does not fabricate a death insight',()=>{
 const {Game,addPanel}=boot(),g=new Game(),p=addPanel();
 const v=victim();v.alive=false;
 g.killTank(v,killer());g.update();
 assert.equal(p.note,null);
});

test('decorative War Room cannot create a playable death insight',()=>{
 const {Game,addPanel,observers}=boot(),g=new Game(),p=addPanel();
 g.__novaDecorativeWorld=true;
 g.killTank(victim(),killer());g.update();
 assert.equal(p.note,null);
 assert.equal(observers.length,0);
 assert.equal(g.__novaDeathInsight,undefined);
});
