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
   querySelectorAll(sel){return sel==='button'?[this.redeploy]:[];},
   querySelector(sel){return sel==='[data-nova-front-choice]'?this.choice:null;},
   insertBefore(node,before){assert.equal(before,this.redeploy);this.choice=node;node.parentNode=this;},
   removeChild(node){assert.equal(node,this.choice);this.choice=null;node.parentNode=null;}};
  panel.redeploy=redeploy;panels.push(panel);return panel;
 }
 return {Game:m.exports.Game,api:window.__NOVA_FRONT_CHOICE_TEST__,addPanel,panels,observers,timers,mapMarks};
}
function victim(x=0,y=0){return {id:1,isPlayer:true,alive:true,x,y};}
function returnCue(g,origin,blocked=false){
 const directions=['E','SE','S','SW','W','NW','N','NE'];
 const angle=Math.atan2(origin.y-g.player.y,origin.x-g.player.x);
 const bearing=directions[(Math.round(angle/(Math.PI/4))+8)%8];
 const direct=Math.round(Math.hypot(origin.x-g.player.x,origin.y-g.player.y)/10)*10;
 return '↩ RETURN · FRONT '+bearing+' · ~'+direct+'u'+(blocked?' · COVER':'');
}
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
 assert.equal(buttons[0].textContent,'⚡ FRESH · RANDOM');
 assert.equal(buttons[1].textContent,'↩ RETURN · NEAR FRONT');
 assert.ok(buttons[0].attributes['aria-label'].startsWith(buttons[0].textContent));
 assert.ok(buttons[1].attributes['aria-label'].startsWith(buttons[1].textContent));
 assert.match(buttons[0].attributes['aria-label'],/random insertion.*No stat bonus/);
 assert.match(buttons[1].attributes['aria-label'],/420–850 world units.*No stat bonus/);
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
 assert.deepEqual(g.toasts,[{message:returnCue(g,{x:100,y:200}),kind:'info'}]);
 assert.equal(g.__novaFrontReturnAccepted,false,'success flag cannot leak to next life');
});
test('return direction reflects the actual independently sampled spawn',()=>{
 const {Game}=boot({random:()=>.25}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.deepEqual(g.toasts,[{message:returnCue(g,{x:100,y:200}),kind:'info'}]);
});
test('RETURN marks a cover-blocked direct approach as a detour without claiming a route length',()=>{
 const {Game}=boot({random:()=>0}),g=new Game(),calls=[];
 g.hasLineOfSight=(ax,ay,bx,by,pad)=>{calls.push({ax,ay,bx,by,pad});return false;};
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
 g.redeploy();
 assert.deepEqual(calls,[{ax:g.player.x,ay:g.player.y,bx:100,by:200,pad:24}]);
 assert.deepEqual(g.toasts,[{message:returnCue(g,{x:100,y:200},true),kind:'info'}]);
 assert.ok(g.__novaLastFrontMarker,'a detour never suppresses the remembered-front waypoint');
});
test('RETURN does not invent a detour when terrain is clear or its query fails',()=>{
 for(const los of [()=>true,()=>{throw Error('terrain owner unavailable');}]){
  const {Game}=boot({random:()=>0}),g=new Game();g.hasLineOfSight=los;
  g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
  assert.doesNotThrow(()=>g.redeploy());
  assert.deepEqual(g.toasts,[{message:returnCue(g,{x:100,y:200}),kind:'info'}]);
 }
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

test('death modal repairs a replaced React callback even when the row survives',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 g.killTank(victim(100,200));g.update();
 const stale=panel.redeploy,first=panel.choice;
 first.isConnected=true;stale.isConnected=false;
 panel.redeploy={...stale,style:{},attributes:{},clicked:0,
  click(){this.clicked++;}};
 panel.redeploy.isConnected=true;
 g.update();
 assert.ok(panel.choice&&panel.choice!==first,'row is rebound to the new React callback');
 panel.choice.children[1].onclick();
 assert.equal(panel.redeploy.clicked,1);
 assert.equal(stale.clicked,0,'the detached React callback cannot be invoked');
 g.redeploy();
 assert.equal(panel.redeploy.style.display,'');
});

/* The navigation cue reports an honest straight-line distance, not a route
 * length or a promise that terrain between spawn and death is clear. */
test('return distance cue is bounded and rounded without leaking hidden world state',()=>{
 for(const sample of [0,.1,.3,.5,.75,.99]){
  const {Game}=boot({random:()=>sample}),g=new Game();
  g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';
  g.redeploy();
  const distance=Math.hypot(g.player.x-100,g.player.y-200);
  const expected=Math.round(distance/10)*10;
  assert.ok(distance>=420-1e-8&&distance<=850+1e-8);
  assert.equal(g.toasts.length,1);
  assert.match(g.toasts[0].message,/^↩ RETURN · FRONT (E|SE|S|SW|W|NW|N|NE) · ~\d+u$/);
  assert.ok(g.toasts[0].message.endsWith('~'+expected+'u'));
  assert.equal(g.__novaRedeployOrigin,null);
 }
});

/* The front is a remembered physical location, not a Euclidean arrival
 * trigger: a nearby wall can still separate the player from the old lane. */
test('RETURN waypoint survives close range when solid terrain blocks the approach',()=>{
 const {Game,mapMarks}=boot({random:()=>0}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';g.redeploy();
 g.player.x=220;g.player.y=200; // 120u away, on the other side of cover.
 const calls=[];
 g.hasLineOfSight=(ax,ay,bx,by,pad)=>{
  calls.push({ax,ay,bx,by,pad});return false;
 };
 g.drawMinimap();
 assert.equal(mapMarks.length,1,'blocked near-front approach must retain the marker');
 assert.ok(g.__novaLastFrontMarker,'straight-line proximity is not arrival');
 assert.deepEqual(calls,[{ax:220,ay:200,bx:100,by:200,pad:24}],
  'arrival check uses the existing terrain visibility owner with hull clearance');
 g.hasLineOfSight=()=>true;
 g.drawMinimap();
 assert.equal(g.__novaLastFrontMarker,null,'clear nearby approach completes return');
 assert.equal(mapMarks.length,1,'arrival removes the marker before the next draw');
});
test('RETURN waypoint keeps its timer when terrain visibility is temporarily unavailable',()=>{
 const {Game,mapMarks}=boot({random:()=>0}),g=new Game();
 g.killTank(victim(100,200));g.update();g.__novaRedeployChoice='return';g.redeploy();
 g.player.x=220;g.player.y=200;
 g.hasLineOfSight=()=>{throw Error('terrain cache not ready');};
 assert.doesNotThrow(()=>g.drawMinimap());
 assert.equal(mapMarks.length,1);
 assert.ok(g.__novaLastFrontMarker);
 g.time=24;g.drawMinimap();
 assert.equal(g.__novaLastFrontMarker,null,'expiry is authoritative even without terrain visibility');
});


/* Frontlines after-action learning: only public-opportunity telemetry that the
 * pilot actually earned, never enemy coordinates or private sector maturity. */
test('death choice shows a factual public-BLOOM recap without changing either action',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 g.__lfState={frontlineTelemetry:{counts:{announcements:2,playerApproaches:2,
  playerEntries:3,observedContests:1,neutralXP:125.8}}};
 g.killTank(victim(100,200));g.update();
 const row=panel.choice;
 assert.ok(row,'canonical React death panel receives the choice row');
 assert.equal(row.children.length,3,'one compact observation plus the two existing actions');
 const [note,fresh,ret]=row.children;
 assert.equal(note.attributes.role,'note');
 assert.ok(note.attributes['data-nova-front-recap']!==undefined);
 assert.equal(note.textContent,'LAST LIFE · BLOOM APPROACH 2 · ENTRY 3 · CONTEST 1 · +126 NEUTRAL XP');
 assert.ok(!note.textContent.includes('enemy'));
 assert.equal(fresh.textContent,'⚡ FRESH · RANDOM');
 assert.equal(ret.textContent,'↩ RETURN · NEAR FRONT');
 ret.onclick();
 assert.equal(g.__novaRedeployChoice,'return');
 assert.equal(panel.redeploy.clicked,1,'the original React callback remains authoritative');
 g.redeploy();
 assert.equal(panel.choice,null,'recap is cleared on redeploy');
 assert.equal(g.__novaFrontlineRecap,null,'old life cannot leak into the next life');
});
test('unobserved, malformed or empty Frontlines telemetry never creates a fake recap',()=>{
 for(const counts of [null,{announcements:0,playerApproaches:1,playerEntries:1},
  {announcements:1,playerApproaches:0,playerEntries:0,observedContests:1,neutralXP:500},
  {announcements:1,playerApproaches:1,playerEntries:0,observedContests:0,neutralXP:Infinity},
  {announcements:1,playerApproaches:1,playerEntries:0,observedContests:-1,neutralXP:0}]){
  const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
  if(counts)g.__lfState={frontlineTelemetry:{counts}};
  g.killTank(victim(100,200));g.update();
  assert.equal(panel.choice.children.length,2,'no invented tactical learning from invalid evidence');
 }
});
test('Frontlines death recap is an immutable last-life snapshot, not a live tracker',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 const counts={announcements:1,playerApproaches:1,playerEntries:1,observedContests:0,neutralXP:20};
 g.__lfState={frontlineTelemetry:{counts}};
 g.killTank(victim(100,200));
 counts.neutralXP=9999;counts.observedContests=5;
 g.update();
 assert.match(panel.choice.children[0].textContent,/CONTEST 0 · \+20 NEUTRAL XP/);
 assert.doesNotMatch(panel.choice.children[0].textContent,/9999|CONTEST 5/);
});


test('malformed Frontlines getter cannot prevent a real player death or redeploy',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 Object.defineProperty(g,'__lfState',{configurable:true,get(){throw Error('telemetry unavailable');}});
 const p=victim(100,200);
 assert.doesNotThrow(()=>g.killTank(p));
 assert.equal(p.alive,false,'the authoritative kill must complete');
 g.update();
 assert.equal(panel.choice.children.length,2,'uncertain observation must fail closed');
 assert.doesNotThrow(()=>g.redeploy());
});
test('React remount retains the last-life recap without duplicating buttons',()=>{
 const {Game,addPanel}=boot(),g=new Game(),panel=addPanel();
 g.__lfState={frontlineTelemetry:{counts:{announcements:1,playerApproaches:1,
  playerEntries:1,observedContests:1,neutralXP:42}}};
 g.killTank(victim(100,200));g.update();
 const old=panel.choice;
 assert.equal(old.children.length,3);
 panel.removeChild(old);
 g.update();
 assert.ok(panel.choice&&panel.choice!==old);
 assert.equal(panel.choice.children.length,3);
 assert.match(panel.choice.children[0].textContent,/\+42 NEUTRAL XP/);
 assert.equal(panel.choice.children.filter(c=>c.tag==='button').length,2);
 g.redeploy();
 assert.equal(g.__novaFrontlineRecap,null);
});

