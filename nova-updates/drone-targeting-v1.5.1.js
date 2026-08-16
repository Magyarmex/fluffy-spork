/* NOVA TANKS v1.5.1 — autonomous drone target filter */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods)return;
function wrap(id,after){var o=mods[id];if(!o)return;mods[id]=function(module,exports,require){o(module,exports,require);after(module.exports,require);};}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y}
function ownerOf(g,d){if(!g||!d)return null;if(g.tankById&&g.tankById.get)return g.tankById.get(d.ownerId)||null;if(g.getTank)return g.getTank(d.ownerId)||null;return null;}
function sameSide(a,b){var keys=['teamId','team','factionId','faction','side'];for(var i=0;i<keys.length;i++){var k=keys[i];if(a&&b&&a[k]!=null&&b[k]!=null)return a[k]===b[k];}return null;}
function hostile(g,owner,t){if(!owner||!t||t.id===owner.id||t.alive===false)return false;if(typeof g.areAllies==='function'&&g.areAllies(owner,t))return false;if(typeof g.areHostile==='function')return !!g.areHostile(owner,t);var side=sameSide(owner,t);if(side!==null)return !side;return true;}
function visible(g,a,b){return !g.hasLineOfSight||g.hasLineOfSight(a.x,a.y,b.x,b.y,2);}
function combatFallback(g,d,owner,leash){var best=null,bd=Math.pow(Math.min(leash||d.leash||500,520),2),i,t,q;var tanks=g.tanks||[];for(i=0;i<tanks.length;i++){t=tanks[i];if(!hostile(g,owner,t)||!visible(g,d,t))continue;q=d2(d.x,d.y,t.x,t.y);if(q<bd){bd=q;best=t;}}var drones=g.drones||[];for(i=0;i<drones.length;i++){t=drones[i];if(!t||t===d||t.hp<=0||t.__novaSpotter)continue;var other=ownerOf(g,t);if(!other||!hostile(g,owner,other)||!visible(g,d,t))continue;q=d2(d.x,d.y,t.x,t.y);if(q<bd){bd=q;best=t;}}return best;}
wrap('game/engine',function(engine){var Game=engine.Game;if(!Game||Game.prototype.__novaSpotterAutoFilter)return;Game.prototype.__novaSpotterAutoFilter=true;var old=Game.prototype.acquireDroneTarget;Game.prototype.acquireDroneTarget=function(d,owner,leash){var t=old.call(this,d,owner,leash);if(!(t&&t.kind==='drone'&&t.__novaSpotter))return t;
 /* Spotters remain reconnaissance targets: automatic defense does not spend itself on them.
    If a spotter happens to win the native selector, preserve combat awareness by trying the
    nearest visible hostile combatant inside the same bounded leash before falling back to
    the historical neutral-shape behavior. Manual Controller command still bypasses this path. */
 var combat=combatFallback(this,d,owner,leash);if(combat)return combat;
 var best=null,bd=Math.pow(Math.min(leash||d.leash||500,520),2);for(var i=0;i<this.shapes.length;i++){var s=this.shapes[i];if(!s||s.hp<=0)continue;var q=d2(d.x,d.y,s.x,s.y);if(q<bd){bd=q;best=s;}}return best;};});
window.__NOVA_DRONE_TARGET_FILTER_TEST__={combatFallback:combatFallback,hostile:hostile,sameSide:sameSide};
console.info('[NOVA TANKS] v1.5.1 spotters exempt from autonomous drone aggro');
})();
