/* NOVA TANKS v1.7.1 — Apex Doctrine
 * Apex specialization for the Three Disciplines lineages.
 * Loaded after disciplines-v1.7.0.js.
 */
(function(){
'use strict';

var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.7.1] module registry unavailable');return;}

var VERSION='1.7.1',CODENAME='Apex Doctrine',TAU=Math.PI*2;
window.__NOVA_APEX_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Apex tanks stop being bigger parents and become distinct mastery problems.',
  groups:{
    'Gunner Apex Doctrine':[
      'Tempest gets a broad redline cadence band with exceptional throughput, but overshooting it creates the harshest recoil/reload punishment in the cyan tree.',
      'Needle Storm gains a narrow precision gate: exact heat plus high stability hardens and accelerates needles, rewarding disciplined ranged tracking.',
      'Breachlord gains a brace cycle: a settled, cooled volley tightens and hits harder, then creates a short movement-recovery window that opponents can punish.',
      'Flakmaster turns stability into true ranged shotgun discipline through faster, longer-lived, tighter pellets instead of raw close-range spam.'
    ],
    'Cannon Apex Doctrine':[
      'Cluster King turns fuse depth into sector geometry: short programs spread child bombs wide, deep programs focus them into a narrower forward kill sector.',
      'Siege Bomber finally converts its structural specialization into real extra barricade damage while preserving Battlefield breach feedback.',
      'Annihilator rewards long programmed commitments with a larger, harder blast, but extends its already dangerous reload punish window.',
      'Quake Cannon converts deeper fuse programs into stronger displacement and slightly broader shock geometry rather than simple damage inflation.'
    ],
    'Guardian Apex Doctrine':[
      'Bastion can anchor a lane for additional frontal efficiency, but only while nearly stationary; flank pressure still bypasses the benefit.',
      'Aegis converts successful Perfect Guards into a brief mobility flow window, encouraging timed protection followed by repositioning instead of static tanking.',
      'Meteor becomes the highest-commitment rammer: straight lines charge faster and hit harder, while meaningful steering burns momentum quickly.',
      'Ravager preserves more momentum through moderate steering, trading Meteor peak impact for a more flexible aggressive route.'
    ],
    'Technical and Readability':[
      'The v1.7 Cannon structural multiplier is now actually consumed against destructible Battlefield cover instead of existing as unused projectile metadata.',
      'Apex telemetry is exposed through the existing discipline-state hook so future Blackglass and QA work can inspect the specialization state.',
      'All specialization rules are deterministic and layered on the same player/AI combat language; no Apex receives hidden perfect execution.'
    ]
  }
};

function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function ad(target,current){var d=(target-current+Math.PI)%TAU;if(d<0)d+=TAU;return d-Math.PI;}
function rotateTo(b,target,factor,speedMul){
  var a=Math.atan2(b.vy||0,b.vx||0),d=ad(target,a),s=Math.hypot(b.vx||0,b.vy||0)*(speedMul==null?1:speedMul);
  a+=d*factor;b.vx=Math.cos(a)*s;b.vy=Math.sin(a)*s;
}
function setSpeedAngle(b,a,mul){
  var s=Math.hypot(b.vx||0,b.vy||0)*(mul==null?1:mul);
  b.vx=Math.cos(a)*s;b.vy=Math.sin(a)*s;
}
function gunState(t){
  var h=clamp(t.__v17Heat||0,0,1.2),s=clamp(t.__v17Stability==null?1:t.__v17Stability,0,1);
  return{heat:h,stability:s};
}
function tempestBand(h){return clamp(1-Math.abs(h-.56)/.36,0,1);}
function needleGate(h,s){return clamp(1-Math.abs(h-.56)/.105,0,1)*clamp((s-.70)/.25,0,1);}
function flakDiscipline(h,s){return clamp(1-Math.abs(h-.43)/.34,0,1)*clamp((s-.58)/.34,0,1);}
function clusterWidth(depth){return 1.92-clamp(depth||0,0,1)*.88;}
function isApex(id){return id==='tempest'||id==='needlestorm'||id==='breachlord'||id==='flakmaster'||id==='clusterking'||id==='siegebomber'||id==='annihilator'||id==='quakecannon'||id==='bastion'||id==='aegis'||id==='meteor'||id==='ravager';}

