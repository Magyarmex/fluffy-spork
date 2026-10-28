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
 const observers=[],panels=[],timers=new Map(),mapMarks=[];
 let nextTimer=1;
 const randomMath=Object.create(Math);
 randomMath.random=options.random||Math.random;
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
  constructor(){this.status='playing';this.player=null;this.randCalls=[];this.toasts=[];this.__novaTerrain=[{id:1}];this.time=0;
   this.mmCtx={save(){},restore(){},beginPath(){},stroke(){},moveTo(){},lineTo(){},
    arc(x,y,r){mapMarks.push({x,y,r});}};}
  toast(message,kind){this.toasts.push({message,kind});}
  isTerrainSafe(x,y,pad){return options.safe?options.safe(x,y,pad):true;}
  randSpawnPos(dist){this.randCalls.push(dist);return {x:1900,y:1900};}
  killTank(victim){if(!victim.alive)return;victim.alive=false;this.status='dying';}
  update(){if(this.status==='dying')this.status='dead';}
  drawMinimap(){this.mapDraws=(this.mapDraws||0)+1;}
  redeploy(){this.status='playing';this.time=0;this.player={...this.randSpawnPos(900),isPlayer:true,alive:true};this.randSpawnPos(400);return 'redeployed';}
 }
 const window={__novaModules:{'game/engine':m=>{m.exports.Game=Game;}}};
 const context={window,document,MutationObserver,Math:randomMath,Number,
  setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},
  clearTimeout(id){timers.delete(id);}};
 vm.runInNewContext(patch,context);
 const m={exports:{}};window.__novaModules['game/engine'](m,m.exports,()=>{throw Error('no extra imports');});
 function addPanel(){
  const redeploy={textContent:'⚡ REDEPLOY',style:{},attributes:{},tabIndex:0,clicked:0,
   setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},
   click(){this.clicked++;}};
  const panel={textContent:'TERMINATED SCORE REDEPLOY',choice:null,
   querySelectorAll(sel){return sel==='button'?[redeploy]:[];},
   querySelector(sel){return sel==='[data-nova-front-choice]'?this.choice:null;},
   insertBefore(node,before){assert.equal(before,redeploy);this.choice=node;node.parentNode=this;},
   removeChild(node){assert.equal(node,this.choice);this.choice=null;node.parentNode=null;}};
  panel.redeploy=redeploy;panels.push(panel);return panel;
 }
 return {Game:m.exports.Game,api:window.__NOVA_FRONT_CHOICE_TEST__,addPanel,panels,observers,timers,mapMarks};
}
function victim(x=0,y=0){return {id:1,isPlayer:true,alive:true,x,y};}
test('materialized production chain loads front choice before game boot',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.ok(html.includes('nova-updates/menu-slot-compat-v1.7.8.js'));
 assert.ok(html.indexOf('nova-updates/menu-slot-compat-v1.7.8.js')<html.search(/window\.__bootModule\((['"])main\1\)/));
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
test('missing or throwing terrain owner falls back without blocking redeploy',()=>{
 const {Game}=boot(),g=new Game();
 g.isTerrainSafe=undefined;
 g.killTank(victim());g.update();g.__novaRedeployChoice='return';
 assert.doesNotThrow(()=>g.redeploy());
 assert.equal(g.player.x,1900);
 const h=new Game();h.isTerrainSafe=()=>{throw Error('terrain temporarily unavailable');};
 h.killTank(victim());h.update();h.__novaRedeployChoice='return';
 assert.doesNotThrow(()=>h.redeploy());
 assert.equal(h.player.x,1900);
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
test('death modal presents accessible one-click plans and restores original callback',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 g.killTank(victim());g.update();
 assert.ok(panel.choice);
 const row=panel.choice,buttons=row.children;
 assert.equal(row.attributes.role,'group');
 assert.equal(buttons.length,2);
 assert.equal(panel.redeploy.style.display,'none');
 assert.equal(panel.redeploy.attributes['aria-hidden'],'true');
 buttons[1].onclick();
 assert.equal(g.__novaRedeployChoice,'return');
 assert.equal(panel.redeploy.clicked,1,'original React callback remains authoritative');
 g.update();assert.equal(panel.choice,row);
 g.redeploy();assert.equal(panel.choice,null);
 assert.equal(panel.redeploy.style.display,'');
 assert.equal(panel.redeploy.attributes['aria-hidden'],undefined);
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

test('successful return tells player which way the last front lies',()=>{
 const {Game}=boot({random:()=>0}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.deepEqual(g.toasts,[{message:'↩ RETURN · LAST FRONT W',kind:'info'}]);
 assert.equal(g.__novaFrontReturnAccepted,false,'success flag cannot leak to next life');
});
test('return direction reflects actual spawn quadrant rather than a guessed map sector',()=>{
 const {Game}=boot({random:()=>.25}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.deepEqual(g.toasts,[{message:'↩ RETURN · LAST FRONT N',kind:'info'}]);
});
test('terrain-blocked return explicitly announces legacy fresh fallback',()=>{
 const {Game}=boot({safe:()=>false,random:()=>0}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.deepEqual(g.toasts,[{message:'↩ RETURN UNAVAILABLE · FRESH FRONT',kind:'info'}]);
 assert.deepEqual(g.randCalls,[900,400]);
});
test('fresh redeploy has no extra notice and UI failures cannot prevent a return',()=>{
 const {Game}=boot({random:()=>0}),g=new Game();
 g.killTank(victim());g.update();g.redeploy();
 assert.deepEqual(g.toasts,[],'fresh behavior remains unchanged');
 g.killTank(victim());g.update();g.__novaRedeployChoice='return';
 g.toast=()=>{throw Error('toast bridge unavailable');};
 assert.doesNotThrow(()=>g.redeploy(),'presentation failure must never block play');
 assert.equal(g.status,'playing');
});

test('successful RETURN marks only the witnessed death front on the existing minimap',()=>{
 const {Game,mapMarks}=boot({random:()=>0}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';g.redeploy();
 assert.equal(g.__novaLastFrontMarker.x,100);
 assert.equal(g.__novaLastFrontMarker.y,200);
 assert.equal(g.__novaLastFrontMarker.until,24);
 g.drawMinimap();
 assert.equal(g.mapDraws,1,'the original minimap remains authoritative');
 assert.equal(mapMarks.length,1,'exactly one fixed waypoint ring');
 assert.ok(Math.abs(mapMarks[0].x-(2350*216/4500))<1e-9);
 assert.ok(Math.abs(mapMarks[0].y-(2450*216/4500))<1e-9);
 assert.equal(mapMarks[0].r,6);
 g.time=23.9;g.drawMinimap();assert.equal(mapMarks.length,2);
 g.time=24;g.drawMinimap();
 assert.equal(mapMarks.length,2,'the marker expires rather than tracking forever');
 assert.equal(g.__novaLastFrontMarker,null);
});
test('RETURN waypoint clears on arrival, next death, fresh redeploy and fallback',()=>{
 const {Game,mapMarks}=boot({random:()=>0}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';g.redeploy();
 g.player.x=220;g.player.y=200;g.drawMinimap();
 assert.equal(mapMarks.length,0,'arrival removes the waypoint before drawing');
 assert.equal(g.__novaLastFrontMarker,null);
 g.killTank(victim(300,400));g.update();g.__novaRedeployChoice='return';g.redeploy();
 assert.ok(g.__novaLastFrontMarker);
 g.killTank(g.player);g.update();
 assert.equal(g.__novaLastFrontMarker,null,'death clears stale previous-life navigation');
 g.redeploy();assert.equal(g.__novaLastFrontMarker,null,'fresh has no waypoint');
 const h=new Game();h.isTerrainSafe=()=>false;
 h.killTank(victim(100,200));h.update();h.__novaRedeployChoice='return';h.redeploy();
 assert.equal(h.__novaLastFrontMarker,null,'failed RETURN cannot claim a return waypoint');
});
test('invalid clock and offscreen marker cannot disrupt the original minimap',()=>{
 const {Game,mapMarks}=boot(),g=new Game();
 g.player={x:0,y:0,alive:true};g.__novaLastFrontMarker={x:3000,y:3000,until:50};
 g.drawMinimap();assert.equal(mapMarks.length,0,'invalid out-of-world marker is not painted');
 g.__novaLastFrontMarker={x:2240,y:2240,until:50};
 g.drawMinimap();assert.equal(mapMarks.length,1,'edge deaths retain a clipped but honest marker');
 assert.ok(mapMarks[0].x>215&&mapMarks[0].x<216);
 g.__novaLastFrontMarker={x:100,y:200,until:50};g.time=NaN;
 assert.doesNotThrow(()=>g.drawMinimap());
 assert.equal(g.__novaLastFrontMarker,null,'invalid game clock clears waypoint');
 assert.equal(g.mapDraws,3);
});


test('death modal recovers if React removes its injected action row',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 g.killTank(victim(100,200));g.update();
 const first=panel.choice;
 assert.ok(first,'the initial two-choice action row exists');
 assert.equal(panel.redeploy.style.display,'none','original React action is intentionally hidden');
 // React can replace/reconcile the death modal while Game.status remains dead.
 // Losing the foreign DOM row must not strand the player with no visible action.
 panel.removeChild(first);
 assert.equal(panel.choice,null);
 g.update();
 assert.ok(panel.choice,'a later dead-state tick must restore usable redeploy actions');
 assert.notEqual(panel.choice,first,'the detached row is not reused');
 assert.equal(panel.choice.children.length,2);
 assert.equal(panel.redeploy.style.display,'none');
 panel.choice.children[1].onclick();
 assert.equal(g.__novaRedeployChoice,'return');
 assert.equal(panel.redeploy.clicked,1,'React callback remains authoritative after remount');
 g.redeploy();
 assert.equal(panel.redeploy.style.display,'','original action is restored on exit');
});

test('React replacing the whole dead panel also restores a live callback',()=>{
 const {Game,addPanel,panels}=boot(),g=new Game(),firstPanel=addPanel();
 g.killTank(victim(100,200));g.update();
 assert.ok(firstPanel.choice);
 firstPanel.choice.isConnected=false;
 firstPanel.redeploy.isConnected=false;
 panels.shift(); // React discarded its previous panel, but the Game stays dead.
 const replacement=addPanel();
 g.update();
 assert.ok(replacement.choice,'the newly mounted React modal gets both choices');
 assert.equal(replacement.redeploy.style.display,'none');
 replacement.choice.children[0].onclick();
 assert.equal(replacement.redeploy.clicked,1,'the NEW React callback is used');
 assert.equal(firstPanel.redeploy.clicked,0,'no stale callback from the discarded panel');
 g.redeploy();
 assert.equal(replacement.redeploy.style.display,'','the live callback is restored');
});
