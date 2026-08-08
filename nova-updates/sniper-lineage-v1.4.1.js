/* NOVA TANKS v1.4.1 — Violet Doctrine
 * Extends Forward Observer's skill/counterplay language across the entire
 * purple Sniper lineage while preserving beam-specific Rail physics.
 */
(function () {
  'use strict';

  var mods = window.__novaModules;
  if (!mods) {
    console.error('[NOVA v1.4.1] module registry unavailable');
    return;
  }

  var VERSION = '1.4.1';
  var CODENAME = 'Violet Doctrine';
  var TAU = Math.PI * 2;
  var DIRECT_VISION = 720;
  var SUPPRESS_RADIUS = 34;
  var OBSERVER_RELAY_REBOOT = 3.4;

  var PURPLE = {
    marksman: 1, railgun: 1, ghost: 1,
    singularity: 1, prism: 1, specter: 1, assassin: 1
  };

  var PROFILES = {
    marksman: { dwell: 0.42, recovery: 0.82, reveal: 0.54, warn1: 0.27, warn2: 0.70, glyph: 'SIGHT', flavor: 'marksman' },
    ghost:    { dwell: 0.34, recovery: 0.72, reveal: 0.36, warn1: 0.30, warn2: 0.72, glyph: 'AMBUSH', flavor: 'ghost' },
    specter:  { dwell: 0.24, recovery: 0.52, reveal: 0.28, warn1: 0.34, warn2: 0.76, glyph: 'HUNT', flavor: 'specter' },
    assassin: { dwell: 0.54, recovery: 1.00, reveal: 0.68, warn1: 0.24, warn2: 0.64, glyph: 'EXEC', flavor: 'assassin' }
  };

  window.__NOVA_SNIPER_LINEAGE_RELEASE__ = {
    version: VERSION,
    codename: CODENAME,
    date: '2026-08-08',
    headline: 'Every purple tank now fights through the same reconnaissance and counterplay doctrine.'
  };

  function wrapModule(id, after) {
    var original = mods[id];
    if (!original) {
      console.warn('[NOVA v1.4.1] module not found:', id);
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
  function pointSegmentDist2(px, py, ax, ay, bx, by) {
    var abx = bx - ax, aby = by - ay;
    var den = abx * abx + aby * aby;
    if (den < 1e-8) return dist2(px, py, ax, ay);
    var t = clamp(((px - ax) * abx + (py - ay) * aby) / den, 0, 1);
    return dist2(px, py, ax + abx * t, ay + aby * t);
  }
  function isPurple(t) { return !!(t && PURPLE[t.cls]); }
  function isRail(t, CLASSES) {
    var d = t && CLASSES[t.cls];
    return !!(d && d.fireMode === 'beam');
  }
  function worldToScreen(g, x, y) {
    var z = g.cam && g.cam.zoom ? g.cam.zoom : 1;
    return { x:(x-g.cam.x)*z+g.w*0.5, y:(y-g.cam.y)*z+g.h*0.5 };
  }
  function edgePoint(w, h, ang, pad) {
    var cx=w*0.5, cy=h*0.5, dx=Math.cos(ang), dy=Math.sin(ang);
    var rx=Math.max(1,cx-pad), ry=Math.max(1,cy-pad);
    var s=1/Math.max(Math.abs(dx)/rx,Math.abs(dy)/ry);
    return {x:cx+dx*s,y:cy+dy*s};
  }
  function panFrom(g, x) {
    if (!g.player) return 0;
    var span=Math.max(420,g.w/Math.max(0.55,(g.cam&&g.cam.zoom)||1));
    return clamp((x-g.player.x)/span,-1,1);
  }
  function resetPrecision(t) {
    if (!t) return;
    t.__novaPrecisionStart = 0;
    t.__novaPrecisionLast = 0;
    t.__novaPrecision = 0;
    t.__novaPrecisionTargetId = -1;
    t.__novaPrecisionWarnStage = 0;
  }
  function authorizedLongRange(t, target, g) {
    if (!target || !target.alive || target.id === t.id) return false;
    var direct = dist2(t.x,t.y,target.x,target.y) <= DIRECT_VISION*DIRECT_VISION;
    if (direct) return true;
    if (t.__novaSpotterDownUntil && t.__novaSpotterDownUntil > g.time) return false;
    return t.__novaSpotterContactId === target.id && t.__novaSpotterContactUntil > g.time;
  }
  function isThreateningPlayer(g, t, target) {
    if (!g.player || !target || target.id !== g.player.id) return false;
    var p=worldToScreen(g,t.x,t.y);
    var off=p.x<34||p.x>g.w-34||p.y<34||p.y>g.h-34;
    return off || dist2(t.x,t.y,target.x,target.y) > 560*560;
  }
  function suppressedBySkill(g, t) {
    if ((t.hitFlash||0) > 0.08) return true;
    if (!g.bullets) return false;
    for (var i=0;i<g.bullets.length;i++) {
      var b=g.bullets[i];
      if(!b||b.dead||b.ownerId===t.id)continue;
      var r=SUPPRESS_RADIUS+(b.r||0);
      var ax=b.px==null?b.x:b.px, ay=b.py==null?b.y:b.py;
      if(pointSegmentDist2(t.x,t.y,ax,ay,b.x,b.y)<=r*r)return true;
    }
    return false;
  }

  wrapModule('game/classes', function (classes) {
    var C=classes.CLASSES;
    if(!C)return;
    if(C.marksman) C.marksman.desc='Precision rifle + Forward Observer. Long-range targets require reconnaissance, aim dwell and a clean firing lane.';
    if(C.railgun) C.railgun.desc='Focused hypervelocity rail + Forward Observer. Observer contact enables distant execution lanes.';
    if(C.ghost) C.ghost.desc='Cloaked precision ambusher + Forward Observer. Fast relocation, deliberate long-range acquisition.';
    if(C.singularity) C.singularity.desc='Map-length execution rail guided by a Forward Observer; extreme commitment, extreme punishment.';
    if(C.prism) C.prism.desc='Twin focused rails with Forward Observer reconnaissance and more persistent long-range pressure.';
    if(C.specter) C.specter.desc='Fast-cycling precision ambusher. Forward Observer finds lanes; movement and phase timing convert them.';
    if(C.assassin) C.assassin.desc='Brutal alpha-strike precision tank. Observer acquisition, long aim commitment and decisive escape windows.';
  });

  wrapModule('game/audio', function (audio) {
    var Sfx=audio.Sfx;
    if(!Sfx||Sfx.prototype.__novaVioletDoctrine)return;
    Sfx.prototype.__novaVioletDoctrine=true;

    function route(self,node,pan){
      if(!self.ctx||!self.master)return;
      if(self.ctx.createStereoPanner){var p=self.ctx.createStereoPanner();p.pan.value=clamp(pan||0,-1,1);node.connect(p);p.connect(self.master);}else node.connect(self.master);
    }
    function voice(self,f0,f1,dur,gain,pan,type,delay){
      self.resume();if(!self.ctx||!self.master||self.muted)return;
      var c=self.ctx,t0=c.currentTime+(delay||0),o=c.createOscillator(),g=c.createGain();
      o.type=type||'sine';o.frequency.setValueAtTime(Math.max(20,f0),t0);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t0+dur);
      g.gain.setValueAtTime(0.0001,t0);g.gain.exponentialRampToValueAtTime(Math.max(0.0002,gain),t0+Math.min(0.014,dur*0.22));g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
      o.connect(g);route(self,g,pan);o.start(t0);o.stop(t0+dur+0.025);
    }
    function noise(self,dur,gain,pan,hp,lp,delay){
      self.resume();if(!self.ctx||!self.master||self.muted)return;
      var c=self.ctx;
      if(!self.__novaVioletNoise){var n=Math.max(1,Math.floor(c.sampleRate*.28)),buf=c.createBuffer(1,n,c.sampleRate),data=buf.getChannelData(0);for(var i=0;i<n;i++)data[i]=Math.random()*2-1;self.__novaVioletNoise=buf;}
      var t0=c.currentTime+(delay||0),src=c.createBufferSource(),hi=c.createBiquadFilter(),lo=c.createBiquadFilter(),g=c.createGain();
      src.buffer=self.__novaVioletNoise;hi.type='highpass';hi.frequency.value=hp||900;lo.type='lowpass';lo.frequency.value=lp||9000;
      g.gain.setValueAtTime(Math.max(.0002,gain),t0);g.gain.exponentialRampToValueAtTime(.0001,t0+dur);src.connect(hi);hi.connect(lo);lo.connect(g);route(self,g,pan);src.start(t0);src.stop(t0+dur+.025);
    }

    Sfx.prototype.novaPrecisionWarning=function(pan,stage,flavor){
      var now=performance.now(),key='__novaPrecisionWarn'+stage;
      if(this[key]&&now-this[key]<180)return;this[key]=now;
      if(flavor==='ghost'||flavor==='specter'){
        if(stage===1){voice(this,980,1380,.11,.018,pan,'sine',0);noise(this,.07,.010,pan,2200,10000,.02);}
        else{voice(this,1380,760,.15,.027,pan,'triangle',0);voice(this,2200,1500,.08,.014,pan,'sine',.045);}
      }else if(flavor==='assassin'){
        if(stage===1){voice(this,210,210,.10,.026,pan,'sine',0);voice(this,940,1180,.08,.014,pan,'triangle',.04);}
        else{voice(this,270,95,.18,.038,pan,'sine',0);voice(this,1500,2450,.12,.025,pan,'triangle',.035);noise(this,.08,.018,pan,1800,10000,.055);}
      }else{
        if(stage===1){voice(this,620,920,.11,.024,pan,'sine',0);voice(this,1280,1560,.07,.011,pan,'triangle',.045);}
        else{voice(this,880,1720,.15,.032,pan,'sine',0);noise(this,.08,.017,pan,1900,10000,.05);}
      }
    };
    Sfx.prototype.novaPrecisionFlyby=function(pan,heavy){
      var now=performance.now();if(this.__novaPrecisionFlybyAt&&now-this.__novaPrecisionFlybyAt<85)return;this.__novaPrecisionFlybyAt=now;
      noise(this,heavy?.105:.075,heavy?.040:.028,pan,1900,12000,0);voice(this,heavy?2150:1750,heavy?430:620,heavy?.12:.09,heavy?.028:.020,pan,'sawtooth',.004);
    };
    Sfx.prototype.novaObserverDown=function(pan,hostile){
      var now=performance.now();if(this.__novaObserverDownAt&&now-this.__novaObserverDownAt<180)return;this.__novaObserverDownAt=now;
      voice(this,hostile?920:720,hostile?250:330,.18,hostile?.030:.024,pan,'triangle',0);voice(this,480,180,.13,.017,pan,'square',.045);
    };
  });

  wrapModule('game/engine', function (engine, require) {
    var Game=engine.Game;
    if(!Game||Game.prototype.__novaVioletDoctrine)return;
    Game.prototype.__novaVioletDoctrine=true;
    var CLASSES=require('./classes').CLASSES;

    function tagNewSniperBullets(g,t,before){
      if(!g.bullets)return;
      for(var i=before;i<g.bullets.length;i++){
        var b=g.bullets[i];if(!b||b.ownerId!==t.id)continue;
        b.__novaSniperLineage=true;b.__novaSniperClass=t.cls;b.__novaSniperOwnerId=t.id;
      }
    }

    var oldTryFire=Game.prototype.tryFire;
    Game.prototype.tryFire=function(t){
      if(!t||!isPurple(t))return oldTryFire.call(this,t);
      var beam=isRail(t,CLASSES),before=this.bullets?this.bullets.length:0;
      if(t.isPlayer||beam){
        var out0=oldTryFire.call(this,t);tagNewSniperBullets(this,t,before);return out0;
      }

      var profile=PROFILES[t.cls];
      if(!profile)return oldTryFire.call(this,t);
      if(!t.alive||t.fireCd>0){resetPrecision(t);return;}
      var target=t.ai&&t.ai.targetId>=0?this.getTank(t.ai.targetId):null;
      if(!target||!authorizedLongRange(t,target,this)){resetPrecision(t);return;}
      if(t.__novaSpotterDownUntil&&t.__novaSpotterDownUntil>this.time&&dist2(t.x,t.y,target.x,target.y)>DIRECT_VISION*DIRECT_VISION){resetPrecision(t);return;}
      if(suppressedBySkill(this,t)){
        var wasDeep=(t.__novaPrecision||0)>.45;resetPrecision(t);t.__novaPrecisionSuppressedUntil=this.time+(wasDeep?.24:.14);
        if(this.addParticles)this.addParticles(t.x,t.y,'#d9f7ff',wasDeep?6:3,65,'glow');
        return;
      }
      if(t.__novaPrecisionSuppressedUntil&&t.__novaPrecisionSuppressedUntil>this.time)return;

      var now=this.time, targetChanged=t.__novaPrecisionTargetId!==target.id;
      var brokenGap=t.__novaPrecisionLast&&now-t.__novaPrecisionLast>.13;
      if(!t.__novaPrecisionStart||targetChanged||brokenGap){
        t.__novaPrecisionStart=now;t.__novaPrecisionTargetId=target.id;t.__novaPrecisionWarnStage=0;t.__novaPrecision=0;
      }
      t.__novaPrecisionLast=now;
      var d=Math.sqrt(dist2(t.x,t.y,target.x,target.y));
      var dwell=profile.dwell*(d>DIRECT_VISION?1:.68);
      var q=clamp((now-t.__novaPrecisionStart)/Math.max(.08,dwell),0,1);
      t.__novaPrecision=q;

      if(target.isPlayer&&isThreateningPlayer(this,t,target)){
        var pan=panFrom(this,t.x);
        if(q>=profile.warn1&&(t.__novaPrecisionWarnStage||0)<1){
          t.__novaPrecisionWarnStage=1;if(this.sfx&&this.sfx.novaPrecisionWarning)this.sfx.novaPrecisionWarning(pan,1,profile.flavor);
        }
        if(q>=profile.warn2&&(t.__novaPrecisionWarnStage||0)<2){
          t.__novaPrecisionWarnStage=2;if(this.sfx&&this.sfx.novaPrecisionWarning)this.sfx.novaPrecisionWarning(pan,2,profile.flavor);
          if(this.addText)this.addText(target.x,target.y-35,profile.glyph+' LOCK','#d8c0ff',9);
        }
      }
      if(q<1)return;

      var out=oldTryFire.call(this,t);
      var fired=this.bullets&&this.bullets.length>before;
      tagNewSniperBullets(this,t,before);
      if(fired){
        t.fireCd=Math.max(t.fireCd||0,profile.recovery);
        t.__novaLineageRevealUntil=this.time+profile.reveal;
        t.__novaLineageRevealTargetId=target.id;
      }
      resetPrecision(t);
      return out;
    };

    var oldDamageDrone=Game.prototype.damageDrone;
    Game.prototype.damageDrone=function(d,dmg,killerId){
      var wasSpotter=!!(d&&d.__novaSpotter&&d.hp>0),owner=wasSpotter&&this.tankById?this.tankById.get(d.ownerId):null;
      var out=oldDamageDrone.call(this,d,dmg,killerId);
      if(wasSpotter&&d&&d.hp<=0&&owner&&isPurple(owner)){
        owner.__novaSpotterDownUntil=this.time+OBSERVER_RELAY_REBOOT;
        owner.__novaSpotterContactUntil=0;
        owner.__novaSpotterContactId=-1;
        resetPrecision(owner);
        if(this.sfx&&this.sfx.novaObserverDown)this.sfx.novaObserverDown(panFrom(this,d.x),!owner.isPlayer);
        if(owner.isPlayer&&this.addText)this.addText(owner.x,owner.y-34,'OBSERVER DOWN · LOCAL SIGHT ONLY','#ffcf8a',10);
        if(this.addRing)this.addRing(d.x,d.y,'#b9e7ff',28);
      }
      return out;
    };

    var oldUpdateDrones=Game.prototype.updateDrones;
    Game.prototype.updateDrones=function(dt){
      var out=oldUpdateDrones.call(this,dt);
      for(var i=0;i<this.tanks.length;i++){
        var t=this.tanks[i];if(!t||!t.alive||!isPurple(t))continue;
        if(t.__novaSpotterDownUntil&&t.__novaSpotterDownUntil>this.time){
          t.__novaSpotterContactId=-1;t.__novaSpotterContactUntil=0;
        }else if(t.__novaSpotterDownUntil){
          t.__novaSpotterDownUntil=0;
          if(t.isPlayer&&this.addText)this.addText(t.x,t.y-32,'OBSERVER LINK RESTORED','#b9e7ff',9);
        }
      }
      return out;
    };

    var oldUpdateBullets=Game.prototype.updateBullets;
    Game.prototype.updateBullets=function(dt){
      var pl=this.player;
      if(pl&&pl.alive&&this.bullets){
        for(var i=0;i<this.bullets.length;i++){
          var b=this.bullets[i];
          if(!b||b.dead||!b.__novaSniperLineage||b.__novaRail||b.ownerId===pl.id||b.__novaPrecisionFlyby)continue;
          var nx=b.x+b.vx*dt,ny=b.y+b.vy*dt;
          if(pointSegmentDist2(pl.x,pl.y,b.x,b.y,nx,ny)<260*260){
            b.__novaPrecisionFlyby=true;
            var heavy=b.__novaSniperClass==='assassin'||(b.dmg||0)>40;
            if(this.sfx&&this.sfx.novaPrecisionFlyby)this.sfx.novaPrecisionFlyby(panFrom(this,b.x),heavy);
          }
        }
      }
      return oldUpdateBullets.call(this,dt);
    };
  });

  wrapModule('game/render', function (renderMod, require) {
    var oldRender=renderMod.render;
    if(!oldRender||oldRender.__novaVioletDoctrine)return;
    var CLASSES=require('./classes').CLASSES;

    function drawThreat(ctx,g,t,w,h){
      var p=worldToScreen(g,t.x,t.y),off=p.x<28||p.x>w-28||p.y<28||p.y>h-28;
      var q=clamp(t.__novaPrecision||0,0,1),revealing=!!(t.__novaLineageRevealUntil&&t.__novaLineageRevealUntil>g.time);
      if(q<.12&&!revealing)return;
      if(t.__novaPrecisionTargetId!==g.player.id&&!revealing)return;
      if(!off&&!revealing)return;
      var ang=Math.atan2(p.y-h*.5,p.x-w*.5),ep=edgePoint(w,h,ang,17),pulse=.70+.30*Math.sin(performance.now()*.021);
      var profile=PROFILES[t.cls]||{glyph:'SCOPE'};
      ctx.save();ctx.translate(ep.x,ep.y);ctx.rotate(ang);ctx.globalCompositeOperation='lighter';
      var a=revealing?0.84:(.24+q*.64)*pulse;
      ctx.strokeStyle='rgba(216,192,255,'+a+')';ctx.lineWidth=1.1+q*1.2;ctx.shadowBlur=10+q*13;ctx.shadowColor='#c493ff';
      ctx.beginPath();ctx.moveTo(-8,0);ctx.lineTo(8+q*9,0);ctx.moveTo(1,-4-q*3);ctx.lineTo(1,4+q*3);ctx.stroke();
      if(q>=(profile.warn2||.7)||revealing){ctx.fillStyle='rgba(235,221,255,.84)';ctx.font='800 7px Orbitron,system-ui';ctx.textAlign='center';ctx.fillText(revealing?'SHOT':profile.glyph,0,-11);}
      ctx.restore();
      if(revealing){
        ctx.save();ctx.globalCompositeOperation='lighter';ctx.strokeStyle='rgba(196,147,255,.18)';ctx.lineWidth=1;ctx.setLineDash([6,10]);
        ctx.beginPath();ctx.moveTo(ep.x,ep.y);ctx.lineTo(w*.5+Math.cos(ang)*Math.min(w,h)*.15,h*.5+Math.sin(ang)*Math.min(w,h)*.15);ctx.stroke();ctx.restore();
      }
    }

    function drawPrecisionTrails(ctx,g,w,h){
      for(var i=0;i<g.bullets.length;i++){
        var b=g.bullets[i];if(!b||b.dead||!b.__novaSniperLineage||b.__novaRail)continue;
        var p=worldToScreen(g,b.x,b.y),pp=worldToScreen(g,b.px==null?b.x:b.px,b.py==null?b.y:b.py);
        if((p.x<-80&&pp.x<-80)||(p.x>w+80&&pp.x>w+80)||(p.y<-80&&pp.y<-80)||(p.y>h+80&&pp.y>h+80))continue;
        var dx=p.x-pp.x,dy=p.y-pp.y,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,tail=Math.min(82,28+len*1.35);
        var tx=p.x-ux*tail,ty=p.y-uy*tail;
        ctx.save();ctx.globalCompositeOperation='lighter';
        var gr=ctx.createLinearGradient(tx,ty,p.x,p.y);gr.addColorStop(0,'rgba(176,107,255,0)');gr.addColorStop(.6,'rgba(196,147,255,.18)');gr.addColorStop(1,'rgba(245,236,255,.68)');
        ctx.strokeStyle=gr;ctx.lineWidth=b.__novaSniperClass==='assassin'?2.4:1.5;ctx.shadowBlur=9;ctx.shadowColor='#c493ff';ctx.beginPath();ctx.moveTo(tx,ty);ctx.lineTo(p.x,p.y);ctx.stroke();ctx.restore();
      }
    }

    function drawObserverStatus(ctx,g,pl,w,h){
      if(!isPurple(pl)||!(pl.__novaSpotterDownUntil&&pl.__novaSpotterDownUntil>g.time))return;
      var left=Math.max(0,pl.__novaSpotterDownUntil-g.time);
      ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);ctx.textAlign='center';ctx.font='800 8px Orbitron,system-ui';ctx.fillStyle='rgba(255,207,138,.84)';ctx.shadowBlur=8;ctx.shadowColor='#ffcf8a';ctx.fillText('OBSERVER RELAY '+left.toFixed(1)+'s',w*.5,74);ctx.restore();
    }

    function patchedRender(g,w,h){
      oldRender(g,w,h);if(!g||!g.ctx||!g.player||!g.player.alive)return;
      var ctx=g.ctx;ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);
      drawPrecisionTrails(ctx,g,w,h);
      for(var i=0;i<g.tanks.length;i++){var t=g.tanks[i];if(t&&!t.isPlayer&&isPurple(t)&&!isRail(t,CLASSES))drawThreat(ctx,g,t,w,h);}
      ctx.restore();drawObserverStatus(ctx,g,g.player,w,h);
    }
    patchedRender.__novaVioletDoctrine=true;
    renderMod.render=patchedRender;
  });

  console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' all-purple sniper doctrine online');
})();