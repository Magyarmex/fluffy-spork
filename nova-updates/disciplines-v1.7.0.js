/* NOVA TANKS v1.7.0 — Three Disciplines
 * Skill-expression rework for Gunner, Cannon, and Guardian lineages.
 * Simple inputs, deeper consequences: cadence/recoil, programmable fuses, directional guard.
 */
(function(){
'use strict';

var mods = window.__novaModules;
if (!mods) { console.error('[NOVA v1.7.0] module registry unavailable'); return; }

var VERSION='1.7.0', CODENAME='Three Disciplines', TAU=Math.PI*2;

window.__NOVA_DISCIPLINES_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Gunners master cadence, Cannons program space, and Guardians fight with facing.',
  groups:{
    'Gunner — Fire Discipline':[
      'The cyan lineage gains deterministic recoil, heat and a readable cadence window instead of flat hold-to-win sustained fire.',
      'Stable aim and controlled bursts tighten fire; excessive heat increases predictable recoil and physically pushes the hull backward.',
      'Miniguns reward maintaining a powerful mid-heat cadence, while shotguns reward bracing and disciplined re-engagement rather than blind spam.',
      'AI Gunners obey the same heat/recoil model and deliberately vent when they exceed a sustainable firing state.'
    ],
    'Cannon — Fire Control':[
      'The orange lineage can program detonation distance directly with right-stick depth while aiming normally with right-stick direction.',
      'A projected impact/fuse reticle shows exactly where a shell will airburst; mouse distance provides the same grammar on desktop.',
      'Airbursts preserve splash/cluster behavior, create a visible blast event, and reward predicting where an opponent will be rather than only direct-hit aim.',
      'Programmable blast placement integrates with Battlefield cover: shells and splash can breach barricades, making fuse choice a map-control decision.'
    ],
    'Guardian — Facing and Counterplay':[
      'The pink lineage gains directional frontal armor: right-stick aim now also determines where the tank is strongest.',
      'BULWARK and IRON WILL become directional guard states instead of 360-degree invulnerability/stat reduction.',
      'The first fraction of a second after a defensive activation is a Perfect Guard window; a successful read stores a Countercharge for the next shot.',
      'Juggernaut descendants build charge by committing to a straight Stampede line; sharp turns and terrain impacts dump momentum.'
    ],
    'Readability and AI Parity':[
      'New cyan heat/cadence, orange fuse-impact and pink guard/charge visuals expose the mechanics without adding buttons.',
      'AI uses the same firing heat, fuse authorization, facing rules, directional defense and charge constraints as the player.',
      'The rework is designed to compound Battlefield geometry rather than bypass it: suppression lanes, programmable blasts and directional shields all care about positioning.'
    ]
  }
};

function wrap(id,after){
  var old=mods[id]; if(!old)return;
  mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};
}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

/* One input contract for both the next projectile and its live aiming marker.
 * In particular, mouse distance must not reuse the preceding shot's fuse. */
function cannonInputDepth(g,t){
  var range=g.weaponRange?g.weaponRange(t):650;
  if(t.isPlayer){
    var a=g.input&&g.input.aim;
    if(a&&a.active)return clamp((Math.hypot(a.dx||0,a.dy||0)-5)/55,.08,1);
    if(g.input&&g.input.mouseActive&&g.canvas){
      var rect=g.canvas.getBoundingClientRect(),z=(g.cam&&g.cam.zoom)||1;
      var wx=g.cam.x+(g.input.mouseX-rect.left-g.w*.5)/z;
      var wy=g.cam.y+(g.input.mouseY-rect.top-g.h*.5)/z;
      return clamp(Math.hypot(wx-t.x,wy-t.y)/Math.max(1,range),.08,1);
    }
    return .72;
  }
  if(t.ai&&t.ai.state==='hunt'&&t.ai.targetId>=0){
    var q=g.getTank&&g.getTank(t.ai.targetId);
    if(q&&q.alive)return clamp(Math.hypot(q.x-t.x,q.y-t.y)/Math.max(1,range),.12,.96);
  }
  return null;
}
/* The shipping RAF clamps simulation steps to 0.033s. A fuse beyond the
 * last surviving step can never fire: core TTL expiry removes the projectile
 * before Three Disciplines can detonate it. Only cap otherwise unreachable
 * programs; do not change mid-depth fuses or weapon speed/lifetime. */
function cannonReachableFuse(raw,speed,ttl){
  if(!Number.isFinite(speed)||speed<=0||!Number.isFinite(ttl))return raw;
  return Math.min(raw,Math.max(0,speed*(ttl-.033)));
}
function cannonFuseDistance(g,t,depth,def){
  var range=g.weaponRange?g.weaponRange(t):650;
  var raw=clamp(range*(.20+.78*depth),150,range*.965);
  if(!def||!def.bullet)return raw;
  var speed=g.bulletSpeed?g.bulletSpeed(t):def.bullet.speed;
  if(!Number.isFinite(speed))return raw;
  var a=t.angle||0,vx=Math.cos(a)*speed+(t.vx||0)*.22;
  var vy=Math.sin(a)*speed+(t.vy||0)*.22;
  var ttl=def.bullet.ttl==null?1.05:def.bullet.ttl;
  return cannonReachableFuse(raw,Math.hypot(vx,vy),ttl);
}
/* Shared prediction for the live Cannon reticle and Combined Arms terrain
 * marker. The canonical Game.tryFire shell/single path uses barrel zero,
 * muzzle offset, 22% inherited hull velocity and the same fuse depth. */
