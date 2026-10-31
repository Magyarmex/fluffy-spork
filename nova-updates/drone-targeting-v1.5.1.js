/* NOVA TANKS v1.5.1 — autonomous drone target filter */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods)return;
function wrap(id,after){var o=mods[id];if(!o)return;mods[id]=function(module,exports,require){o(module,exports,require);after(module.exports,require);};}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y}
function ownerOf(g,d){if(!g||!d)return null;if(g.tankById&&g.tankById.get)return g.tankById.get(d.ownerId)||null;if(g.getTank)return g.getTank(d.ownerId)||null;return null;}
function sameSide(a,b){var keys=['teamId','team','factionId','faction','side'];for(var i=0;i<keys.length;i++){var k=keys[i];if(a&&b&&a[k]!=null&&b[k]!=null)return a[k]===b[k];}return null;}
function hostile(g,owner,t){if(!owner||!t||t.id===owner.id||t.alive===false)return false;if(typeof g.areAllies==='function'&&g.areAllies(owner,t))return false;if(typeof g.areHostile==='function')return !!g.areHostile(owner,t);var side=sameSide(owner,t);if(side!==null)return !side;return true;}
/* Fair Engagement owns AI viewport geometry. A native tank candidate or
 * fallback hostile must not bypass that gate merely because its position is
 * known on the minimap. Human-owned drones retain their existing autonomy;
 * visible in-frame tanks may still be pursued around cover. */
function fairDroneInView(g,owner,target){var fair=window.__NOVA_FAIR_ENGAGEMENT__;return !owner||owner.isPlayer||!owner.ai||!fair||typeof fair.inGameplayViewport!=='function'||fair.inGameplayViewport(g,owner,target);}
/* Forward Observer's fresh public relay is the one deliberate off-viewport
 * tank exception in Fair Engagement. Preserve it for Sniper-gene drones;
 * an arbitrary target ID or an expired relay must not become global radar. */
var SNIPER_IDS={marksman:1,railgun:1,ghost:1,singularity:1,prism:1,specter:1,assassin:1};
function fairTankPerceived(g,owner,t){
 if(fairDroneInView(g,owner,t))return true;
 /* A drone consumes its cached target before the Spotter scan this frame.
  * A contact ID/TTL from the last scan is not current offscreen sight. */
 var live=window.__NOVA_SPOTTER_LIVE_RELAY__;
 return !!(owner&&owner.ai&&!owner.isPlayer&&t&&SNIPER_IDS[owner.cls]&&
   typeof live==='function'&&live(g,owner,t));
}
function visible(g,a,b){if(!a||!b)return false;if(typeof g.hasLineOfSight==='function')return !!g.hasLineOfSight(a.x,a.y,b.x,b.y,2);var solids=g.__novaTerrain||[];for(var i=0;i<solids.length;i++){var s=solids[i];if(s&&s.solid!==false&&(!s.destructible||s.hp>0))return false;}return true;}
function combatFallback(g,d,owner,leash){var limit=leash||d.leash||500,best=null,bd=Math.pow(Math.min(limit,520),2),ownerBd=limit*limit,i,t,q;var tanks=g.tanks||[];for(i=0;i<tanks.length;i++){t=tanks[i];if(!hostile(g,owner,t)||t.spawnShieldT>0||d2(owner.x,owner.y,t.x,t.y)>ownerBd)continue;q=d2(d.x,d.y,t.x,t.y);if(q<bd&&fairTankPerceived(g,owner,t)&&visible(g,d,t)){bd=q;best=t;}}var drones=g.drones||[];for(i=0;i<drones.length;i++){t=drones[i];if(!t||t===d||t.hp<=0||t.__novaSpotter)continue;var other=ownerOf(g,t);if(!other||!hostile(g,owner,other)||d2(owner.x,owner.y,t.x,t.y)>ownerBd)continue;q=d2(d.x,d.y,t.x,t.y);if(q<bd&&fairDroneInView(g,owner,t)&&visible(g,d,t)){bd=q;best=t;}}return best;}
function nativeTargetAllowed(g,t,owner,d){if(!t)return false;if(t.kind==='tank')return !(t.spawnShieldT>0)&&hostile(g,owner,t)&&fairTankPerceived(g,owner,t);if(t.kind==='drone'){if(t.__novaSpotter||t.hp<=0)return false;var other=ownerOf(g,t);return !!(other&&hostile(g,owner,other)&&fairDroneInView(g,owner,t)&&visible(g,d,t));}return true;}
function neutralFallback(g,d,owner,leash){var limit=leash||d.leash||500,best=null,bd=Math.pow(Math.min(limit,520),2),ownerBd=limit*limit,shapes=g.shapes||[];for(var i=0;i<shapes.length;i++){var s=shapes[i];if(!s||s.hp<=0||d2(owner.x,owner.y,s.x,s.y)>ownerBd)continue;var q=d2(d.x,d.y,s.x,s.y);if(q<bd){bd=q;best=s;}}return best;}
wrap('game/engine',function(engine){var Game=engine.Game;if(!Game||Game.prototype.__novaSpotterAutoFilter)return;Game.prototype.__novaSpotterAutoFilter=true;var old=Game.prototype.acquireDroneTarget;Game.prototype.acquireDroneTarget=function(d,owner,leash){var t=old.call(this,d,owner,leash);if(nativeTargetAllowed(this,t,owner,d))return t;
 /* Protected spotters and allied combatants must never become autonomous attack targets.
    If the native selector returns one, preserve combat awareness by trying the nearest
    visible hostile combatant inside the same bounded leash before the historical
    neutral-shape fallback. Manual Controller designation remains outside this path. */
 var combat=combatFallback(this,d,owner,leash);if(combat)return combat;return neutralFallback(this,d,owner,leash);};
 /* A previously visible tank can cross the viewport boundary between the
  * staggered 0.22-0.31s legacy retarget ticks. Drop only AI-owned cached
  * tank pursuits that no longer have legal perception; leave player drones,
  * neutral farming, hostile-drone last-seen logic and fresh Sniper relays. */
 var oldUpdate=Game.prototype.updateDrones;
 if(typeof oldUpdate==='function')Game.prototype.updateDrones=function(dt){
  var ds=this.drones||[];
  for(var i=0;i<ds.length;i++){
   var drone=ds[i],owner=ownerOf(this,drone),target=drone&&drone.targetRef;
   if(owner&&owner.ai&&!owner.isPlayer&&target&&target.kind==='tank'&&
      !fairTankPerceived(this,owner,target)){
    drone.targetRef=null;drone.targetId=-1;
   }
  }
  return oldUpdate.apply(this,arguments);
 };
});
window.__NOVA_DRONE_TARGET_FILTER_TEST__={combatFallback:combatFallback,hostile:hostile,sameSide:sameSide,nativeTargetAllowed:nativeTargetAllowed,neutralFallback:neutralFallback};
console.info('[NOVA TANKS] v1.5.1 spotters and allies exempt from autonomous drone aggro');
})();
