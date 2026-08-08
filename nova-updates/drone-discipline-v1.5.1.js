/* NOVA TANKS v1.5.1 — Swarm Discipline
 * Drone navigation stability, distributed harvesting, defensive interception,
 * and explicit drone-vs-drone combat behavior.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.5.1] module registry unavailable');return;}
var VERSION='1.5.1',CODENAME='Swarm Discipline',MAP_LIMIT=2250;
var CONTROLLER={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};
window.__NOVA_DRONE_RELEASE__={version:VERSION,codename:CODENAME,date:'2026-08-08',headline:'Drones stop dithering and start behaving like a coordinated squad.',groups:{
 'Navigation and farming':['Removed the idle Controller farm/home oscillation that could make drones vibrate near an invisible 150-unit boundary.','Idle drone movement now uses persistent velocity, dead zones and separate return/resume thresholds so a drone finishes one movement decision before changing its mind.','Friendly drones reserve different harvest shapes whenever alternatives exist instead of dog-piling the nearest object.'],
 'Defensive drone combat':['Idle defensive drones automatically intercept hostile combat drones that enter the owner’s defensive bubble.','Forward Observer spotters are deliberately ignored by automatic drone defense so reconnaissance remains something a player chooses to contest rather than free aggro.','Manually commanded Controller swarms continue to treat enemy drones—including spotters—as valid attack targets around the Command Node.'],
 'AI and stability':['Legacy escort/hunter target acquisition now prioritizes nearby hostile non-spotter drones before passive farming.','Farm reservations are owner-local and expire naturally when shapes die, leave leash range, or the drone changes role.','Controller idle behavior preserves committed attack runs, recall, real drone HP, respawn, and the existing Second Body combat language.']
}};
function wrap(id,after){var original=mods[id];if(!original)return;mods[id]=function(module,exports,require){original(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function isController(t){return !!(t&&CONTROLLER[t.cls]);}
function validShape(s){return !!s&&s.hp>0&&s.kind==='shape';}
function validDrone(d){return !!d&&d.hp>0&&d.kind==='drone';}
function enemyDrone(d,owner){return validDrone(d)&&d.ownerId!==owner.id;}
function spotter(d){return !!(d&&d.__novaSpotter);}
function ownerOf(g,d){return g.tankById&&g.tankById.get?g.tankById.get(d.ownerId):null;}
function homeRadius(d){return clamp((d.leash||600)*0.58,220,430);}
function resumeRadius(d){return homeRadius(d)*0.76;}
function farmRadius(d){return clamp((d.leash||600)*0.83,260,540);}
function defenseRadius(d){return clamp((d.leash||600)*0.46,230,345);}
function squadIndex(squad,d){for(var i=0;i<squad.length;i++)if(squad[i]===d)return i;return Math.max(0,d.slot||0);}
function homePoint(g,owner,d,squad){var n=Math.max(1,squad.length),idx=squadIndex(squad,d),r=52+Math.min(42,n*4),a=(idx/n)*Math.PI*2+g.time*(owner.cls==='hivemind'?.48:.72);return{x:owner.x+Math.cos(a)*r,y:owner.y+Math.sin(a)*r*.82};}
function steer(d,tx,ty,speed,dt){var dx=tx-d.x,dy=ty-d.y,dist=Math.hypot(dx,dy);if(d.__novaIdleVX==null){d.__novaIdleVX=Number.isFinite(d.__novaVX)?d.__novaVX:0;d.__novaIdleVY=Number.isFinite(d.__novaVY)?d.__novaVY:0;}var desired=dist<3?0:Math.min(speed,dist*4.4),dvx=dist>0?dx/dist*desired:0,dvy=dist>0?dy/dist*desired:0,k=1-Math.exp(-6.0*dt);d.__novaIdleVX+=(dvx-d.__novaIdleVX)*k;d.__novaIdleVY+=(dvy-d.__novaIdleVY)*k;if(dist<3){d.__novaIdleVX*=Math.max(0,1-dt*10);d.__novaIdleVY*=Math.max(0,1-dt*10);}d.__novaPrevX=d.x;d.__novaPrevY=d.y;d.x+=d.__novaIdleVX*dt;d.y+=d.__novaIdleVY*dt;d.__novaVX=d.__novaIdleVX;d.__novaVY=d.__novaIdleVY;if(Math.abs(d.__novaIdleVX)+Math.abs(d.__novaIdleVY)>3)d.angle=Math.atan2(d.__novaIdleVY,d.__novaIdleVX);}
function nearestDefense(g,owner,d){var r=defenseRadius(d),best=null,bd=r*r;for(var i=0;i<g.drones.length;i++){var x=g.drones[i];if(!enemyDrone(x,owner)||spotter(x))continue;var od=d2(owner.x,owner.y,x.x,x.y);if(od>bd)continue;var score=od*.72+d2(d.x,d.y,x.x,x.y)*.28;if(!best||score<best.score)best={drone:x,score:score};}return best&&best.drone;}
function chooseShape(g,owner,d,claims){var cur=d.__novaIdleShape;if(validShape(cur)&&!claims.has(cur)&&d2(owner.x,owner.y,cur.x,cur.y)<=farmRadius(d)*farmRadius(d)){claims.add(cur);return cur;}var best=null,bs=Infinity,fr=farmRadius(d),fr2=fr*fr;for(var i=0;i<g.shapes.length;i++){var s=g.shapes[i];if(!validShape(s)||claims.has(s))continue;var od=d2(owner.x,owner.y,s.x,s.y);if(od>fr2)continue;var score=d2(d.x,d.y,s.x,s.y)+od*.12;if(score<bs){bs=score;best=s;}}if(best)claims.add(best);return best;}
function hitDrone(g,owner,d,target){if(d.attackCd>0||!validDrone(target))return;var rr=(d.r||8)+(target.r||8)+7;if(d2(d.x,d.y,target.x,target.y)>rr*rr)return;d.attackCd=d.role==='hunter'?.34:.46;var dmg=d.dmg*(owner.swarmT>0?1.25:1);g.damageDrone(target,dmg,owner.id);if(g.addImpactDebris)g.addImpactDebris(target.x,target.y,target.x-d.x,target.y-d.y,d.color,3);}
function hitShape(g,owner,d,target){if(d.attackCd>0||!validShape(target))return;var rr=(d.r||8)+(target.r||10)+5;if(d2(d.x,d.y,target.x,target.y)>rr*rr)return;d.attackCd=.36;g.damageShape(target,d.dmg*(owner.swarmT>0?1.3:1),target.x-d.x,target.y-d.y);if(g.addImpactDebris)g.addImpactDebris(target.x,target.y,target.x-d.x,target.y-d.y,d.color,3);}
function controlIdle(g,owner,d,squad,claims,dt){var state=owner.__novaSwarm;if(!state||state.active)return false;if(d.__novaPhase==='dash')return false;
 var recall=state.recallUntil>g.time;if(d.__novaPhase==='windup'){d.__novaPhase='recover';d.__novaPhaseT=Math.max(.24,d.__novaPhaseT||.24);d.__novaCommitted=false;d.__novaTarget=null;}
 var threat=d.__novaDefenseTarget;if(!enemyDrone(threat,owner)||spotter(threat)||d2(owner.x,owner.y,threat.x,threat.y)>Math.pow(defenseRadius(d)*1.22,2))threat=null;if(!threat)threat=nearestDefense(g,owner,d);d.__novaDefenseTarget=threat||null;
 if(threat&&!recall){d.__novaIdleMode='defend';d.__novaIdleShape=null;steer(d,threat.x,threat.y,d.speed*1.30,dt);hitDrone(g,owner,d,threat);return true;}
 var od=Math.sqrt(d2(owner.x,owner.y,d.x,d.y));if(recall||d.__novaIdleMode==='return'||od>homeRadius(d)){d.__novaIdleMode='return';d.__novaIdleShape=null;var hp=homePoint(g,owner,d,squad);steer(d,hp.x,hp.y,d.speed*1.18,dt);if(!recall&&od<resumeRadius(d))d.__novaIdleMode='farm';return true;}
 var shape=chooseShape(g,owner,d,claims);d.__novaIdleShape=shape||null;if(shape){d.__novaIdleMode='farm';steer(d,shape.x,shape.y,d.speed*(owner.swarmT>0?1.34:1),dt);hitShape(g,owner,d,shape);if(shape.hp<=0)d.__novaIdleShape=null;return true;}
 d.__novaIdleMode='guard';var h=homePoint(g,owner,d,squad);steer(d,h.x,h.y,d.speed*1.05,dt);return true;}
function alternativeShape(g,d,owner,leash){var claimed=new Set();for(var i=0;i<g.drones.length;i++){var o=g.drones[i];if(o===d||o.ownerId!==owner.id)continue;var t=o.__novaIdleShape||o.__novaFarmTarget||o.targetRef;if(validShape(t))claimed.add(t);}var best=null,bs=Infinity,r=Math.min(leash||d.leash||520,farmRadius(d)),r2=r*r;for(var j=0;j<g.shapes.length;j++){var s=g.shapes[j];if(!validShape(s)||claimed.has(s)||d2(owner.x,owner.y,s.x,s.y)>r2)continue;var q=d2(d.x,d.y,s.x,s.y);if(q<bs){bs=q;best=s;}}return best;}
wrap('game/engine',function(engine,require){var Game=engine.Game;if(!Game||Game.prototype.__novaSwarmDiscipline)return;Game.prototype.__novaSwarmDiscipline=true;var CLASSES=require('./classes').CLASSES;
 var oldAcquire=Game.prototype.acquireDroneTarget;Game.prototype.acquireDroneTarget=function(d,owner,leash){if(d&&owner&&!spotter(d)){var threat=nearestDefense(this,owner,d);if(threat)return threat;}var target=oldAcquire.call(this,d,owner,leash);if(target&&target.kind==='shape'&&d&&owner){var duplicate=false;for(var i=0;i<this.drones.length;i++){var f=this.drones[i];if(f===d||f.ownerId!==owner.id)continue;var ft=f.__novaIdleShape||f.__novaFarmTarget||f.targetRef;if(ft===target){duplicate=true;break;}}if(duplicate){var alt=alternativeShape(this,d,owner,leash);if(alt)return alt;return null;}}return target;};
 var oldUpdate=Game.prototype.updateDrones;Game.prototype.updateDrones=function(dt){var pre=[];for(var i=0;i<this.drones.length;i++){var d=this.drones[i],o=ownerOf(this,d);if(!o||!o.alive||!isController(o))continue;pre.push([d,d.x,d.y,d.angle]);var st=o.__novaSwarm;if(st&&!st.active&&d.__novaPhase!=='dash'){d.__novaFarmTarget=null;d.retargetT=999;}}
 oldUpdate.call(this,dt);
 var squads=Object.create(null);for(var s=0;s<this.drones.length;s++){var dd=this.drones[s],oo=ownerOf(this,dd);if(oo&&oo.alive&&isController(oo)){(squads[oo.id]||(squads[oo.id]=[])).push(dd);}}for(var k in squads)squads[k].sort(function(a,b){return(a.slot||0)-(b.slot||0);});
 var snaps=new Map();for(var p=0;p<pre.length;p++)snaps.set(pre[p][0],pre[p]);var claimsByOwner=Object.create(null);
 for(var oi=0;oi<this.tanks.length;oi++){var owner=this.tanks[oi];if(!owner||!owner.alive||!isController(owner)||!owner.__novaSwarm||owner.__novaSwarm.active)continue;var sq=squads[owner.id]||[];var claims=claimsByOwner[owner.id]||(claimsByOwner[owner.id]=new Set());for(var di=0;di<sq.length;di++){var drone=sq[di],snap=snaps.get(drone);if(!snap||drone.__novaPhase==='dash')continue;drone.x=snap[1];drone.y=snap[2];drone.angle=snap[3];controlIdle(this,owner,drone,sq,claims,dt);drone.x=clamp(drone.x,-MAP_LIMIT+24,MAP_LIMIT-24);drone.y=clamp(drone.y,-MAP_LIMIT+24,MAP_LIMIT-24);}}
 };
});
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' drone behavior linked');
})();
