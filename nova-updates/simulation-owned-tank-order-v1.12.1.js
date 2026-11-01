/* NOVA: simulation-owned depth order. Render never changes live tank iteration order.
 * Preserve the established 60Hz update->render ordering while keeping out-of-band
 * spawns/redeploys sorted before the next simulation update.
 */
(function(){
  'use strict';
  const modules = window.__novaModules;
  const previousFactory = modules && modules['game/engine'];
  if (typeof previousFactory !== 'function') {
    console.error('[NOVA tank order] canonical engine module missing');
    return;
  }
  modules['game/engine'] = function(module,exports,require){
    previousFactory(module,exports,require);
    const Game = module.exports.Game;
    if (!Game || Game.prototype.__novaSimulationTankOrder) return;
  const order = g => { if (Array.isArray(g.tanks)) g.tanks.sort((a,b)=>a.y-b.y); };
  const update = Game.prototype.update;
  const redeploy = Game.prototype.redeploy;
  const spawnAITank = Game.prototype.spawnAITank;
  const spawnPlayer = Game.prototype.spawnPlayer;
  Game.prototype.update = function(dt){
    if (this.__novaOrderReady) order(this);
    this.__novaOrderTickActive = true;
    let result;
    try { result = update.apply(this,arguments); }
    finally {
      this.__novaOrderTickActive = false;
      this.__novaOrderReady = true;
      order(this);
    }
    return result;
  };
  Game.prototype.redeploy = function(){
    this.__novaOrderRedeployActive = true;
    let result;
    try { result = redeploy.apply(this,arguments); }
    finally { this.__novaOrderRedeployActive = false; if(this.__novaOrderReady && !this.__novaOrderTickActive) order(this); }
    return result;
  };
  Game.prototype.spawnAITank = function(){
    const result = spawnAITank.apply(this,arguments);
    if(this.__novaOrderReady && !this.__novaOrderTickActive && !this.__novaOrderRedeployActive) order(this);
    return result;
  };
  Game.prototype.spawnPlayer = function(){
    const result = spawnPlayer.apply(this,arguments);
    if(this.__novaOrderReady && !this.__novaOrderTickActive && !this.__novaOrderRedeployActive) order(this);
    return result;
  };
    Object.defineProperty(Game.prototype,'__novaSimulationTankOrder',{value:true});
  };
})();
