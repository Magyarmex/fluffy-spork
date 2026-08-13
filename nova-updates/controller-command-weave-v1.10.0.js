/* NOVA TANKS v1.10.0 — Command Weave
 * Controller-lineage combat + input pass.
 *
 * Goals:
 * - Cannon aim is always cannon aim; swarm orders persist independently.
 * - A dedicated Command Pad supports tap-to-stamp, drag-to-place, guard, and recall.
 * - Every touch/pen control owns its own pointer; buttons activate independently of held sticks.
 * - Controller drones automatically peel against imminent breaches and repair when disengaged.
 * - Controller cannon hits disrupt tight hostile drone formations.
 * - AI Controllers use observable information, commitment windows, screens, flanks, and readable breach cues.
 */
(function(){
'use strict';
if(window.__NOVA_COMMAND_WEAVE__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.10.0] module registry unavailable');return;}

var VERSION='1.10.0',CODENAME='Command Weave',TAU=Math.PI*2;
var CONTROLLER_IDS={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};
var BUTTON_GUARD_MS=850,DOUBLE_TAP_MS=285,DRAG_PX=12;
var MAP_LIMIT=2100;

window.__NOVA_COMMAND_WEAVE_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Controller becomes a two-layer fighting discipline: aim the cannon, stamp intent, then command while you survive.',
  groups:{
    'Command Controls':[
      'The right aim stick exclusively controls the cannon. It no longer doubles as a live swarm leash.',
      'A dedicated CMD pad can stamp the current cannon sightline with a tap, place a command directly in world space by dragging, enter a defensive screen near the Controller, or recall on a double tap.',
      'Orders persist after the command gesture, so the player can immediately return to aiming and shooting.',
      'Command-pad pointer capture is independent of both joysticks and every other held screen touch.'
    ],
    'No Input Clogging':[
      'Movement and aim retain separate pointer ownership, with release/cancel affecting only the stick that owns that pointer.',
      'Touch and pen buttons activate on their own pointer-down path even while one or more gameplay pointers remain held.',
      'Synthetic follow-up clicks are suppressed per button so multi-touch responsiveness cannot double-activate controls.',
      'Mouse behavior stays on the normal desktop path.'
    ],
    'Controller Defense':[
      'A portion of each Controller swarm automatically forms a local screen when hostile drones breach the personal-defense radius.',
      'Screen drones intercept predicted paths instead of tail-chasing, then return to the explicit order when the breach ends.',
      'Badly damaged Controller drones disengage, return to their owner, and repair only after an out-of-combat delay.',
      'Controller cannon hits create a small anti-drone disruption pulse: nearby hostile drones take light secondary damage and have attack runs broken.'
    ],
    'AI Controller Doctrine':[
      'AI Controllers retain targets through short commitment windows, probe and flank instead of reevaluating every frame, and keep part of the swarm as a screen.',
      'Their target knowledge is limited to the Controller or its drones actually sensing a tank; hidden enemies are not globally tracked.',
      'Mirror fights bias flanks against the opponent swarm position and escalate out of prolonged defensive deadlocks.',
      'Major hostile swarm commitments generate a restrained directional forming cue before the breach reaches the player.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function dist2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function angleDiff(a,b){var d=(a-b+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI;}
function isController(t){return !!(t&&CONTROLLER_IDS[t.cls]);}
function lineage(classes,t){try{return t?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
function maxCommandRange(owner,def){var leash=(def&&def.droneLeash)||650;return Math.max(170,leash*.88*(owner&&owner.swarmT>0?1.12:1));}
function clampNode(owner,x,y,maxR){
  var dx=x-owner.x,dy=y-owner.y,d=Math.hypot(dx,dy)||1;
  if(d>maxR){x=owner.x+dx/d*maxR;y=owner.y+dy/d*maxR;}
  return{x:clamp(x,-MAP_LIMIT+40,MAP_LIMIT-40),y:clamp(y,-MAP_LIMIT+40,MAP_LIMIT-40)};
}
function commandState(t){
  if(!t.__novaCommandWeave)t.__novaCommandWeave={active:false,mode:'recall',x:t.x,y:t.y,targetId:-1,preview:false,changedAt:0,lastTapAt:-99,tutorialUntil:0};
  return t.__novaCommandWeave;
}
function fakeAimFor(owner,def,cmd){
  if(!cmd||!cmd.active||cmd.mode==='recall')return{active:false,ox:0,oy:0,dx:0,dy:0};
  var x=cmd.x,y=cmd.y;
  var dx=x-owner.x,dy=y-owner.y,r=Math.hypot(dx,dy),a=r>1?Math.atan2(dy,dx):(owner.angle||0),maxR=maxCommandRange(owner,def);
  r=clamp(r,58,maxR);
  var power=clamp((r-58)/Math.max(1,maxR-58),.04,1),mag=4+power*47;
  return{active:true,ox:0,oy:0,dx:Math.cos(a)*mag,dy:Math.sin(a)*mag,__novaCommandWeave:true};
}
function screenToWorld(g,cx,cy){
  var rect=g.canvas.getBoundingClientRect(),z=(g.cam&&g.cam.zoom)||g.zoom||1;
  return{x:g.cam.x+(cx-rect.left-g.w*.5)/z,y:g.cam.y+(cy-rect.top-g.h*.5)/z};
}
function isLegacyUltimate(button){
  if(!window.__NOVA_MULTITOUCH_ULTIMATE__||!button||!button.classList)return false;
  var holder=button.parentElement;
  return button.classList.contains('h-[68px]')&&button.classList.contains('w-[68px]')&&holder&&holder.classList&&holder.classList.contains('bottom-6')&&holder.classList.contains('right-4');
}

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
  window.__NOVA_COMMAND_WEAVE_BUTTON_TEST__={pointerDown:pointerDown,clickCapture:clickCapture,isLegacyUltimate:isLegacyUltimate};
})();

wrap('game/input',function(inputMod){
  var Input=inputMod.Input;if(!Input||Input.prototype.__novaCommandWeaveInput)return;
  Input.prototype.__novaCommandWeaveInput=true;
  var oldAttach=Input.prototype.attach;
  if(!oldAttach)return;
  Input.prototype.attach=function(canvas){
    oldAttach.call(this,canvas);
    var self=this,legacyPd=this.pd,legacyPm=this.pm,legacyPu=this.pu;
    try{canvas.removeEventListener('pointerdown',legacyPd);}catch(_){}
    try{window.removeEventListener('pointermove',legacyPm);window.removeEventListener('pointerup',legacyPu);window.removeEventListener('pointercancel',legacyPu);}catch(_){}
    this.__novaPointerOwners=new Map();
    function emit(kind,s){if(self.onStickChange)self.onStickChange(kind,s);}
    function release(kind,pid){
      var s=self[kind];if(!s||self.stickId[kind]!==pid)return;
      s.active=false;s.dx=0;s.dy=0;self.stickId[kind]=-1;self.__novaPointerOwners.delete(pid);emit(kind,s);
      if(kind==='aim')self.firing=false;
      try{if(canvas.hasPointerCapture&&canvas.hasPointerCapture(pid))canvas.releasePointerCapture(pid);}catch(_){}
    }
    this.pd=function(e){
      var target=e.target;if(target&&target.closest&&target.closest('[data-ui]'))return;
      var rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
      if(e.pointerType==='mouse'){
        if(self.touchSeen)return;self.mouseX=e.clientX;self.mouseY=e.clientY;self.mouseActive=true;self.firing=true;return;
      }
      self.touchSeen=true;if(e.cancelable&&e.preventDefault)e.preventDefault();
      var kind=x<rect.width*.45?'move':'aim';
      if(self.stickId[kind]!==-1)return;
      var s=self[kind];self.stickId[kind]=e.pointerId;self.__novaPointerOwners.set(e.pointerId,kind);
      s.active=true;s.ox=x;s.oy=y;s.dx=0;s.dy=0;if(kind==='aim')self.firing=true;emit(kind,s);
      try{canvas.setPointerCapture(e.pointerId);}catch(_){}
    };
    this.pm=function(e){
      if(e.pointerType==='mouse'){if(self.touchSeen)return;self.mouseX=e.clientX;self.mouseY=e.clientY;return;}
      var kind=self.__novaPointerOwners.get(e.pointerId);if(!kind)return;
      var rect=canvas.getBoundingClientRect(),s=self[kind],x=e.clientX-rect.left,y=e.clientY-rect.top;
      s.dx=clamp(x-s.ox,-60,60);s.dy=clamp(y-s.oy,-60,60);emit(kind,s);
      if(e.cancelable&&e.preventDefault)e.preventDefault();
    };
    this.pu=function(e){
      if(e.pointerType==='mouse'){if(self.touchSeen)return;self.mouseActive=false;self.firing=false;return;}
      var kind=self.__novaPointerOwners.get(e.pointerId);if(kind)release(kind,e.pointerId);
    };
    canvas.addEventListener('pointerdown',this.pd,{passive:false});
    window.addEventListener('pointermove',this.pm,{passive:false});
    window.addEventListener('pointerup',this.pu,{passive:false});
    window.addEventListener('pointercancel',this.pu,{passive:false});
    this.__novaPointerRelease=release;
  };
});

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaCommandWeave)return;
  Game.prototype.__novaCommandWeave=true;
  var classes=require('./classes'),C=classes.CLASSES||{};

  var descriptions={
    carrier:'3 command hunters. Aim your cannon normally; tap CMD to stamp its sightline, drag CMD to place the swarm, double-tap to recall.',
    overlord:'6 hunters split pressure and screen duties. Persistent CMD orders free your cannon for personal defense.',
    warden:'4 armored hunters maintain a protective screen while explicit CMD stamps move the phalanx.',
    hivemind:'Nine hunters execute persistent command stamps, screen breaches, and reform without stealing cannon aim.',
    broodmother:'Six brutal hunters pressure from twin claws while damaged drones disengage and recycle through the Controller.',
    citadel:'Six armored hunters form a movable wall; CMD places the wall while reflex peelers protect the core.',
    valkyrie:'Five lightning hunters commit to rapid attack runs; CMD timing and recall windows define the cavalry rhythm.'
  };
  Object.keys(descriptions).forEach(function(id){if(C[id])C[id].desc=descriptions[id];});

  function visibleControllerPlayer(g){return !!(g&&g.player&&g.player.alive&&isController(g.player));}
  function setPadStatus(g,text,hot){
    var pad=g&&g.__novaCommandPad;if(!pad)return;
    var label=pad.querySelector&&pad.querySelector('[data-cw-label]');if(label)label.textContent=text||'CMD';
    pad.style.borderColor=hot?'rgba(157,255,192,.94)':'rgba(110,224,255,.62)';
    pad.style.boxShadow=hot?'0 0 24px rgba(96,255,165,.32), inset 0 0 14px rgba(96,255,165,.12)':'0 0 20px rgba(70,210,255,.20), inset 0 0 12px rgba(70,210,255,.08)';
  }
  function cueCommand(g,owner,cmd,label){
    cmd.changedAt=g.time||0;
    if(g.sfx&&g.sfx.novaSwarmCommand)g.sfx.novaSwarmCommand();
    if(g.addRing)g.addRing(cmd.x,cmd.y,cmd.mode==='guard'?'#aeeaff':'#9dffc0',cmd.mode==='guard'?42:30);
    if(g.addText&&label)g.addText(cmd.x,cmd.y-24,label,cmd.mode==='guard'?'#aeeaff':'#9dffc0',9);
  }
  function setRecall(g,owner){
    var c=commandState(owner);c.active=false;c.mode='recall';c.targetId=-1;c.preview=false;c.x=owner.x;c.y=owner.y;c.changedAt=g.time||0;
    setPadStatus(g,'RCL',true);
  }
  function setGuard(g,owner){
    var c=commandState(owner),a=owner.angle||0;c.active=true;c.mode='guard';c.targetId=-1;c.preview=false;c.x=owner.x+Math.cos(a)*66;c.y=owner.y+Math.sin(a)*66;
    cueCommand(g,owner,c,'SCREEN');setPadStatus(g,'DEF',true);
  }
  function aimStampTarget(g,owner){
    var a=owner.angle||0,maxR=maxCommandRange(owner,C[owner.cls]),best=null,bestScore=Infinity;
    for(var i=0;i<g.tanks.length;i++){
      var t=g.tanks[i];if(!t||!t.alive||t.id===owner.id||t.spawnShieldT>0)continue;
      var dx=t.x-owner.x,dy=t.y-owner.y,d=Math.hypot(dx,dy);if(d>maxR*1.08||d<1)continue;
      var ad=Math.abs(angleDiff(Math.atan2(dy,dx),a));if(ad>.18)continue;
      var score=ad*700+d*.09;if(score<bestScore){best=t;bestScore=score;}
    }
    if(best)return best;
    return null;
  }
  function stampAim(g,owner){
    var c=commandState(owner),target=aimStampTarget(g,owner),maxR=maxCommandRange(owner,C[owner.cls]),a=owner.angle||0;
    c.active=true;c.preview=false;
    if(target){c.mode='target';c.targetId=target.id;c.x=target.x;c.y=target.y;cueCommand(g,owner,c,'STAMPED');if(g.sfx&&g.sfx.novaDesignate)g.sfx.novaDesignate();}
    else{c.mode='point';c.targetId=-1;c.x=owner.x+Math.cos(a)*maxR*.72;c.y=owner.y+Math.sin(a)*maxR*.72;cueCommand(g,owner,c,'COMMAND');}
    setPadStatus(g,'CMD',true);
  }
  function placeCommand(g,owner,x,y,preview){
    var c=commandState(owner),p=clampNode(owner,x,y,maxCommandRange(owner,C[owner.cls]));
    c.active=true;c.mode='point';c.targetId=-1;c.x=p.x;c.y=p.y;c.preview=!!preview;c.changedAt=g.time||0;
    setPadStatus(g,preview?'SET':'CMD',true);
  }
  function finishPlacedCommand(g,owner,x,y){
    var d=Math.hypot(x-owner.x,y-owner.y);
    if(d<145){setGuard(g,owner);return;}
    placeCommand(g,owner,x,y,false);cueCommand(g,owner,commandState(owner),'COMMAND');
  }
  function ensureCommandPad(g){
    if(typeof document==='undefined'||!document.body)return null;
    if(g.__novaCommandPad){g.__novaCommandPad.style.display=visibleControllerPlayer(g)?'flex':'none';return g.__novaCommandPad;}
    var pad=document.createElement('div');g.__novaCommandPad=pad;pad.id='nova-command-pad';pad.setAttribute('data-ui','1');pad.setAttribute('role','button');pad.setAttribute('aria-label','Controller command pad');
    pad.style.cssText='position:fixed;right:92px;bottom:max(22px,env(safe-area-inset-bottom));width:62px;height:62px;border-radius:22px 10px 22px 10px;border:1px solid rgba(110,224,255,.62);background:radial-gradient(circle at 38% 32%,rgba(132,242,255,.19),rgba(8,22,42,.82) 58%,rgba(4,10,22,.92));display:none;align-items:center;justify-content:center;z-index:31;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;backdrop-filter:blur(5px);font-family:Orbitron,system-ui;color:#c9f7ff;letter-spacing:.08em;font-weight:900;font-size:10px;box-shadow:0 0 20px rgba(70,210,255,.20),inset 0 0 12px rgba(70,210,255,.08);';
    pad.innerHTML='<div style="position:absolute;inset:9px;border:1px solid rgba(145,240,255,.22);border-radius:16px 7px 16px 7px;pointer-events:none"></div><span data-cw-label style="pointer-events:none;text-shadow:0 0 8px rgba(120,235,255,.7)">CMD</span>';
    document.body.appendChild(pad);
    var pointer=-1,downX=0,downY=0,lastX=0,lastY=0,moved=false;
    function activeOwner(){return visibleControllerPlayer(g)?g.player:null;}
    function pd(e){
      var owner=activeOwner();if(!owner||pointer!==-1||e.button>0)return;
      pointer=e.pointerId;downX=lastX=e.clientX;downY=lastY=e.clientY;moved=false;
      if(e.cancelable)e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();else e.stopPropagation();
      try{pad.setPointerCapture(pointer);}catch(_){}
      setPadStatus(g,'SET',true);
    }
    function pm(e){
      if(e.pointerId!==pointer)return;lastX=e.clientX;lastY=e.clientY;
      if(!moved&&Math.hypot(lastX-downX,lastY-downY)>=DRAG_PX)moved=true;
      if(moved){var owner=activeOwner();if(owner){var p=screenToWorld(g,lastX,lastY);placeCommand(g,owner,p.x,p.y,true);}}
      if(e.cancelable)e.preventDefault();
    }
    function pu(e){
      if(e.pointerId!==pointer)return;var owner=activeOwner(),now=Date.now();
      try{if(pad.hasPointerCapture&&pad.hasPointerCapture(pointer))pad.releasePointerCapture(pointer);}catch(_){}
      pointer=-1;if(!owner){setPadStatus(g,'CMD',false);return;}
      var c=commandState(owner);
      if(moved){var p=screenToWorld(g,lastX,lastY);finishPlacedCommand(g,owner,p.x,p.y);}
      else if(now-c.lastTapAt<=DOUBLE_TAP_MS){c.lastTapAt=-99;setRecall(g,owner);}
      else{c.lastTapAt=now;stampAim(g,owner);}
      c.preview=false;
      if(e.cancelable)e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();else if(e.stopPropagation)e.stopPropagation();
    }
    pad.addEventListener('pointerdown',pd,{passive:false});pad.addEventListener('pointermove',pm,{passive:false});pad.addEventListener('pointerup',pu,{passive:false});pad.addEventListener('pointercancel',pu,{passive:false});
    pad.__novaCleanup=function(){pad.removeEventListener('pointerdown',pd);pad.removeEventListener('pointermove',pm);pad.removeEventListener('pointerup',pu);pad.removeEventListener('pointercancel',pu);};
    pad.style.display=visibleControllerPlayer(g)?'flex':'none';return pad;
  }

  function sensorSees(g,owner,target){
    if(!target||!target.alive)return false;
    if(dist2(owner.x,owner.y,target.x,target.y)<=850*850&&(!g.hasLineOfSight||g.hasLineOfSight(owner.x,owner.y,target.x,target.y,3)))return true;
    if(!g.drones)return false;
    for(var i=0;i<g.drones.length;i++){
      var d=g.drones[i];if(!d||d.hp<=0||d.ownerId!==owner.id)continue;
      if(dist2(d.x,d.y,target.x,target.y)<=520*520&&(!g.hasLineOfSight||g.hasLineOfSight(d.x,d.y,target.x,target.y,2)))return true;
    }
    return false;
  }
  function bestObservedTank(g,owner,current){
    if(current&&sensorSees(g,owner,current))return current;
    var best=null,score=Infinity;
    for(var i=0;i<g.tanks.length;i++){
      var t=g.tanks[i];if(!t||!t.alive||t.id===owner.id||t.spawnShieldT>0||!sensorSees(g,owner,t))continue;
      var s=dist2(owner.x,owner.y,t.x,t.y)*(t.isPlayer ? .88 : 1);if(s<score){score=s;best=t;}
    }
    return best;
  }
  function planAIControllers(g){
    var now=g.time||0;
    for(var i=0;i<g.tanks.length;i++){
      var owner=g.tanks[i];if(!owner||!owner.alive||owner.isPlayer||!owner.ai||!isController(owner))continue;
      var p=owner.__novaCommandAI||(owner.__novaCommandAI={thinkAt:0,commitUntil:0,targetId:-1,flankSide:(owner.id&1)?1:-1,pressure:'probe',lastCueAt:-99,cueUntil:0,lastProgressAt:now,lastOwnHp:owner.hp});
      if(owner.hp<p.lastOwnHp-1)p.lastProgressAt=now;p.lastOwnHp=owner.hp;
      if(now<p.thinkAt)continue;
      p.thinkAt=now+(owner.ai.isElite ? .22 : .34)+((owner.id%3)*.025);
      var current=p.targetId>=0&&g.getTank?g.getTank(p.targetId):null,target=bestObservedTank(g,owner,current);
      if(!target){p.targetId=-1;owner.ai.targetId=-1;if(owner.ai.state!=='flee')owner.ai.state='wander';continue;}
      var changed=target.id!==p.targetId;
      if(changed||now>=p.commitUntil){
        p.targetId=target.id;p.commitUntil=now+(owner.ai.isElite ? .78 : 1.02);p.flankSide*=-1;
        var sw=target.__novaSwarm;
        if(sw&&sw.active){
          var vx=target.x-owner.x,vy=target.y-owner.y,px=-vy,py=vx,side=(sw.nodeX-target.x)*px+(sw.nodeY-target.y)*py;
          if(Math.abs(side)>2500)p.flankSide=side>0?-1:1;
        }
        var stalled=now-p.lastProgressAt>5.2;p.pressure=stalled?'breach':(changed?'probe':(p.pressure==='probe'?'breach':'probe'));
      }
      owner.ai.targetId=target.id;owner.ai.state=owner.hp/Math.max(1,owner.maxHp)<.22?'flee':'hunt';owner.ai.strafe=p.flankSide;
      if(target.isPlayer&&p.pressure==='breach'&&now-p.lastCueAt>4.5){
        p.lastCueAt=now;p.cueUntil=now+1.15;
        if(g.addRing)g.addRing(owner.x,owner.y,'#77ff9c',52);
        if(g.sfx&&g.sfx.novaDroneWindup)g.sfx.novaDroneWindup(clamp((owner.x-target.x)/650,-1,1),true,false);
      }
    }
  }

  function hostileDroneNear(g,owner,radius){
    var best=null,score=radius*radius;
    for(var i=0;i<g.drones.length;i++){
      var d=g.drones[i];if(!d||d.hp<=0||d.ownerId===owner.id)continue;
      var hostileOwner=g.getTank&&g.getTank(d.ownerId);if(!hostileOwner||!hostileOwner.alive)continue;
      var dd=dist2(owner.x,owner.y,d.x,d.y);if(dd<score){score=dd;best=d;}
    }
    return best;
  }
  function steerToward(g,d,x,y,speed,dt){
    if(g.hasLineOfSight&&!g.hasLineOfSight(d.x,d.y,x,y,Math.max(2,(d.r||8)*.45))&&g.novaBattlefieldWaypoint){
      var wp=g.novaBattlefieldWaypoint(d.x,d.y,x,y,(d.r||8)+5,d.id);if(wp){x=wp.x;y=wp.y;}
    }
    var dx=x-d.x,dy=y-d.y,m=Math.hypot(dx,dy)||1,ux=dx/m,uy=dy/m;
    d.__novaVX=(d.__novaVX||0)*.30+ux*speed*.70;d.__novaVY=(d.__novaVY||0)*.30+uy*speed*.70;
    d.x+=ux*Math.min(m,speed*dt*.52);d.y+=uy*Math.min(m,speed*dt*.52);d.angle=Math.atan2(uy,ux);
  }
  function repairDrone(g,d,owner,dt){
    var max=d.maxHp||d.hp||1;if(d.__cwLastHp==null)d.__cwLastHp=d.hp;
    if(d.hp<d.__cwLastHp-.01)d.__cwRepairWait=2.8;else d.__cwRepairWait=Math.max(0,(d.__cwRepairWait||0)-dt);
    d.__cwLastHp=d.hp;var f=d.hp/max;
    if(f<.36)d.__cwRepairing=true;else if(f>.84)d.__cwRepairing=false;
    if(!d.__cwRepairing)return false;
    if(d.__novaPhase==='dash')return false;
    if(d.__novaPhase==='windup'||d.__novaPhase!=='recover'){d.__novaPhase='recover';d.__novaCommitted=false;d.__novaTarget=null;d.targetRef=null;}
    steerToward(g,d,owner.x,owner.y,Math.max(150,(d.speed||180)*1.08),dt);
    var near=dist2(d.x,d.y,owner.x,owner.y)<145*145,combat=!!hostileDroneNear(g,owner,225);
    if(near&&!combat&&(d.__cwRepairWait||0)<=0){
      d.hp=Math.min(max,d.hp+max*.105*dt);
      if((g.time||0)>(d.__cwRepairFxAt||0)){d.__cwRepairFxAt=(g.time||0)+.34;if(g.addRing)g.addRing(d.x,d.y,'#8fffd0',10);}
    }
    return true;
  }
  function peelScreen(g,group,owner,threat,dt){
    if(!threat)return;
    var count=Math.max(1,Math.ceil(group.length*(owner.isPlayer ? .36 : .28)));
    var tx=threat.x+(threat.__novaVX||0)*.18,ty=threat.y+(threat.__novaVY||0)*.18;
    for(var i=0;i<count&&i<group.length;i++){
      var d=group[i];if(!d||d.hp<=0||d.__cwRepairing||d.__novaPhase==='dash')continue;
      steerToward(g,d,tx,ty,Math.max(190,(d.speed||190)*1.12),dt);d.__cwPeelUntil=(g.time||0)+.16;
      var rr=(d.r||8)+(threat.r||8)+9;
      if(dist2(d.x,d.y,threat.x,threat.y)<rr*rr&&(d.attackCd||0)<=0){
        if(g.damageDrone){var prevOwner=g.__novaDroneDamageOwner;g.__novaDroneDamageOwner=owner.id;try{g.damageDrone(threat,Math.max(5,(d.damage||8)*.75),owner.id);}finally{g.__novaDroneDamageOwner=prevOwner;}}d.attackCd=.38;
        d.__novaVX*=.45;d.__novaVY*=.45;
      }
    }
  }
  function maintainAIScreen(g,group,owner,dt){
    if(owner.isPlayer||!owner.__novaCommandAI||!group.length)return;
    var plan=owner.__novaCommandAI,target=plan.targetId>=0&&g.getTank?g.getTank(plan.targetId):null;
    var fraction=plan.pressure==='probe' ? .58 : .30,count=Math.max(1,Math.ceil(group.length*fraction));
    var face=target?Math.atan2(target.y-owner.y,target.x-owner.x):(owner.angle||0),px=-Math.sin(face),py=Math.cos(face);
    for(var i=0;i<count&&i<group.length;i++){
      var d=group[i];if(!d||d.hp<=0||d.__cwRepairing||d.__novaPhase==='dash')continue;
      if(d.__novaPhase==='windup'){d.__novaPhase='recover';d.__novaPhaseT=.16;d.__novaCommitted=false;d.__novaTarget=null;d.targetRef=null;}
      var lane=i-(count-1)*.5,depth=58+(i%2)*18,sx=owner.x+Math.cos(face)*depth+px*lane*34,sy=owner.y+Math.sin(face)*depth+py*lane*34;
      steerToward(g,d,sx,sy,Math.max(150,(d.speed||180)*.92),dt);
    }
  }
  function flankPressure(g,group,owner,dt){
    if(owner.isPlayer||!owner.__novaCommandAI||owner.__novaCommandAI.pressure!=='breach')return;
    var p=owner.__novaCommandAI,target=p.targetId>=0&&g.getTank?g.getTank(p.targetId):null;if(!target)return;
    var dx=target.x-owner.x,dy=target.y-owner.y,m=Math.hypot(dx,dy)||1,px=-dy/m,py=dx/m,side=p.flankSide||1;
    var start=Math.floor(group.length*.72),fx=target.x+px*side*115,fy=target.y+py*side*115;
    for(var i=start;i<group.length;i++){
      var d=group[i];if(!d||d.hp<=0||d.__cwRepairing||d.__novaPhase==='dash'||d.__novaPhase==='windup')continue;
      steerToward(g,d,fx,fy,Math.max(170,(d.speed||180)*1.04),dt);
    }
  }
  function postProcessControllers(g,dt){
    if(!g.drones||!g.tanks)return;
    var groups=Object.create(null),i,d;
    for(i=0;i<g.drones.length;i++){
      d=g.drones[i];if(!d||d.hp<=0||d.__novaSpotter)continue;
      var owner=g.getTank&&g.getTank(d.ownerId);if(!owner||!owner.alive||!isController(owner))continue;
      (groups[owner.id]||(groups[owner.id]=[])).push(d);
    }
    Object.keys(groups).forEach(function(key){
      var owner=g.getTank(+key),group=groups[key];if(!owner)return;
      group.sort(function(a,b){return ((a.slot==null?a.__novaSlot:a.slot)||0)-((b.slot==null?b.__novaSlot:b.slot)||0);});
      for(var j=0;j<group.length;j++)repairDrone(g,group[j],owner,dt);
      var threat=hostileDroneNear(g,owner,owner.isPlayer?285:245);
      maintainAIScreen(g,group,owner,dt);peelScreen(g,group,owner,threat,dt);flankPressure(g,group,owner,dt);
    });
  }

  function directControllerBullet(g,killer,victim){
    if(!g.bullets||!killer||!victim)return null;
    for(var i=0;i<g.bullets.length;i++){
      var b=g.bullets[i];if(!b||b.dead||b.ownerId!==killer.id||b.__cwDisrupted)continue;
      var rr=(b.r||4)+(victim.r||8)+10;if(dist2(b.x,b.y,victim.x,victim.y)<=rr*rr)return b;
    }
    return null;
  }
  var oldDamageDrone=Game.prototype.damageDrone;
  if(oldDamageDrone)Game.prototype.damageDrone=function(victim,dmg,killerId){
    var killer=killerId>=0&&this.getTank?this.getTank(killerId):null,b=(killer&&isController(killer)&&this.__novaDroneDamageOwner!==killerId)?directControllerBullet(this,killer,victim):null;
    var out=oldDamageDrone.apply(this,arguments);
    if(!b||!victim)return out;b.__cwDisrupted=true;
    var radius=62,r2=radius*radius,secondary=Math.max(2.5,(dmg||0)*.24);
    function disrupt(d){if(!d||d.hp<=0)return;d.__novaPhase='recover';d.__novaPhaseT=Math.max(d.__novaPhaseT||0,.18);d.__novaTarget=null;d.targetRef=null;d.__novaVX=(d.__novaVX||0)*.34;d.__novaVY=(d.__novaVY||0)*.34;}
    disrupt(victim);
    for(var i=0;i<this.drones.length;i++){
      var d=this.drones[i];if(!d||d===victim||d.hp<=0||d.ownerId===killer.id||dist2(victim.x,victim.y,d.x,d.y)>r2)continue;
      oldDamageDrone.call(this,d,secondary,killerId);disrupt(d);
    }
    if(this.addRing)this.addRing(victim.x,victim.y,'#d8f8ff',radius);
    return out;
  };

  var oldDrones=Game.prototype.updateDrones;
  if(oldDrones)Game.prototype.updateDrones=function(dt){
    planAIControllers(this);
    var input=this.input,realAim=input&&input.aim,realMouse=input&&input.mouseActive,player=this.player,restore=false;
    if(input&&player&&player.alive&&isController(player)){
      var c=commandState(player),target=c.targetId>=0&&this.getTank?this.getTank(c.targetId):null;
      if(c.mode==='target'){if(target&&target.alive){c.x=target.x;c.y=target.y;}else{c.mode='point';c.targetId=-1;}}
      input.aim=fakeAimFor(player,C[player.cls],c);input.mouseActive=false;restore=true;
    }
    var out;
    try{out=oldDrones.call(this,dt);}finally{if(restore){input.aim=realAim;input.mouseActive=realMouse;}}
    postProcessControllers(this,dt);
    return out;
  };

  var oldSetClass=Game.prototype.setClass;
  if(oldSetClass)Game.prototype.setClass=function(t,id){
    var was=isController(t),out=oldSetClass.call(this,t,id),now=isController(t);ensureCommandPad(this);
    if(t&&t.isPlayer&&now&&!was){
      var c=commandState(t);c.active=false;c.mode='recall';c.x=t.x;c.y=t.y;c.targetId=-1;c.tutorialUntil=(this.time||0)+9.5;
      if(t.__novaSwarm)t.__novaSwarm.tutorialUntil=0;
      if(this.toast)this.toast('❖ CONTROLLER LINK — CANNON AIM IS INDEPENDENT · TAP CMD TO STAMP · DRAG TO PLACE · DOUBLE-TAP RECALL','info');
      setPadStatus(this,'CMD',false);
    }else if(t&&t.isPlayer&&!now)setPadStatus(this,'CMD',false);
    return out;
  };
  var oldStart=Game.prototype.start;
  if(oldStart)Game.prototype.start=function(){var out=oldStart.apply(this,arguments);ensureCommandPad(this);return out;};
  var oldSync=Game.prototype.syncHud;
  if(oldSync)Game.prototype.syncHud=function(){var out=oldSync.apply(this,arguments);ensureCommandPad(this);return out;};
  var oldDestroy=Game.prototype.destroy;
  if(oldDestroy)Game.prototype.destroy=function(){var p=this.__novaCommandPad;if(p){if(p.__novaCleanup)p.__novaCleanup();if(p.parentNode)p.parentNode.removeChild(p);this.__novaCommandPad=null;}return oldDestroy.apply(this,arguments);};
});

wrap('game/render',function(renderMod,require){
  var old=renderMod.render;if(!old||old.__novaCommandWeave)return;
  var classes=require('./classes');
  function edgePoint(w,h,a,pad){var cx=w*.5,cy=h*.5,dx=Math.cos(a),dy=Math.sin(a),rx=Math.max(1,cx-pad),ry=Math.max(1,cy-pad),s=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);return{x:cx+dx*s,y:cy+dy*s};}
  function patched(g,w,h){
    old(g,w,h);if(!g||!g.ctx||!g.player||!g.player.alive)return;
    var ctx=g.ctx,now=g.time||0;
    if(isController(g.player)){
      var pc=commandState(g.player);
      if((pc.tutorialUntil||0)>now){
        ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.textAlign='center';ctx.font='800 9px Orbitron,system-ui';ctx.fillStyle='rgba(207,255,224,.90)';ctx.shadowBlur=10;ctx.shadowColor='#75f0a3';
        ctx.fillText('RIGHT STICK: CANNON · TAP CMD: STAMP · DRAG CMD: PLACE · DOUBLE-TAP: RECALL',g.w*.5,g.h*.72);
        ctx.font='700 10px Rajdhani,system-ui';ctx.fillStyle='rgba(170,220,190,.80)';ctx.shadowBlur=0;ctx.fillText('Drag a command close to your hull for SCREEN · explicit orders persist while you aim elsewhere',g.w*.5,g.h*.72+15);ctx.restore();
      }
    }
    for(var i=0;i<g.tanks.length;i++){
      var t=g.tanks[i],p=t&&t.__novaCommandAI;if(!t||!t.alive||t.isPlayer||!p||p.cueUntil<=now||p.targetId!==g.player.id||lineage(classes,t)!=='controller')continue;
      var sx=(t.x-g.cam.x)*(g.cam.zoom||1)+g.w*.5,sy=(t.y-g.cam.y)*(g.cam.zoom||1)+g.h*.5;
      if(sx>38&&sx<g.w-38&&sy>38&&sy<g.h-38)continue;
      var a=Math.atan2(t.y-g.player.y,t.x-g.player.x),e=edgePoint(g.w,g.h,a,42),pulse=.72+.28*Math.sin(now*13);
      ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.translate(e.x,e.y);ctx.rotate(a);ctx.globalAlpha=pulse;ctx.strokeStyle='#81ffad';ctx.fillStyle='rgba(80,255,142,.11)';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-5,-8);ctx.lineTo(-1,0);ctx.lineTo(-5,8);ctx.closePath();ctx.fill();ctx.stroke();ctx.rotate(-a);ctx.font='800 8px Orbitron,system-ui';ctx.textAlign='center';ctx.fillStyle='#aaffc2';ctx.fillText('SWARM FORMING',0,-15);ctx.restore();
    }
  }
  patched.__novaCommandWeave=true;renderMod.render=patched;
});

window.__NOVA_COMMAND_WEAVE__={version:VERSION,codename:CODENAME,date:'2026-08-08'};
window.__NOVA_COMMAND_WEAVE_TEST__={
  isControllerId:function(id){return !!CONTROLLER_IDS[id];},
  maxCommandRange:maxCommandRange,
  fakeAimFor:fakeAimFor,
  doubleTapMs:DOUBLE_TAP_MS,
  dragPx:DRAG_PX,
  buttonGuardMs:BUTTON_GUARD_MS
};
window.__NOVA_VERSION=VERSION;
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