wrap('game/classes',function(c){
  var C=c.CLASSES||{},text={
    tempest:'Redline cyclone. Hold the broad power band for unmatched pressure; overshoot it and the five barrels kick the chassis apart.',
    needlestorm:'Precision gate rotary. Exact heat plus stable tracking hardens the needle stream for ranged penetration.',
    breachlord:'Brace-cycle breacher. A settled volley is monstrous, but every committed blast creates a short punishable recovery.',
    flakmaster:'Range-disciplined flak. Calm tracking turns the six-pellet cone into a long-lane precision weapon.',
    clusterking:'Sector programmer. Fuse depth controls both where the cluster opens and how wide its child-bomb fan spreads.',
    siegebomber:'True siege artillery. Deliberate shell placement applies exceptional structural pressure to Battlefield cover.',
    annihilator:'Maximum commitment cannon. Deep programmed shots gain blast authority at the cost of an even larger reload opening.',
    quakecannon:'Displacement artillery. Deep fuse programs trade time and prediction for stronger lane-clearing shock.',
    bastion:'Anchor bunker. Nearly stop, face the lane and become brutally efficient from the front; movement and flanks break the posture.',
    aegis:'Mobile counter-guard. Perfect timing converts defense into a short repositioning window.',
    meteor:'Peak-commitment rammer. Straight lines build terrifying impact quickly; steering throws that force away.',
    ravager:'Flexible assault rammer. Carries momentum through moderate steering, sacrificing Meteor peak impact for route freedom.'
  };
  Object.keys(text).forEach(function(k){if(C[k])C[k].desc=text[k];});
});

