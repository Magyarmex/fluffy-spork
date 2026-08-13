/* NOVA TANKS v1.10.10 — Live War Room
 * The lobby is a throttled presentation of the shipped game, not a second game.
 *
 * NOVA_VISUAL_INTENT: lobby-live-war-room | identity | world
 * Question: Which real NOVA tank forms, weapons and combat behaviors define the arena?
 * Reason: Canonical world visuals stop the menu from teaching false silhouettes, weapons or battle behavior.
 */
(function(){
'use strict';

var VERSION='1.10.10',CODENAME='Live War Room';
var NORMAL_SIM_HZ=15,LOW_SIM_HZ=12,NORMAL_RENDER_HZ=30,LOW_RENDER_HZ=20;
var NORMAL_SCALE=.72,LOW_SCALE=.54,PAN_UNITS_PER_SEC=18;
var SHAPE_BUDGET_NORMAL=34,SHAPE_BUDGET_LOW=22;
var ARENA_CAMERA_BOTTOM=1680,ARENA_CAMERA_TOP=-1680;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function legalLevelForTier(tier){return tier>=3?40:tier===2?39:tier===1?19:9;}
function lowPower(){
  var dm=navigator.deviceMemory||8,hc=navigator.hardwareConcurrency||8;
  return dm<=4||hc<=4||window.innerWidth<390;
}
function reduced(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
function visibleMenu(m){return !!(m&&m.isConnected&&!document.hidden&&m.offsetParent!==null);}
function menu(){return document.querySelector('#root .menu-grid-bg');}
function silentAudio(){
  return new Proxy({muted:true,musicPlaying:false},{get:function(obj,key){
    if(key in obj)return obj[key];
    return function(){};
  }});
}
function callbacks(){
  var noop=function(){};
  return {hud:noop,event:noop,toast:noop,offer:noop,stick:noop,gameover:noop};
}

window.__NOVA_VERSION=VERSION;
window.__NOVA_LOBBY_BATTLEFIELD_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-10',
  headline:'The War Room now runs real NOVA combat instead of a separate lobby approximation.',
  groups:{
    'Canonical Visuals':[
      'Lobby tanks are rendered by the shipped gameplay renderer from the live CLASSES registry, including exact hull size, barrels, class glyphs, projectiles, shields, cloak states and current visual patches.',
      'The roster is derived from CLASSES at runtime; no duplicate tank list, fake starter id or hand-authored silhouette library remains.'
    ],
    'Canonical Combat':[
      'The background uses the real Game update loop and final patched AI module, so targeting, leading, dodging, farming, firing, projectile interception, splash, body collisions, abilities, drones and terrain behavior follow gameplay rules.',
      'Combat is free-for-all like the arena instead of the old invented blue-versus-red team simulation.',
      'Each form is instantiated at a legal mature level for its evolution tier, and class progression is frozen only so the lobby keeps one representative of every current form.'
    ],
    'Performance':[
      'Simulation is throttled to 15 Hz normally and 12 Hz on constrained devices; rendering is capped at 30/20 FPS on a reduced-resolution canvas.',
      'The real engine keeps a reduced neutral-shape population in the lobby and disables menu-only powerup/elite replenishment, while tank combat rules themselves remain untouched.',
      'Audio and input are detached, hidden menus skip simulation/render work, DPR is bounded, and reduced-motion freezes camera travel while retaining a low-rate live battle.'
    ]
  }
};
window.__NOVA_LOBBY_BATTLEFIELD_TEST__={
  version:VERSION,codename:CODENAME,canonicalRuntime:true,legacyApproximation:false,
  legalLevelForTier:legalLevelForTier,normalSimHz:NORMAL_SIM_HZ,lowSimHz:LOW_SIM_HZ,
  normalRenderHz:NORMAL_RENDER_HZ,lowRenderHz:LOW_RENDER_HZ,
  normalScale:NORMAL_SCALE,lowScale:LOW_SCALE,panSpeed:PAN_UNITS_PER_SEC
};

if(window.NOVAVisuals&&typeof window.NOVAVisuals.register==='function'){
  try{window.NOVAVisuals.register({
    id:'lobby-live-war-room',intent:'identity',channel:'world',
    question:'Which real NOVA tanks and combat behaviors define the arena?',
    reason:'Canonical world models and behavior prevent the menu from teaching false combat information.',
    duration:'menu-only'
  });}catch(_){}
}

if(typeof document==='undefined'||!document.createElement)return;
if(window.__NOVA_LIVE_WAR_ROOM_RUNTIME__)return;
window.__NOVA_LIVE_WAR_ROOM_RUNTIME__=true;

var req=window.__novaMakeRequire;
if(!req){console.error('[NOVA v1.10.10] module runtime unavailable');return;}
var engine,classes,ai,render;
try{
  engine=req('lobby-battlefield-v11010')('./game/engine');
  classes=req('lobby-battlefield-v11010')('./game/classes');
  ai=req('lobby-battlefield-v11010')('./game/ai');
  render=req('lobby-battlefield-v11010')('./game/render');
}catch(e){console.error('[NOVA v1.10.10] canonical gameplay modules unavailable',e);return;}
var Game=engine&&engine.Game,CLASSES=classes&&classes.CLASSES||{};
if(!Game||!render||typeof render.render!=='function'||!Object.keys(CLASSES).length){
  console.error('[NOVA v1.10.10] canonical engine/render/class registry incomplete');return;
}

function installCss(){
  if(document.getElementById('nova-live-war-room-css'))return;
  var s=document.createElement('style');s.id='nova-live-war-room-css';s.textContent=`
.menu-grid-bg.nv-war-room{isolation:isolate;background-color:#04060d!important;background-image:none!important}
.nv-lobby-battlefield,.nv-lobby-atmosphere{position:absolute;inset:0;width:100%;height:100%;pointer-events:none!important}
.nv-lobby-battlefield{z-index:0;opacity:.43;filter:saturate(.72) contrast(.94) brightness(.68);contain:strict}
.nv-lobby-atmosphere{z-index:1;overflow:hidden;background:radial-gradient(ellipse at 50% 42%,rgba(2,7,16,.18) 0,rgba(3,7,15,.42) 55%,rgba(2,4,10,.78) 100%),linear-gradient(180deg,rgba(77,227,255,.026),transparent 32%,rgba(176,107,255,.020) 76%,rgba(2,4,10,.26));box-shadow:inset 0 0 76px rgba(0,0,0,.48)}
.nv-lobby-atmosphere:before{content:'';position:absolute;inset:-25% -70%;background:linear-gradient(108deg,transparent 42%,rgba(91,216,255,.025) 49%,rgba(255,255,255,.012) 50%,transparent 56%);animation:nvLiveWarSweep 17s ease-in-out infinite;will-change:transform}
.menu-grid-bg.nv-war-room>.nv-lobby-foreground{z-index:2}
@keyframes nvLiveWarSweep{0%,14%{transform:translateX(-34%)}64%,100%{transform:translateX(34%)}}
@media(max-width:430px){.nv-lobby-battlefield{opacity:.38;filter:saturate(.68) contrast(.92) brightness(.64)}.nv-lobby-atmosphere{box-shadow:inset 0 0 60px rgba(0,0,0,.52)}}
@media(prefers-reduced-motion:reduce){.nv-lobby-atmosphere:before{animation:none!important}.nv-lobby-battlefield{opacity:.34}}
`;
  document.head.appendChild(s);
}

function classOrder(a,b){
  var da=CLASSES[a]||{},db=CLASSES[b]||{};
  var ta=Number(da.tier)||0,tb=Number(db.tier)||0;
  if(ta!==tb)return ta-tb;
  var la=classes.lineageForClass?classes.lineageForClass(a)||'starter':'starter';
  var lb=classes.lineageForClass?classes.lineageForClass(b)||'starter':'starter';
  if(la!==lb)return la<lb?-1:1;
  return a<b?-1:a>b?1:0;
}
function archetypeFor(id){
  var ln=classes.lineageForClass?classes.lineageForClass(id):null;
  if(ln==='sniper')return 'ranged';
  if(ln==='controller')return 'control';
  if(ln==='guardian')return 'guard';
  return 'brawler';
}
function statBlock(){return {damage:0,reload:0,bulletspeed:0,penetration:0,maxhp:0,regen:0,speed:0,body:0};}
function makeTank(world,id,index){
  var g=world.game,def=CLASSES[id],tier=Number(def.tier)||0,level=legalLevelForTier(tier);
  var lane=index%6,row=Math.floor(index/6);
  var x=-700+lane*280+(world.rand()-.5)*70,y=1540-row*610+(world.rand()-.5)*150;
  var arch=archetypeFor(id),t={
    id:g.nextId++,kind:'tank',name:def.name||id,isPlayer:false,
    x:clamp(x,-1850,1850),y:clamp(y,-1900,1900),vx:0,vy:0,angle:world.rand()*Math.PI*2,
    hp:100,maxHp:100,level:level,xp:0,stats:statBlock(),cls:id,tier:tier,
    fireCd:world.rand()*.7,fireSpin:0,barrelIdx:0,abilityCd:2+world.rand()*6,
    overheatT:0,swarmT:0,bulwarkT:0,tauntT:0,stampedeT:0,supercharge:false,
    shieldT:0,tripleT:0,hasteT:0,spawnShieldT:.4+world.rand()*1.2,cloakT:0,hitFlash:0,regenDelay:0,
    score:0,kills:0,streak:0,alive:true,color:def.color,perk:null,gene:null,droneRespawnT:0,moving:false,
    ai:{state:'wander',thinkT:world.rand()*.16,targetId:-1,strafe:world.rand()<.5?-1:1,dodgeX:0,dodgeY:0,dodgeT:0,preferredRange:0,archetype:arch,wanderA:world.rand()*Math.PI*2,wanderT:.8+world.rand()*2.2,aggression:.35+world.rand()*.65,isElite:false,fireHold:0},
    dmgMult:level>=30?1.1:1,__novaLobbyClass:id
  };
  for(var p=1;p<level;p++)if(ai.allocStatPoint)ai.allocStatPoint(t);
  if(level>=35&&ai.aiHybridize)ai.aiHybridize(t);
  t.maxHp=g.maxHpFor(t);t.hp=t.maxHp;
  return t;
}
function spectator(){
  return {id:-1000000,kind:'tank',name:'',isPlayer:true,x:99999,y:99999,vx:0,vy:0,angle:0,
    hp:1,maxHp:1,level:1,xp:0,stats:statBlock(),cls:'scout',tier:0,fireCd:0,fireSpin:0,barrelIdx:0,abilityCd:999,
    overheatT:0,swarmT:0,bulwarkT:0,tauntT:0,stampedeT:0,supercharge:false,shieldT:0,tripleT:0,hasteT:0,
    spawnShieldT:0,cloakT:0,hitFlash:0,regenDelay:0,score:0,kills:0,streak:0,alive:true,
    color:(CLASSES.scout&&CLASSES.scout.color)||'#7dd3fc',perk:null,gene:null,droneRespawnT:0,ai:null,dmgMult:1,moving:false};
}
function seededRandom(seed){
  var x=seed>>>0;return function(){x+=0x6D2B79F5;var t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
}

function LiveWorld(canvas,m){
  this.canvas=canvas;this.menu=m;this.low=lowPower();this.reduced=reduced();this.rand=seededRandom(0x4e4f5641);
  this.simHz=this.low?LOW_SIM_HZ:NORMAL_SIM_HZ;this.renderHz=this.reduced?12:(this.low?LOW_RENDER_HZ:NORMAL_RENDER_HZ);
  this.scale=this.low?LOW_SCALE:NORMAL_SCALE;this.last=0;this.acc=0;this.lastRender=0;this.raf=0;this.dead=false;this.elapsed=0;
  this.respawns=[];this.roster=Object.keys(CLASSES).sort(classOrder);this.mm=document.createElement('canvas');this.mm.width=this.mm.height=32;
  this.game=new Game(canvas,this.mm,callbacks(),'low');
  this.boundFrame=this.frame.bind(this);
  this.detachInteractiveRuntime();
  this.prepareCanonicalBattle();
  this.resize();
}
LiveWorld.prototype.detachInteractiveRuntime=function(){
  var g=this.game;
  if(g.input&&g.input.detach)try{g.input.detach();}catch(_){}
  if(g.resizeFn)window.removeEventListener('resize',g.resizeFn);
  if(g.visFn)document.removeEventListener('visibilitychange',g.visFn);
  if(g.sfx&&g.sfx.dispose)try{g.sfx.dispose();}catch(_){}
  g.sfx=silentAudio();
};
LiveWorld.prototype.registerRepresentative=function(t){
  var g=this.game;g.registerTank(t);
  if(typeof g.refitDrones==='function')g.refitDrones(t);
};
LiveWorld.prototype.prepareCanonicalBattle=function(){
  var g=this.game,self=this;
  g.tanks.length=0;if(g.tankById&&g.tankById.clear)g.tankById.clear();
  g.bullets.length=0;g.drones.length=0;g.orbs.length=0;g.powerups.length=0;g.aiRespawns.length=0;
  var shapeBudget=this.low?SHAPE_BUDGET_LOW:SHAPE_BUDGET_NORMAL;
  if(g.shapes.length>shapeBudget)g.shapes.length=shapeBudget;
  g.shapeTimer=1e9;g.powerupTimer=1e9;g.eliteTimer=1e9;g.crasherTimer=1e9;
  g.status='playing';g.paused=false;g.player=spectator();

  /* The decorative roster must not be mutated by run progression. These are
   * the only gameplay exceptions: no XP/evolution syncing, while movement,
   * targeting, fire, damage, deaths, abilities, drones and cover stay real. */
  g.syncAILevels=function(){};
  var baseMove=g.moveTank.bind(g);
  g.moveTank=function(t,vx,vy,dt){if(t===g.player)return;return baseMove(t,vx,vy,dt);};
  var baseGainXP=g.gainXP&&g.gainXP.bind(g);
  if(baseGainXP)g.gainXP=function(t,amount){if(t&&t.__novaLobbyClass)return;return baseGainXP(t,amount);};
  var baseKill=g.killTank.bind(g);
  g.killTank=function(victim,killer){
    var cls=victim&&victim.__novaLobbyClass||null;
    baseKill(victim,killer);
    if(cls){g.aiRespawns.length=0;self.respawns.push({at:g.time+4.5+self.rand()*4.5,cls:cls});}
  };
  for(var i=0;i<this.roster.length;i++)this.registerRepresentative(makeTank(this,this.roster[i],i));
  g.cam.x=0;g.cam.y=ARENA_CAMERA_BOTTOM;g.cam.zoom=.66;g.zoom=.66;g.cam.shake=0;
};
LiveWorld.prototype.respawnMissing=function(){
  var g=this.game;g.aiRespawns.length=0;
  for(var i=this.respawns.length-1;i>=0;i--){
    var r=this.respawns[i];if(g.time<r.at)continue;
    this.respawns.splice(i,1);
    var idx=this.roster.indexOf(r.cls),t=makeTank(this,r.cls,idx<0?0:idx);
    t.x=clamp((this.rand()-.5)*1200,-1800,1800);t.y=clamp(this.cameraY()+((this.rand()-.5)*900),-1900,1900);
    this.registerRepresentative(t);
  }
};
LiveWorld.prototype.cameraY=function(){
  if(this.reduced)return 0;
  var span=ARENA_CAMERA_BOTTOM-ARENA_CAMERA_TOP,travel=(this.elapsed*PAN_UNITS_PER_SEC)%span;
  return ARENA_CAMERA_BOTTOM-travel;
};
LiveWorld.prototype.resize=function(){
  var rect=this.menu.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
  if(w===this.w&&h===this.h)return;
  this.w=w;this.h=h;
  var dpr=Math.min(window.devicePixelRatio||1,this.low?1:1.18),ratio=this.scale*dpr;
  this.pixelRatio=ratio;this.canvas.width=Math.max(1,Math.round(w*ratio));this.canvas.height=Math.max(1,Math.round(h*ratio));
  this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
  var g=this.game;g.w=w;g.h=h;g.dpr=ratio;g.zoom=clamp(Math.min(w/720,h/650),.50,.78);g.cam.zoom=g.zoom;
};
LiveWorld.prototype.step=function(dt){
  var g=this.game;this.elapsed+=dt;g.update(dt);this.respawnMissing();
  g.player.x=99999;g.player.y=99999;g.player.vx=g.player.vy=0;g.player.alive=true;g.status='playing';
  g.cam.x=Math.sin(this.elapsed*.065)*115;g.cam.y=this.cameraY();g.cam.zoom=g.zoom;g.cam.shake=Math.min(g.cam.shake||0,.05);
};
LiveWorld.prototype.draw=function(){
  var g=this.game;
  g.cam.x=Math.sin(this.elapsed*.065)*115;g.cam.y=this.cameraY();g.cam.zoom=g.zoom;g.cam.shake=Math.min(g.cam.shake||0,.05);
  render.render(g,this.w,this.h);
};
LiveWorld.prototype.frame=function(ts){
  if(this.dead)return;
  if(!visibleMenu(this.menu)){this.last=ts;this.acc=0;this.raf=requestAnimationFrame(this.boundFrame);return;}
  if(!this.last)this.last=ts;
  var delta=Math.min(.16,(ts-this.last)/1000);this.last=ts;this.acc+=delta;
  var step=1/this.simHz,guard=0;
  while(this.acc>=step&&guard++<3){this.step(step);this.acc-=step;}
  var interval=1000/this.renderHz;
  if(ts-this.lastRender>=interval){this.resize();this.draw();this.lastRender=ts;}
  this.raf=requestAnimationFrame(this.boundFrame);
};
LiveWorld.prototype.start=function(){this.raf=requestAnimationFrame(this.boundFrame);};
LiveWorld.prototype.destroy=function(){
  this.dead=true;cancelAnimationFrame(this.raf);
  var g=this.game;if(g){if(g.input&&g.input.detach)try{g.input.detach();}catch(_){};if(g.sfx&&g.sfx.dispose)try{g.sfx.dispose();}catch(_){};}
};

var current=null;
function mount(m){
  if(!m||m.querySelector('.nv-lobby-battlefield'))return;
  installCss();m.classList.add('nv-war-room');
  var existing=Array.prototype.slice.call(m.children);for(var i=0;i<existing.length;i++)existing[i].classList.add('nv-lobby-foreground');
  var c=document.createElement('canvas');c.className='nv-lobby-battlefield';c.setAttribute('aria-hidden','true');
  var a=document.createElement('div');a.className='nv-lobby-atmosphere';a.setAttribute('aria-hidden','true');
  m.insertBefore(c,m.firstChild);m.insertBefore(a,c.nextSibling);
  current=new LiveWorld(c,m);current.start();
}
function reconcile(){
  var m=menu();
  if(current&&(!m||current.menu!==m||!m.isConnected)){current.destroy();current=null;}
  if(m&&!current)mount(m);
}
var mo=new MutationObserver(reconcile);mo.observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('visibilitychange',function(){if(current)current.last=performance.now();});
window.addEventListener('resize',function(){if(current)current.resize();},{passive:true});
reconcile();

})();
