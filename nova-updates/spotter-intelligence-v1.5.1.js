/* NOVA TANKS v1.5.1 — Forward Observer intelligence polish
 * Wider, suspicion-driven search cones, purposeful patrol behavior, and
 * clearer long-range target relays for both AI and player snipers.
 * Performance hardening: shared bullet kinematics and reusable sensor/render scratch.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.5.1] module registry unavailable');return;}
var TAU=Math.PI*2,SEARCH_RANGE=700,SEARCH_HALF=1.30,CONTACT_MEMORY=1.72,HEAR_RANGE=1040,PATROL_RADIUS=650,MAP_LIMIT=2250;
var PURPLE={marksman:1,railgun:1,ghost:1,singularity:1,prism:1,specter:1,assassin:1};
var SCREEN_A={x:0,y:0},SCREEN_B={x:0,y:0},SCREEN_C={x:0,y:0};
window.__NOVA_SPOTTER_POLISH__={version:'1.5.1',codename:'Swarm Discipline',feature:'Forward Observer intelligence',headline:'Spotters search like scouts instead of spinning like ornaments.'};
function wrap(id,after){var o=mods[id];if(!o)return;mods[id]=function(module,exports,require){o(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y}
function ad(target,current){var d=(target-current+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI}
function moveAngle(current,target,max){return current+clamp(ad(target,current),-max,max)}
function sniper(t){return !!(t&&PURPLE[t.cls])}
function ownerOf(g,d){return g.tankById&&g.tankById.get?g.tankById.get(d.ownerId):null}
function tankOf(g,id){return id>=0&&g.getTank?g.getTank(id):null}
function world(g,x,y,out){var z=g.cam&&g.cam.zoom?g.cam.zoom:1,p=out||SCREEN_A;p.x=(x-g.cam.x)*z+g.w*.5;p.y=(y-g.cam.y)*z+g.h*.5;return p}
function edge(w,h,ang,pad,out){var p=out||SCREEN_C,cx=w*.5,cy=h*.5,dx=Math.cos(ang),dy=Math.sin(ang),rx=Math.max(1,cx-pad),ry=Math.max(1,cy-pad),s=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);p.x=cx+dx*s;p.y=cy+dy*s;return p}
function pan(g,x){var p=g.player;if(!p)return 0;return clamp((x-p.x)/Math.max(420,g.w/Math.max(.55,(g.cam&&g.cam.zoom)||1)),-1,1)}
function seenByCone(d,t){var dd=d2(d.x,d.y,t.x,t.y);if(dd>SEARCH_RANGE*SEARCH_RANGE)return false;if(dd<135*135)return true;var a=Math.atan2(t.y-d.y,t.x-d.x);return Math.abs(ad(a,d.angle||0))<=SEARCH_HALF}
function hostileBulletActivity(g,owner,d){
 var best=null,bs=Infinity,hr2=HEAR_RANGE*HEAR_RANGE,now=g.time||0;
 for(var i=0;i<g.bullets.length;i++){
   var b=g.bullets[i];if(!b||b.dead||b.ownerId===owner.id)continue;
   var dd=Math.min(d2(d.x,d.y,b.x,b.y),d2(owner.x,owner.y,b.x,b.y));if(dd>hr2)continue;
   if(b.__novaSpotterKinAt!==now){var sp=Math.hypot(b.vx||0,b.vy||0);b.__novaSpotterKinAt=now;b.__novaSpotterSpeed=sp;if(sp>=40){b.__novaSpotterUX=(b.vx||0)/sp;b.__novaSpotterUY=(b.vy||0)/sp;}}
   if((b.__novaSpotterSpeed||0)<40)continue;
   var sx=b.x-b.__novaSpotterUX*420,sy=b.y-b.__novaSpotterUY*420,score=dd+(b.__novaSniperLineage?-.18*hr2:0);
   if(score<bs){bs=score;best=b;d.__novaActivityX=sx;d.__novaActivityY=sy;}
 }
 if(!best)return null;
 var out=d.__novaBulletActivity||(d.__novaBulletActivity={x:0,y:0,angle:0,strength:0});out.x=d.__novaActivityX;out.y=d.__novaActivityY;out.angle=Math.atan2(out.y-d.y,out.x-d.x);out.strength=clamp(1-Math.sqrt(Math.max(0,bs-(best.__novaSniperLineage?-.18*hr2:0)))/HEAR_RANGE,.18,.92);return out;
}
function knownContact(g,owner){if(owner.__novaSpotterContactId>=0&&owner.__novaSpotterContactUntil>g.time){var t=tankOf(g,owner.__novaSpotterContactId);if(t&&t.alive)return t}return null}
function updateSuspicion(g,owner,d,dt){var known=knownContact(g,owner);if(known){d.__novaSuspectAngle=Math.atan2(known.y-d.y,known.x-d.x);d.__novaSuspectStrength=1;d.__novaLastKnownX=known.x;d.__novaLastKnownY=known.y;d.__novaSearchHold=.65;return}
 var activity=hostileBulletActivity(g,owner,d);if(activity){var cur=d.__novaSuspectAngle==null?activity.angle:d.__novaSuspectAngle;d.__novaSuspectAngle=moveAngle(cur,activity.angle,2.8*dt);d.__novaSuspectStrength=Math.max(d.__novaSuspectStrength||0,activity.strength);d.__novaSearchHold=.9;}
 else{d.__novaSearchHold=Math.max(0,(d.__novaSearchHold||0)-dt);d.__novaSuspectStrength=Math.max(0,(d.__novaSuspectStrength||0)-dt*(d.__novaSearchHold>0?.16:.34));}
 if((d.__novaSuspectStrength||0)<.12){d.__novaSweepT=(d.__novaSweepT||0)-dt;if(d.__novaSweepT<=0){d.__novaSweepT=1.45+((d.slot||0)%3)*.32;var base=Math.atan2((owner.vy||0),(owner.vx||0));if(Math.hypot(owner.vx||0,owner.vy||0)<20)base=d.__novaPatrolBase==null?(owner.angle||0):d.__novaPatrolBase;var sequence=[-.95,.35,1.05,-.25],idx=((d.__novaSweepIndex||0)+1)%sequence.length;d.__novaSweepIndex=idx;d.__novaPatrolBase=base+sequence[idx];}d.__novaSuspectAngle=d.__novaPatrolBase==null?(d.angle||0):d.__novaPatrolBase;}}
function steerSearch(g,owner,d,dt){updateSuspicion(g,owner,d,dt);var strength=clamp(d.__novaSuspectStrength||0,0,1),heading=d.__novaSuspectAngle==null?(d.angle||0):d.__novaSuspectAngle;
 d.angle=moveAngle(d.angle||0,heading,(1.35+strength*2.4)*dt);
 var orbit=(d.__novaScoutOrbit==null?((d.slot||0)*1.7):d.__novaScoutOrbit)+dt*(.24+strength*.08);d.__novaScoutOrbit=orbit;
 var searchR=PATROL_RADIUS+(owner.cls==='marksman'?-45:35),leadX=Math.cos(heading)*searchR,leadY=Math.sin(heading)*searchR,sideA=heading+Math.PI/2,side=Math.sin(g.time*.7+(d.slot||0)*1.9)*(strength>.25?130:225),tx=owner.x+leadX+Math.cos(sideA)*side,ty=owner.y+leadY+Math.sin(sideA)*side;
 if(strength<.15){tx=owner.x+Math.cos(orbit)*searchR;ty=owner.y+Math.sin(orbit)*searchR*.82;}
 tx=clamp(tx,-MAP_LIMIT+80,MAP_LIMIT-80);ty=clamp(ty,-MAP_LIMIT+80,MAP_LIMIT-80);
 var dx=tx-d.x,dy=ty-d.y,dist=Math.hypot(dx,dy)||1,speed=Math.max(d.speed||275,285)*(strength>.35?1.08:.94),desired=Math.min(speed,dist*2.8),vx=dx/dist*desired,vy=dy/dist*desired,k=1-Math.exp(-3.4*dt);
 d.__novaScoutVX=(d.__novaScoutVX||0)+(vx-(d.__novaScoutVX||0))*k;d.__novaScoutVY=(d.__novaScoutVY||0)+(vy-(d.__novaScoutVY||0))*k;
 d.x+=d.__novaScoutVX*dt*.62;d.y+=d.__novaScoutVY*dt*.62;
 var od=Math.hypot(d.x-owner.x,d.y-owner.y),max=Math.max(980,d.leash||0);if(od>max){var ux=(d.x-owner.x)/od,uy=(d.y-owner.y)/od;d.x=owner.x+ux*max;d.y=owner.y+uy*max;d.__novaScoutVX*=.55;d.__novaScoutVY*=.55;}}
function scan(g,owner,d){var best=null,bs=Infinity;for(var i=0;i<g.tanks.length;i++){var t=g.tanks[i];if(!t||!t.alive||t.id===owner.id||t.spawnShieldT>0)continue;if(!seenByCone(d,t))continue;var dd=d2(d.x,d.y,t.x,t.y),moving=Math.hypot(t.vx||0,t.vy||0),score=dd-(moving>80?28000:0)-(t.hitFlash>0?22000:0);if(score<bs){bs=score;best=t}}
 if(best){var changed=owner.__novaSpotterContactId!==best.id||owner.__novaSpotterContactUntil<=g.time;owner.__novaSpotterContactId=best.id;owner.__novaSpotterContactUntil=g.time+CONTACT_MEMORY;owner.__novaSpotterDroneId=d.id;d.__novaSuspectAngle=Math.atan2(best.y-d.y,best.x-d.x);d.__novaSuspectStrength=1;d.__novaLastKnownX=best.x;d.__novaLastKnownY=best.y;if(changed){d.__novaContactPulseUntil=g.time+.62;if(g.addRing)g.addRing(d.x,d.y,owner.isPlayer?'#8fe8ff':'#c493ff',34);if(owner.isPlayer){if(g.addText)g.addText(best.x,best.y-35,'CONTACT RELAY','#bceeff',10);if(g.sfx&&g.sfx.novaSpotterContact)g.sfx.novaSpotterContact(pan(g,d.x),false)}else if(best.isPlayer){if(g.addText)g.addText(best.x,best.y-33,'SPOTTED · RELAY','#ffd98a',10);if(g.sfx&&g.sfx.novaSpotterContact)g.sfx.novaSpotterContact(pan(g,d.x),true)}}}}
wrap('game/engine',function(engine){var Game=engine.Game;if(!Game||Game.prototype.__novaSpotterIntelligence)return;Game.prototype.__novaSpotterIntelligence=true;var old=Game.prototype.updateDrones;Game.prototype.updateDrones=function(dt){old.call(this,dt);for(var i=0;i<this.drones.length;i++){var d=this.drones[i],owner=ownerOf(this,d);if(!d||!d.__novaSpotter||!owner||!owner.alive||!sniper(owner))continue;if(owner.__novaSpotterDownUntil&&owner.__novaSpotterDownUntil>this.time)continue;steerSearch(this,owner,d,dt);scan(this,owner,d);}};});
wrap('game/render',function(renderMod){var old=renderMod.render;if(!old||old.__novaSpotterIntelligence)return;function marker(ctx,x,y,ang,color,label,sub){ctx.save();ctx.translate(x,y);ctx.rotate(ang);ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.4;ctx.shadowBlur=10;ctx.shadowColor=color;ctx.beginPath();ctx.moveTo(9,0);ctx.lineTo(-4,-5);ctx.lineTo(-2,0);ctx.lineTo(-4,5);ctx.closePath();ctx.stroke();ctx.rotate(-ang);ctx.shadowBlur=0;ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText(label,0,-12);if(sub){ctx.globalAlpha=.72;ctx.font='700 7px Rajdhani,system-ui';ctx.fillText(sub,0,11)}ctx.restore()}
 function cone(ctx,g,d,owner,w,h){var p=world(g,d.x,d.y,SCREEN_A),z=(g.cam&&g.cam.zoom)||1;if(p.x<-210||p.x>w+210||p.y<-210||p.y>h+210)return;var rr=Math.min(185,SEARCH_RANGE*z*.30),a=d.angle||0,pulse=.86+.14*Math.sin(performance.now()*.008+(d.slot||0));ctx.save();ctx.globalCompositeOperation='lighter';var col=owner.isPlayer?'rgba(116,218,255,':'rgba(196,147,255,';ctx.fillStyle=col+(.045*pulse)+')';ctx.strokeStyle=col+(.28*pulse)+')';ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,rr,a-SEARCH_HALF,a+SEARCH_HALF);ctx.closePath();ctx.fill();ctx.stroke();ctx.strokeStyle=col+(.62*pulse)+')';ctx.setLineDash([3,8]);ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x+Math.cos(a)*rr,p.y+Math.sin(a)*rr);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(p.x,p.y,14+(d.__novaContactPulseUntil>g.time?4*Math.sin(g.time*18):0),0,TAU);ctx.stroke();ctx.fillStyle=owner.isPlayer?'rgba(199,242,255,.90)':'rgba(233,220,255,.84)';ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText((d.__novaSuspectStrength||0)>.28?'SEARCH':'SWEEP',p.x,p.y-18);ctx.restore()}
 function relay(ctx,g,d,owner,w,h){var target=knownContact(g,owner);if(!target)return;var dp=world(g,d.x,d.y,SCREEN_A),tp=world(g,target.x,target.y,SCREEN_B),targetOff=tp.x<22||tp.x>w-22||tp.y<22||tp.y>h-22,observerOff=dp.x<22||dp.x>w-22||dp.y<22||dp.y>h-22,col=owner.isPlayer?'rgba(143,232,255,.75)':'rgba(216,192,255,.70)';ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle=col;ctx.lineWidth=1;ctx.setLineDash([4,7]);if(!observerOff){var ex=tp.x,ey=tp.y;if(targetOff){var ta=Math.atan2(tp.y-h*.5,tp.x-w*.5),te=edge(w,h,ta,24,SCREEN_C);ex=te.x;ey=te.y}ctx.beginPath();ctx.moveTo(dp.x,dp.y);ctx.lineTo(ex,ey);ctx.stroke()}ctx.setLineDash([]);if(owner.isPlayer){var dist=Math.round(Math.hypot(target.x-owner.x,target.y-owner.y));if(targetOff){var ang=Math.atan2(tp.y-h*.5,tp.x-w*.5),ep=edge(w,h,ang,25,SCREEN_C);marker(ctx,ep.x,ep.y,ang,'rgba(174,239,255,.92)','CONTACT',dist+'u')}else{ctx.strokeStyle='rgba(174,239,255,.86)';ctx.lineWidth=1.4;ctx.beginPath();ctx.arc(tp.x,tp.y,23+Math.sin(g.time*7)*2,0,TAU);ctx.moveTo(tp.x-30,tp.y);ctx.lineTo(tp.x-19,tp.y);ctx.moveTo(tp.x+19,tp.y);ctx.lineTo(tp.x+30,tp.y);ctx.stroke();ctx.fillStyle='rgba(202,245,255,.88)';ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText('RELAY',tp.x,tp.y-30)}}else if(target.isPlayer){if(observerOff){var oa=Math.atan2(dp.y-h*.5,dp.x-w*.5),oe=edge(w,h,oa,25,SCREEN_C);marker(ctx,oe.x,oe.y,oa,'rgba(226,205,255,.88)','OBSERVER','RELAY ACTIVE')}ctx.strokeStyle='rgba(255,218,145,.70)';ctx.beginPath();ctx.arc(tp.x,tp.y,28+Math.sin(g.time*8)*2,0,TAU);ctx.stroke()}ctx.restore()}
 function patched(g,w,h){old(g,w,h);if(!g||!g.ctx||!g.player)return;var ctx=g.ctx;ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);for(var i=0;i<g.drones.length;i++){var d=g.drones[i],owner=ownerOf(g,d);if(!d||!d.__novaSpotter||!owner||!owner.alive||!sniper(owner))continue;cone(ctx,g,d,owner,w,h);relay(ctx,g,d,owner,w,h)}ctx.restore()}
 patched.__novaSpotterIntelligence=true;renderMod.render=patched;});
console.info('[NOVA TANKS] v1.5.1 intelligent Forward Observer linked');
})();
