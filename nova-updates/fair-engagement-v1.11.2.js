/* NOVA TANKS v1.11.2 — Fair Engagement
 * Three fairness/reliability corrections:
 * 1) Rival hull perception mirrors the live player gameplay viewport in world
 *    space, including current canvas dimensions, zoom and device rotation.
 *    Sniper Forward Observer relays are the one deliberate remote-sight exception.
 * 2) Target selection has no player-only priority term. Distance, vulnerability,
 *    danger, retaliation, commitment and mild target saturation apply equally to
 *    every relevant hostile tank, so gangs remain possible without a human magnet.
 * 3) A held Controller aim inside the historical 4-unit dead zone remains a live
 *    minimum-range Command Node. Releasing the stick still recalls normally.
 */
(function(){
'use strict';
if(window.__NOVA_FAIR_ENGAGEMENT__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.11.2] module registry unavailable');return;}

var VERSION='1.11.2',CODENAME='Fair Engagement';
var CONTROLLER={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};
var SNIPER={marksman:1,railgun:1,ghost:1,singularity:1,prism:1,specter:1,assassin:1};
var CLOSE_AIM_MAG=4.25;
var NORMAL_REPLAN=.18,ELITE_REPLAN=.12,SATURATION_PENALTY=.18;

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function alive(t){return !!t&&t.alive!==false&&(t.hp==null||t.hp>0);}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function lineage(classes,t){try{return t&&classes&&typeof classes.lineageForClass==='function'?classes.lineageForClass(t.cls):null;}catch(_){return null;}}
function isController(t){return !!(t&&CONTROLLER[t.cls]);}
function isSniper(classes,t){return lineage(classes,t)==='sniper'||!!(t&&SNIPER[t.cls]);}

/* The game renders the world through g.cam.zoom into a g.w × g.h CSS-pixel
 * viewport. Reusing those exact live values means portrait/landscape changes,
 * resize, DPR-independent CSS geometry and camera zoom all change AI sight on
 * the same frame budget as the player's view. */
function viewportHalfExtents(g){
  var z=Number(g&&g.cam&&g.cam.zoom);if(!(z>0))z=Number(g&&g.zoom);if(!(z>0))z=1;
  return{x:Math.max(0,Number(g&&g.w)||0)/(2*z),y:Math.max(0,Number(g&&g.h)||0)/(2*z),zoom:z};
}
function inGameplayViewport(g,observer,target){
  if(!g||!observer||!target||observer.id===target.id||!alive(target))return false;
  var e=viewportHalfExtents(g);
  return Math.abs(target.x-observer.x)<=e.x&&Math.abs(target.y-observer.y)<=e.y;
}
function hasSpotterRelay(g,classes,observer,target){
  if(!g||!observer||!target||!isSniper(classes,observer))return false;
  return observer.__novaSpotterContactId===target.id&&Number(observer.__novaSpotterContactUntil)>Number(g.time||0);
}
function canPerceive(g,classes,observer,target){
  return inGameplayViewport(g,observer,target)||hasSpotterRelay(g,classes,observer,target);
}
function hostile(g,a,b){
  if(!a||!b||a.id===b.id)return false;
  if(typeof g.areAllies==='function'&&g.areAllies(a,b))return false;
  if(typeof g.areHostile==='function')return !!g.areHostile(a,b);
  var keys=['teamId','team','factionId','faction','side'];
  for(var i=0;i<keys.length;i++){var k=keys[i];if(a[k]!=null&&b[k]!=null)return a[k]!==b[k];}
  return true;
}
function targetDanger(classes,t){
  var ln=lineage(classes,t),v=.45;
  if(ln==='sniper')v=.78;else if(ln==='cannon')v=.72;else if(ln==='controller')v=.68;else if(ln==='guardian')v=.64;else if(ln==='gunner')v=.62;
  if(t&&t.tier>=3)v+=.12;
  return clamp(v,0,1);
}
function saturation(g,targetId,selfId){
  var n=0,ts=g&&g.tanks||[];
  for(var i=0;i<ts.length;i++){
    var q=ts[i];if(!q||q.id===selfId||!q.ai||!alive(q))continue;
    var a=q.ai,id=a.__v1112TargetId>=0?a.__v1112TargetId:(a.__v1105TargetId>=0?a.__v1105TargetId:(a.__v180TargetId>=0?a.__v180TargetId:a.targetId));
    if(id===targetId&&(a.state==='hunt'||a.__v180Posture==='pressure'||a.__v180Posture==='flank'||a.__v180Posture==='route'))n++;
  }
  return n;
}
function scoreTarget(g,classes,observer,a,target,now){
  if(!alive(target)||!hostile(g,observer,target)||target.spawnShieldT>0||!canPerceive(g,classes,observer,target))return-Infinity;
  var dist=Math.hypot(target.x-observer.x,target.y-observer.y),near=1/(1+dist/720);
  var hp=clamp(Number(target.hp)/Math.max(1,Number(target.maxHp)||Number(target.hp)||1),0,1);
  var score=near*1.16+(1-hp)*.48+targetDanger(classes,target)*.30;
  if(a&&a.__v1112TargetId===target.id)score+=.16;
  if(a&&a.__v180LastAttacker===target.id&&now-Number(a.__v180HitAt||-99)<2.2)score+=.34;
  score-=saturation(g,target.id,observer.id)*SATURATION_PENALTY;
  /* Tiny deterministic tie breaker prevents identical bots from synchronizing
   * onto one equal-distance target. It is identity-neutral: isPlayer is never read. */
  var seed=Math.sin((observer.id||1)*17.17+(target.id||1)*31.73)*43758.5453;
  score+=(seed-Math.floor(seed)-.5)*.04;
  return score;
}
function chooseTarget(g,classes,observer,a,now){
  var best=null,bs=-Infinity,ts=g&&g.tanks||[];
  for(var i=0;i<ts.length;i++){
    var q=ts[i];if(!q||q.id===observer.id)continue;
    var s=scoreTarget(g,classes,observer,a,q,now);
    if(s>bs){bs=s;best=q;}
  }
  return best;
}
function replanDelay(t){return (t&&t.ai&&t.ai.isElite?ELITE_REPLAN:NORMAL_REPLAN)+(Math.abs(Number(t&&t.id)||0)%4)*.009;}
function fairTarget(g,classes,t,now){
  var a=t.ai||{},cur=a.__v1112TargetId>=0&&g.getTank?g.getTank(a.__v1112TargetId):null;
  var valid=cur&&alive(cur)&&hostile(g,t,cur)&&canPerceive(g,classes,t,cur)&&cur.spawnShieldT<=0;
  if(!valid||now>=Number(a.__v1112NextThink||0)){
    cur=chooseTarget(g,classes,t,a,now);
    a.__v1112TargetId=cur?cur.id:-1;
    a.__v1112NextThink=now+replanDelay(t);
  }
  return cur||null;
}

function closeAimVector(aim,fallbackAngle){
  if(!aim||!aim.active)return null;
  var dx=Number(aim.dx)||0,dy=Number(aim.dy)||0,m=Math.hypot(dx,dy);
  if(m>CLOSE_AIM_MAG||m>4)return null;
  var ang=m>.0001?Math.atan2(dy,dx):(Number(fallbackAngle)||0);
  var out={};for(var k in aim)out[k]=aim[k];
  out.active=true;out.dx=Math.cos(ang)*CLOSE_AIM_MAG;out.dy=Math.sin(ang)*CLOSE_AIM_MAG;out.__novaCloseCommand=true;
  return out;
}
function prepareClosePlayerAim(g){
  var p=g&&g.player,input=g&&g.input;if(!p||!isController(p)||!input)return function(){};
  var oldAim=input.aim,oldMouse=input.mouseActive,changed=false;
  var state=p.__novaSwarm,angle=state&&Number.isFinite(state.angle)?state.angle:(Number(p.angle)||0);
  var fixed=closeAimVector(oldAim,angle);
  if(fixed){input.aim=fixed;changed=true;}
  else if((!oldAim||!oldAim.active)&&input.mouseActive&&input.firing&&g.canvas&&g.cam){
    var rect=typeof g.canvas.getBoundingClientRect==='function'?g.canvas.getBoundingClientRect():{left:0,top:0};
    var z=Number(g.cam.zoom)||Number(g.zoom)||1;
    var wx=g.cam.x+(Number(input.mouseX)-rect.left-Number(g.w)*.5)/z;
    var wy=g.cam.y+(Number(input.mouseY)-rect.top-Number(g.h)*.5)/z;
    var dx=wx-p.x,dy=wy-p.y,m=Math.hypot(dx,dy);
    if(m<=5){
      var a=m>.0001?Math.atan2(dy,dx):angle;
      input.aim={active:true,dx:Math.cos(a)*CLOSE_AIM_MAG,dy:Math.sin(a)*CLOSE_AIM_MAG,__novaCloseCommand:true};
      input.mouseActive=false;changed=true;
    }
  }
  if(changed)window.__NOVA_FAIR_ENGAGEMENT__.closeNodeRescues++;
  return function(){if(changed){input.aim=oldAim;input.mouseActive=oldMouse;}};
}

window.__NOVA_VERSION=VERSION;
window.__NOVA_FAIR_ENGAGEMENT__={
  version:VERSION,codename:CODENAME,date:'2026-08-30',closeNodeRescues:0,targetReplans:0,
  contract:{gameplayViewportParity:true,adaptiveWidthHeight:true,adaptiveRotation:true,adaptiveZoom:true,globalMinimapRadar:false,spotterRelayException:true,playerPriorityBonus:false,saturationIsSoft:true,closeHeldAimRemainsCommand:true,releaseStillRecalls:true}
};
window.__NOVA_FAIR_ENGAGEMENT_TEST__={
  viewportHalfExtents:viewportHalfExtents,inGameplayViewport:inGameplayViewport,canPerceive:canPerceive,
  saturation:saturation,scoreTarget:scoreTarget,chooseTarget:chooseTarget,closeAimVector:closeAimVector,
  closeAimMagnitude:CLOSE_AIM_MAG,saturationPenalty:SATURATION_PENALTY
};
if(window.__NOVA_SHARED_BATTLEFIELD_VIEW__){
  window.__NOVA_SHARED_BATTLEFIELD_VIEW__.supersededBy=VERSION;
  if(window.__NOVA_SHARED_BATTLEFIELD_VIEW__.contract){
    window.__NOVA_SHARED_BATTLEFIELD_VIEW__.contract.globalLivingTankTracking=false;
    window.__NOVA_SHARED_BATTLEFIELD_VIEW__.contract.playerMinimapParity=false;
    window.__NOVA_SHARED_BATTLEFIELD_VIEW__.contract.gameplayViewportParity=true;
    window.__NOVA_SHARED_BATTLEFIELD_VIEW__.contract.spotterRelayException=true;
  }
}

/* Fair Engagement is deliberately the outermost AI information gate. Rather
 * than copying mature Predator/Battle Sense movement and firing code, it narrows
 * that whole legacy chain to exactly one fairly-selected perceived opponent.
 * Shared Battlefield View can still compute its full tactics, but cannot see or
 * score off-screen alternatives and therefore cannot resurrect global radar or
 * its historical +player priority term. */
wrap('game/ai',function(ai,require){
  var old=ai&&ai.updateAI;if(typeof old!=='function'||old.__novaFairEngagement)return;
  var classes=require('./classes')||{};
  function patched(t,g,dt){
    if(!t||!t.ai||t.isPlayer||!g||!Array.isArray(g.tanks))return old.apply(this,arguments);
    var a=t.ai,now=Number(g.time)||0,before=a.__v1112TargetId,target=fairTarget(g,classes,t,now);
    if(before!==a.__v1112TargetId)window.__NOVA_FAIR_ENGAGEMENT__.targetReplans++;
    var id=target?target.id:-1,changed=id!==a.__v1112InjectedId;
    a.__v1112InjectedId=id;
    if(changed)a.__v1105PlanT=0;

    var all=g.tanks,player=g.player,narrow=[t];
    if(target&&target.id!==t.id)narrow.push(target);
    g.tanks=narrow;
    /* Only the actual human remains the special g.player handle. AI-vs-AI
     * targets flow through nearest/target-id paths, avoiding accidental player
     * semantics in old code while still leaving only the chosen rival visible. */
    g.player=target&&target.isPlayer?target:null;
    var out;
    try{out=old.apply(this,arguments);}finally{g.tanks=all;g.player=player;}

    /* Older wrappers may rewrite compatibility target slots after execution.
     * Reassert only the information contract; flee state remains authoritative. */
    a.__v1112TargetId=id;
    a.__v1105TargetId=id;
    a.__v180TargetId=id;
    if(target&&alive(target)){
      if(a.state!=='flee'){a.targetId=id;if(a.state==='wander'||a.state==='farm')a.state='hunt';}
    }else if(a.state!=='flee'){
      a.targetId=-1;
      if(a.state==='hunt')a.state='wander';
    }
    return out;
  }
  patched.__novaFairEngagement=true;
  ai.updateAI=patched;
});

wrap('game/engine',function(engine,require){
  var Game=engine&&engine.Game;if(!Game||Game.prototype.__novaFairEngagement)return;
  Game.prototype.__novaFairEngagement=true;
  var classes=require('./classes')||{},C=classes.CLASSES||{};

  function targetFor(owner,g){
    var id=owner&&owner.ai&&owner.ai.__v1112TargetId;
    var t=id>=0&&g.getTank?g.getTank(id):null;
    return t&&alive(t)&&hostile(g,owner,t)&&canPerceive(g,classes,owner,t)?t:null;
  }
  function syncControllerPlans(g){
    var now=Number(g.time)||0,ts=g.tanks||[];
    for(var i=0;i<ts.length;i++){
      var owner=ts[i];if(!owner||!owner.alive||owner.isPlayer||!owner.ai||!isController(owner))continue;
      var target=targetFor(owner,g);
      if(!target){target=fairTarget(g,classes,owner,now);owner.ai.__v1112TargetId=target?target.id:-1;}
      var id=target?target.id:-1;

      /* Live Vector's private planner historically had an 850u hull / 520u
       * drone sensor and a player score multiplier. Feed its virtual thumb from
       * the fair hull target and keep that private sensor planner asleep. */
      var p=owner.__novaLiveVectorAI||(owner.__novaLiveVectorAI={thinkAt:0,commitUntil:0,targetId:-1,flankSide:(owner.id&1)?1:-1,pressure:'probe',releaseUntil:0,cueUntil:0,lastCueAt:-99,lastOwnHp:owner.hp,commandAngle:owner.angle||0,commandPower:0,active:false,now:now});
      p.now=now;p.thinkAt=now+.5;p.targetId=id;
      if(target){
        var helper=window.__NOVA_LIVE_VECTOR_TEST__,stick=helper&&typeof helper.aiVirtualStick==='function'?helper.aiVirtualStick(owner,C[owner.cls],target,p,null):null;
        if(stick){p.active=!!stick.active;p.commandAngle=stick.angle;p.commandPower=stick.power;}
        else{var ang=Math.atan2(target.y-owner.y,target.x-owner.x);p.active=true;p.commandAngle=ang;p.commandPower=clamp(Math.hypot(target.x-owner.x,target.y-owner.y)/700,.08,1);}
        owner.ai.targetId=id;if(owner.ai.state!=='flee')owner.ai.state='hunt';
      }else{p.active=false;p.commandPower=0;if(owner.ai.state!=='flee')owner.ai.targetId=-1;}

      /* Retired Command Weave still exists underneath Live Vector. Prevent its
       * older drone-extended sensor from briefly overwriting the fair target. */
      var cp=owner.__novaCommandAI||(owner.__novaCommandAI={thinkAt:0,commitUntil:0,targetId:-1,flankSide:(owner.id&1)?1:-1,pressure:'probe',lastCueAt:-99,cueUntil:0,lastProgressAt:now,lastOwnHp:owner.hp});
      cp.thinkAt=now+.5;cp.targetId=id;
    }
  }

  var oldDrones=Game.prototype.updateDrones;
  if(typeof oldDrones==='function')Game.prototype.updateDrones=function(dt){
    syncControllerPlans(this);
    var restore=prepareClosePlayerAim(this),out;
    try{out=oldDrones.apply(this,arguments);}finally{restore();}
    return out;
  };
});

console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
