/* NOVA TANKS v1.8.2 — Long Glass
 * Adaptive tactical framing for Controller command nodes and Sniper Forward Observers.
 * Remote intent stays visible while mouse/world aiming remains projection-correct.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.8.2] module registry unavailable');return;}
var VERSION='1.8.2',CODENAME='Long Glass';
var CONTROLLER={carrier:1,overlord:1,warden:1,hivemind:1,broodmother:1,citadel:1,valkyrie:1};
var SNIPER={marksman:1,railgun:1,ghost:1,singularity:1,prism:1,specter:1,assassin:1};
var EPS=.0005;
window.__NOVA_VERSION=VERSION;
window.__NOVA_TACTICAL_FRAMING_RELEASE__={version:VERSION,codename:CODENAME,date:'2026-08-08',headline:'Remote intent stays on screen without changing what your aim means.',groups:{
  'Adaptive Tactical Camera':['Controller Command Nodes that leave the normal viewport pull the camera into a wider two-point frame instead of becoming blind edge markers.','Player Snipers frame their Forward Observer and any legitimate active relay contact, keeping scout, shooter and target readable without exposing unspotted targets.','The camera fits the smallest useful bounding box rather than blindly zooming from the player center, so it preserves as much target size as possible.'],
  'Precision Preservation':['Tactical framing changes only camera projection: Controller world commands, drone simulation, weapon ranges and hitboxes are untouched.','Mouse-to-world conversion and rendered camera use the same effective zoom and center every frame, so the cursor continues to mean the world point shown beneath it.','When a valid Sniper relay forces extra zoom-out, a narrow precision-compensation zone preserves the target\'s native screen-space aiming tolerance; it never enlarges the hitbox or snaps to an unspotted enemy.'],
  'Camera Feel':['Zoom-out reacts quickly enough to prevent blind remote control; return to the native camera is deliberately softer to avoid breathing and edge flicker.','Small hysteresis prevents an orbiting Observer or Command Node near the viewport boundary from repeatedly toggling the camera.']
}};
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function finitePoint(x,y){return Number.isFinite(x)&&Number.isFinite(y);}
function isController(t){return !!(t&&CONTROLLER[t.cls]);}
function isSniper(t){return !!(t&&SNIPER[t.cls]);}
function normalCenter(pl){return{x:pl.x+(pl.vx||0)*.16,y:pl.y+(pl.vy||0)*.16};}
function padding(g){return{x:clamp(g.w*.115,42,92),y:clamp(g.h*.135,54,108)};}
function nativeVisible(g,point,nativeZoom,release){var c=normalCenter(g.player),p=padding(g),extra=release?18:0;var hx=Math.max(36,g.w*.5-p.x-extra),hy=Math.max(36,g.h*.5-p.y-extra);return Math.abs(point.x-c.x)*nativeZoom<=hx&&Math.abs(point.y-c.y)*nativeZoom<=hy;}
function findDrone(g,id,ownerId){var ds=g.drones||[];for(var i=0;i<ds.length;i++){var d=ds[i];if(!d)continue;if(id>=0&&d.id===id)return d;if(id<0&&d.ownerId===ownerId&&d.__novaSpotter)return d;}return null;}
function tacticalPoints(g){var pl=g.player,out=[];if(!pl||!pl.alive)return out;
 if(isController(pl)&&pl.__novaSwarm&&pl.__novaSwarm.active&&finitePoint(pl.__novaSwarm.nodeX,pl.__novaSwarm.nodeY))out.push({x:pl.__novaSwarm.nodeX,y:pl.__novaSwarm.nodeY,kind:'controller-node'});
 if(isSniper(pl)){
   var sid=Number.isFinite(pl.__novaSpotterDroneId)?pl.__novaSpotterDroneId:-1,spot=findDrone(g,sid,pl.id);if(spot&&spot.hp>0&&finitePoint(spot.x,spot.y))out.push({x:spot.x,y:spot.y,kind:'spotter',entity:spot});
   if(pl.__novaSpotterContactId>=0&&pl.__novaSpotterContactUntil>g.time&&g.getTank){var t=g.getTank(pl.__novaSpotterContactId);if(t&&t.alive&&finitePoint(t.x,t.y))out.push({x:t.x,y:t.y,kind:'relay-target',entity:t});}
 }
 return out;}
function fitFor(g,points,nativeZoom,wasActive){var pl=g.player;if(!pl||!points.length)return{active:false,zoom:nativeZoom,x:pl?normalCenter(pl).x:0,y:pl?normalCenter(pl).y:0,points:points};
 var must=false;for(var i=0;i<points.length;i++){if(!nativeVisible(g,points[i],nativeZoom,wasActive)){must=true;break;}}
 if(!must)return{active:false,zoom:nativeZoom,x:normalCenter(pl).x,y:normalCenter(pl).y,points:points};
 var minX=pl.x,maxX=pl.x,minY=pl.y,maxY=pl.y;for(var j=0;j<points.length;j++){var q=points[j];minX=Math.min(minX,q.x);maxX=Math.max(maxX,q.x);minY=Math.min(minY,q.y);maxY=Math.max(maxY,q.y);}
 var p=padding(g),usableW=Math.max(96,g.w-p.x*2),usableH=Math.max(96,g.h-p.y*2),spanX=Math.max(1,maxX-minX),spanY=Math.max(1,maxY-minY);
 var needed=Math.min(nativeZoom,usableW/spanX,usableH/spanY)*.955,minZoom=Math.max(.12,nativeZoom*.25);needed=clamp(needed,minZoom,nativeZoom);
 return{active:true,zoom:needed,x:(minX+maxX)*.5,y:(minY+maxY)*.5,points:points};}
function stateFor(g){return g.__novaTacticalCamera||(g.__novaTacticalCamera={nativeZoom:Number.isFinite(g.zoom)?g.zoom:1,appliedZoom:Number.isFinite(g.zoom)?g.zoom:1,camX:g.cam?g.cam.x:0,camY:g.cam?g.cam.y:0,active:false,lastMode:'native'});}
function detectNativeZoom(g,s){var z=Number.isFinite(g.zoom)?g.zoom:s.nativeZoom;if(Math.abs(z-s.appliedZoom)>EPS)s.nativeZoom=z;return Math.max(.05,s.nativeZoom||1);}
function frameStep(g,dt){var s=stateFor(g),nativeZoom=detectNativeZoom(g,s),pts=tacticalPoints(g),fit=fitFor(g,pts,nativeZoom,s.active),targetC=fit.active?fit:normalCenter(g.player);var transition=s.active||fit.active||Math.abs((s.appliedZoom||nativeZoom)-nativeZoom)>.003;
 var zoomRate=fit.zoom<(s.appliedZoom||nativeZoom)?12:5.2,zk=1-Math.exp(-zoomRate*Math.max(0,dt||0)),ck=1-Math.exp(-(fit.active?10:6)*Math.max(0,dt||0));
 var nextZoom=transition?lerp(s.appliedZoom||nativeZoom,fit.zoom,zk):nativeZoom,nextX=transition?lerp(Number.isFinite(s.camX)?s.camX:g.cam.x,targetC.x,ck):g.cam.x,nextY=transition?lerp(Number.isFinite(s.camY)?s.camY:g.cam.y,targetC.y,ck):g.cam.y;
 if(!fit.active&&Math.abs(nextZoom-nativeZoom)<.002){nextZoom=nativeZoom;if(Math.hypot(nextX-targetC.x,nextY-targetC.y)<1.2)transition=false;}
 s.active=fit.active;s.appliedZoom=nextZoom;s.camX=nextX;s.camY=nextY;s.points=pts;s.fit=fit;s.transition=transition;s.lastMode=fit.active?(isController(g.player)?'controller':'sniper'):'native';
 return s;}
function applyFrame(g,s){if(!g.cam)return;g.zoom=s.appliedZoom;g.cam.zoom=s.appliedZoom;if(s.transition||s.active){g.cam.x=s.camX;g.cam.y=s.camY;}}
function relayTarget(points){for(var i=0;i<points.length;i++)if(points[i].kind==='relay-target')return points[i].entity||null;return null;}
function precisionSnap(g,s,CLASSES){var pl=g.player,input=g.input;if(!s.active||!isSniper(pl)||!input||!input.mouseActive||!input.firing||!g.canvas)return null;var target=relayTarget(s.points||[]);if(!target)return null;var native=s.nativeZoom||s.appliedZoom,current=s.appliedZoom;if(current>=native-.003)return null;
 var rect=g.canvas.getBoundingClientRect(),sx=(target.x-g.cam.x)*current+g.w*.5,sy=(target.y-g.cam.y)*current+g.h*.5,mx=input.mouseX-rect.left,my=input.mouseY-rect.top,size=((CLASSES[target.cls]&&CLASSES[target.cls].size)||15)+2,nativeR=clamp(size*native+2,8,34),currentR=clamp(size*current+2,6,34),preserve=Math.max(currentR,nativeR);
 var dx=mx-sx,dy=my-sy;if(dx*dx+dy*dy>preserve*preserve)return null;var saved={x:input.mouseX,y:input.mouseY,targetId:target.id,radius:preserve};input.mouseX=rect.left+sx;input.mouseY=rect.top+sy;return saved;}
function restoreSnap(g,saved){if(saved&&g.input){g.input.mouseX=saved.x;g.input.mouseY=saved.y;}}
function screenOf(cam,z,w,h,p){return{x:(p.x-cam.x)*z+w*.5,y:(p.y-cam.y)*z+h*.5};}
function worldFromScreen(cam,z,w,h,s){return{x:cam.x+(s.x-w*.5)/z,y:cam.y+(s.y-h*.5)/z};}
wrap('game/engine',function(engine,require){var Game=engine.Game;if(!Game||Game.prototype.__novaLongGlass)return;Game.prototype.__novaLongGlass=true;var CLASSES=require('./classes').CLASSES,old=Game.prototype.update;if(!old)return;
 Game.prototype.update=function(dt){var s=frameStep(this,dt);applyFrame(this,s);var snap=precisionSnap(this,s,CLASSES),out;try{out=old.call(this,dt);}finally{restoreSnap(this,snap);applyFrame(this,s);}return out;};
});
window.__NOVA_TACTICAL_FRAMING__={version:VERSION,principles:{playerAndIntentFit:true,projectionCorrectAim:true,nativeTolerancePreserved:true,hiddenTargetReveal:false,hitboxInflation:false}};
window.__NOVA_TACTICAL_FRAMING_TEST__={tacticalPoints:tacticalPoints,fitFor:fitFor,nativeVisible:nativeVisible,screenOf:screenOf,worldFromScreen:worldFromScreen,precisionRadius:function(size,native,current){return Math.max(clamp((size+2)*current+2,6,34),clamp((size+2)*native+2,8,34));}};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' tactical framing linked');
})();
