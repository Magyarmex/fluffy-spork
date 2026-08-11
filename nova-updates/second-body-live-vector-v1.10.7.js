/* NOVA TANKS v1.10.7 — Second Body: Live Vector
 * Restores the original two-stick Controller combat language and keeps the
 * useful reliability/AI work from the retired Command Weave runtime without
 * keeping its CMD pad or persistent RTS-style orders.
 *
 * Human control law:
 * - left stick = hull movement
 * - right-stick angle = cannon aim + swarm bearing
 * - right-stick depth = live Command Node range
 * - release = recall
 * - cannon hit = temporary designation
 *
 * AI Controllers operate through a sampled virtual version of that same polar
 * stick. Their swarm bearing is tied to their real gun bearing with only a
 * small bounded shear; they do not get an independent command cursor.
 */
(function(){
'use strict';
if(window.__NOVA_SECOND_BODY_LIVE_VECTOR__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.10.7] module registry unavailable');return;}

var VERSION='1.10.7',CODENAME='Second Body: Live Vector',TAU=Math.PI*2;
var CONTROLLER={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};
var BUTTON_GUARD_MS=850;
var AI_NORMAL_THINK=.34,AI_ELITE_THINK=.22;
var AI_NORMAL_SHEAR=.085,AI_ELITE_SHEAR=.125;
var REPAIR_DELAY=2.6,REPAIR_RATE=.11;
var PEEL_CUTOFF=.58,PEEL_MAX=.36;

window.__NOVA_SECOND_BODY_LIVE_VECTOR__={version:VERSION,codename:CODENAME,date:'2026-08-10'};
window.__NOVA_LIVE_VECTOR_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-10',
  headline:'Controller goes back to being a live second body: one right thumb aims, commands depth, shoots, designates, and decides when to give everything up for recall.',
  groups:{
    'Second Body Restored':[
      'The dedicated CMD pad and persistent command cursor are retired from production.',
      'Right-stick direction once again drives cannon bearing and live swarm bearing together; analog stick depth continuously controls Command Node distance.',
      'Releasing the right stick stops firing and recalls every uncommitted drone, restoring the original pressure-versus-safety trade.',
      'The Command Node never follows an enemy for free and never stays behind as a static RTS waypoint: keeping it relevant against a moving tank is player execution.'
    ],
    'Multitask Mastery':[
      'Normal cannon hits still DESIGNATE targets, rewarding players who maintain useful gun aim while shaping swarm geometry.',
      'A tiny command-shear cue exposes the existing difference between raw stick bearing and assisted/smoothed gun bearing, letting advanced players bend formation geometry without adding another control.',
      'Deep deployment deliberately strips away automatic local peel coverage; a player who sends the whole swarm forward is choosing to defend with movement, direct fire, or a hard recall.',
      'Direct fire, not a radial bailout pulse, is the Controller cannon answer to hostile drones: hitting a winding attacker already breaks its run through Second Body commitment rules.'
    ],
    'Useful Autonomy Only':[
      'Nearby uncommitted drones can still intercept an immediate hostile-drone breach, but only if the live command keeps enough hull-local coverage to make that physically plausible.',
      'Critically damaged hunters may disengage and recycle; ordinary chip damage does not automatically abandon a live offensive command.',
      'During recall, damaged drones are allowed to return for the Controller lineage faster repair path requested in Field Service.',
      'Committed dives remain committed: recall, repair, local defense, and terrain intelligence do not bend a launched attack after lock.'
    ],
    'AI Parity':[
      'AI Controllers retain sensed-target commitment and readable pressure cues, but issue swarm orders through a sampled virtual polar stick instead of an independent command cursor.',
      'The virtual swarm bearing is anchored to the AI tank\'s actual gun angle with only a small bounded shear; elite AI samples faster and uses that window better rather than gaining a third thumb.',
      'AI may pull command depth inward when hostile drones breach its hull space or release entirely when critically damaged, paying the same pressure cost a human does.',
      'Target information remains limited to what the Controller hull or its surviving drones can legitimately sense through terrain.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function dist2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function angleDiff(a,b){var d=(a-b+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI;}
function isController(t){return !!(t&&CONTROLLER[t.cls]);}
function maxCommandRange(owner,def){var leash=(def&&def.droneLeash)||650;return Math.max(170,leash*.88*(owner&&owner.swarmT>0?1.12:1));}
function liveVectorFromAim(owner,def,aim){
  var maxR=maxCommandRange(owner,def),dx=aim&&aim.active?(aim.dx||0):0,dy=aim&&aim.active?(aim.dy||0):0,m=Math.hypot(dx,dy);
  if(!aim||!aim.active||m<=4)return{active:false,angle:owner&&owner.angle||0,power:0,range:0,x:owner&&owner.x||0,y:owner&&owner.y||0};
  var angle=Math.atan2(dy,dx),power=clamp((m-4)/47,.04,1),range=58+power*(maxR-58);
  return{active:true,angle:angle,power:power,range:range,x:owner.x+Math.cos(angle)*range,y:owner.y+Math.sin(angle)*range};
}
function peelFraction(power){
  power=clamp(Number(power)||0,0,1);
  if(power>=PEEL_CUTOFF)return 0;
  return PEEL_MAX*(1-power/PEEL_CUTOFF);
}
function virtualPoint(owner,def,angle,power){
  var maxR=maxCommandRange(owner,def),p=clamp(Number(power)||0,0,1),r=58+p*(maxR-58);
  return{x:owner.x+Math.cos(angle)*r,y:owner.y+Math.sin(angle)*r,range:r,power:p,angle:angle};
}
function aiVirtualStick(owner,def,target,plan,threat){
  var hp=owner&&owner.maxHp>0?owner.hp/owner.maxHp:1;
  if(!owner||!target||!target.alive||hp<.16||plan&&plan.releaseUntil>(plan.now||0))return{active:false,angle:owner&&owner.angle||0,power:0,shear:0};
  var dx=target.x-owner.x,dy=target.y-owner.y,d=Math.hypot(dx,dy),maxR=maxCommandRange(owner,def);
  var base=clamp((d-58)/Math.max(1,maxR-58),.14,1),elite=!!(owner.ai&&owner.ai.isElite),pressure=plan&&plan.pressure||'probe';
  var shearMax=elite?AI_ELITE_SHEAR:AI_NORMAL_SHEAR;
  var shear=(plan&&plan.flankSide||1)*shearMax*(pressure==='breach'?1:.58);
  var power=pressure==='breach'?Math.max(base,elite?.74:.66):Math.min(base,elite?.66:.57);
  if(threat)power=Math.min(power,elite?.31:.25);
  if(hp<.26)power=Math.min(power,.20);
  return{active:true,angle:(owner.angle||0)+shear,power:clamp(power,.08,1),shear:shear};
}
function isLegacyUltimate(button){
  if(!window.__NOVA_MULTITOUCH_ULTIMATE__||!button||!button.classList)return false;
  var holder=button.parentElement;
  return button.classList.contains('h-[68px]')&&button.classList.contains('w-[68px]')&&holder&&holder.classList&&holder.classList.contains('bottom-6')&&holder.classList.contains('right-4');
}

/* Preserve the useful v1.10 touch reliability without preserving the command pad. */
(function installButtonBridge(){
  if(typeof document==='undefined'||!document||!document.addEventListener)return;
  var guarded=typeof WeakMap!=='undefined'?new WeakMap():null,dispatchDepth=0;
  function buttonFrom(target){return target&&typeof target.closest==='function'?target.closest('button'):null;}
  function pointerDown(e){
    if(!e||(e.pointerType!=='touch'&&e.pointerType!=='pen'))return;
    var b=buttonFrom(e.target);if(!b||b.disabled||typeof b.click!=='function'||isLegacyUltimate(b))return;
    if(e.cancelable&&e.preventDefault)e.preventDefault();
    if(e.stopImmediatePropagation)e.stopImmediatePropagation();else if(e.stopPropagation)e.stopPropagation();
    if(guarded)guarded.set(b,Date.now()+BUTTON_GUARD_MS);
    dispatchDepth++;
    try{b.click();}finally{dispatchDepth--;}
  }
  function clickCapture(e){
    if(dispatchDepth||!e||!guarded)return;
    var b=buttonFrom(e.target),until=b&&guarded.get(b);if(!until||Date.now()>until)return;
    guarded.delete(b);
    if(e.cancelable&&e.preventDefault)e.preventDefault();
    if(e.stopImmediatePropagation)e.stopImmediatePropagation();else if(e.stopPropagation)e.stopPropagation();
  }
  document.addEventListener('pointerdown',pointerDown,true);
  document.addEventListener('click',clickCapture,true);
  window.__NOVA_LIVE_VECTOR_BUTTON_TEST__={pointerDown:pointerDown,clickCapture:clickCapture,isLegacyUltimate:isLegacyUltimate};
})();

function registerTips(){
  var api=window.NOVATips;if(!api||typeof api.registerMany!=='function'||window.__NOVA_LIVE_VECTOR_TIPS__)return;
  window.__NOVA_LIVE_VECTOR_TIPS__=true;
  api.registerMany([
    {id:'controller-live-vector',contexts:['gameplay','controller'],text:'Controller depth is analog: right-stick ANGLE aims the gun and swarm together; stick DEPTH changes Command Node range. Releasing recalls uncommitted drones.',reviewed:'2026-08-10'},
    {id:'controller-designation-weave',contexts:['gameplay','controller'],text:'A cannon hit briefly DESIGNATES its target. Use that window to keep useful shots flowing while you bend the live swarm vector into better geometry.',reviewed:'2026-08-10'},
    {id:'controller-deep-defense-cost',contexts:['gameplay','controller'],text:'Deep swarm pressure leaves fewer drones physically close enough to intercept a breach. If hostile drones reach you, pull depth inward, shoot them, dodge, or surrender pressure with a recall.',reviewed:'2026-08-10'}
  ]);
}

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaSecondBodyLiveVector)return;
  Game.prototype.__novaSecondBodyLiveVector=true;
  var classes=require('./classes'),C=classes.CLASSES||{};
  var descriptions={
    carrier:'3 live-vector hunters. Right-stick angle aims gun + swarm; depth sets deployment range; release recalls.',
    overlord:'6 crescent hunters. Keep gun aim useful while continuously shaping swarm depth and bearing around a moving fight.',
    warden:'4 armored hunters form a live phalanx. Shallow depth screens the hull; deep depth spends that protection on lane pressure.',
    hivemind:'Nine hunters become a second body. Maintain a moving ring, designation, firing, and recall timing without another control.',
    broodmother:'Six claw hunters reward calculated sacrifice. Critically damaged brood recycle, but active pressure is not automatically abandoned for chip damage.',
    citadel:'Six armored hunters form a heavy live wall whose orientation and distance are inseparable from your current right-stick command.',
    valkyrie:'Five cavalry hunters turn rapid live-vector corrections into sweeping attack tempo; bad depth decisions fail just as quickly.'
  };
  Object.keys(descriptions).forEach(function(id){if(C[id])C[id].desc=descriptions[id];});

  function ownerOf(g,d){if(!g||!d)return null;if(g.tankById&&g.tankById.get)return g.tankById.get(d.ownerId)||null;if(g.getTank)return g.getTank(d.ownerId)||null;return null;}
  function hostileOwners(g,a,b){
    if(!a||!b||a.id===b.id)return false;
    if(typeof g.areAllies==='function'&&g.areAllies(a,b))return false;
    if(typeof g.areHostile==='function')return !!g.areHostile(a,b);
    var keys=['teamId','team','factionId','faction','side'];
    for(var i=0;i<keys.length;i++){var k=keys[i];if(a[k]!=null&&b[k]!=null)return a[k]!==b[k];}
    return true;
  }
  function lineClear(g,ax,ay,bx,by,r){return !g.hasLineOfSight||g.hasLineOfSight(ax,ay,bx,by,r||2);}
  function sensorSees(g,owner,target){
    if(!target||!target.alive)return false;
    if(dist2(owner.x,owner.y,target.x,target.y)<=850*850&&lineClear(g,owner.x,owner.y,target.x,target.y,3))return true;
    var ds=g.drones||[];
    for(var i=0;i<ds.length;i++){
      var d=ds[i];if(!d||d.hp<=0||d.ownerId!==owner.id)continue;
      if(dist2(d.x,d.y,target.x,target.y)<=520*520&&lineClear(g,d.x,d.y,target.x,target.y,2))return true;
    }
    return false;
  }
  function bestObservedTank(g,owner,current){
    if(current&&sensorSees(g,owner,current))return current;
    var best=null,score=Infinity,ts=g.tanks||[];
    for(var i=0;i<ts.length;i++){
      var t=ts[i];if(!t||!t.alive||t.id===owner.id||t.spawnShieldT>0||!hostileOwners(g,owner,t)||!sensorSees(g,owner,t))continue;
      var s=dist2(owner.x,owner.y,t.x,t.y)*(t.isPlayer?.88:1);if(s<score){score=s;best=t;}
    }
    return best;
  }
  function hostileDroneNear(g,owner,radius){
    var best=null,score=radius*radius,ds=g.drones||[];
    for(var i=0;i<ds.length;i++){
      var d=ds[i];if(!d||d.hp<=0||d.ownerId===owner.id||d.__novaSpotter)continue;
      var other=ownerOf(g,d);if(!other||!hostileOwners(g,owner,other))continue;
      var dd=dist2(owner.x,owner.y,d.x,d.y);if(dd<score&&lineClear(g,owner.x,owner.y,d.x,d.y,2)){score=dd;best=d;}
    }
    return best;
  }
  function aiPlan(owner,now){
    return owner.__novaLiveVectorAI||(owner.__novaLiveVectorAI={thinkAt:0,commitUntil:0,targetId:-1,flankSide:(owner.id&1)?1:-1,pressure:'probe',releaseUntil:0,cueUntil:0,lastCueAt:-99,lastOwnHp:owner.hp,commandAngle:owner.angle||0,commandPower:0,active:false,now:now});
  }
  function planAIControllers(g){
    var now=Number(g.time)||0,ts=g.tanks||[];
    for(var i=0;i<ts.length;i++){
      var owner=ts[i];if(!owner||!owner.alive||owner.isPlayer||!owner.ai||!isController(owner))continue;
      var p=aiPlan(owner,now);p.now=now;
      if(owner.hp<p.lastOwnHp-1&&owner.hp/Math.max(1,owner.maxHp)<.20)p.releaseUntil=Math.max(p.releaseUntil,now+.42);
      p.lastOwnHp=owner.hp;
      if(now<p.thinkAt)continue;
      p.thinkAt=now+(owner.ai.isElite?AI_ELITE_THINK:AI_NORMAL_THINK)+((Math.abs(owner.id||0)%3)*.025);
      var current=p.targetId>=0&&g.getTank?g.getTank(p.targetId):null,target=bestObservedTank(g,owner,current);
      if(!target){p.targetId=-1;p.active=false;p.commandPower=0;continue;}
      var changed=target.id!==p.targetId;
      if(changed||now>=p.commitUntil){
        p.targetId=target.id;p.commitUntil=now+(owner.ai.isElite?.80:1.04);p.flankSide*=-1;
        var stalled=owner.ai.state==='wander'||owner.ai.state==='flee';
        p.pressure=stalled?'probe':(changed?'probe':(p.pressure==='probe'?'breach':'probe'));
      }
      var threat=hostileDroneNear(g,owner,265),v=aiVirtualStick(owner,C[owner.cls],target,p,threat);
      p.active=v.active;p.commandAngle=v.angle;p.commandPower=v.power;p.shear=v.shear;
      /* Keep the ordinary tank AI pointed at a legitimate sensed target. The
       * swarm gets no separate target identity; only the virtual polar stick. */
      owner.ai.targetId=target.id;
      if(owner.ai.state!=='flee')owner.ai.state='hunt';
      if(target.isPlayer&&p.pressure==='breach'&&p.active&&now-p.lastCueAt>4.5){
        p.lastCueAt=now;p.cueUntil=now+1.12;
        if(g.addRing)g.addRing(owner.x,owner.y,'#77ff9c',52);
        if(g.sfx&&g.sfx.novaDroneWindup)g.sfx.novaDroneWindup(clamp((owner.x-target.x)/650,-1,1),true,false);
      }
    }
  }
  function prepareAIVirtualThumbs(g){
    var realGet=g.getTank;if(typeof realGet!=='function')return function(){};
    var fake=Object.create(null),saved=[],ts=g.tanks||[];
    for(var i=0;i<ts.length;i++){
      var owner=ts[i];if(!owner||!owner.alive||owner.isPlayer||!owner.ai||!isController(owner))continue;
      var p=owner.__novaLiveVectorAI||null;
      saved.push({owner:owner,targetId:owner.ai.targetId,state:owner.ai.state,strafe:owner.ai.strafe});
      if(!p||!p.active){owner.ai.targetId=-1;owner.ai.state='wander';owner.ai.strafe=1e-6;continue;}
      var point=virtualPoint(owner,C[owner.cls],p.commandAngle,p.commandPower),id=-900000-Math.abs(Number(owner.id)||i+1);
      fake[id]={id:id,kind:'tank',alive:true,spawnShieldT:0,x:point.x,y:point.y,vx:0,vy:0};
      owner.ai.targetId=id;owner.ai.state='hunt';owner.ai.strafe=1e-6;
    }
    g.getTank=function(id){return fake[id]||realGet.call(this,id);};
    return function(){
      g.getTank=realGet;
      for(var j=0;j<saved.length;j++){var s=saved[j];s.owner.ai.targetId=s.targetId;s.owner.ai.state=s.state;s.owner.ai.strafe=s.strafe;}
    };
  }
  function steerToward(g,d,x,y,speed,dt){
    if(g.hasLineOfSight&&!g.hasLineOfSight(d.x,d.y,x,y,Math.max(2,(d.r||8)*.45))&&g.novaBattlefieldWaypoint){
      var wp=g.novaBattlefieldWaypoint(d.x,d.y,x,y,(d.r||8)+5,d.id);if(wp){x=wp.x;y=wp.y;}
    }
    var dx=x-d.x,dy=y-d.y,m=Math.hypot(dx,dy)||1,ux=dx/m,uy=dy/m,k=1-Math.exp(-7*Math.max(0,dt));
    var vx=ux*Math.min(speed,m*4.4),vy=uy*Math.min(speed,m*4.4);
    d.__lvVX=(d.__lvVX==null?(d.__novaVX||0):d.__lvVX)+(vx-(d.__lvVX==null?(d.__novaVX||0):d.__lvVX))*k;
    d.__lvVY=(d.__lvVY==null?(d.__novaVY||0):d.__lvVY)+(vy-(d.__lvVY==null?(d.__novaVY||0):d.__lvVY))*k;
    d.x+=d.__lvVX*dt;d.y+=d.__lvVY*dt;d.__novaVX=d.__lvVX;d.__novaVY=d.__lvVY;
    if(Math.abs(d.__lvVX)+Math.abs(d.__lvVY)>3)d.angle=Math.atan2(d.__lvVY,d.__lvVX);
  }
  function repairDrone(g,d,owner,state,dt){
    var max=Math.max(1,d.maxHp||d.hp||1),f=d.hp/max,active=!!(state&&state.active),threshold=active?(owner.cls==='broodmother'?.12:.18):.62;
    if(d.__lvLastHp==null)d.__lvLastHp=d.hp;
    if(d.hp<d.__lvLastHp-.01)d.__lvRepairWait=REPAIR_DELAY;else d.__lvRepairWait=Math.max(0,(d.__lvRepairWait||0)-dt);
    d.__lvLastHp=d.hp;
    if(d.__novaPhase==='dash'||d.__novaCommitted)return false;
    if(f<threshold)d.__lvRepairing=true;
    else if(f>.84||active&&f>threshold+.10)d.__lvRepairing=false;
    if(!d.__lvRepairing)return false;
    if(d.__novaPhase==='windup'||d.__novaPhase!=='recover'){d.__novaPhase='recover';d.__novaPhaseT=Math.max(d.__novaPhaseT||0,.22);d.__novaTarget=null;d.targetRef=null;}
    steerToward(g,d,owner.x,owner.y,Math.max(150,(d.speed||180)*1.08),dt);
    var near=dist2(d.x,d.y,owner.x,owner.y)<145*145,combat=!!hostileDroneNear(g,owner,225);
    if(near&&!combat&&(d.__lvRepairWait||0)<=0){
      var before=d.hp;d.hp=Math.min(max,d.hp+max*REPAIR_RATE*Math.max(0,dt));
      if(d.hp>before&&Number(g.time||0)>=(d.__lvRepairFxAt||0)){d.__lvRepairFxAt=Number(g.time||0)+.34;if(g.addParticles)g.addParticles(d.x,d.y,'#8fffd0',2,22,'glow');if(g.addRing)g.addRing(d.x,d.y,'#8fffd0',8);}
    }
    return true;
  }
  function peelScreen(g,group,owner,state,threat,dt){
    if(!threat||!group.length)return 0;
    var power=state&&state.active?state.power:0,fraction=peelFraction(power);if(fraction<=0)return 0;
    var count=Math.max(1,Math.ceil(group.length*fraction)),local=155+(1-power)*95,local2=local*local,used=0;
    var tx=threat.x+(threat.__novaVX||0)*.18,ty=threat.y+(threat.__novaVY||0)*.18;
    for(var i=0;i<group.length&&used<count;i++){
      var d=group[i];if(!d||d.hp<=0||d.__lvRepairing||d.__novaPhase==='dash'||d.__novaPhase==='windup'||d.__novaCommitted)continue;
      if(dist2(owner.x,owner.y,d.x,d.y)>local2)continue;
      used++;steerToward(g,d,tx,ty,Math.max(190,(d.speed||190)*1.12),dt);d.__lvPeelUntil=Number(g.time||0)+.16;
      var rr=(d.r||8)+(threat.r||8)+9;
      if(dist2(d.x,d.y,threat.x,threat.y)<rr*rr&&(d.attackCd||0)<=0){
        if(g.damageDrone){var prev=g.__novaDroneDamageOwner;g.__novaDroneDamageOwner=owner.id;try{g.damageDrone(threat,Math.max(5,(d.damage||d.dmg||8)*.75),owner.id);}finally{g.__novaDroneDamageOwner=prev;}}
        d.attackCd=.38;d.__novaVX=(d.__novaVX||0)*.45;d.__novaVY=(d.__novaVY||0)*.45;
      }
    }
    return used;
  }
  function postProcessControllers(g,dt){
    var groups=Object.create(null),ds=g.drones||[];
    for(var i=0;i<ds.length;i++){
      var d=ds[i];if(!d||d.hp<=0||d.__novaSpotter)continue;
      var owner=ownerOf(g,d);if(!owner||!owner.alive||!isController(owner))continue;
      (groups[owner.id]||(groups[owner.id]=[])).push(d);
    }
    Object.keys(groups).forEach(function(key){
      var owner=g.getTank?g.getTank(+key):null;if(!owner&&g.tankById&&g.tankById.get)owner=g.tankById.get(+key);if(!owner)return;
      var group=groups[key],state=owner.__novaSwarm||null;
      group.sort(function(a,b){return ((a.slot==null?a.__novaSlot:a.slot)||0)-((b.slot==null?b.__novaSlot:b.slot)||0);});
      for(var j=0;j<group.length;j++)repairDrone(g,group[j],owner,state,dt);
      var threat=hostileDroneNear(g,owner,owner.isPlayer?285:250);
      peelScreen(g,group,owner,state,threat,dt);
    });
  }
  function updateTelemetry(g,dt){
    var p=g.player;if(!p||!p.alive||!isController(p))return;
    var out=window.__NOVA_LIVE_VECTOR_LAST__||(window.__NOVA_LIVE_VECTOR_LAST__={});
    var st=p.__novaSwarm||{},aim=g.input&&g.input.aim,raw=liveVectorFromAim(p,C[p.cls],aim),prevX=out.nodeX,prevY=out.nodeY;
    out.time=Number(g.time)||0;out.active=!!st.active;out.depth=Number(st.power)||0;out.nodeX=Number(st.nodeX)||p.x;out.nodeY=Number(st.nodeY)||p.y;
    out.nodeDistance=Math.hypot(out.nodeX-p.x,out.nodeY-p.y);out.rawCommandAngle=raw.active?raw.angle:null;out.gunAngle=p.angle||0;out.shear=raw.active?angleDiff(raw.angle,p.angle||0):0;
    out.nodeSpeed=dt>0&&Number.isFinite(prevX)&&Number.isFinite(prevY)?Math.hypot(out.nodeX-prevX,out.nodeY-prevY)/dt:0;out.designatedTargetId=st.markUntil>out.time?st.markId:-1;
    out.form=0;out.windup=0;out.dash=0;out.recover=0;out.localDefenders=0;
    var ds=g.drones||[];for(var i=0;i<ds.length;i++){var d=ds[i];if(!d||d.hp<=0||d.ownerId!==p.id)continue;var ph=d.__novaPhase||'form';if(ph==='windup')out.windup++;else if(ph==='dash')out.dash++;else if(ph==='recover')out.recover++;else out.form++;if(dist2(p.x,p.y,d.x,d.y)<220*220)out.localDefenders++;}
  }

  var oldDrones=Game.prototype.updateDrones;
  if(oldDrones)Game.prototype.updateDrones=function(dt){
    planAIControllers(this);
    var restore=prepareAIVirtualThumbs(this),out;
    try{out=oldDrones.apply(this,arguments);}finally{restore();}
    postProcessControllers(this,dt);updateTelemetry(this,dt);registerTips();
    return out;
  };

  var oldSetClass=Game.prototype.setClass;
  if(oldSetClass)Game.prototype.setClass=function(t,id){
    var was=isController(t),out=oldSetClass.apply(this,arguments),now=isController(t);
    if(t&&t.isPlayer&&now&&!was){
      if(t.__novaSwarm)t.__novaSwarm.tutorialUntil=0;
      t.__novaLiveVectorTutorialUntil=(this.time||0)+10.5;
      if(this.toast)this.toast('❖ SECOND BODY — RIGHT STICK ANGLE: GUN + SWARM · DEPTH: RANGE · RELEASE: RECALL · HIT: DESIGNATE','info');
    }
    return out;
  };
});

wrap('game/render',function(renderMod,require){
  var old=renderMod.render;if(!old||old.__novaSecondBodyLiveVector)return;
  var classes=require('./classes'),C=classes.CLASSES||{};
  function lineage(t){try{return t?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
  function edgePoint(w,h,a,pad){var cx=w*.5,cy=h*.5,dx=Math.cos(a),dy=Math.sin(a),rx=Math.max(1,cx-pad),ry=Math.max(1,cy-pad),s=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);return{x:cx+dx*s,y:cy+dy*s};}
  function drawShear(g,ctx){
    var p=g.player,aim=g.input&&g.input.aim;if(!p||!isController(p)||!aim||!aim.active)return;
    var raw=liveVectorFromAim(p,C[p.cls],aim);if(!raw.active)return;
    var gun=p.angle||0,d=angleDiff(raw.angle,gun);if(Math.abs(d)<.025||Math.abs(d)>.30)return;
    var cx=g.w*.5,cy=g.h*.5,r=22;
    ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(117,240,163,.55)';ctx.fillStyle='rgba(117,240,163,.82)';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,r,gun,raw.angle,d<0);ctx.stroke();ctx.translate(cx+Math.cos(raw.angle)*(r+5),cy+Math.sin(raw.angle)*(r+5));ctx.rotate(raw.angle);ctx.beginPath();ctx.moveTo(5,0);ctx.lineTo(-2,-2.5);ctx.lineTo(-1,0);ctx.lineTo(-2,2.5);ctx.closePath();ctx.fill();ctx.restore();
  }
  function patched(g,w,h){
    old(g,w,h);if(!g||!g.ctx||!g.player||!g.player.alive)return;
    var ctx=g.ctx,now=Number(g.time)||0;drawShear(g,ctx);
    if(isController(g.player)&&(g.player.__novaLiveVectorTutorialUntil||0)>now){
      ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.textAlign='center';ctx.font='800 9px Orbitron,system-ui';ctx.fillStyle='rgba(207,255,224,.92)';ctx.shadowBlur=10;ctx.shadowColor='#75f0a3';
      ctx.fillText('RIGHT STICK ANGLE = GUN + SWARM · DEPTH = SWARM RANGE · RELEASE = RECALL',g.w*.5,g.h*.72);
      ctx.font='700 10px Rajdhani,system-ui';ctx.fillStyle='rgba(170,220,190,.82)';ctx.shadowBlur=0;ctx.fillText('Cannon hits DESIGNATE · deep pressure leaves fewer drones close enough to peel',g.w*.5,g.h*.72+15);ctx.restore();
    }
    var ts=g.tanks||[];
    for(var i=0;i<ts.length;i++){
      var t=ts[i],p=t&&t.__novaLiveVectorAI;if(!t||!t.alive||t.isPlayer||!p||p.cueUntil<=now||p.targetId!==g.player.id||lineage(t)!=='controller')continue;
      var sx=(t.x-g.cam.x)*(g.cam.zoom||1)+g.w*.5,sy=(t.y-g.cam.y)*(g.cam.zoom||1)+g.h*.5;if(sx>38&&sx<g.w-38&&sy>38&&sy<g.h-38)continue;
      var a=Math.atan2(t.y-g.player.y,t.x-g.player.x),e=edgePoint(g.w,g.h,a,42),pulse=.72+.28*Math.sin(now*13);
      ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.translate(e.x,e.y);ctx.rotate(a);ctx.globalAlpha=pulse;ctx.strokeStyle='#81ffad';ctx.fillStyle='rgba(80,255,142,.11)';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-5,-8);ctx.lineTo(-1,0);ctx.lineTo(-5,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.rotate(-a);ctx.font='800 8px Orbitron,system-ui';ctx.textAlign='center';ctx.fillStyle='#aaffc2';ctx.fillText('SWARM FORMING',0,-15);ctx.restore();
    }
  }
  patched.__novaSecondBodyLiveVector=true;renderMod.render=patched;
});

registerTips();
window.__NOVA_LIVE_VECTOR_TEST__={
  isController:function(id){return !!CONTROLLER[id];},maxCommandRange:maxCommandRange,liveVectorFromAim:liveVectorFromAim,peelFraction:peelFraction,virtualPoint:virtualPoint,aiVirtualStick:aiVirtualStick,
  normalThink:AI_NORMAL_THINK,eliteThink:AI_ELITE_THINK,normalShear:AI_NORMAL_SHEAR,eliteShear:AI_ELITE_SHEAR,repairDelay:REPAIR_DELAY,repairRate:REPAIR_RATE,buttonGuardMs:BUTTON_GUARD_MS
};
window.__NOVA_LIVE_VECTOR_SNAPSHOT__=function(){var s=window.__NOVA_LIVE_VECTOR_LAST__||{};return Object.assign({},s);};
window.__NOVA_VERSION=VERSION;
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();