function cannonShotPreview(g,t,def){
  var depth=cannonInputDepth(g,t);
  var dist=cannonFuseDistance(g,t,depth==null?.72:depth,def);
  var barrel=def&&def.barrels&&def.barrels[0];
  var a=t.angle||0,cs=Math.cos(a),sn=Math.sin(a);
  var len=(barrel?barrel.len:0)+8,side=barrel?(barrel.x||0):0;
  var ox=t.x+cs*len-sn*side,oy=t.y+sn*len+cs*side;
  var speed=g.bulletSpeed?g.bulletSpeed(t):((def&&def.bullet&&def.bullet.speed)||1);
  var vx=cs*speed+(t.vx||0)*.22,vy=sn*speed+(t.vy||0)*.22;
  var mag=Math.hypot(vx,vy)||1;
  var bullet=def&&def.bullet||{},dmg=g.bulletDamageFor?g.bulletDamageFor(t,bullet.dmg||0):(bullet.dmg||0);
  var r=(bullet.r||2)*(1+clamp(dmg*.0085,0,.45));
  var pen=(bullet.pen||0)+Math.floor(((t.stats&&t.stats.penetration)||0)*.6)+(t.gene==='sniper'?1:0);
  return {ox:ox,oy:oy,x:ox+vx/mag*dist,y:oy+vy/mag*dist,dist:dist,r:r,pen:pen};
}
function ad(target,current){var d=(target-current+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI;}
function moveAngle(current,target,max){return current+clamp(ad(target,current),-max,max);}
function d2(ax,ay,bx,by){var x=bx-ax,y=by-ay;return x*x+y*y;}
function world(g,x,y){var z=g.cam&&g.cam.zoom?g.cam.zoom:1;return{x:(x-g.cam.x)*z+g.w*.5,y:(y-g.cam.y)*z+g.h*.5};}
function rotateVelocity(b,delta,mul){
  var s=Math.hypot(b.vx||0,b.vy||0)*(mul==null?1:mul);
  if(s<1)return;
  var a=Math.atan2(b.vy||0,b.vx||0)+delta;
  b.vx=Math.cos(a)*s;b.vy=Math.sin(a)*s;
}
function lineage(classes,t){
  if(!t)return null;
  try{return classes.lineageForClass(t.cls);}catch(_){return null;}
}
function pan(g,x){
  if(!g.player)return 0;
  return clamp((x-g.player.x)/Math.max(480,g.w/Math.max(.55,(g.cam&&g.cam.zoom)||1)),-1,1);
}

/* ---------------- Class identity / showroom text ---------------- */
wrap('game/classes',function(c){
  var C=c.CLASSES||{};
  var text={
    twin:'Twin barrels reward controlled rhythm: heat and deterministic recoil turn sustained fire into a cadence skill.',
    minigun:'Spin into a lethal cadence window, then vent before predictable recoil tears the stream off-line.',
    shotgun:'A disciplined breacher: braced, cooled bursts tighten the pellet wall; panic-spam throws the hull and cone wide.',
    tempest:'A five-barrel storm whose maximum output lives inside a narrow sustainable cadence band.',
    needlestorm:'Precision rotary discipline: steadiness and heat control keep the needle stream surgical at range.',
    breachlord:'Point-blank authority with enormous recoil. Brace, fire, recover, and punish the opening you created.',
    flakmaster:'Long shotgun reach becomes a precision test: stable aim visibly tightens the fast six-pellet cone.',
    cannon:'Programmable-fuse artillery. Aim with direction and set burst distance with right-stick depth.',
    bomber:'Cluster artillery whose fuse point decides where the battlefield fills with submunitions.',
    demolisher:'Heavy blast placement and structural demolition. Predict movement, detonate the space, open the map.',
    clusterking:'Programs entire sectors: precise fuse placement turns ten-child clusters into deliberate area traps.',
    siegebomber:'Slow siege shells reward patient fuse placement and brutal, intentional breaches through cover.',
    annihilator:'One enormous spatial commitment. Put the detonation exactly where the opponent has to be.',
    quake:'Shock artillery that rewards deliberate blast placement, lane denial and terrain destruction.',
    guard:'Directional vanguard armor. Your aim direction is also your strongest facing.',
    fortress:'A walking bunker whose defense is strongest only where the player deliberately points it.',
    juggernaut:'Build Stampede momentum by holding a clean line; sharp turns sacrifice impact force.',
    bastion:'Maximum directional bunker. Narrow, brutally strong frontal defense rewards lane ownership.',
    aegis:'Mobile shield specialist with a broad guard arc and the strongest Perfect Guard timing game.',
    meteor:'A high-momentum rammer: choose a line, build charge, and make the commitment count.',
    ravager:'Aggressive heavy whose straight-line Stampede becomes devastating only if you preserve momentum.'
  };
  Object.keys(text).forEach(function(k){if(C[k])C[k].desc=text[k];});
});

/* ---------------- Procedural audio extensions ---------------- */
wrap('game/audio',function(audio){
  var Sfx=audio.Sfx;if(!Sfx||Sfx.prototype.__novaThreeDisciplines)return;
  Sfx.prototype.__novaThreeDisciplines=true;
  function route(self,node,p){
    if(self.ctx&&self.ctx.createStereoPanner){var q=self.ctx.createStereoPanner();q.pan.value=clamp(p||0,-1,1);node.connect(q);q.connect(self.master);}
    else node.connect(self.master);
  }
  function tone(self,f0,f1,dur,gain,p,type){
    self.resume();if(!self.ctx||!self.master||self.muted)return;
    var c=self.ctx,t=c.currentTime,o=c.createOscillator(),v=c.createGain();
    o.type=type||'triangle';o.frequency.setValueAtTime(Math.max(25,f0),t);o.frequency.exponentialRampToValueAtTime(Math.max(25,f1),t+dur);
    v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.012);v.gain.exponentialRampToValueAtTime(.0001,t+dur);
    o.connect(v);route(self,v,p);o.start(t);o.stop(t+dur+.02);
  }
  Sfx.prototype.novaCadence=function(p,q){
    tone(this,520+q*220,880+q*360,.055,.012+q*.008,p,'square');
  };
  Sfx.prototype.novaOverheat=function(p){
    tone(this,310,135,.11,.023,p,'sawtooth');
  };
  Sfx.prototype.novaFuseBurst=function(p,heavy){
    tone(this,heavy?185:260,heavy?62:92,heavy?.18:.13,heavy?.040:.026,p,'sine');
    tone(this,heavy?980:1250,330,.09,heavy?.016:.011,p,'triangle');
  };
  Sfx.prototype.novaPerfectGuard=function(p){
    tone(this,1380,2850,.085,.030,p,'sine');tone(this,410,820,.11,.018,p,'square');
  };
  Sfx.prototype.novaCountershot=function(p){
    tone(this,760,1680,.08,.022,p,'triangle');
  };
  Sfx.prototype.novaChargeBreak=function(p){
    tone(this,180,72,.13,.025,p,'sawtooth');
  };
});

