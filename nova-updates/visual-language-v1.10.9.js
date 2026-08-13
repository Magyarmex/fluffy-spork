/* NOVA TANKS v1.10.9 — Signal Discipline
 * Visual-language cleanup and forward contract.
 *
 * NOVA_VISUAL_INTENT: signal-director | state/readiness/confirmation | reticle
 * Reason: collapse duplicate self-feedback into one low-salience primary cue.
 * NOVA_VISUAL_INTENT: critical-health | threat/state | edge
 * Reason: preserve urgent health communication without a full-screen alarm frame.
 *
 * Historical release files stay immutable. This layer loads last, suppresses a
 * small set of known redundant legacy emissions, then renders one authoritative
 * player-centric signal per channel.
 */
(function(){
'use strict';
if(window.__NOVA_SIGNAL_DISCIPLINE__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.10.9] module registry unavailable');return;}

var VERSION='1.10.9',CODENAME='Signal Discipline',TAU=Math.PI*2;
var INTENTS={confirmation:1,threat:1,readiness:1,state:1,spatial:1,identity:1};
var CHANNELS={reticle:1,edge:1,world:1,hud:1,chassis:1};
var registry=Object.create(null),suppressed=Object.create(null);

window.__NOVA_SIGNAL_DISCIPLINE__={version:VERSION,codename:CODENAME,date:'2026-08-10'};
window.__NOVA_VISUAL_LANGUAGE_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-10',
  headline:'The player tank returns to a clean baseline: visuals must communicate a decision-relevant fact, in one deliberate place, without decorating the same event twice.',
  groups:{
    'Clean Chassis Baseline':[
      'Powerups, abilities, evolution, focus readiness, near-misses, kills and drone losses no longer stack duplicate rings or particle blooms on the player or target when another authoritative cue already exists.',
      'Firing itself gets no extra reticle flourish: projectile, muzzle response and audio already say that the shot happened.',
      'Critical health keeps a restrained edge cue rather than a pulsing full-frame box; death receives no extra red frame because the death state is already unambiguous.'
    ],
    'One Signal, One Job':[
      'Reticle space is arbitrated: hit/kill confirmation wins first, then state transitions, weapon readiness and Sniper focus. These cues do not stack on top of one another.',
      'Incoming-damage direction remains an independent edge threat signal, while spatial battlefield information stays attached to the relevant world object.',
      'Sniper focus uses one thin progress arc instead of the older arc plus segmented halo plus percentage/READY decoration.'
    ],
    'Future Visual Contract':[
      'Every new visual must declare what player question it answers, why that information changes a decision, and which single primary channel owns it.',
      'World-space effects are reserved for information whose location matters; reticle effects are for aim/action; edge effects are for directional threats; persistent scalar state belongs in HUD.',
      'Pure style is allowed only when it stays low-salience and clarifies identity, material or geometry without impersonating gameplay state.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function now(g){return g&&Number.isFinite(g.time)?g.time:(typeof performance!=='undefined'?performance.now()/1000:0);}
function near(x,y,t,pad){if(!t||!Number.isFinite(x)||!Number.isFinite(y))return false;var dx=x-t.x,dy=y-t.y,r=pad||2;return dx*dx+dy*dy<=r*r;}
function countSuppressed(key){suppressed[key]=(suppressed[key]||0)+1;}

function normalizeSpec(spec){
  if(!spec||typeof spec!=='object')throw new TypeError('visual intent spec required');
  var out={id:String(spec.id||''),intent:String(spec.intent||''),channel:String(spec.channel||''),question:String(spec.question||''),reason:String(spec.reason||''),duration:spec.duration==null?'event':String(spec.duration)};
  if(!out.id)throw new Error('visual intent id required');
  if(!INTENTS[out.intent])throw new Error('unknown visual intent: '+out.intent);
  if(!CHANNELS[out.channel])throw new Error('unknown visual channel: '+out.channel);
  if(out.question.trim().length<8)throw new Error('visual intent must state the player question it answers');
  if(out.reason.trim().length<12)throw new Error('visual intent must explain decision value');
  return out;
}
function register(spec){var out=normalizeSpec(spec);registry[out.id]=out;return out;}
function registerMany(list){for(var i=0;i<list.length;i++)register(list[i]);}
function audit(){
  var items=Object.keys(registry).map(function(k){return registry[k];});
  return{version:VERSION,valid:items.length>0,registered:items.length,items:items,suppressed:Object.assign({},suppressed),rules:{onePrimaryVisual:true,cleanPlayerBaseline:true,worldRequiresLocation:true}};
}
window.NOVAVisuals={version:VERSION,intents:Object.keys(INTENTS),channels:Object.keys(CHANNELS),register:register,registerMany:registerMany,audit:audit};

registerMany([
  {id:'incoming-damage-direction',intent:'threat',channel:'edge',question:'Where did the damaging attack come from?',reason:'Direction changes the immediate dodge, cover and retaliation decision.',duration:'transient'},
  {id:'hit-confirmation',intent:'confirmation',channel:'reticle',question:'Did my aimed attack actually deal damage?',reason:'Confirmation determines whether to keep tracking, correct aim or change target.',duration:'transient'},
  {id:'weapon-ready',intent:'readiness',channel:'reticle',question:'Can this deliberate weapon fire again now?',reason:'Readiness changes shot timing for weapons with meaningful recovery windows.',duration:'transient'},
  {id:'sniper-focus',intent:'state',channel:'reticle',question:'How close is the current precision shot to full focus?',reason:'Focus directly changes whether holding, releasing or aborting the shot is optimal.',duration:'while-active'},
  {id:'critical-health',intent:'threat',channel:'edge',question:'Am I in a health state where one more mistake is likely lethal?',reason:'Critical health changes aggression, cover, disengage and repair decisions.',duration:'while-critical'},
  {id:'controller-command-space',intent:'spatial',channel:'world',question:'Where is my swarm currently being asked to operate?',reason:'Command position is physical battlefield information required to steer the swarm.',duration:'while-commanded'},
  {id:'hostile-drone-commitment',intent:'threat',channel:'world',question:'Which hostile drone has committed an attack line toward me?',reason:'The line creates a short movement or direct-fire counterplay decision.',duration:'while-winding'},
  {id:'chassis-material-identity',intent:'identity',channel:'chassis',question:'What kind of machine and lineage am I looking at?',reason:'Quiet material and lineage cues improve recognition without implying temporary state.',duration:'persistent'}
]);

/* Gate only exact legacy signatures that are known duplicates. This is not a
 * blanket ban on rings/particles: mechanical radii, projectile impacts, terrain
 * feedback and world-space warnings remain untouched. */
function shouldSuppressLegacy(ctx,method,args){
  if(!ctx||!ctx.kind)return false;
  var t=ctx.target,x=args[0],y=args[1],col=args[2],r=args[3];
  if(ctx.kind==='pickup'&&t&&t.isPlayer&&near(x,y,t,2)){
    if(method==='addRing'&&r===42)return true;
    if(method==='addParticles'&&r===7&&args[4]===72&&args[5]==='glow')return true;
  }
  if(ctx.kind==='ability'&&t&&t.isPlayer&&near(x,y,t,2)&&method==='addRing'&&r===36)return true;
  if(ctx.kind==='evolve'&&t&&near(x,y,t,2)){
    if(method==='addRing'&&(r===48||r===62))return true;
    if(method==='addParticles'&&r===12&&args[4]===105&&args[5]==='glow')return true;
  }
  if(ctx.kind==='update'&&t){
    if(method==='addRing'&&near(x,y,t,2)&&((r===38&&col==='#d8c0ff')||(r===30&&col==='#ffd98a')))return true;
    if(method==='addParticles'&&near(x,y,t,2)&&col==='#d9f7ff'&&(r===4||r===7)&&args[4]===70&&args[5]==='glow')return true;
    if(method==='addText'&&String(args[2]||'')==='EVADED'&&Math.abs(x-t.x)<4&&Math.abs(y-t.y)<48)return true;
  }
  if(ctx.kind==='kill'&&t&&near(x,y,t,2)&&method==='addRing'&&col==='#ffffff'&&r===44)return true;
  if(ctx.kind==='drone'&&t&&near(x,y,t,2)&&method==='addRing'&&(r===20||r===28))return true;
  return false;
}
function withGate(g,ctx,fn){
  if(!g)return fn();
  var names=['addRing','addParticles','addText'],old={},changed=[];
  for(var i=0;i<names.length;i++){
    (function(name){
      if(typeof g[name]!=='function')return;
      old[name]=g[name];changed.push(name);
      g[name]=function(){
        if(shouldSuppressLegacy(ctx,name,arguments)){countSuppressed(ctx.kind+':'+name);return;}
        return old[name].apply(g,arguments);
      };
    })(names[i]);
  }
  try{return fn();}finally{for(var j=0;j<changed.length;j++)g[changed[j]]=old[changed[j]];}
}

wrap('game/engine',function(engine){
  var Game=engine.Game;if(!Game||Game.prototype.__novaSignalDiscipline)return;
  Game.prototype.__novaSignalDiscipline=true;

  function gateMethod(name,kind,targetFromArgs,when){
    var old=Game.prototype[name];if(!old)return;
    Game.prototype[name]=function(){
      var args=arguments,target=targetFromArgs?targetFromArgs.call(this,args):this.player;
      if(when&&!when.call(this,args,target))return old.apply(this,args);
      var self=this;return withGate(this,{kind:kind,target:target},function(){return old.apply(self,args);});
    };
  }
  gateMethod('applyPowerup','pickup',function(a){return a[0];},function(a,t){return !!(t&&t.isPlayer);});
  gateMethod('useAbility','ability',function(a){return a[0];},function(a,t){return !!(t&&t.isPlayer);});
  ['applyClass','applyPerk','applyGene'].forEach(function(name){gateMethod(name,'evolve',function(){return this.player;},function(a,t){return !!t;});});
  gateMethod('update','update',function(){return this.player;},function(a,t){return !!t;});
  gateMethod('damageTank','kill',function(a){return a[0];},function(a,t){var pl=this.player,k=a[2];return !!(pl&&t&&t.id!==pl.id&&k===pl.id);});
  gateMethod('damageDrone','drone',function(a){return a[0];},function(a,t){return !!t;});
});

function saveFeedback(s){
  if(!s)return null;
  return{shotUntil:s.shotUntil,hitUntil:s.hitUntil,hitKill:s.hitKill,hitPower:s.hitPower,hitColor:s.hitColor,readyUntil:s.readyUntil,powerUntil:s.powerUntil,powerColor:s.powerColor,abilityUntil:s.abilityUntil,abilityColor:s.abilityColor,evolveUntil:s.evolveUntil,critical:s.critical,deathUntil:s.deathUntil};
}
function muteLegacyFeedback(s){
  if(!s)return;
  s.shotUntil=0;s.hitUntil=0;s.readyUntil=0;s.powerUntil=0;s.abilityUntil=0;s.evolveUntil=0;s.critical=false;s.deathUntil=0;
}
function restoreFeedback(s,v){if(!s||!v)return;Object.keys(v).forEach(function(k){s[k]=v[k];});}
function tickCross(ctx,cx,cy,r,len,col,a,w){
  ctx.save();ctx.strokeStyle=col;ctx.globalAlpha=a;ctx.lineWidth=w||1.4;ctx.lineCap='round';
  for(var i=0;i<4;i++){var q=i*Math.PI*.5+.785398,ux=Math.cos(q),uy=Math.sin(q);ctx.beginPath();ctx.moveTo(cx+ux*r,cy+uy*r);ctx.lineTo(cx+ux*(r+len),cy+uy*(r+len));ctx.stroke();}
  ctx.restore();
}
function sideBrackets(ctx,cx,cy,r,col,a){
  ctx.save();ctx.strokeStyle=col;ctx.globalAlpha=a;ctx.lineWidth=1.3;ctx.beginPath();
  ctx.moveTo(cx-r-5,cy-4);ctx.lineTo(cx-r,cy-4);ctx.lineTo(cx-r,cy+4);ctx.lineTo(cx-r-5,cy+4);
  ctx.moveTo(cx+r+5,cy-4);ctx.lineTo(cx+r,cy-4);ctx.lineTo(cx+r,cy+4);ctx.lineTo(cx+r+5,cy+4);ctx.stroke();ctx.restore();
}
function drawCriticalCorners(ctx,w,h,frac){
  if(frac<=0||frac>.28)return;var urg=clamp((.29-frac)/.22,.12,1),len=12+urg*7,a=.10+urg*.12;
  ctx.save();ctx.strokeStyle='#ff5f78';ctx.globalAlpha=a;ctx.lineWidth=2;ctx.beginPath();
  ctx.moveTo(6,6+len);ctx.lineTo(6,6);ctx.lineTo(6+len,6);ctx.moveTo(w-6-len,6);ctx.lineTo(w-6,6);ctx.lineTo(w-6,6+len);
  ctx.moveTo(6,h-6-len);ctx.lineTo(6,h-6);ctx.lineTo(6+len,h-6);ctx.moveTo(w-6-len,h-6);ctx.lineTo(w-6,h-6);ctx.lineTo(w-6,h-6-len);ctx.stroke();ctx.restore();
}
function drawPrimary(g,w,h,saved,focus){
  if(!g||!g.ctx||!g.player)return;var ctx=g.ctx,tm=now(g),cx=w*.5,cy=h*.5,pl=g.player;
  ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);
  var primary='none';
  if(saved&&saved.hitUntil>tm){
    primary=saved.hitKill?'kill':'hit';tickCross(ctx,cx,cy,saved.hitKill?10:8,4,saved.hitKill?'#ffffff':'#d8f7ff',saved.hitKill?.86:.68,saved.hitKill?1.9:1.4);
  }else if(saved&&saved.evolveUntil>tm){
    primary='evolve';tickCross(ctx,cx,cy,12,3,pl.color||'#d8f7ff',.55,1.35);
  }else if(saved&&saved.abilityUntil>tm){
    primary='ability';ctx.save();ctx.strokeStyle=saved.abilityColor||'#d8f7ff';ctx.globalAlpha=.54;ctx.lineWidth=1.35;ctx.beginPath();ctx.arc(cx,cy,19,-Math.PI*.72,-Math.PI*.28);ctx.stroke();ctx.restore();
  }else if(saved&&saved.powerUntil>tm){
    primary='power';ctx.save();ctx.strokeStyle=saved.powerColor||'#d8f7ff';ctx.globalAlpha=.50;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(cx,cy,19,Math.PI*.28,Math.PI*.72);ctx.stroke();ctx.restore();
  }else if(saved&&saved.readyUntil>tm){
    primary='ready';sideBrackets(ctx,cx,cy,17,'#bff7ff',.58);
  }else if(focus>.01){
    primary='focus';var q=clamp(focus,0,1);ctx.save();ctx.strokeStyle=q>=.92?'#e9ddff':'#c493ff';ctx.globalAlpha=.34+.32*q;ctx.lineWidth=1.45;ctx.beginPath();ctx.arc(cx,cy,24,-Math.PI*.5,-Math.PI*.5+TAU*q);ctx.stroke();if(q>=.92){ctx.fillStyle='#ffffff';ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(cx,cy-24,1.8,0,TAU);ctx.fill();}ctx.restore();
  }
  var frac=(Number(pl.hp)||0)/Math.max(1,Number(pl.maxHp)||Number(pl.hp)||1);if(pl.alive!==false)drawCriticalCorners(ctx,w,h,frac);
  ctx.restore();
  window.__NOVA_VISUAL_LANGUAGE_LAST__={time:tm,primary:primary,focus:focus,critical:frac>0&&frac<=.28,suppressed:Object.assign({},suppressed)};
}

wrap('game/render',function(render,require){
  var old=render.render;if(!old||old.__novaSignalDiscipline)return;
  var classes=require('./classes'),C=classes&&classes.CLASSES||{};
  function isRail(t){var d=t&&C[t.cls];return !!(d&&d.fireMode==='beam');}
  function patched(g,w,h){
    if(!g||!g.ctx||!g.player)return old(g,w,h);
    var s=g.__v191Feedback,pl=g.player,saved=saveFeedback(s),focus=isRail(pl)?clamp(Number(pl.__novaFocus)||0,0,1):0,oldFocus=pl.__novaFocus;
    muteLegacyFeedback(s);if(focus>0)pl.__novaFocus=0;
    try{old(g,w,h);}finally{restoreFeedback(s,saved);if(focus>0)pl.__novaFocus=oldFocus;}
    drawPrimary(g,w,h,saved,focus);
  }
  patched.__novaSignalDiscipline=true;render.render=patched;
});

window.__NOVA_VISUAL_LANGUAGE_TEST__={normalizeSpec:normalizeSpec,shouldSuppressLegacy:shouldSuppressLegacy,saveFeedback:saveFeedback,version:VERSION};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' visual language online');
})();
