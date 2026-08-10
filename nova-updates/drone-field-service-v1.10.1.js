/* NOVA TANKS v1.10.1 — Field Service
 * Universal drone out-of-combat repair and conservative stuck recovery.
 * Controller repair remains owned by Command Weave and is deliberately faster.
 */
(function(){
'use strict';
if(window.__NOVA_FIELD_SERVICE__)return;
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.10.1] module registry unavailable');return;}
var VERSION='1.10.1',CODENAME='Field Service';
var CONTROLLER={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};
var REPAIR_DELAY=4.6,REPAIR_RATE=.045,THREAT_CHECK=.34,STUCK_AFTER=.90,WAYPOINT_HOLD=.58;
window.__NOVA_VERSION=VERSION;
window.__NOVA_FIELD_SERVICE_RELEASE__={version:VERSION,codename:CODENAME,date:'2026-08-09',headline:'Damaged drones recover when the fight truly ends, and stalled navigation gets a bounded second chance instead of jittering forever.',groups:{
 'Field repair':['Every surviving non-Controller drone slowly repairs after 4.6 seconds without taking damage, but only while no visible hostile is close enough to keep it in combat.','Repair is cancelled by attack commitment and immediately reset by fresh damage.','Controller drones keep Command Weave\'s faster return-to-owner recycling, so the Controller lineage retains its intended logistics advantage.','Actual healing emits sparse mint service particles instead of a permanent status effect.'],
 'Navigation recovery':['Existing Battlefield waypoints remain authoritative; Field Service does not introduce a second pathfinder.','A drone must make too little progress toward a real target for almost a second before recovery engages.','Recovery holds a chosen local waypoint briefly to prevent left-right replanning oscillation.','Committed wind-ups and dives are never redirected, and recovery never uses hidden enemy coordinates.'],
 'Performance':['Healthy drones do no threat scan. Damaged repair candidates check nearby danger on a staggered interval rather than every frame.','Per-drone recovery state is fixed-size and reused for the lifetime of the drone.']
}};
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function isController(t){return !!(t&&CONTROLLER[t.cls]);}
function live(e){return !!e&&(e.alive!==false)&&(e.hp==null||e.hp>0);}
function now(g){return g&&Number.isFinite(g.time)?g.time:0;}
function ownerOf(g,d){if(!g||!d)return null;if(g.tankById&&g.tankById.get)return g.tankById.get(d.ownerId)||null;if(g.getTank)return g.getTank(d.ownerId)||null;return null;}
function serviceState(g,d){
 var hp=Math.max(0,Number(d.hp)||0),max=Math.max(hp,Number(d.maxHp)||0);
 var s=d.__novaFieldService;if(!s){s=d.__novaFieldService={maxHp:max,lastHp:hp,lastDamageAt:-99,nextThreatAt:0,threat:false,lastX:Number(d.x)||0,lastY:Number(d.y)||0,blockedFor:0,waypoint:null,waypointUntil:0,fxAt:0};}
 if(max>s.maxHp)s.maxHp=max;if(hp>s.maxHp)s.maxHp=hp;return s;
}
function lineClear(g,ax,ay,bx,by,r){return !g.hasLineOfSight||g.hasLineOfSight(ax,ay,bx,by,r||2);}
function hostile(g,owner,t){
 if(!owner||!t||t.id===owner.id||t.alive===false)return false;
 if(typeof g.areAllies==='function'&&g.areAllies(owner,t))return false;
 if(typeof g.areHostile==='function')return !!g.areHostile(owner,t);
 var keys=['teamId','team','factionId','faction','side'];for(var i=0;i<keys.length;i++){var k=keys[i];if(owner[k]!=null&&t[k]!=null)return owner[k]!==t[k];}
 return true;
}
function visibleThreat(g,d,owner){
 var radius=310,r2=radius*radius,ts=g.tanks||[],i,t;
 for(i=0;i<ts.length;i++){t=ts[i];if(!hostile(g,owner,t)||d2(d.x,d.y,t.x,t.y)>r2)continue;if(lineClear(g,d.x,d.y,t.x,t.y,2))return true;}
 var ds=g.drones||[];for(i=0;i<ds.length;i++){var x=ds[i];if(!x||x===d||x.hp<=0||x.ownerId===owner.id||d2(d.x,d.y,x.x,x.y)>r2)continue;var xo=ownerOf(g,x);if(xo&&hostile(g,owner,xo)&&lineClear(g,d.x,d.y,x.x,x.y,2))return true;}
 return false;
}
function committed(d){return !!(d&&(d.__novaPhase==='dash'||d.__novaPhase==='windup'||d.__novaCommitted));}
function canRepair(g,d,owner,s){
 if(!d||d.hp<=0||!owner||!owner.alive||isController(owner))return false;
 var max=Math.max(s.maxHp,Number(d.maxHp)||0);if(max<=0||d.hp>=max-.01)return false;
 if(committed(d)||(d.attackCd||0)>.05)return false;
 var tm=now(g);if(tm-s.lastDamageAt<REPAIR_DELAY)return false;
 if(tm>=s.nextThreatAt){s.nextThreatAt=tm+THREAT_CHECK+((d.id||0)%5)*.017;s.threat=visibleThreat(g,d,owner);}return !s.threat;
}
function heal(g,d,s,dt){var max=Math.max(s.maxHp,Number(d.maxHp)||0),before=d.hp;d.hp=Math.min(max,d.hp+max*REPAIR_RATE*Math.max(0,dt||0));if(d.hp<=before+.0001)return false;var tm=now(g);if(tm>=s.fxAt){s.fxAt=tm+.38+((d.id||0)%3)*.025;if(g.addParticles)g.addParticles(d.x,d.y,'#8fffd0',2,22,'glow');if(g.addRing)g.addRing(d.x,d.y,'#8fffd0',8);}return true;}
function desiredTarget(d){var keys=['targetRef','__novaTarget','__novaDefenseTarget','__novaIdleShape','__novaFarmTarget'];for(var i=0;i<keys.length;i++){var t=d&&d[keys[i]];if(live(t)&&Number.isFinite(t.x)&&Number.isFinite(t.y))return t;}return null;}
function recoveryStep(g,d,s,dt){
 if(!d||d.hp<=0||committed(d)){s.blockedFor=0;s.waypoint=null;return false;}
 var target=desiredTarget(d);if(!target){s.blockedFor=Math.max(0,s.blockedFor-(dt||0)*2);s.waypoint=null;return false;}
 var tx=target.x,ty=target.y,dist=Math.hypot(tx-d.x,ty-d.y);if(dist<92){s.blockedFor=0;s.waypoint=null;return false;}
 var moved=Math.hypot(d.x-s.lastX,d.y-s.lastY),threshold=Math.max(.35,Math.min(2.2,(d.speed||160)*Math.max(0,dt||0)*.055));
 if(moved<threshold)s.blockedFor+=Math.max(0,dt||0);else s.blockedFor=Math.max(0,s.blockedFor-Math.max(0,dt||0)*2.4);
 if(s.blockedFor<STUCK_AFTER)return false;
 var tm=now(g),wp=s.waypoint;if(!wp||tm>=s.waypointUntil||Math.hypot(wp.x-d.x,wp.y-d.y)<22){wp=null;if(typeof g.novaBattlefieldWaypoint==='function')wp=g.novaBattlefieldWaypoint(d.x,d.y,tx,ty,(d.r||8)+5,d.id||0);if(wp&&Number.isFinite(wp.x)&&Number.isFinite(wp.y)){s.waypoint={x:wp.x,y:wp.y};s.waypointUntil=tm+WAYPOINT_HOLD;}else s.waypoint=null;}
 wp=s.waypoint;if(!wp&&lineClear(g,d.x,d.y,tx,ty,(d.r||8)*.5))wp={x:tx,y:ty};if(!wp||!lineClear(g,d.x,d.y,wp.x,wp.y,(d.r||8)*.5))return false;
 var dx=wp.x-d.x,dy=wp.y-d.y,m=Math.hypot(dx,dy)||1,speed=Math.max(70,Math.min((d.speed||160)*.55,126)),step=Math.min(m,speed*Math.max(0,dt||0));
 d.x+=dx/m*step;d.y+=dy/m*step;d.__novaVX=dx/m*speed;d.__novaVY=dy/m*speed;d.angle=Math.atan2(dy,dx);s.blockedFor=Math.max(STUCK_AFTER*.55,s.blockedFor-(dt||0)*.6);return true;
}
function registerTips(){var api=window.NOVATips;if(!api||typeof api.registerMany!=='function'||window.__NOVA_FIELD_SERVICE_TIPS__)return;window.__NOVA_FIELD_SERVICE_TIPS__=true;api.registerMany([
 {id:'drone-field-repair',contexts:['gameplay','controller'],text:'A damaged drone that survives can self-repair once combat genuinely breaks. Fresh damage or a nearby visible hostile resets the repair window.',reviewed:'2026-08-09'},
 {id:'controller-repair-advantage',contexts:['gameplay','controller'],text:'Controller drones recycle much faster than ordinary drones: disengage damaged hunters before the screen collapses instead of trading every hull to zero.',reviewed:'2026-08-09'}
 ]);}
wrap('game/engine',function(engine){
 var Game=engine.Game;if(!Game||Game.prototype.__novaFieldService)return;Game.prototype.__novaFieldService=true;
 var oldDamage=Game.prototype.damageDrone;if(oldDamage)Game.prototype.damageDrone=function(d){var before=d?Number(d.hp)||0:0,s=d?serviceState(this,d):null,out=oldDamage.apply(this,arguments);if(d&&s&&(Number(d.hp)||0)<before-.001){s.lastDamageAt=now(this);s.threat=true;s.nextThreatAt=now(this)+THREAT_CHECK;s.blockedFor=0;}s&&(s.lastHp=Number(d.hp)||0);return out;};
 var oldUpdate=Game.prototype.updateDrones;if(oldUpdate)Game.prototype.updateDrones=function(dt){var ds=this.drones||[],i,d,s;for(i=0;i<ds.length;i++){d=ds[i];if(!d||d.hp<=0)continue;s=serviceState(this,d);s.lastX=d.x;s.lastY=d.y;}var out=oldUpdate.apply(this,arguments);ds=this.drones||[];for(i=0;i<ds.length;i++){d=ds[i];if(!d||d.hp<=0)continue;s=serviceState(this,d);var owner=ownerOf(this,d);if(canRepair(this,d,owner,s))heal(this,d,s,dt);recoveryStep(this,d,s,dt);s.lastX=d.x;s.lastY=d.y;s.lastHp=d.hp;}registerTips();return out;};
});
registerTips();
window.__NOVA_FIELD_SERVICE__={version:VERSION,codename:CODENAME,repairDelay:REPAIR_DELAY,repairRate:REPAIR_RATE,controllerUsesCommandWeave:true};
window.__NOVA_FIELD_SERVICE_TEST__={isController:isController,serviceState:serviceState,visibleThreat:visibleThreat,committed:committed,canRepair:canRepair,heal:heal,desiredTarget:desiredTarget,recoveryStep:recoveryStep,repairDelay:REPAIR_DELAY,repairRate:REPAIR_RATE,stuckAfter:STUCK_AFTER,waypointHold:WAYPOINT_HOLD};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' drone recovery online');
})();
