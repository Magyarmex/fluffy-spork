/* NOVA TANKS v1.4.0 — Forward Observer
 * Sniper AI/acquisition correction, spotter-drone reconnaissance, evolution safety,
 * Controller/drone invariants, and stronger pre-shot readability.
 */
(function () {
  'use strict';

  var mods = window.__novaModules;
  if (!mods) {
    console.error('[NOVA v1.4.0] module registry unavailable');
    return;
  }

  var VERSION = '1.4.0';
  var CODENAME = 'Forward Observer';
  var TAU = Math.PI * 2;
  var MAP_LIMIT = 2250;
  var DIRECT_VISION = 720;
  var SPOTTER_FOV_RANGE = 480;
  var SPOTTER_FOV_HALF = 0.98; // ~112 degree total cone
  var SPOTTER_MEMORY = 1.45;
  var SPOTTER_LEASH = 1240;
  var SPOTTER_ORBIT = 690;
  var AI_RAIL_CHARGE = 0.82;
  var ELITE_RAIL_CHARGE = 0.70;
  var AI_RAIL_RECOVERY = 1.60;
  var ELITE_RAIL_RECOVERY = 1.35;

  var SNIPER_IDS = {
    marksman:1, railgun:1, ghost:1,
    singularity:1, prism:1, specter:1, assassin:1
  };
  var CONTROLLER_IDS = {
    carrier:1, overlord:1, warden:1,
    hivemind:1, broodmother:1, citadel:1, valkyrie:1
  };

  window.__NOVA_STABILITY_RELEASE__ = {
    version: VERSION,
    codename: CODENAME,
    date: '2026-08-07',
    headline: 'Snipers need eyes before they can kill beyond sight.'
  };

  function wrapModule(id, after) {
    var original = mods[id];
    if (!original) {
      console.warn('[NOVA v1.4.0] module not found:', id);
      return;
    }
    mods[id] = function (module, exports, require) {
      original(module, exports, require);
      after(module.exports, require);
    };
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function dist2(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; }
  function angleDelta(target, current) {
    var d = (target - current + Math.PI) % TAU;
    if (d < 0) d += TAU;
    return d - Math.PI;
  }
  function moveAngle(current, target, maxStep) {
    return current + clamp(angleDelta(target, current), -maxStep, maxStep);
  }
  function pointSegmentDist2(px, py, ax, ay, bx, by) {
    var abx = bx - ax, aby = by - ay;
    var den = abx * abx + aby * aby;
    if (den < 1e-8) return dist2(px, py, ax, ay);
    var t = clamp(((px - ax) * abx + (py - ay) * aby) / den, 0, 1);
    return dist2(px, py, ax + abx * t, ay + aby * t);
  }
  function isSniper(t) { return !!(t && SNIPER_IDS[t.cls]); }
  function isController(t) { return !!(t && CONTROLLER_IDS[t.cls]); }
  function isRail(t, CLASSES) {
    var d = t && CLASSES[t.cls];
    return !!(d && d.fireMode === 'beam');
  }
  function worldToScreen(g, x, y) {
    var z = g.cam && g.cam.zoom ? g.cam.zoom : 1;
    return { x:(x - g.cam.x) * z + g.w * 0.5, y:(y - g.cam.y) * z + g.h * 0.5 };
  }
  function edgePoint(w, h, ang, pad) {
    var cx=w*0.5, cy=h*0.5, dx=Math.cos(ang), dy=Math.sin(ang);
    var rx=Math.max(1,cx-pad), ry=Math.max(1,cy-pad);
    var s=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);
    return {x:cx+dx*s,y:cy+dy*s};
  }
  function panFrom(g, x) {
    if (!g.player) return 0;
    var span = Math.max(420, g.w / Math.max(0.55, (g.cam && g.cam.zoom) || 1));
    return clamp((x - g.player.x) / span, -1, 1);
  }
  function resetRailFocus(t) {
    if (!t) return;
    t.__novaFocusStart = 0;
    t.__novaFocus = 0;
    t.__novaFocusAngle = null;
    t.__novaFocusLast = 0;
    t.__novaChargeCue = false;
    t.__novaAICharge = 0;
    t.__novaAIFocusLost = 0;
    t.__novaAIRailReady = false;
    t.__novaAIWarnStage = 0;
    t.__novaRailTargetId = -1;
  }
  function collapseUpgradeTraySoon() {
    if (typeof document === 'undefined') return;
    setTimeout(function () {
      var bs = document.querySelectorAll('button[data-ui]');
      for (var i=0;i<bs.length;i++) {
        if ((bs[i].textContent || '').trim() === 'MINIMIZE') {
          try { bs[i].click(); } catch (_) {}
          break;
        }
      }
    }, 40);
  }

  wrapModule('game/audio', function (audio) {
    var Sfx = audio.Sfx;
    if (!Sfx || Sfx.prototype.__novaForwardObserver) return;
    Sfx.prototype.__novaForwardObserver = true;

    function route(self, node, pan) {
      if (!self.ctx || !self.master) return;
      if (self.ctx.createStereoPanner) {
        var p = self.ctx.createStereoPanner();
        p.pan.value = clamp(pan || 0, -1, 1);
        node.connect(p); p.connect(self.master);
      } else node.connect(self.master);
    }
    function voice(self, f0, f1, dur, gain, pan, type, delay) {
      self.resume();
      if (!self.ctx || !self.master || self.muted) return;
      var c=self.ctx, t0=c.currentTime+(delay||0), o=c.createOscillator(), g=c.createGain();
      o.type=type||'sine'; o.frequency.setValueAtTime(Math.max(20,f0),t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t0+dur);
      g.gain.setValueAtTime(0.0001,t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002,gain),t0+Math.min(0.015,dur*0.22));
      g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
      o.connect(g); route(self,g,pan); o.start(t0); o.stop(t0+dur+0.025);
    }
    function noise(self, dur, gain, pan, hp, lp, delay) {
      self.resume();
      if (!self.ctx || !self.master || self.muted) return;
      var c=self.ctx;
      if (!self.__novaObserverNoise) {
        var n=Math.max(1,Math.floor(c.sampleRate*0.3));
        var buf=c.createBuffer(1,n,c.sampleRate), data=buf.getChannelData(0);
        for(var i=0;i<n;i++) data[i]=Math.random()*2-1;
        self.__novaObserverNoise=buf;
      }
      var t0=c.currentTime+(delay||0), src=c.createBufferSource(), hi=c.createBiquadFilter(), lo=c.createBiquadFilter(), g=c.createGain();
      src.buffer=self.__novaObserverNoise;
      hi.type='highpass'; hi.frequency.value=hp||900;
      lo.type='lowpass'; lo.frequency.value=lp||9000;
      g.gain.setValueAtTime(Math.max(0.0002,gain),t0);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
      src.connect(hi); hi.connect(lo); lo.connect(g); route(self,g,pan);
      src.start(t0); src.stop(t0+dur+0.025);
    }

    Sfx.prototype.novaSpotterContact = function (pan, hostile) {
      var now=performance.now();
      if(this.__novaSpotterAt && now-this.__novaSpotterAt<260) return;
      this.__novaSpotterAt=now;
      voice(this, hostile?960:760, hostile?1450:1180, 0.09, hostile?0.040:0.026, pan, 'sine', 0);
      voice(this, hostile?1450:1180, hostile?1120:910, 0.10, hostile?0.025:0.016, pan, 'triangle', 0.065);
    };
    Sfx.prototype.novaRailWarning = function (pan, stage) {
      var now=performance.now();
      var key=stage===2?'__novaRailWarn2':'__novaRailWarn1';
      if(this[key] && now-this[key]<260) return;
      this[key]=now;
      if(stage===1) {
        voice(this, 340, 620, 0.18, 0.033, pan, 'sine', 0);
        voice(this, 1020, 1320, 0.10, 0.014, pan, 'triangle', 0.07);
      } else {
        voice(this, 620, 1680, 0.20, 0.044, pan, 'sine', 0);
        noise(this, 0.11, 0.026, pan, 1600, 10500, 0.025);
        voice(this, 1900, 1180, 0.10, 0.022, pan, 'triangle', 0.10);
      }
    };
    Sfx.prototype.novaRailFlybyActual = function (pan) {
      var now=performance.now();
      if(this.__novaActualFlybyAt && now-this.__novaActualFlybyAt<90) return;
      this.__novaActualFlybyAt=now;
      noise(this,0.095,0.045,pan,1800,12000,0);
      voice(this,2500,520,0.12,0.032,pan,'sawtooth',0.005);
    };
  });

  /* Replace only the sniper lineage AI. All other AI keeps the base implementation. */
  wrapModule('game/ai', function (aiMod, require) {
    var baseUpdateAI = aiMod.updateAI;
    var CLASSES = require('./classes').CLASSES;

    function authorizedTarget(t, target, g) {
      if (!target || !target.alive || target.id === t.id) return false;
      if (dist2(t.x,t.y,target.x,target.y) <= DIRECT_VISION*DIRECT_VISION) return true;
      return !!(t.__novaSpotterContactId === target.id && t.__novaSpotterContactUntil > g.time);
    }
    function selectTarget(t, g) {
      var direct = null, best = DIRECT_VISION*DIRECT_VISION;
      for (var i=0;i<g.tanks.length;i++) {
        var x=g.tanks[i];
        if(!x||!x.alive||x.id===t.id||x.spawnShieldT>0) continue;
        var dd=dist2(t.x,t.y,x.x,x.y);
        if(dd<best){best=dd;direct=x;}
      }
      if(direct) return direct;
      if(t.__novaSpotterContactId>=0 && t.__novaSpotterContactUntil>g.time) {
        var spotted=g.getTank(t.__novaSpotterContactId);
        if(spotted&&spotted.alive&&spotted.spawnShieldT<=0) return spotted;
      }
      return null;
    }
    function dodgeOverlay(t,g) {
      var dx=0,dy=0,n=0;
      for(var i=0;i<g.bullets.length;i++){
        var b=g.bullets[i]; if(!b||b.dead||b.ownerId===t.id)continue;
        var rx=b.x-t.x,ry=b.y-t.y,d2v=rx*rx+ry*ry;
        if(d2v>170*170)continue;
        var sp=Math.hypot(b.vx,b.vy)||1;
        var dot=(rx*b.vx+ry*b.vy)/sp;
        if(dot<=0)continue;
        var perp=d2v-dot*dot;
        if(perp<100*100){var side=((t.id+i)&1)?1:-1;dx+=(-b.vy/sp)*side;dy+=(b.vx/sp)*side;n++;}
      }
      if(!n)return {x:0,y:0};
      var l=Math.hypot(dx,dy)||1; return {x:dx/l,y:dy/l};
    }
    function sampleAim(t,target,g,dt) {
      var ai=t.ai, d=Math.hypot(target.x-t.x,target.y-t.y)||1;
      ai.__novaAimSampleT=(ai.__novaAimSampleT||0)-dt;
      if(ai.__novaAimSampleT<=0||ai.__novaAimX==null){
        ai.__novaAimSampleT=ai.isElite?0.075:0.115;
        var flight=clamp(d/Math.max(1,g.bulletSpeed(t)),0,0.72);
        var pred=ai.isElite?0.92:0.68;
        var err=(ai.isElite?0.008:0.020)*d;
        ai.__novaAimX=target.x+(target.vx||0)*flight*pred+(Math.random()*2-1)*err;
        ai.__novaAimY=target.y+(target.vy||0)*flight*pred+(Math.random()*2-1)*err;
      }
      return Math.atan2(ai.__novaAimY-t.y,ai.__novaAimX-t.x);
    }
    function manageRail(t,g,target,dt,combat) {
      var ai=t.ai, now=performance.now();
      if(t.fireCd>0 || (t.__novaSuppressedUntil&&now<t.__novaSuppressedUntil) || !authorizedTarget(t,target,g)) {
        resetRailFocus(t); return;
      }
      var exact=Math.atan2(target.y-t.y,target.x-t.x);
      var err=Math.abs(angleDelta(exact,t.angle));
      var q=t.__novaAICharge||0;
      var permitted=err<(q<0.40?0.28:q<0.72?0.22:0.17);
      if(!permitted){
        t.__novaAIFocusLost=(t.__novaAIFocusLost||0)+dt;
        if(t.__novaAIFocusLost>0.10) resetRailFocus(t);
        return;
      }
      t.__novaAIFocusLost=0;
      var fullTime=combat?(ai.isElite?ELITE_RAIL_CHARGE:AI_RAIL_CHARGE):0.62;
      q=clamp(q+dt/fullTime,0,1);
      t.__novaAICharge=q;
      t.__novaFocus=q;
      t.__novaFocusStart=now-q*520;
      t.__novaFocusLast=now;
      t.__novaRailTargetId=target.id;

      if(combat&&target.isPlayer){
        var pan=panFrom(g,t.x);
        if(q>=0.26&&(t.__novaAIWarnStage||0)<1){
          t.__novaAIWarnStage=1;
          if(g.sfx&&g.sfx.novaRailWarning)g.sfx.novaRailWarning(pan,1);
        }
        if(q>=0.62&&(t.__novaAIWarnStage||0)<2){
          t.__novaAIWarnStage=2;
          if(g.sfx&&g.sfx.novaRailWarning)g.sfx.novaRailWarning(pan,2);
          if(g.addText)g.addText(target.x,target.y-36,'RAIL FOCUS','#d8c0ff',9);
        }
      }
      if(q>=1&&err<0.17){
        t.__novaAIRailReady=true;
        t.__novaChargeCue=true;
        g.tryFire(t);
      }
    }
    function updateSniperAI(t,g,dt){
      var ai=t.ai;if(!ai)return;
      ai.thinkT=(ai.thinkT||0)-dt;
      if(ai.thinkT<=0){
        ai.thinkT=0.10+Math.random()*0.055;
        var tg=selectTarget(t,g);
        if(tg){ai.state='hunt';ai.targetId=tg.id;}
        else{
          var sh=g.nearestShape(t.x,t.y,560);
          if(sh){ai.state='farm';ai.targetId=sh.id;}else{ai.state='wander';ai.targetId=-1;}
        }
      }
      var target=ai.targetId>=0?g.getTank(ai.targetId):null;
      var shape=ai.targetId>=0&&!target?g.getShape(ai.targetId):null;
      if(target&&!authorizedTarget(t,target,g)){target=null;ai.targetId=-1;ai.state='wander';resetRailFocus(t);}
      var spd=g.tankSpeed(t),mx=0,my=0,want=t.angle;
      if(target&&ai.state==='hunt'){
        var dx=target.x-t.x,dy=target.y-t.y,d=Math.hypot(dx,dy)||1,ux=dx/d,uy=dy/d;
        var def=CLASSES[t.cls], reach=g.weaponRange(t);
        var pref=clamp(reach*0.62,430,820);
        var radial=d>pref*1.12?1:d<pref*0.72?-1:0;
        ai.strafe=ai.strafe||(((t.id&1)?1:-1));
        if(Math.random()<0.0025)ai.strafe*=-1;
        mx=ux*radial+(-uy)*ai.strafe*0.74;
        my=uy*radial+(ux)*ai.strafe*0.74;
        var dod=dodgeOverlay(t,g);mx+=dod.x*1.1;my+=dod.y*1.1;
        var ml=Math.hypot(mx,my)||1;if(ml>1){mx/=ml;my/=ml;}
        want=sampleAim(t,target,g,dt);
        var q=t.__novaAICharge||0;
        var turn=q<0.38?(ai.isElite?3.0:2.5):q<0.70?(ai.isElite?1.75:1.35):(ai.isElite?0.95:0.70);
        t.angle=moveAngle(t.angle,want,turn*dt);
        g.moveTank(t,mx*spd,my*spd,dt);
        t.moving=Math.hypot(t.vx||0,t.vy||0)>24;
        if(isRail(t,CLASSES)) manageRail(t,g,target,dt,true);
        else if(d<g.weaponRange(t)&&Math.abs(angleDelta(Math.atan2(dy,dx),t.angle))<0.18)g.tryFire(t);
      }else if(shape&&ai.state==='farm'){
        var sdx=shape.x-t.x,sdy=shape.y-t.y,sd=Math.hypot(sdx,sdy)||1;
        if(sd>330){mx=sdx/sd;my=sdy/sd;}else{mx=-sdy/sd*0.45;my=sdx/sd*0.45;}
        want=Math.atan2(sdy,sdx);t.angle=moveAngle(t.angle,want,3.0*dt);
        g.moveTank(t,mx*spd,my*spd,dt);t.moving=true;
        if(isRail(t,CLASSES)){
          // Shape farming is allowed, but cannot leave a hidden charged shot banked.
          t.__novaSpotterContactId=shape.id;
          t.__novaSpotterContactUntil=g.time+0.05;
          var oldAuth=t.__novaSpotterContactId;
          // Rail farm uses a normal fire attempt only after a deliberate short aim dwell.
          ai.__novaFarmAim=(ai.__novaFarmAim||0)+dt;
          if(ai.__novaFarmAim>0.42&&sd<g.weaponRange(t)&&Math.abs(angleDelta(want,t.angle))<0.15){
            t.__novaAIRailReady=true;t.__novaChargeCue=true;t.__novaFocusStart=performance.now()-520;t.__novaFocus=1;
            g.tryFire(t);ai.__novaFarmAim=0;
          }
          t.__novaSpotterContactId=oldAuth;
        }else if(sd<g.weaponRange(t)&&Math.abs(angleDelta(want,t.angle))<0.20)g.tryFire(t);
      }else{
        resetRailFocus(t);
        ai.wanderT=(ai.wanderT||0)-dt;
        if(ai.wanderT<=0){ai.wanderT=1.2+Math.random()*2.4;ai.wanderA=Math.random()*TAU;}
        mx=Math.cos(ai.wanderA);my=Math.sin(ai.wanderA);
        g.moveTank(t,mx*spd*0.55,my*spd*0.55,dt);t.moving=true;
      }
      // Arena edge safety.
      if(t.x>MAP_LIMIT-140)t.x=MAP_LIMIT-140;
      if(t.x<-MAP_LIMIT+140)t.x=-MAP_LIMIT+140;
      if(t.y>MAP_LIMIT-140)t.y=MAP_LIMIT-140;
      if(t.y<-MAP_LIMIT+140)t.y=-MAP_LIMIT+140;
      if(t.abilityCd<=0&&(ai.state==='hunt'||ai.state==='flee')&&Math.random()<0.006)g.useAbility(t);
    }

    aiMod.updateAI=function(t,g,dt){
      if(isSniper(t))return updateSniperAI(t,g,dt);
      return baseUpdateAI(t,g,dt);
    };
  });

  wrapModule('game/engine', function (engine, require) {
    var Game=engine.Game;
    if(!Game||Game.prototype.__novaForwardObserver)return;
    Game.prototype.__novaForwardObserver=true;
    var CLASSES=require('./classes').CLASSES;

    function clearEnemyFocus(g){
      for(var i=0;i<g.tanks.length;i++){
        var t=g.tanks[i];if(t&&!t.isPlayer&&isRail(t,CLASSES))resetRailFocus(t);
      }
    }
    function evolutionGrace(g){
      if(!g.player)return;
      g.player.spawnShieldT=Math.max(g.player.spawnShieldT||0,1.8);
      g.player.hitFlash=0;
      if(g.input){g.input.firing=false;g.input.abilityQueued=false;}
      clearEnemyFocus(g);
      collapseUpgradeTraySoon();
    }

    var oldTryOffer=Game.prototype.tryOffer;
    Game.prototype.tryOffer=function(tier){
      clearEnemyFocus(this);
      if(this.input){this.input.firing=false;this.input.abilityQueued=false;}
      return oldTryOffer.call(this,tier);
    };
    ['applyClass','applyPerk','applyGene','dismissOffer'].forEach(function(name){
      var old=Game.prototype[name];if(!old)return;
      Game.prototype[name]=function(){
        var out=old.apply(this,arguments);
        evolutionGrace(this);
        return out;
      };
    });

    var prevTryFire=Game.prototype.tryFire;
    Game.prototype.tryFire=function(t){
      if(!t||t.isPlayer||!isRail(t,CLASSES))return prevTryFire.call(this,t);
      if(!t.__novaAIRailReady)return;
      var before=this.bullets?this.bullets.length:0;
      t.__novaFocusStart=performance.now()-530;
      t.__novaFocus=1;
      t.__novaChargeCue=true;
      var out=prevTryFire.call(this,t);
      var fired=this.bullets&&this.bullets.length>before;
      if(fired)t.fireCd=Math.max(t.fireCd||0,t.ai&&t.ai.isElite?ELITE_RAIL_RECOVERY:AI_RAIL_RECOVERY);
      resetRailFocus(t);
      return out;
    };

    function assignSpotters(g){
      var chosen=Object.create(null);
      for(var i=0;i<g.drones.length;i++){
        var d=g.drones[i],owner=g.tankById&&g.tankById.get(d.ownerId);
        if(!owner||!owner.alive||!isSniper(owner)){d.__novaSpotter=false;continue;}
        var cur=chosen[owner.id];
        if(!cur||((d.slot||0)<(cur.slot||0)))chosen[owner.id]=d;
      }
      for(var j=0;j<g.drones.length;j++){
        var dr=g.drones[j],own=g.tankById&&g.tankById.get(dr.ownerId);
        if(!own||!isSniper(own))continue;
        var yes=chosen[own.id]===dr;
        dr.__novaSpotter=yes;
        if(yes){
          dr.leash=Math.max(dr.leash||0,SPOTTER_LEASH);
          dr.orbitR=Math.max(dr.orbitR||0,SPOTTER_ORBIT+(own.cls==='marksman'?0:70));
          dr.speed=Math.max(dr.speed||0,275);
        }
      }
    }

    var oldAcquire=Game.prototype.acquireDroneTarget;
    Game.prototype.acquireDroneTarget=function(d,owner,leash){
      if(d&&d.__novaSpotter&&owner&&isSniper(owner)){
        var best=null,bd=245*245;
        for(var i=0;i<this.shapes.length;i++){
          var s=this.shapes[i];if(!s||s.hp<=0)continue;
          var dd=dist2(d.x,d.y,s.x,s.y);
          if(dd<bd&&dist2(owner.x,owner.y,s.x,s.y)<SPOTTER_LEASH*SPOTTER_LEASH){bd=dd;best=s;}
        }
        return best;
      }
      return oldAcquire.call(this,d,owner,leash);
    };

    function updateSpotterVision(g,owner,d){
      // Undo most of the legacy escort orbit's very fast angular advance: spotters sweep deliberately.
      d.orbitA=(d.orbitA||0)-0.030;
      var best=null,bestD=SPOTTER_FOV_RANGE*SPOTTER_FOV_RANGE;
      for(var i=0;i<g.tanks.length;i++){
        var t=g.tanks[i];if(!t||!t.alive||t.id===owner.id||t.spawnShieldT>0)continue;
        var dd=dist2(d.x,d.y,t.x,t.y);if(dd>bestD)continue;
        var a=Math.atan2(t.y-d.y,t.x-d.x);
        if(Math.abs(angleDelta(a,d.angle||0))>SPOTTER_FOV_HALF)continue;
        best=t;bestD=dd;
      }
      if(best){
        var changed=owner.__novaSpotterContactId!==best.id||owner.__novaSpotterContactUntil<=g.time;
        owner.__novaSpotterContactId=best.id;
        owner.__novaSpotterContactUntil=g.time+SPOTTER_MEMORY;
        owner.__novaSpotterDroneId=d.id;
        if(changed){
          if(g.addRing)g.addRing(d.x,d.y,'#9dd7ff',24);
          if(owner.isPlayer){
            if(g.addText)g.addText(d.x,d.y-18,'CONTACT','#b9e7ff',9);
            if(g.sfx&&g.sfx.novaSpotterContact)g.sfx.novaSpotterContact(panFrom(g,d.x),false);
          }else if(best.isPlayer){
            if(g.addText)g.addText(best.x,best.y-30,'SPOTTED','#ffd98a',9);
            if(g.sfx&&g.sfx.novaSpotterContact)g.sfx.novaSpotterContact(panFrom(g,d.x),true);
          }
        }
      }
      if(owner.__novaSpotterContactUntil<=g.time){owner.__novaSpotterContactId=-1;owner.__novaSpotterDroneId=-1;}
    }

    function sanitizeControllerDrones(g){
      var phases={orbit:1,form:1,windup:1,dash:1,recover:1};
      for(var i=0;i<g.drones.length;i++){
        var d=g.drones[i],o=g.tankById&&g.tankById.get(d.ownerId);
        if(!o||!isController(o))continue;
        if(!Number.isFinite(d.x)||!Number.isFinite(d.y)||!Number.isFinite(d.hp)){
          d.x=o.x+Math.cos((d.slot||0)*1.7)*48;d.y=o.y+Math.sin((d.slot||0)*1.7)*48;
          d.__novaVX=0;d.__novaVY=0;d.hp=Math.max(1,Number.isFinite(d.maxHp)?d.maxHp:30);
          d.__novaPhase='form';d.__novaPhaseT=0;d.__novaCommitted=false;d.__novaTarget=null;
        }
        if(d.__novaPhase&&!phases[d.__novaPhase]){d.__novaPhase='form';d.__novaPhaseT=0;d.__novaCommitted=false;d.__novaTarget=null;}
        if(d.__novaTarget&&(d.__novaTarget.hp<=0||(d.__novaTarget.kind==='tank'&&!d.__novaTarget.alive))){d.__novaTarget=null;if(d.__novaPhase==='windup')d.__novaPhase='recover';}
        if(d.__novaPhase==='dash'&&(!Number.isFinite(d.__novaDiveDX)||!Number.isFinite(d.__novaDiveDY))){d.__novaPhase='recover';d.__novaPhaseT=0.35;d.__novaCommitted=false;}
      }
      for(var j=0;j<g.tanks.length;j++){
        var t=g.tanks[j];if(!t||!isController(t)||!t.__novaSwarm)continue;
        var st=t.__novaSwarm;
        if(st.target&&(!st.target.alive&&st.target.kind==='tank'||st.target.hp<=0)){st.target=null;st.targetId=-1;}
        if(!Number.isFinite(st.nodeX)||!Number.isFinite(st.nodeY)){st.nodeX=t.x;st.nodeY=t.y;st.active=false;st.wasActive=false;}
      }
    }

    var oldUpdateDrones=Game.prototype.updateDrones;
    Game.prototype.updateDrones=function(dt){
      assignSpotters(this);
      oldUpdateDrones.call(this,dt);
      assignSpotters(this);
      for(var i=0;i<this.tanks.length;i++){
        var owner=this.tanks[i];if(!owner||!owner.alive||!isSniper(owner))continue;
        var spot=null;
        for(var j=0;j<this.drones.length;j++){var d=this.drones[j];if(d.ownerId===owner.id&&d.__novaSpotter){spot=d;break;}}
        if(spot)updateSpotterVision(this,owner,spot);
        else {owner.__novaSpotterContactId=-1;owner.__novaSpotterContactUntil=0;owner.__novaSpotterDroneId=-1;}
      }
      sanitizeControllerDrones(this);
    };

    var oldUpdateBullets=Game.prototype.updateBullets;
    Game.prototype.updateBullets=function(dt){
      var pl=this.player;
      if(pl&&pl.alive){
        for(var i=0;i<this.bullets.length;i++){
          var b=this.bullets[i];if(!b||b.dead||!b.__novaRail||b.ownerId===pl.id||b.__novaActualFlyby)continue;
          var nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;
          if(pointSegmentDist2(pl.x,pl.y,b.x,b.y,nx,ny)<330*330){
            b.__novaActualFlyby=true;
            if(this.sfx&&this.sfx.novaRailFlybyActual)this.sfx.novaRailFlybyActual(panFrom(this,b.x));
          }
        }
      }
      return oldUpdateBullets.call(this,dt);
    };
  });

  wrapModule('game/render', function (renderMod, require) {
    var oldRender=renderMod.render;
    if(!oldRender||oldRender.__novaForwardObserver)return;
    var CLASSES=require('./classes').CLASSES;

    function drawSpotter(ctx,g,d,owner,w,h){
      var p=worldToScreen(g,d.x,d.y);if(p.x<-80||p.x>w+80||p.y<-80||p.y>h+80)return;
      var z=(g.cam&&g.cam.zoom)||1, rr=Math.min(92,SPOTTER_FOV_RANGE*z*0.20);
      var a=d.angle||0;
      ctx.save();ctx.globalCompositeOperation='lighter';
      ctx.strokeStyle=owner.isPlayer?'rgba(157,215,255,.30)':'rgba(196,147,255,.20)';ctx.fillStyle=owner.isPlayer?'rgba(100,190,255,.035)':'rgba(196,147,255,.025)';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.arc(p.x,p.y,rr,a-SPOTTER_FOV_HALF,a+SPOTTER_FOV_HALF);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.strokeStyle=owner.isPlayer?'rgba(185,231,255,.72)':'rgba(216,192,255,.55)';ctx.shadowBlur=10;ctx.shadowColor=owner.isPlayer?'#9dd7ff':'#c493ff';
      ctx.beginPath();ctx.arc(p.x,p.y,11,0,TAU);ctx.stroke();
      ctx.fillStyle='rgba(235,248,255,.76)';ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText('SPOT',p.x,p.y-15);ctx.restore();
    }
    function drawPlayerSpotterContact(ctx,g,pl,w,h){
      if(!isSniper(pl)||pl.__novaSpotterContactId<0||pl.__novaSpotterContactUntil<=g.time)return;
      var t=g.getTank(pl.__novaSpotterContactId);if(!t||!t.alive)return;
      var p=worldToScreen(g,t.x,t.y),off=p.x<24||p.x>w-24||p.y<24||p.y>h-24;
      ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(157,215,255,.62)';ctx.fillStyle='rgba(185,231,255,.82)';ctx.lineWidth=1.2;ctx.shadowBlur=10;ctx.shadowColor='#9dd7ff';
      if(off){var ang=Math.atan2(p.y-h*.5,p.x-w*.5),ep=edgePoint(w,h,ang,18);ctx.translate(ep.x,ep.y);ctx.rotate(ang);ctx.beginPath();ctx.moveTo(8,0);ctx.lineTo(-4,-5);ctx.lineTo(-4,5);ctx.closePath();ctx.stroke();ctx.fillStyle='rgba(185,231,255,.72)';ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText('SPOT',0,-10);}
      else{ctx.beginPath();ctx.arc(p.x,p.y,24,0,TAU);ctx.stroke();}
      ctx.restore();
    }
    function drawRailWarning(ctx,g,t,w,h){
      if(!g.player||t.__novaRailTargetId!==g.player.id||(t.__novaAICharge||0)<0.20)return;
      var p=worldToScreen(g,t.x,t.y),ang=Math.atan2(p.y-h*.5,p.x-w*.5),ep=edgePoint(w,h,ang,17),q=clamp(t.__novaAICharge||0,0,1);
      var pulse=.65+.35*Math.sin(performance.now()*.022);
      ctx.save();ctx.translate(ep.x,ep.y);ctx.rotate(ang);ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(216,192,255,'+(.28+q*.62)*pulse+')';ctx.lineWidth=1.2+q;ctx.shadowBlur=12+q*12;ctx.shadowColor='#c493ff';
      ctx.beginPath();ctx.moveTo(-9,0);ctx.lineTo(9+q*8,0);ctx.moveTo(2,-5-q*3);ctx.lineTo(2,5+q*3);ctx.stroke();
      if(q>=.62){ctx.fillStyle='rgba(235,221,255,.84)';ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText('RAIL',0,-11);}
      ctx.restore();
    }
    function patchedRender(g,w,h){
      oldRender(g,w,h);if(!g||!g.ctx||!g.player||!g.player.alive)return;
      var ctx=g.ctx,pl=g.player;ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);
      for(var i=0;i<g.drones.length;i++){var d=g.drones[i],o=g.tankById&&g.tankById.get(d.ownerId);if(d&&d.__novaSpotter&&o)drawSpotter(ctx,g,d,o,w,h);}
      drawPlayerSpotterContact(ctx,g,pl,w,h);
      for(var j=0;j<g.tanks.length;j++){var t=g.tanks[j];if(t&&!t.isPlayer&&isRail(t,CLASSES))drawRailWarning(ctx,g,t,w,h);}
      ctx.restore();
    }
    patchedRender.__novaForwardObserver=true;
    renderMod.render=patchedRender;
  });

  console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' reconnaissance and stability online');
})();
