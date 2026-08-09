/* NOVA TANKS v1.9.3 — Quiet Relay
 * De-duplicate Forward Observer callouts without changing Spotter sensing,
 * target memory, relay markers, combat AI, or audio cues.
 */
(function(){
'use strict';
if(window.__NOVA_SPOTTER_COMMS_FIX__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.9.3] module registry unavailable; Spotter comms fix not installed');return;}

var VERSION='1.9.3',CODENAME='Quiet Relay';
var RULES={
  'CONTACT':{key:'friendly-contact',canonical:'CONTACT RELAY',cooldownMs:1400},
  'CONTACT RELAY':{key:'friendly-contact',canonical:'CONTACT RELAY',cooldownMs:1400},
  'SPOTTED':{key:'hostile-contact',canonical:'SPOTTED · RELAY',cooldownMs:1900},
  'SPOTTED · RELAY':{key:'hostile-contact',canonical:'SPOTTED · RELAY',cooldownMs:1900},
  'OBSERVER DOWN · LOCAL SIGHT ONLY':{key:'observer-down',canonical:'OBSERVER DOWN · LOCAL SIGHT ONLY',cooldownMs:1200},
  'OBSERVER LINK RESTORED':{key:'observer-restored',canonical:'OBSERVER LINK RESTORED',cooldownMs:1200}
};

function wrap(id,after){
  var original=mods[id];
  if(!original)return;
  mods[id]=function(module,exports,require){
    original(module,exports,require);
    after(module.exports,require);
  };
}
function ruleFor(text){return typeof text==='string'?RULES[text]||null:null;}
function clockMs(g){
  if(g&&Number.isFinite(g.time))return g.time*1000;
  if(typeof performance!=='undefined'&&performance&&typeof performance.now==='function')return performance.now();
  return Date.now();
}
function shouldPrint(g,text){
  var rule=ruleFor(text);
  if(!rule)return {allow:true,text:text,key:null};
  var state=g.__novaSpotterCommsState||(g.__novaSpotterCommsState=Object.create(null));
  var now=clockMs(g),last=state[rule.key];
  if(last!==undefined&&now-last<rule.cooldownMs)return {allow:false,text:rule.canonical,key:rule.key};
  state[rule.key]=now;
  return {allow:true,text:rule.canonical,key:rule.key};
}

wrap('game/engine',function(engine){
  var Game=engine&&engine.Game;
  if(!Game||Game.prototype.__novaSpotterCommsFix)return;
  var oldAddText=Game.prototype.addText;
  if(typeof oldAddText!=='function')return;
  Game.prototype.__novaSpotterCommsFix=true;
  Game.prototype.addText=function(x,y,text,color,size){
    var decision=shouldPrint(this,text);
    if(!decision.allow)return;
    return oldAddText.call(this,x,y,decision.text,color,size);
  };
});

window.__NOVA_VERSION=VERSION;
window.__NOVA_SPOTTER_COMMS_FIX__={
  version:VERSION,
  codename:CODENAME,
  date:'2026-08-08',
  friendlyCooldownMs:1400,
  hostileCooldownMs:1900,
  linkCooldownMs:1200,
  behavior:'Legacy and current Spotter callouts share one player-facing channel, so one acquisition produces one message and hostile Spotter swarms cannot flood the combat text pool.'
};
window.__NOVA_SPOTTER_COMMS_TEST__={ruleFor:ruleFor,shouldPrint:shouldPrint};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