/* ---------------- Engine mechanics ---------------- */
wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaThreeDisciplines)return;
  Game.prototype.__novaThreeDisciplines=true;
  var classes=require('./classes'),C=classes.CLASSES;
  Game.prototype.novaCannonShotPreview=function(t){return cannonShotPreview(this,t,C[t.cls]);};

  function gunner(t){return lineage(classes,t)==='gunner';}
  function cannon(t){return lineage(classes,t)==='cannon';}
  function guardian(t){return lineage(classes,t)==='guardian';}
  function shotMode(t){return C[t.cls]&&C[t.cls].fireMode||'single';}

  function gunHeatAdd(t,count){
    var mode=shotMode(t),base=mode==='minigun'?.046:mode==='shotgun'?.24:.13;
    if(t.cls==='tempest')base*=.82;
    if(t.cls==='needlestorm')base*=1.05;
    return base*Math.max(1,mode==='shotgun'?1:Math.min(2,count));
  }
  function gunProfile(t){
    var h=clamp(t.__v17Heat||0,0,1.2);
    var sweet=clamp(1-Math.abs(h-.56)/.30,0,1);
    var over=clamp((h-.78)/.30,0,1);
    var stable=clamp(t.__v17Stability==null?1:t.__v17Stability,0,1);
    return{heat:h,sweet:sweet,over:over,stable:stable};
  }
  function onGunnerFire(g,t,before){
    var created=[];
    for(var i=before;i<g.bullets.length;i++){var b=g.bullets[i];if(b&&b.ownerId===t.id)created.push(b);}
    if(!created.length)return;
    var prev=t.__v17LastShotAngle==null?t.angle:t.__v17LastShotAngle;
    var turn=Math.abs(ad(t.angle,prev));
    var speed=Math.hypot(t.vx||0,t.vy||0),max=g.tankSpeed?Math.max(1,g.tankSpeed(t)):130;
    var settle=clamp(1-turn/.22,0,1)*clamp(1-(speed/max)*.22,0,1);
    t.__v17Stability=(t.__v17Stability==null?1:t.__v17Stability)*.45+settle*.55;
    t.__v17Heat=clamp((t.__v17Heat||0)+gunHeatAdd(t,created.length),0,1.18);
    t.__v17LastShotAngle=t.angle;t.__v17FiredAt=g.time;t.__v17ShotIndex=(t.__v17ShotIndex||0)+1;
    var p=gunProfile(t),mode=shotMode(t),idx=t.__v17ShotIndex;
    for(var j=0;j<created.length;j++){
      var b=created[j];b.__v17Gunner=true;
      var pattern=Math.sin((idx+j*.61)*2.399963+ t.id*.173);
      if(mode==='shotgun'){
        var a=Math.atan2(b.vy,b.vx),toward=ad(t.angle,a);
        var tighten=clamp(.08+p.stable*.28-p.over*.10,0,.34);
        rotateVelocity(b,toward*tighten,1+(p.sweet*p.stable)*.025);
      }else{
        var spread=(1-p.stable)*.028+p.over*.075;
        rotateVelocity(b,pattern*spread,1+(p.sweet*p.stable)*.045);
      }
      if(p.sweet>.62&&p.stable>.56){b.dmg*=1.045;b.__v17Cadence=true;}
    }
    var kick=(mode==='shotgun'?11:3.0+created.length*.55)*(0.72+p.heat*.52);
    t.vx=(t.vx||0)-Math.cos(t.angle)*kick;
    t.vy=(t.vy||0)-Math.sin(t.angle)*kick;
    if(t.isPlayer&&p.sweet>.78&&p.stable>.65&&(!t.__v17CadenceCueAt||g.time-t.__v17CadenceCueAt>.55)){
      t.__v17CadenceCueAt=g.time;if(g.sfx&&g.sfx.novaCadence)g.sfx.novaCadence(0,p.sweet);
    }
    if(t.isPlayer&&p.over>.72&&(!t.__v17HeatCueAt||g.time-t.__v17HeatCueAt>.9)){
      t.__v17HeatCueAt=g.time;if(g.sfx&&g.sfx.novaOverheat)g.sfx.novaOverheat(0);
    }
  }

  function inputDepth(g,t){return cannonInputDepth(g,t);}
  function cannonProfile(t){
    var heavy=t.cls==='siegebomber'||t.cls==='annihilator'||t.cls==='quake';
    var cluster=t.cls==='bomber'||t.cls==='clusterking'||t.cls==='siegebomber';
    return{heavy:heavy,cluster:cluster,structure:t.cls==='annihilator'||t.cls==='quake'?1.9:t.cls==='siegebomber'?1.75:t.cls==='demolisher'?1.55:1.35};
  }
  function annotateCannon(g,t,before,force){
    var depth=inputDepth(g,t);
    if(depth==null&&!force)return;
    if(depth==null)depth=.82;
    var range=g.weaponRange?g.weaponRange(t):650,dist=cannonFuseDistance(g,t,depth,C[t.cls]),prof=cannonProfile(t);
    for(var i=before;i<g.bullets.length;i++){
      var b=g.bullets[i];if(!b||b.ownerId!==t.id)continue;
      var shotDist=cannonReachableFuse(dist,Math.hypot(b.vx||0,b.vy||0),b.ttl);
      b.__v17Cannon=true;b.__v17FuseDist=shotDist;b.__v17SpawnX=b.x;b.__v17SpawnY=b.y;
      b.__v17FuseArmed=shotDist>210;b.__novaStructureMult=prof.structure;
      b.__v17FuseHeavy=prof.heavy;b.__v17FuseCluster=!!b.shell;
    }
    t.__v17FuseDepth=depth;t.__v17FuseDist=dist;t.__v17FuseRange=range;
  }

  function guardProfile(t){
    var id=t.cls;
    if(id==='bastion')return{arc:1.52,passive:.30,active:.80,perfect:.34,counter:.48};
    if(id==='aegis')return{arc:2.36,passive:.26,active:.86,perfect:.42,counter:.42};
    if(id==='fortress')return{arc:1.82,passive:.25,active:.78,perfect:.32,counter:.44};
    if(id==='juggernaut')return{arc:1.62,passive:.16,active:.62,perfect:.25,counter:.34};
    if(id==='meteor')return{arc:1.72,passive:.18,active:.64,perfect:.26,counter:.36};
    if(id==='ravager')return{arc:1.66,passive:.17,active:.64,perfect:.24,counter:.38};
    return{arc:1.96,passive:.20,active:.72,perfect:.32,counter:.40};
  }
  function incomingBearing(g,t,srcId,kx,ky){
    if(Math.hypot(kx||0,ky||0)>.0005)return Math.atan2(-(ky||0),-(kx||0));
    var s=srcId>=0&&g.getTank?g.getTank(srcId):null;
    if(s&&s.alive)return Math.atan2(s.y-t.y,s.x-t.x);
    return null;
  }
  function isFront(t,bearing,prof){
    return bearing!=null&&Math.abs(ad(bearing,t.angle))<=prof.arc*.5;
  }

  var oldTry=Game.prototype.tryFire;
  Game.prototype.tryFire=function(t){
    var lin=lineage(classes,t),before=this.bullets.length,counter=guardian(t)?(t.__v17CounterCharge||0):0;
    oldTry.call(this,t);
    if(this.bullets.length<=before)return;
    if(lin==='gunner')onGunnerFire(this,t,before);
    else if(lin==='cannon')annotateCannon(this,t,before,false);
    else if(lin==='guardian'&&counter>0){
      var used=false;
      for(var i=before;i<this.bullets.length;i++){
        var b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;
        b.dmg*=1+.34*counter;rotateVelocity(b,0,1+.08*counter);if(counter>.82)b.pen=(b.pen||0)+1;b.__v17Counter=true;used=true;
      }
      if(used){
        t.__v17CounterCharge=0;
        if(this.addText)this.addText(t.x,t.y-36,'COUNTERSHOT','#ffd6e7',11);
        if(this.sfx&&this.sfx.novaCountershot)this.sfx.novaCountershot(pan(this,t.x));
      }
    }
  };

  var oldAbility=Game.prototype.useAbility;
  Game.prototype.useAbility=function(t){
    var lin=lineage(classes,t),before=this.bullets.length,def=C[t.cls],ab=def&&def.ability;
    var bBul=t.bulwarkT||0,bTaunt=t.tauntT||0,bStamp=t.stampedeT||0,bCd=t.abilityCd||0;
    oldAbility.call(this,t);
    if(lin==='cannon'&&this.bullets.length>before)annotateCannon(this,t,before,true);
    if(lin==='guardian'){
      var p=guardProfile(t);
      var activated=(t.abilityCd||0)>bCd+.05 ||
        (ab==='bulwark'&&(t.bulwarkT||0)>bBul+.05) ||
        (ab==='taunt'&&(t.tauntT||0)>bTaunt+.05) ||
        (ab==='stampede'&&(t.stampedeT||0)>bStamp+.05);
      if(!activated)return;
      if(ab==='bulwark'||ab==='taunt'){
        t.__v17PerfectGuardUntil=this.time+p.perfect;
        t.__v17GuardPulseUntil=this.time+.55;
      }else if(ab==='stampede'){
        t.__v17Charge=Math.max(.12,t.__v17Charge||0);
        t.__v17ChargeAngle=Math.atan2(t.vy||Math.sin(t.angle),t.vx||Math.cos(t.angle));
      }
    }
  };

  var oldDamage=Game.prototype.damageTank;
  Game.prototype.damageTank=function(t,dmg,srcId,kx,ky){
    if(!guardian(t)||!t.alive||t.hp<=0)return oldDamage.call(this,t,dmg,srcId,kx,ky);
    /* Core shields already make the hit harmless. Do not spend Perfect Guard
     * or award a countercharge for damage that could never reach the hull. */
    if(t.spawnShieldT>0||t.shieldT>0)return oldDamage.call(this,t,dmg,srcId,kx,ky);
    var prof=guardProfile(t),bearing=incomingBearing(this,t,srcId,kx,ky);
    if(bearing==null)return oldDamage.call(this,t,dmg,srcId,kx,ky);
    var front=isFront(t,bearing,prof),diff=Math.abs(ad(bearing,t.angle));
    var active=(t.bulwarkT||0)>0||(t.tauntT||0)>0;
    var oldB=t.bulwarkT||0,oldT=t.tauntT||0;
    /* Disable legacy 360-degree defenses; v1.7 reapplies them directionally. */
    t.bulwarkT=0;t.tauntT=0;
    if(active&&front&&this.time<=(t.__v17PerfectGuardUntil||-1)){
      t.bulwarkT=oldB;t.tauntT=oldT;
      t.__v17CounterCharge=Math.max(t.__v17CounterCharge||0,1);
      t.__v17PerfectGuardUntil=-1;
      if(this.addRing)this.addRing(t.x,t.y,'#ffe4ef',48);
      if(this.addText)this.addText(t.x,t.y-34,'PERFECT GUARD','#ffe4ef',12);
      if(this.sfx&&this.sfx.novaPerfectGuard)this.sfx.novaPerfectGuard(pan(this,t.x));
      return;
    }
    var factor=1;
    if(front)factor*=1-prof.passive;
    else if(diff<prof.arc*.72)factor*=1-prof.passive*.32;
    if(active&&front)factor*=1-prof.active;
    else if(active&&diff<prof.arc*.72)factor*=.86;
    var r;
    try{
      /* The directional guard disables legacy taunt before core damage,
       * otherwise the old 360-degree mitigation leaks through. That also
       * disabled Iron Will's advertised 30% reflection. Restore one bounded
       * frontal reflection, never reflecting a reflected hit: two Fortresses
       * facing each other must not recurse indefinitely. */
      if(oldT>0&&front&&dmg>0&&!this.__v17ReflectingIronWill){
        var src=srcId>=0&&this.getTank?this.getTank(srcId):null;
        if(src&&src.alive&&src.id!==t.id){
          /* Reflection is a new direct hit, not another target of the
           * original Combined Arms splash exposure calculation. */
          var blast=this.__v172BlastContext,wasBlast=!!(blast&&blast.active);
          if(wasBlast)blast.active=false;
          this.__v17ReflectingIronWill=true;
          try{this.damageTank(src,dmg*.30,t.id);}
          finally{
            this.__v17ReflectingIronWill=false;
            if(wasBlast)blast.active=true;
          }
        }
      }
      r=oldDamage.call(this,t,dmg*factor,srcId,kx,ky);
    }finally{
      t.bulwarkT=oldB;t.tauntT=oldT;
    }
    if(active&&front){
      t.__v17CounterCharge=clamp(Math.max(t.__v17CounterCharge||0,prof.counter*(1-factor)),0,1);
      t.__v17GuardPulseUntil=this.time+.18;
    }
    return r;
  };

  var oldBody=Game.prototype.bodyDamage;
  Game.prototype.bodyDamage=function(t){
    var d=oldBody.call(this,t);
    if(guardian(t)&&(t.stampedeT||0)>0&&(t.cls==='juggernaut'||t.cls==='meteor'||t.cls==='ravager')){
      d*=1+.82*clamp(t.__v17Charge||0,0,1);
    }
    return d;
  };

  /* A post-core fuse crossing creates shrapnel too late for the ordinary
   * bullet pass. In an independently clear corridor, advance the newborn
   * children through ONLY the time after physical fuse crossing. Any possible
   * first contact retains the existing collision owner (#147/#193); never
   * teleport shrapnel across cover or silently invent damage here. */
  function advanceClearFuseChildren(g,parent,first,dt,cross,sole){
    if(!sole||!(dt>0&&dt<=.05&&cross>1e-9&&cross<1-1e-9)||
       !Array.isArray(g.__novaTerrain)||!Array.isArray(g.bullets))return;
    var remaining=dt*(1-cross),count=g.bullets.length-first;
    if(count<3||count>12)return;
    for(var q=0;q<first;q++)
      if(g.bullets[q]&&g.bullets[q]!==parent&&!g.bullets[q].dead)return;
    var plans=[];
    function near(ax,ay,bx,by,x,y,r){
      if(!Number.isFinite(x)||!Number.isFinite(y)||!(r>=0))return true;
      var dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;
      var t=den>1e-12?clamp(((x-ax)*dx+(y-ay)*dy)/den,0,1):0;
      var px=ax+dx*t-x,py=ay+dy*t-y;
      return px*px+py*py<=r*r;
    }
    function entityClear(e,r,ax,ay,bx,by,childR){
      if(!e||!Number.isFinite(e.x)||!Number.isFinite(e.y)||
         !Number.isFinite(e.vx)||!Number.isFinite(e.vy)||
         !(Number.isFinite(r)&&r>0))return false;
      var speed=Math.hypot(e.vx,e.vy);
      if(!(speed<=2400))return false;
      /* Existing movement witnesses are checked when available. Unknown
       * movement receives a deliberately generous 1600u/s allowance. */
      var pad=r+childR+30+dt*(speed+1600);
      if(near(ax,ay,bx,by,e.x,e.y,pad))return false;
      var px=null,py=null;
      if(e.__novaSweepMoveTime===g.time){
        px=e.__novaSweepPrevX;py=e.__novaSweepPrevY;
      }else if(g.__novaShapeSweepActive&&
               e.__novaShapeSweepEpoch===g.__novaShapeSweepEpoch){
        px=e.__novaShapeSweepPrevX;py=e.__novaShapeSweepPrevY;
      }else if(g.__novaShapeSweepActive&&
               e.__novaChronoDroneEpoch===g.__novaShapeSweepEpoch){
        px=e.__novaChronoDronePrevX;py=e.__novaChronoDronePrevY;
      }
      if(px!==null){
        if(!Number.isFinite(px)||!Number.isFinite(py)||
           Math.hypot(px-e.x,py-e.y)>96)return false;
        if(near(ax,ay,bx,by,px,py,pad))return false;
      }
      return true;
    }
    for(var i=first;i<g.bullets.length;i++){
      var c=g.bullets[i];
      if(!c||c.dead||c.shell||c.beam||c.ownerId!==parent.ownerId||
         !(c.r>0)||!(c.ttl>remaining)||
         !Number.isFinite(c.x)||!Number.isFinite(c.y)||
         !Number.isFinite(c.px)||!Number.isFinite(c.py)||
         !Number.isFinite(c.vx)||!Number.isFinite(c.vy)||
         !Number.isFinite(c.ttl)||
         Math.hypot(c.vx,c.vy)>360)return;
      var ex=c.x+c.vx*remaining,ey=c.y+c.vy*remaining,pad=c.r+1;
      if(!Number.isFinite(ex)||!Number.isFinite(ey)||
         Math.max(Math.abs(c.x),Math.abs(c.y),Math.abs(ex),Math.abs(ey))>=2200)return;
      for(var ti=0;ti<g.__novaTerrain.length;ti++){
        var s=g.__novaTerrain[ti];
        if(!s||s.solid===false||(s.destructible&&!(s.hp>0)))continue;
        if(!Number.isFinite(s.x)||!Number.isFinite(s.y))return;
        if(s.shape==='circle'){
          if(!(s.r>0)||near(c.x,c.y,ex,ey,s.x,s.y,s.r+pad))return;
        }else if(s.shape==='rect'){
          if(!(s.w>0&&s.h>0))return;
          if(Math.max(c.x,ex)+pad>=s.x-s.w*.5&&
             Math.min(c.x,ex)-pad<=s.x+s.w*.5&&
             Math.max(c.y,ey)+pad>=s.y-s.h*.5&&
             Math.min(c.y,ey)-pad<=s.y+s.h*.5)return;
        }else return;
      }
      var tanks=g.tanks||[],shapes=g.shapes||[],drones=g.drones||[];
      for(var j=0;j<tanks.length;j++){
        var t=tanks[j];if(!t||!t.alive||t.id===parent.ownerId)continue;
        var def=C[t.cls];
        if(!def||!entityClear(t,(def.size||0)+3,c.x,c.y,ex,ey,c.r))return;
      }
      for(var k=0;k<shapes.length;k++){
        var shape=shapes[k];if(!shape||!(shape.hp>0))continue;
        if(!entityClear(shape,shape.r,c.x,c.y,ex,ey,c.r))return;
      }
      for(var di=0;di<drones.length;di++){
        var drone=drones[di];
        if(!drone||!(drone.hp>0)||drone.ownerId===parent.ownerId)continue;
        if(!entityClear(drone,(drone.r||0)+1,c.x,c.y,ex,ey,c.r))return;
      }
      plans.push({child:c,x:ex,y:ey});
    }
    /* Atomic commit: never move only some children if another is contested.
     * Keep px/py at their actual birth position for a truthful trail. */
    for(var n=0;n<plans.length;n++){
      var p=plans[n];p.child.x=p.x;p.child.y=p.y;
      p.child.ttl-=remaining;
    }
  }

  var oldBullets=Game.prototype.updateBullets;
  Game.prototype.updateBullets=function(dt){
    var sole=this.bullets&&this.bullets.length===1;
    oldBullets.call(this,dt);
    /* Programmable cannon airbursts happen after normal collision resolution:
       direct hits therefore still beat the fuse, while surviving rounds detonate at the programmed distance. */
    for(var i=this.bullets.length-1;i>=0;i--){
      var b=this.bullets[i];if(!b||b.dead||!b.__v17Cannon||!b.__v17FuseDist)continue;
      var tr=Math.hypot(b.x-b.__v17SpawnX,b.y-b.__v17SpawnY);
      if(tr+2<b.__v17FuseDist)continue;
      /* The core already resolved this frame's direct hits and terrain.
       * For a surviving, non-breaching shot with no direct victims, place the
       * airburst at the FIRST crossing of the programmed fuse circle rather
       * than at the FPS-dependent frame endpoint. Never rewind a registered
       * hit or a high-penetration cover-breach path: those require the wider
       * chronological resolver. The historical 2u early-trigger tolerance
       * remains unchanged when the fuse circle was not actually crossed. */
      var physicalCross=null;
      if((b.hits||0)===0&&(b.pen||0)<2&&b.__novaBreachAtTime!==this.time&&tr>=b.__v17FuseDist&&
         Number.isFinite(b.px)&&Number.isFinite(b.py)&&
         Number.isFinite(b.__v17SpawnX)&&Number.isFinite(b.__v17SpawnY)){
        var fx=b.px-b.__v17SpawnX,fy=b.py-b.__v17SpawnY;
        var dx=b.x-b.px,dy=b.y-b.py,a=dx*dx+dy*dy;
        var c=fx*fx+fy*fy-b.__v17FuseDist*b.__v17FuseDist;
        if(a>1e-12&&c<0){
          var h=fx*dx+fy*dy,disc=h*h-a*c;
          if(disc>=0){
            var root=Math.sqrt(disc),t=h>=0?-c/(h+root):(-h+root)/a;
            if(t>=0&&t<=1){b.x=b.px+dx*t;b.y=b.py+dy*t;physicalCross=t;}
          }
        }
      }
      var owner=this.getTank&&this.getTank(b.ownerId),frac=b.splashDmg||.36;
      if(!b.__v17FuseArmed)frac*=.72;
      if(b.shell&&this.clusterBurst){
        var childStart=this.bullets.length;
        this.clusterBurst(b);
        advanceClearFuseChildren(this,b,childStart,dt,physicalCross,sole);
      }
      if((b.splash||0)>0&&this.splashAt)this.splashAt(b.x,b.y,b.splash,frac,b.ownerId,b.knock||0,b.color,b.dmg);
      if(this.addRing)this.addRing(b.x,b.y,b.color,Math.max(28,(b.splash||48)*.42));
      if(owner&&owner.isPlayer&&this.addText)this.addText(b.x,b.y-20,'AIRBURST',b.color,9);
      if(this.sfx&&this.sfx.novaFuseBurst)this.sfx.novaFuseBurst(pan(this,b.x),!!b.__v17FuseHeavy);
      b.dead=true;this.bullets.splice(i,1);
    }
  };

  var oldUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    oldUpdate.call(this,dt);
    if(!this.tanks)return;
    for(var i=0;i<this.tanks.length;i++){
      var t=this.tanks[i];if(!t||!t.alive)continue;
      var lin=lineage(classes,t);
      if(lin==='gunner'){
        var since=this.time-(t.__v17FiredAt==null?-99:t.__v17FiredAt);
        if(since>.08){
          var cool=shotMode(t)==='minigun'?.48:.62;
          t.__v17Heat=Math.max(0,(t.__v17Heat||0)-dt*cool);
          t.__v17Stability=clamp((t.__v17Stability==null?1:t.__v17Stability)+dt*.7,0,1);
        }
        /* AI has to vent rather than receiving effectively infinite perfect sustained fire. */
        if(t.ai&&(t.__v17Heat||0)>.93&&t.fireCd<.16){
          t.fireCd=.18+(t.ai.isElite?.04:.09);
          t.__v17Heat=Math.max(.68,(t.__v17Heat||0)-.14);
        }
      }else if(lin==='guardian'){
        if((t.stampedeT||0)>0&&(t.cls==='juggernaut'||t.cls==='meteor'||t.cls==='ravager')){
          var v=Math.hypot(t.vx||0,t.vy||0),max=this.tankSpeed?Math.max(1,this.tankSpeed(t)):140,ratio=v/max;
          var va=v>8?Math.atan2(t.vy,t.vx):(t.__v17ChargeAngle==null?t.angle:t.__v17ChargeAngle);
          var turn=t.__v17ChargeAngle==null?0:Math.abs(ad(va,t.__v17ChargeAngle));
          if(ratio>.56&&turn<.25)t.__v17Charge=clamp((t.__v17Charge||0)+dt*(.48+ratio*.24),0,1);
          else t.__v17Charge=Math.max(0,(t.__v17Charge||0)-dt*(.75+turn*1.5));
          t.__v17ChargeAngle=moveAngle(t.__v17ChargeAngle==null?va:t.__v17ChargeAngle,va,.95*dt);
          if((t.__novaTerrainBumpT||0)>0&&v>55&&(t.__v17Charge||0)>.18){
            t.__v17Charge*=.22;
            if(t.isPlayer&&(!t.__v17BumpCueAt||this.time-t.__v17BumpCueAt>.35)){
              t.__v17BumpCueAt=this.time;if(this.sfx&&this.sfx.novaChargeBreak)this.sfx.novaChargeBreak(0);
            }
          }
        }else t.__v17Charge=Math.max(0,(t.__v17Charge||0)-dt*1.2);
        t.__v17CounterCharge=Math.max(0,(t.__v17CounterCharge||0)-dt*.07);
      }
    }
  };

  /* Small public read-only helpers for tests/showroom telemetry. */
  Game.prototype.novaDisciplineState=function(t){
    var lin=lineage(classes,t);
    if(lin==='gunner'){var p=gunProfile(t);return{lineage:lin,heat:p.heat,cadence:p.sweet,stability:p.stable};}
    if(lin==='cannon')return{lineage:lin,fuseDepth:t.__v17FuseDepth||0,fuseDist:t.__v17FuseDist||0};
    if(lin==='guardian'){var gp=guardProfile(t);return{lineage:lin,guardArc:gp.arc,counter:t.__v17CounterCharge||0,charge:t.__v17Charge||0};}
    return{lineage:lin};
  };
});

