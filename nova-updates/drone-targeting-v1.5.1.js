/* NOVA TANKS v1.5.1 — autonomous drone target filter */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods)return;
function wrap(id,after){var o=mods[id];if(!o)return;mods[id]=function(module,exports,require){o(module,exports,require);after(module.exports,require);};}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y}
wrap('game/engine',function(engine){var Game=engine.Game;if(!Game||Game.prototype.__novaSpotterAutoFilter)return;Game.prototype.__novaSpotterAutoFilter=true;var old=Game.prototype.acquireDroneTarget;Game.prototype.acquireDroneTarget=function(d,owner,leash){var t=old.call(this,d,owner,leash);if(!(t&&t.kind==='drone'&&t.__novaSpotter))return t;
 /* Spotters are reconnaissance targets: automatic defense does not spend itself on them.
    Manual Controller command never uses this fallback selector, so commanded swarms can still kill spotters. */
 var best=null,bd=Math.pow(Math.min(leash||d.leash||500,520),2);for(var i=0;i<this.shapes.length;i++){var s=this.shapes[i];if(!s||s.hp<=0)continue;var q=d2(d.x,d.y,s.x,s.y);if(q<bd){bd=q;best=s;}}return best;};});
console.info('[NOVA TANKS] v1.5.1 spotters exempt from autonomous drone aggro');
})();
