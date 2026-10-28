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
  constructor(){this.status='playing';this.tankById=new Map();}
  getTank(id){return this.tankById.get(id)||null;}
  unregisterTank(t){this.tankById.delete(t.id);}
  damageTank(victim,dmg,sourceId){
   if(!victim.alive)return;
   victim.hp=(victim.hp??100)-dmg;
   if(victim.hp<=0)this.killTank(victim,this.getTank(sourceId));
  }
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
 return {Game:m.exports.Game,api:window.__NOVA_DEATH_INSIGHT_TEST__,document,
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

test('allied damage cannot be presented as an opponent matchup',()=>{
 const {Game,addPanel}=boot(),g=new Game(),p=addPanel();
 g.areAllies=()=>true;
 g.killTank(victim(),killer('marksman'));g.update();
 assert.equal(p.note,null);
 assert.equal(g.__novaDeathInsight,null);
});

test('optional alliance API failure cannot prevent an authoritative kill',()=>{
 const {Game,addPanel}=boot(),g=new Game(),p=addPanel(),v=victim();
 g.areAllies=()=>{throw new Error('transient alliance lookup');};
 assert.doesNotThrow(()=>g.killTank(v,killer()));
 assert.equal(v.alive,false);
 assert.doesNotThrow(()=>g.update());
 assert.equal(p.note,null,'uncertain allegiance must not produce a claim');
});
test('broken presentation DOM cannot interrupt the game update',()=>{
 const {Game,document}=boot(),g=new Game();
 document.querySelectorAll=()=>{throw new Error('DOM unavailable');};
 g.killTank(victim(),killer());
 assert.doesNotThrow(()=>g.update());
 assert.equal(g.status,'dead');
 assert.equal(g.__novaDeathInsight,null);
});

function shippingClassRegistry(){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const marker='window.__defineModule("game/classes", function (module, exports, require) {';
 const at=html.indexOf(marker),end=html.indexOf('\n});',at);
 assert.ok(at>=0&&end>at,'materialized canonical class module exists');
 const mod={exports:{}};
 new Function('module','exports','require',html.slice(at+marker.length,end))(
  mod,mod.exports,()=>{throw Error('unexpected class dependency');});
 return mod.exports;
}
test('every real playable class teaches unique, actionable opponent counterplay',()=>{
 const {api}=boot(),classes=shippingClassRegistry(),seen=new Set();
 const entries=Object.entries(classes.CLASSES);
 assert.equal(entries.length,36,'canonical class registry expanded: update the matchup audit');
 for(const [id,def] of entries){
  const info=api.choose(victim(),{id:2,cls:id},classes);
  assert.ok(info,'missing matchup for '+id);
  assert.equal(info.name,def.name);
  assert.ok(info.lesson.length>=48&&info.lesson.length<=145,
   'death modal tip must stay legible on compact phones: '+id+' '+info.lesson.length);
  assert.match(info.lesson,/\b(bait|break|avoid|use|watch|read|stay|escape|cross|change|shift|sidestep|strafe|split|dodge|expect|flank|disrupt|do not|never|hunters|force|keep|punish)\b/i,
   'tip needs a concrete decision: '+id);
  assert.ok(!seen.has(info.lesson),'generic duplicated lesson for '+id);
  seen.add(info.lesson);
 }
 assert.equal(seen.size,36);
});
test('a missing or prototype-inherited class never invents an opponent lesson',()=>{
 const {api}=boot(),classes=shippingClassRegistry();
 assert.equal(api.choose(victim(),{id:2,cls:'unknown'},classes),null);
 assert.equal(api.choose(victim(),{id:2,cls:'toString'},classes),null);
 assert.equal(api.choose(victim(),{id:2,cls:'__proto__'},classes),null);
});
test('Apex lessons teach different counters inside each shared lineage',()=>{
 const {api}=boot(),classes=shippingClassRegistry();
 for(const pair of [['tempest','needlestorm'],['clusterking','siegebomber'],
  ['singularity','prism'],['hivemind','broodmother'],['bastion','aegis']]){
  const a=api.choose(victim(),{id:2,cls:pair[0]},classes);
  const b=api.choose(victim(),{id:2,cls:pair[1]},classes);
  assert.notEqual(a.lesson,b.lesson,'Apex pair must have distinct tactical advice');
 }
});

test('posthumous enemy projectile still teaches the actual class matchup',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel(),v=victim();
 const shooter=killer('marksman');shooter.alive=false;
 g.tankById.set(shooter.id,shooter);
 g.unregisterTank(shooter);
 assert.equal(g.getTank(shooter.id),null,'canonical dead owner is no longer a tank');
 v.hp=6;g.damageTank(v,12,shooter.id);g.update();
 assert.equal(v.alive,false);
 assert.ok(panel.note,'death panel identifies a departed projectile owner');
 assert.match(panel.note.children[0].textContent,/LAST OPPONENT: MARKSMAN/);
 assert.match(panel.note.children[1].textContent,/sightline/);
 assert.equal(g.__novaFieldcraftActiveSource,undefined,'damage context does not leak');
 g.redeploy();
 assert.equal(g.__novaFieldcraftDeadOwners,null,'redeploy forgets previous-life identities');
});
test('unknown owner and environmental damage never invent a Fieldcraft killer',()=>{
 const a=boot(),g=new a.Game(),panel=a.addPanel(),v=victim();
 v.hp=5;g.damageTank(v,20,99999);g.update();
 assert.equal(panel.note,null);
 assert.equal(g.__novaDeathInsight,null);
 const b=boot(),h=new b.Game(),p=b.addPanel(),w=victim();
 w.hp=5;h.damageTank(w,20,-1);h.update();
 assert.equal(p.note,null);
});
test('team-mode uncertainty abstains from posthumous attribution',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel(),v=victim();
 const shooter=killer('guard');shooter.alive=false;
 g.unregisterTank(shooter);
 g.areAllies=()=>false;
 v.hp=5;g.damageTank(v,10,shooter.id);g.update();
 assert.equal(panel.note,null,'cannot reconstruct departed alliances');
});

