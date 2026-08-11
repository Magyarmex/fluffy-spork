/* NOVA TANKS v1.10.8 — Applied Power Parity
 * Rival AI scales from upgrades the player has actually assigned, not raw XP level.
 * Banking a stat point no longer gives every rival a free level of HP, damage,
 * projectile/drone scaling, tactical skill, or evolution progress.
 */
(function(){
'use strict';
if(window.__NOVA_APPLIED_POWER_PARITY__)return;
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.10.8] module registry unavailable');return;}

var VERSION='1.10.8',CODENAME='Applied Power Parity';
var STAT_KEYS=['damage','reload','bulletspeed','penetration','maxhp','regen','speed','body'];

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function spentStatPoints(player){
  var stats=player&&player.stats||{},total=0;
  for(var i=0;i<STAT_KEYS.length;i++){
    var value=Number(stats[STAT_KEYS[i]]);
    if(Number.isFinite(value)&&value>0)total+=Math.floor(value);
  }
  return total;
}
function appliedPowerLevel(player,maxLevel){
  var raw=Math.max(1,Math.floor(Number(player&&player.level)||1));
  var cap=Math.max(1,Math.floor(Number(maxLevel)||raw));
  return clamp(1+spentStatPoints(player),1,Math.min(raw,cap));
}
function wrap(id,after){
  var old=mods[id];if(!old)return;
  mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};
}
function withAppliedPlayerLevel(game,fn,args,scope){
  var player=game&&game.player;
  if(!player)return fn.apply(scope,args);
  var raw=player.level,level=typeof game.appliedPowerLevel==='function'?game.appliedPowerLevel():appliedPowerLevel(player,raw);
  player.level=level;
  try{return fn.apply(scope,args);}finally{player.level=raw;}
}

window.__NOVA_VERSION=VERSION;
window.__NOVA_APPLIED_POWER_PARITY__={
  version:VERSION,codename:CODENAME,date:'2026-08-10',
  headline:'Enemy power now follows points you have actually committed to the build, not points still sitting in the upgrade tray.'
};
window.__NOVA_APPLIED_POWER_PARITY_TEST__={
  statKeys:STAT_KEYS.slice(),
  spentStatPoints:spentStatPoints,
  appliedPowerLevel:appliedPowerLevel
};

/* Predator/legacy AI compares player.level against rival level for threat posture.
 * Present the same applied-power value during AI thinking so banked points do not
 * secretly alter fear, chase, vision-side decisions, or tactical confidence. */
wrap('game/ai',function(ai){
  if(!ai||typeof ai.updateAI!=='function'||ai.updateAI.__novaAppliedPowerParity)return;
  var oldUpdateAI=ai.updateAI;
  function updateAI(t,g,dt){
    if(!g||!g.player)return oldUpdateAI.apply(this,arguments);
    return withAppliedPlayerLevel(g,oldUpdateAI,arguments,this);
  }
  updateAI.__novaAppliedPowerParity=true;
  ai.updateAI=updateAI;
});

wrap('game/engine',function(engine,require){
  var Game=engine&&engine.Game;
  if(!Game||Game.prototype.__novaAppliedPowerParity)return;
  Game.prototype.__novaAppliedPowerParity=true;
  var types=require('./types')||{},MAX_LEVEL=Number(types.MAX_LEVEL)||45;

  Game.prototype.appliedPowerLevel=function(){
    return appliedPowerLevel(this.player,MAX_LEVEL);
  };

  /* spawnAITank currently derives its level directly from this.player.level and
   * ignores its level argument. Temporarily exposing the applied level keeps the
   * canonical spawn/evolution/stat allocator intact without copying that logic. */
  var oldSpawnAITank=Game.prototype.spawnAITank;
  if(typeof oldSpawnAITank==='function'){
    Game.prototype.spawnAITank=function(level,arch,elite){
      var effective=this.appliedPowerLevel();
      return withAppliedPlayerLevel(this,oldSpawnAITank,[effective,arch,elite],this);
    };
  }

  /* Hard-cap every AI level-up path to applied power. This prevents future or
   * older systems from accidentally bypassing parity by passing raw player level. */
  var oldLevelAITo=Game.prototype.levelAITo;
  if(typeof oldLevelAITo==='function'){
    Game.prototype.levelAITo=function(t,target){
      var cap=this.appliedPowerLevel(),requested=Number(target);
      if(!Number.isFinite(requested))requested=cap;
      return oldLevelAITo.call(this,t,Math.min(requested,cap));
    };
  }

  /* Preserve the canonical arena sync but make its player-level read resolve to
   * the applied level. Existing AI never needs down-leveling: assigned points are
   * monotonic during a run, while raw XP can rise without changing this value. */
  var oldSyncAILevels=Game.prototype.syncAILevels;
  if(typeof oldSyncAILevels==='function'){
    Game.prototype.syncAILevels=function(){
      return withAppliedPlayerLevel(this,oldSyncAILevels,arguments,this);
    };
  }

  /* Raw level-up still awards the point immediately, but rivals remain unchanged
   * until upgradeStat successfully consumes it. Spending the point advances the
   * applied level and synchronizes every living rival at that exact moment. */
  var oldUpgradeStat=Game.prototype.upgradeStat;
  if(typeof oldUpgradeStat==='function'){
    Game.prototype.upgradeStat=function(key){
      var before=this.appliedPowerLevel(),pointsBefore=this.statPoints;
      var result=oldUpgradeStat.apply(this,arguments);
      var after=this.appliedPowerLevel();
      if(after>before&&this.statPoints<pointsBefore){
        if(typeof this.syncAILevels==='function')this.syncAILevels();
        if(typeof this.syncHud==='function')this.syncHud();
      }
      return result;
    };
  }
});

console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