wrap('game/engine',function(engine,require){
  var Game=engine.Game;if(!Game||Game.prototype.__novaApexDoctrine)return;
  Game.prototype.__novaApexDoctrine=true;
  var classes=require('./classes'),C=classes.CLASSES||{};

  function tankByOwner(g,id){return g.getTank?g.getTank(id):null;}

  var oldTry=Game.prototype.tryFire;
  Game.prototype.tryFire=function(t){
    var before=this.bullets?this.bullets.length:0;
    oldTry.call(this,t);
    if(!t||!isApex(t.cls)||!this.bullets||this.bullets.length<=before)return;
    var st=gunState(t),i,b;

    if(t.cls==='tempest'){
      var band=tempestBand(st.heat);
      if(band>.58&&st.stability>.52)t.fireCd*=.88;
      if(st.heat>.90){
        t.fireCd*=1.16;
        var kick=5.5+14*clamp((st.heat-.90)/.24,0,1);
        t.vx=(t.vx||0)-Math.cos(t.angle)*kick;t.vy=(t.vy||0)-Math.sin(t.angle)*kick;
        t.__v171RedlinePenalty=this.time+.22;
      }
      t.__v171ApexMeter=band;
    }else if(t.cls==='needlestorm'){
      var gate=needleGate(st.heat,st.stability);t.__v171ApexMeter=gate;
      if(gate>.64)for(i=before;i<this.bullets.length;i++){b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;b.vx*=1.08;b.vy*=1.08;b.dmg*=1.04;b.pen=(b.pen||0)+1;b.__v171NeedleGate=true;}
    }else if(t.cls==='breachlord'){
      var braced=st.heat<.54&&st.stability>.72;t.__v171ApexMeter=braced?1:0;
      if(braced){
        for(i=before;i<this.bullets.length;i++){b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;rotateTo(b,t.angle,.12,1.035);b.dmg*=1.055;b.__v171Braced=true;}
        t.__v171RecoverUntil=this.time+.30;
      }
    }else if(t.cls==='flakmaster'){
      var fd=flakDiscipline(st.heat,st.stability);t.__v171ApexMeter=fd;
      if(fd>.48)for(i=before;i<this.bullets.length;i++){b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;rotateTo(b,t.angle,.08+.06*fd,1+.08*fd);b.ttl=(b.ttl||.7)*(1+.10*fd);b.__v171FlakDiscipline=true;}
    }else if(t.cls==='siegebomber'){
      for(i=before;i<this.bullets.length;i++){b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;b.__novaStructureMult=Math.max(b.__novaStructureMult||1,2.35);b.__v171Siege=true;}
      t.__v171ApexMeter=clamp(t.__v17FuseDepth||0,0,1);
    }else if(t.cls==='annihilator'){
      var dep=clamp(t.__v17FuseDepth||0,0,1),commit=clamp((dep-.46)/.42,0,1);t.__v171ApexMeter=commit;
      if(commit>.15){
        for(i=before;i<this.bullets.length;i++){b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;b.dmg*=1+.10*commit;if(b.splash)b.splash*=1+.13*commit;if(b.knock)b.knock*=1+.12*commit;b.__v171Committed=commit;}
        t.fireCd*=1+.22*commit;t.__v171CommitUntil=this.time+.18+.18*commit;
      }
    }else if(t.cls==='quakecannon'){
      var qd=clamp(t.__v17FuseDepth||0,0,1);t.__v171ApexMeter=qd;
      for(i=before;i<this.bullets.length;i++){b=this.bullets[i];if(!b||b.ownerId!==t.id)continue;if(b.knock)b.knock*=1+.62*qd;if(b.splash)b.splash*=1+.10*qd;b.__v171QuakeDepth=qd;}
    }
  };

  /* Cluster King: child bombs become a forward sector whose width is set by fuse depth. */
  if(Game.prototype.clusterBurst){
    var oldCluster=Game.prototype.clusterBurst;
    Game.prototype.clusterBurst=function(parent){
      var before=this.bullets?this.bullets.length:0,owner=parent?tankByOwner(this,parent.ownerId):null;
      var out=oldCluster.apply(this,arguments);
      if(!owner||owner.cls!=='clusterking'||!this.bullets)return out;
      var kids=[];
      for(var i=before;i<this.bullets.length;i++){var b=this.bullets[i];if(b&&b.ownerId===owner.id)kids.push(b);}
      if(!kids.length)return out;
      var center=Math.atan2(parent.vy||Math.sin(owner.angle),parent.vx||Math.cos(owner.angle));
      var width=clusterWidth(owner.__v17FuseDepth||0),n=kids.length;
      for(var j=0;j<n;j++){
        var u=n===1?.5:j/(n-1),a=center-width*.5+width*u;
        setSpeedAngle(kids[j],a,1);kids[j].__v171SectorChild=true;
      }
      owner.__v171ApexMeter=1-width/1.92;
      return out;
    };
  }

  /* Structural integration repair: prime extra damage before Battlefield handles the actual hit.
     HP is clamped to 1 so Battlefield remains the code that performs the break, rubble, score and SFX. */
  var oldBullets=Game.prototype.updateBullets;
  Game.prototype.updateBullets=function(dt){
    if(this.bullets&&this.firstTerrainHit){
      for(var i=0;i<this.bullets.length;i++){
        var b=this.bullets[i];if(!b||b.dead||!(b.__novaStructureMult>1))continue;
        var nx=b.x+(b.vx||0)*dt,ny=b.y+(b.vy||0)*dt;
        var hit=this.firstTerrainHit(b.x,b.y,nx,ny,(b.r||2)*.45);
        if(!hit||!hit.solid||!hit.solid.destructible||hit.solid.hp<=1)continue;
        if(b.__v171PrimedCover===hit.solid.id)continue;
        b.__v171PrimedCover=hit.solid.id;
        var shellMult=b.shell?1.35:1;
        var extra=(b.dmg||0)*shellMult*((b.__novaStructureMult||1)-1);
        hit.solid.hp=Math.max(1,hit.solid.hp-extra);
      }
    }
    return oldBullets.apply(this,arguments);
  };

  var oldSpeed=Game.prototype.tankSpeed;
  Game.prototype.tankSpeed=function(t){
    var s=oldSpeed.call(this,t);
    if(!t)return s;
    if(t.cls==='breachlord'&&this.time<(t.__v171RecoverUntil||0))s*=.86;
    if(t.cls==='aegis'&&this.time<(t.__v171FlowUntil||0))s*=1.10;
    return s;
  };

  /* Bastion: an earned stationary posture strengthens only the already-correct frontal lane. */
  var oldDamage=Game.prototype.damageTank;
  Game.prototype.damageTank=function(t,dmg,sourceId){
    var incoming=dmg;
    if(t&&t.cls==='bastion'&&(t.__v171Anchor||0)>.88&&sourceId!=null){
      var src=tankByOwner(this,sourceId);
      if(src){
        var bearing=Math.atan2(src.y-t.y,src.x-t.x);
        if(Math.abs(ad(bearing,t.angle))<=.62)incoming*=.82;
      }
    }
    var beforeCounter=t&&t.__v17CounterCharge||0;
    var out=oldDamage.call(this,t,incoming,sourceId);
    if(t&&t.cls==='aegis'&&(t.__v17CounterCharge||0)>beforeCounter+.25)t.__v171FlowUntil=this.time+.72;
    return out;
  };

  var oldBody=Game.prototype.bodyDamage;
  Game.prototype.bodyDamage=function(t){
    var d=oldBody.call(this,t);
    var c=clamp(t&&t.__v17Charge||0,0,1);
    if(t&&t.cls==='meteor')d*=1+.24*c;
    else if(t&&t.cls==='ravager')d*=1+.08*c;
    return d;
  };

  var oldUpdate=Game.prototype.update;
  Game.prototype.update=function(dt){
    oldUpdate.call(this,dt);
    if(!this.tanks)return;
    for(var i=0;i<this.tanks.length;i++){
      var t=this.tanks[i];if(!t||!t.alive)continue;
      if(t.cls==='bastion'){
        var max=oldSpeed.call(this,t)||1,ratio=Math.hypot(t.vx||0,t.vy||0)/Math.max(1,max);
        t.__v171Anchor=clamp((t.__v171Anchor||0)+dt*(ratio<.18?2.6:-3.4),0,1);
        t.__v171ApexMeter=t.__v171Anchor;
      }else if((t.cls==='meteor'||t.cls==='ravager')&&(t.stampedeT||0)>0){
        var v=Math.hypot(t.vx||0,t.vy||0),a=v>8?Math.atan2(t.vy,t.vx):t.angle;
        var prev=t.__v171MoveAngle==null?a:t.__v171MoveAngle,turn=Math.abs(ad(a,prev));
        if(t.cls==='meteor'){
          if(v>55&&turn<.15)t.__v17Charge=clamp((t.__v17Charge||0)+dt*.24,0,1);
          else if(turn>.20)t.__v17Charge=Math.max(0,(t.__v17Charge||0)-dt*(.55+turn*1.8));
        }else{
          if(v>48&&turn<.42)t.__v17Charge=clamp((t.__v17Charge||0)+dt*.10,0,1);
          else if(turn>.58)t.__v17Charge=Math.max(0,(t.__v17Charge||0)-dt*(.30+turn*.72));
        }
        t.__v171MoveAngle=a;t.__v171ApexMeter=clamp(t.__v17Charge||0,0,1);
      }else if(t.cls==='aegis'){
        t.__v171ApexMeter=this.time<(t.__v171FlowUntil||0)?1:0;
      }
    }
  };

  if(Game.prototype.novaDisciplineState){
    var oldState=Game.prototype.novaDisciplineState;
    Game.prototype.novaDisciplineState=function(t){
      var s=oldState.call(this,t)||{};
      if(t&&isApex(t.cls)){s.apex=t.cls;s.apexMeter=clamp(t.__v171ApexMeter||0,0,1);s.apexRecovery=Math.max(0,(t.__v171RecoverUntil||t.__v171FlowUntil||0)-this.time);}
      return s;
    };
  }
});

window.__NOVA_APEX_TEST__={
  tempestBand:tempestBand,
  needleGate:needleGate,
  flakDiscipline:flakDiscipline,
  clusterWidth:clusterWidth
};
})();