/* ---------------- Rendering: visible mechanics, no extra controls ---------------- */
wrap('game/render',function(renderMod,require){
  var old=renderMod.render;if(!old||old.__novaThreeDisciplines)return;
  var classes=require('./classes'),C=classes.CLASSES;
  function lin(t){try{return classes.lineageForClass(t.cls);}catch(_){return null;}}
  function arc(ctx,x,y,r,a0,a1,col,w,alpha){
    ctx.save();ctx.globalAlpha=alpha==null?1:alpha;ctx.strokeStyle=col;ctx.lineWidth=w||2;ctx.beginPath();ctx.arc(x,y,r,a0,a1);ctx.stroke();ctx.restore();
  }
  function drawGunner(ctx,g,t){
    var h=clamp(t.__v17Heat||0,0,1),st=clamp(t.__v17Stability==null?1:t.__v17Stability,0,1),def=C[t.cls],r=(def&&def.size||15)+12;
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.lineCap='round';arc(ctx,t.x,t.y,r,-Math.PI*.78,-Math.PI*.78+Math.PI*1.56*h,'#68ecff',2.3,.72);
    if(h>.26&&h<.86&&st>.54)arc(ctx,t.x,t.y,r+3,-Math.PI*.10,Math.PI*.10,'#d9fbff',2.8,.72);
    if(h>.84)arc(ctx,t.x,t.y,r+1,Math.PI*.30,Math.PI*.72,'#ff9d7a',2.1,.58+.18*Math.sin(g.time*12));
    ctx.restore();
  }
  function cannonDepth(g,t){
    var depth=cannonInputDepth(g,t);
    return cannonFuseDistance(g,t,depth==null?.72:depth,C[t.cls]);
  }
  function drawCannon(ctx,g,t){
    if(!t.isPlayer)return;
    var input=g.input&&g.input.aim;
    if(!(input&&input.active)&&!(g.input&&g.input.mouseActive))return;
    var def=C[t.cls],shot=cannonShotPreview(g,t,def);
    var dist=shot.dist,ox=shot.ox,oy=shot.oy,x=shot.x,y=shot.y;
    /* A guaranteed earlier terrain impact supersedes the programmed fuse.
     * Combined Arms owns the IMPACT glyph; avoid a false FUSE glyph beyond
     * the wall. Potential cover breaches remain explicitly uncertain. */
    var terrain=g.novaFusePreview?g.novaFusePreview(t):null;
    var blocked=!!(terrain&&terrain.blocked);
    if(blocked){x=terrain.x;y=terrain.y;}
    var rad=(def&&def.bullet&&def.bullet.splash)||46;
    ctx.save();ctx.globalCompositeOperation='lighter';
    ctx.strokeStyle='rgba(255,190,112,.78)';ctx.fillStyle='rgba(255,190,112,.07)';
    ctx.lineWidth=1.3;ctx.setLineDash([5,7]);
    ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(x,y);ctx.stroke();ctx.setLineDash([]);
    if(blocked){ctx.restore();return;}
    ctx.beginPath();ctx.arc(x,y,Math.max(15,rad*.32),0,TAU);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-9,y);ctx.lineTo(x+9,y);ctx.moveTo(x,y-9);ctx.lineTo(x,y+9);ctx.stroke();
    ctx.font='800 8px Orbitron,system-ui';ctx.textAlign='center';
    ctx.fillStyle='rgba(255,224,187,.90)';
    ctx.fillText('FUSE '+Math.round(dist),x,y-18);
    ctx.restore();
  }
  function guardProf(id){
    if(id==='bastion')return{arc:1.52};
    if(id==='aegis')return{arc:2.36};
    if(id==='fortress')return{arc:1.82};
    if(id==='juggernaut')return{arc:1.62};
    if(id==='meteor')return{arc:1.72};
    if(id==='ravager')return{arc:1.66};
    return{arc:1.96};
  }
  function drawGuardian(ctx,g,t){
    var d=C[t.cls],r=(d&&d.size||16)+10,p=guardProf(t.cls),active=(t.bulwarkT||0)>0||(t.tauntT||0)>0,perfect=g.time<=(t.__v17PerfectGuardUntil||-1);
    ctx.save();ctx.globalCompositeOperation='lighter';ctx.lineCap='round';
    var c=perfect?'#fff0f6':active?'#ff9fc7':'#ff78ac',alpha=perfect?.95:active?.68:.24,w=perfect?4:active?3:1.5;
    arc(ctx,t.x,t.y,r,t.angle-p.arc*.5,t.angle+p.arc*.5,c,w,alpha);
    if(active){ctx.strokeStyle='rgba(255,150,195,.16)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(t.x,t.y);ctx.lineTo(t.x+Math.cos(t.angle-p.arc*.5)*r,t.y+Math.sin(t.angle-p.arc*.5)*r);ctx.moveTo(t.x,t.y);ctx.lineTo(t.x+Math.cos(t.angle+p.arc*.5)*r,t.y+Math.sin(t.angle+p.arc*.5)*r);ctx.stroke();}
    var cc=clamp(t.__v17CounterCharge||0,0,1);if(cc>.06)arc(ctx,t.x,t.y,r+4,t.angle-.24,t.angle+.24,'#fff1a8',2.2,.45+.42*cc);
    var ch=clamp(t.__v17Charge||0,0,1);if(ch>.05){ctx.strokeStyle='rgba(255,110,170,'+(.25+.5*ch)+')';ctx.lineWidth=2+ch*2;ctx.beginPath();ctx.moveTo(t.x-Math.cos(t.__v17ChargeAngle||t.angle)*(14+ch*20),t.y-Math.sin(t.__v17ChargeAngle||t.angle)*(14+ch*20));ctx.lineTo(t.x-Math.cos(t.__v17ChargeAngle||t.angle)*5,t.y-Math.sin(t.__v17ChargeAngle||t.angle)*5);ctx.stroke();}
    ctx.restore();
  }
  function patched(g,w,h){
    old(g,w,h);if(!g||!g.ctx||!g.player)return;
    var ctx=g.ctx,z=(g.cam&&g.cam.zoom)||g.zoom||1,dpr=g.dpr||1;ctx.save();ctx.setTransform(dpr*z,0,0,dpr*z,dpr*(w*.5-g.cam.x*z),dpr*(h*.5-g.cam.y*z));
    for(var i=0;i<g.tanks.length;i++){var t=g.tanks[i];if(!t||!t.alive)continue;var l=lin(t);if(l==='gunner')drawGunner(ctx,g,t);else if(l==='cannon')drawCannon(ctx,g,t);else if(l==='guardian')drawGuardian(ctx,g,t);}
    ctx.restore();
  }
  patched.__novaThreeDisciplines=true;renderMod.render=patched;
});

window.__NOVA_DISCIPLINES_TEST__={
  angleDelta:ad,
  gunSweet:function(h){return clamp(1-Math.abs(h-.56)/.30,0,1);},
  guardFront:function(facing,bearing,arc){return Math.abs(ad(bearing,facing))<=arc*.5;},
  fuse:function(range,depth){return clamp(range*(.20+.78*clamp(depth,.08,1)),150,range*.965);}
};

console.info('[NOVA TANKS] v1.7.0 Three Disciplines linked');
})();