test('RETURN uses a reproducible local sampler without advancing gameplay Math.random',()=>{
 let draws=0;
 const {Game,api}=boot({random:()=>{draws++;return .25;}}),g=new Game();
 const origin=victim(100,200);
 g.killTank(origin);g.update();
 const seed=g.__novaRedeploySeed;
 assert.ok(Number.isInteger(seed)&&seed!==0);
 const local=api.returnStream(seed),replay=api.returnStream(seed);
 for(let i=0;i<64;i++){
  const a=local(),b=replay();
  assert.equal(a,b,'same witnessed death yields the same independent sequence');
  assert.ok(a>=0&&a<1);
 }
 g.__novaRedeployChoice='return';g.redeploy();
 assert.equal(draws,0,'RETURN must not advance the combat random stream');
 assert.equal(g.__novaRedeploySeed,null,'no seed survives into the next life');
 const other=new Game();other.killTank(victim(100,200));other.update();
 assert.equal(other.__novaRedeploySeed,seed,'identical death state is reproducible');
 other.__novaRedeployChoice='return';other.redeploy();
 assert.deepEqual([other.player.x,other.player.y],[g.player.x,g.player.y]);
 assert.equal(draws,0);
});
test('RETURN local seed changes with witnessed death time or location, not hidden enemies',()=>{
 const {api}=boot();
 const p={x:100,y:200};
 const a=api.returnSeed(p,10,1,42);
 assert.equal(a,api.returnSeed(p,10,1,42));
 assert.notEqual(a,api.returnSeed(p,11,1,42));
 assert.notEqual(a,api.returnSeed({x:101,y:200},10,1,42));
 assert.notEqual(a,api.returnSeed(p,10,2,42));
 assert.equal(api.returnStream(0),null);
 assert.equal(api.returnStream(NaN),null);
});