test('Fieldcraft death lesson recovers after React removes its foreign DOM note',()=>{
 const {Game,addPanel}=boot(),g=new Game(),p=addPanel();
 g.killTank(victim(),killer('marksman'));g.update();
 const first=p.note;
 assert.ok(first);
 p.removeChild(first);
 g.update();
 assert.ok(p.note&&p.note!==first,'dead-state tick remounts the missing lesson');
 assert.match(p.note.children[0].textContent,/MARKSMAN/);
 g.redeploy();
 assert.equal(p.note,null,'cleanup still removes the remounted note');
});
test('Fieldcraft death lesson recovers when React replaces the whole modal',()=>{
 const {Game,addPanel,panels}=boot(),g=new Game(),p=addPanel();
 g.killTank(victim(),killer('carrier'));g.update();
 assert.ok(p.note);
 p.note.isConnected=false;
 panels.shift();
 const replacement=addPanel();
 g.update();
 assert.ok(replacement.note,'the new React modal gets the existing killer lesson');
 assert.match(replacement.note.children[0].textContent,/CARRIER/);
 g.redeploy();
 assert.equal(replacement.note,null);
});

test('Fieldcraft remount ignores nested front-choice buttons and keeps React insertion owner',()=>{
 const {Game,addPanel}=boot(),g=new Game(),p=addPanel();
 g.killTank(victim(),killer('marksman'));g.update();
 assert.ok(p.note);
 p.removeChild(p.note);
 const nativeButtons=p.querySelectorAll.bind(p);
 const nested={textContent:'⚡ REDEPLOY FRESH',
  getAttribute(name){return name==='data-nova-insertion'?'fresh':null;}};
 p.querySelectorAll=sel=>sel==='button'?[nested,...nativeButtons(sel)]:nativeButtons(sel);
 g.update();
 assert.ok(p.note,'the note remounts before the original React callback');
 assert.match(p.note.children[0].textContent,/MARKSMAN/);
});
