(function(){
'use strict';
var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.9.1] module registry unavailable');return;}
var VERSION='1.9.1',CODENAME='Impact Language',TAU=Math.PI*2;
var REDUCED=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
var COLORS={heal:'#75f0a3',shield:'#7dcfff',triple:'#c493ff',haste:'#75f6ff',nuke:'#ff9a67',default:'#d8f7ff'};
var SHAPE_COLORS={circle:'#5ad1ff',triangle:'#54e38a',square:'#c98bff',pentagon:'#ffb45e',hexagon:'#ff6ea9',star:'#ffe066',crasher:'#ff5d5d'};
window.__NOVA_VERSION=VERSION;
window.__NOVA_FEEDBACK_RELEASE__={
version:VERSION,codename:CODENAME,date:'2026-08-08',
headline:'Every important action speaks the same visual and audio language without turning the arena into a notification feed.',
groups:{
'Shot → Hit → Kill':['Successful player shots get a restrained muzzle/reticle impulse instead of another label.','Confirmed damage produces a crisp micro-hit cue; lethal hits resolve into a distinct kill punctuation without obscuring the target.','Incoming damage reports direction and severity with a short peripheral arc and spatial impact sound, while critical health shifts into a restrained pulse rather than permanent alarm spam.'],
'State Changes':['Longer weapon recoveries end with a subtle ready click and reticle bracket; rapid-fire weapons are deliberately excluded from repetitive ready spam.','Powerup collection, valid ability activation and evolution choices each receive their own short color/sound signature so state changes are felt immediately.','Nearby powerup spawns receive a quiet world-space ping, making battlefield resources legible without adding a minimap or extra HUD panel.'],
'Drones and Battlefield':['Losing a player-owned drone now has a distinct link-break cue; destroying a hostile drone receives a lighter confirmation.','Existing terrain breach, sniper warning, class-discipline and Controller impact feedback remain authoritative; this layer complements them instead of duplicating them.','Audio uses stereo direction and distance-aware gain where world position matters.'],
'Restraint and Performance':['The feedback director stores only a reused per-game state object and renders from timestamps; it does not create per-frame event arrays or perform new per-frame entity scans.','High-frequency events are coalesced and audio-throttled so automatic weapons stay readable instead of becoming a slot machine.','The layer respects SOUND OFF, the existing master audio route, Pilot Console screen-shake behavior, and reduced-motion preferences.']
}
};
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function now(g){return g&&Number.isFinite(g.time)?g.time:(typeof performance!=='undefined'?performance.now()/1000:0);}
function colorFor(type){return COLORS[type]||COLORS.default;}
function panFrom(g,x){if(!g||!g.player)return 0;var span=Math.max(480,(g.w||960)/Math.max(.55,(g.cam&&g.cam.zoom)||1));return clamp((x-g.player.x)/span,-1,1);}
function atten(g,x,y,range){if(!g||!g.player)return .7;var d=Math.hypot(x-g.player.x,y-g.player.y);return clamp(1-d/(range||1050),.15,1);}
function state(g){
var s=g.__v191Feedback;if(s)return s;
s=g.__v191Feedback={
shotUntil:0,shotPower:0,hitUntil:0,hitX:0,hitY:0,hitPower:0,hitKill:false,hitColor:'#fff',
damageUntil:0,damageAngle:0,damagePower:0,damageCritical:false,readyUntil:0,
powerUntil:0,powerColor:COLORS.default,abilityUntil:0,abilityColor:COLORS.default,evolveUntil:0,
droneUntil:0,droneX:0,droneY:0,droneFriendly:false,reloading:false,reloadPeak:0,reloadBeam:false,
critical:false,lowBeatAt:-99,deathUntil:0
};
return s;
}
function mark(g){if(window.__NOVA_FEEDBACK__)window.__NOVA_FEEDBACK__.events++;return state(g);}
function sourceAngle(g,victim,killerId,kx,ky){
var src=killerId!=null&&killerId>=0&&g.getTank?g.getTank(killerId):null;
if(src&&Number.isFinite(src.x)&&Number.isFinite(src.y))return Math.atan2(src.y-victim.y,src.x-victim.x);
if(Number.isFinite(kx)&&Number.isFinite(ky)&&Math.hypot(kx,ky)>.001)return Math.atan2(-ky,-kx);
return 0;
}
wrap('game/audio',function(audio){
var Sfx=audio.Sfx;if(!Sfx||Sfx.prototype.__novaImpactLanguage)return;
Sfx.prototype.__novaImpactLanguage=true;
function route(self,node,p){
if(!self.ctx||!self.master)return;
if(self.ctx.createStereoPanner){var q=self.ctx.createStereoPanner();q.pan.value=clamp(p||0,-1,1);node.connect(q);q.connect(self.master);}else node.connect(self.master);
}
function tone(self,f0,f1,dur,gain,p,type,delay){
self.resume();if(!self.ctx||!self.master||self.muted)return;
var c=self.ctx,t=c.currentTime+(delay||0),o=c.createOscillator(),v=c.createGain();
o.type=type||'triangle';o.frequency.setValueAtTime(Math.max(24,f0),t);o.frequency.exponentialRampToValueAtTime(Math.max(24,f1),t+dur);
v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+Math.min(.012,dur*.22));v.gain.exponentialRampToValueAtTime(.0001,t+dur);
o.connect(v);route(self,v,p);o.start(t);o.stop(t+dur+.025);
}
function noise(self,dur,gain,p,hp,lp,delay){
self.resume();if(!self.ctx||!self.master||self.muted)return;
var c=self.ctx;if(!self.__novaImpactNoise){var n=Math.max(1,Math.floor(c.sampleRate*.24)),b=c.createBuffer(1,n,c.sampleRate),d=b.getChannelData(0);for(var i=0;i<n;i++)d[i]=Math.random()*2-1;self.__novaImpactNoise=b;}
var t=c.currentTime+(delay||0),src=c.createBufferSource(),hi=c.createBiquadFilter(),lo=c.createBiquadFilter(),v=c.createGain();src.buffer=self.__novaImpactNoise;hi.type='highpass';hi.frequency.value=hp||900;lo.type='lowpass';lo.frequency.value=lp||9000;
v.gain.setValueAtTime(Math.max(.0002,gain),t);v.gain.exponentialRampToValueAtTime(.0001,t+dur);src.connect(hi);hi.connect(lo);lo.connect(v);route(self,v,p);src.start(t);src.stop(t+dur+.025);
}
function throttle(self,key,ms){var t=typeof performance!=='undefined'?performance.now():Date.now();if(self[key]&&t-self[key]<ms){if(window.__NOVA_FEEDBACK__)window.__NOVA_FEEDBACK__.throttled++;return true;}self[key]=t;return false;}
Sfx.prototype.novaFeedbackHit=function(p,power,kill){
if(throttle(this,'__novaFbHitAt',kill?35:55))return;power=clamp(power||.35,.15,1);
tone(this,kill?720:1180,kill?1480:1760,kill?.105:.045,(kill?.030:.013)*power,p,'triangle',0);
noise(this,kill?.070:.030,(kill?.016:.006)*power,p,kill?1000:2200,10500,0);
if(kill){tone(this,390,780,.13,.016*power,p,'sine',.038);tone(this,780,1170,.11,.011*power,p,'sine',.105);}
};
Sfx.prototype.novaFeedbackDamage=function(p,power,critical){
if(throttle(this,'__novaFbDamageAt',65))return;power=clamp(power||.35,.15,1);
tone(this,critical?145:190,critical?54:72,.13,.020+.027*power,p,'sine',0);noise(this,.050,.007+.011*power,p,900,6200,0);
};
Sfx.prototype.novaFeedbackReady=function(){if(throttle(this,'__novaFbReadyAt',180))return;tone(this,820,1340,.060,.012,0,'triangle',0);tone(this,1350,1680,.045,.007,0,'sine',.038);};
Sfx.prototype.novaFeedbackPickup=function(p,type){
if(throttle(this,'__novaFbPickupAt',85))return;var f=type==='heal'?620:type==='shield'?780:type==='nuke'?330:type==='triple'?910:type==='haste'?1080:720;
tone(this,f,f*1.55,.09,.020,p,'sine',0);tone(this,f*1.28,f*1.92,.10,.012,p,'triangle',.052);
};
Sfx.prototype.novaFeedbackPowerSpawn=function(p,level){if(throttle(this,'__novaFbSpawnAt',220))return;level=clamp(level||.5,.1,1);tone(this,980,1320,.065,.008*level,p,'sine',0);tone(this,1320,1010,.07,.005*level,p,'triangle',.052);};
Sfx.prototype.novaFeedbackAbility=function(p){if(throttle(this,'__novaFbAbilityAt',100))return;tone(this,430,920,.11,.016,p,'triangle',0);tone(this,920,650,.08,.009,p,'sine',.065);};
Sfx.prototype.novaFeedbackEvolve=function(){if(throttle(this,'__novaFbEvolveAt',200))return;tone(this,360,720,.16,.020,0,'sine',0);tone(this,540,1080,.17,.016,0,'sine',.075);tone(this,810,1620,.19,.012,0,'triangle',.15);};
Sfx.prototype.novaFeedbackHeartbeat=function(intensity){if(throttle(this,'__novaFbHeartAt',360))return;intensity=clamp(intensity||.5,.2,1);tone(this,105,72,.095,.010+.012*intensity,0,'sine',0);tone(this,95,65,.080,.007+.008*intensity,0,'sine',.13);};
Sfx.prototype.novaFeedbackDrone=function(p,friendly){if(throttle(this,'__novaFbDroneAt',90))return;tone(this,friendly?760:1120,friendly?190:520,.095,friendly?.019:.010,p,'square',0);noise(this,.045,friendly?.008:.004,p,1500,7200,.01);};
});
wrap('game/engine',function(engine,require){
var Game=engine.Game;if(!Game||Game.prototype.__novaImpactLanguage)return;
Game.prototype.__novaImpactLanguage=true;
var classes=require('./classes'),C=classes&&classes.CLASSES||{};
function isBeam(t){var d=t&&C[t.cls];return !!(d&&d.fireMode==='beam');}
function hasSniperReady(t){try{return classes.lineageForClass&&classes.lineageForClass(t.cls)==='sniper';}catch(_){return false;}}
function shotRecovery(t){var d=t&&C[t.cls],r=d&&d.bullet&&d.bullet.reload;return Number.isFinite(r)?r:(t&&Number.isFinite(t.fireCd)?t.fireCd:0);}
function flashWorld(g,x,y,col,r){if(g.addRing)g.addRing(x,y,col,r);}
var oldFire=Game.prototype.tryFire;
if(oldFire)Game.prototype.tryFire=function(t){
var before=this.bullets?this.bullets.length:0,out=oldFire.apply(this,arguments),after=this.bullets?this.bullets.length:0;
if(t&&t.isPlayer&&after>before){
var s=mark(this),tm=now(this),recovery=Math.max(t.fireCd||0,shotRecovery(t)||0);
s.shotUntil=tm+(REDUCED?.045:.075);s.shotPower=clamp(.34+(after-before-1)*.055+(recovery>.8?.22:0),.32,1);
s.reloadPeak=recovery;s.reloadBeam=isBeam(t)||hasSniperReady(t);s.reloading=!s.reloadBeam&&recovery>=.34;
}
return out;
};
var oldShape=Game.prototype.damageShape;
if(oldShape)Game.prototype.damageShape=function(s,dmg,kx,ky){
if(!s)return oldShape.apply(this,arguments);
var pl=this.player,hp0=Number(s.hp)||0,likely=false;
if(pl&&pl.alive!==false&&Math.pow(s.x-pl.x,2)+Math.pow(s.y-pl.y,2)<1300*1300){
for(var i=(this.bullets?this.bullets.length:0)-1,seen=0;i>=0&&seen<18;i--,seen++){var b=this.bullets[i];if(!b||b.ownerId!==pl.id||b.dead)continue;var rr=(Number(s.r)||18)+(Number(b.r)||5)+14;if(Math.pow(b.x-s.x,2)+Math.pow(b.y-s.y,2)<=rr*rr){likely=true;break;}}
if(!likely&&(!kx&&!ky)){var d=C[pl.cls],sz=(d&&d.size)||14,rr2=sz+(Number(s.r)||18)+6;likely=Math.pow(s.x-pl.x,2)+Math.pow(s.y-pl.y,2)<=rr2*rr2;}
}
var out=oldShape.apply(this,arguments),dealt=Math.max(0,hp0-Math.max(0,Number(s.hp)||0));
if(likely&&dealt>.001){var st=mark(this),tm=now(this),power=clamp(dealt/Math.max(1,Number(s.maxHp)||hp0||1)*2.4,.18,.72);st.hitUntil=tm+.10;st.hitX=s.x;st.hitY=s.y;st.hitPower=Math.max(st.hitPower||0,power);st.hitKill=false;st.hitColor=SHAPE_COLORS[s.type]||COLORS.default;if(this.sfx&&this.sfx.novaFeedbackHit)this.sfx.novaFeedbackHit(panFrom(this,s.x),power,false);}
return out;
};
var oldDamage=Game.prototype.damageTank;
if(oldDamage)Game.prototype.damageTank=function(victim,dmg,killerId,kx,ky){
if(!victim)return oldDamage.apply(this,arguments);
var hp0=Number(victim.hp)||0,alive0=victim.alive!==false&&hp0>0,out=oldDamage.apply(this,arguments),hp1=Math.max(0,Number(victim.hp)||0),dealt=Math.max(0,hp0-hp1);
if(dealt<=.001)return out;
var tm=now(this),pl=this.player,killer=killerId!=null&&killerId>=0&&this.getTank?this.getTank(killerId):null,maxHp=Math.max(1,Number(victim.maxHp)||hp0||1),power=clamp((dealt/maxHp)*3.2,.22,1),dead=alive0&&(victim.alive===false||hp1<=0);
if(pl&&killer&&killer.id===pl.id&&victim.id!==pl.id){
var hs=mark(this);hs.hitUntil=tm+(dead?.24:.12);hs.hitX=victim.x;hs.hitY=victim.y;hs.hitPower=Math.max(hs.hitPower||0,power);hs.hitKill=dead;hs.hitColor=victim.color||'#ffffff';
if(this.sfx&&this.sfx.novaFeedbackHit)this.sfx.novaFeedbackHit(panFrom(this,victim.x),power,dead);
if(dead)flashWorld(this,victim.x,victim.y,'#ffffff',44);
}
if(pl&&victim.id===pl.id){
var ds=mark(this),ang=sourceAngle(this,victim,killerId,kx,ky),frac=hp1/maxHp,critical=frac<=.28;
ds.damageUntil=tm+(dead?.72:.40);ds.damageAngle=ang;ds.damagePower=Math.max(ds.damagePower||0,power);ds.damageCritical=critical;
if(this.sfx&&this.sfx.novaFeedbackDamage){var sx=killer&&Number.isFinite(killer.x)?killer.x:pl.x+Math.cos(ang)*120;this.sfx.novaFeedbackDamage(panFrom(this,sx),power,critical);}
if(dead)ds.deathUntil=tm+.85;
}
return out;
};
var oldDrone=Game.prototype.damageDrone;
if(oldDrone)Game.prototype.damageDrone=function(d,dmg,killerId){
var hp0=d?Number(d.hp)||0:0,owner=d&&this.tankById?this.tankById.get(d.ownerId):null,out=oldDrone.apply(this,arguments);
if(!d||hp0<=0||((Number(d.hp)||0)>0&&!d.dead))return out;
var killer=killerId!=null&&killerId>=0&&this.getTank?this.getTank(killerId):null,pl=this.player,friendly=!!(owner&&owner.isPlayer),confirmed=!!(pl&&killer&&killer.id===pl.id&&owner&&!owner.isPlayer);
if(friendly||confirmed){var s=mark(this);s.droneUntil=now(this)+.30;s.droneX=d.x;s.droneY=d.y;s.droneFriendly=friendly;if(this.sfx&&this.sfx.novaFeedbackDrone)this.sfx.novaFeedbackDrone(panFrom(this,d.x),friendly);flashWorld(this,d.x,d.y,friendly?'#ff8fa6':'#d8f7ff',friendly?28:20);}
return out;
};
var oldPower=Game.prototype.applyPowerup;
if(oldPower)Game.prototype.applyPowerup=function(t,type){
var out=oldPower.apply(this,arguments);
if(t&&t.isPlayer){var s=mark(this),col=colorFor(type);s.powerUntil=now(this)+.42;s.powerColor=col;if(this.addRing)this.addRing(t.x,t.y,col,42);if(this.addParticles)this.addParticles(t.x,t.y,col,7,72,'glow');if(this.sfx&&this.sfx.novaFeedbackPickup)this.sfx.novaFeedbackPickup(0,type);}
return out;
};
var oldSpawnPower=Game.prototype.spawnPowerup;
if(oldSpawnPower)Game.prototype.spawnPowerup=function(){
var n=this.powerups?this.powerups.length:0,out=oldSpawnPower.apply(this,arguments),p=this.powerups&&this.powerups.length>n?this.powerups[this.powerups.length-1]:null,pl=this.player;
if(p&&pl&&pl.alive!==false){var d=Math.hypot(p.x-pl.x,p.y-pl.y);if(d<900&&(!this.hasLineOfSight||this.hasLineOfSight(pl.x,pl.y,p.x,p.y,2))){var col=colorFor(p.type);if(this.addRing)this.addRing(p.x,p.y,col,24);if(this.sfx&&this.sfx.novaFeedbackPowerSpawn)this.sfx.novaFeedbackPowerSpawn(panFrom(this,p.x),atten(this,p.x,p.y,900));}}
return out;
};
var oldAbility=Game.prototype.useAbility;
if(oldAbility)Game.prototype.useAbility=function(t){
if(!t||!t.isPlayer)return oldAbility.apply(this,arguments);
var cd=t.abilityCd||0,n=this.bullets?this.bullets.length:0,b1=t.bulwarkT||0,b2=t.tauntT||0,b3=t.stampedeT||0,out=oldAbility.apply(this,arguments);
var activated=(t.abilityCd||0)>cd+.02||(this.bullets&&this.bullets.length>n)||(t.bulwarkT||0)>b1+.02||(t.tauntT||0)>b2+.02||(t.stampedeT||0)>b3+.02;
if(activated){var s=mark(this);s.abilityUntil=now(this)+.28;s.abilityColor=t.color||COLORS.default;if(this.addRing)this.addRing(t.x,t.y,s.abilityColor,36);if(this.sfx&&this.sfx.novaFeedbackAbility)this.sfx.novaFeedbackAbility(0);}
return out;
};
[['applyClass','cls'],['applyPerk','perk'],['applyGene','gene']].forEach(function(pair){
var name=pair[0],prop=pair[1],old=Game.prototype[name];if(!old)return;
Game.prototype[name]=function(){
var before=this.player?this.player[prop]:undefined,out=old.apply(this,arguments),pl=this.player;
if(pl&&pl[prop]!==before){var s=mark(this);s.evolveUntil=now(this)+(REDUCED?.38:.72);if(this.addRing){this.addRing(pl.x,pl.y,'#ffffff',48);this.addRing(pl.x,pl.y,pl.color||COLORS.default,62);}if(this.addParticles)this.addParticles(pl.x,pl.y,pl.color||COLORS.default,12,105,'glow');if(this.sfx&&this.sfx.novaFeedbackEvolve)this.sfx.novaFeedbackEvolve();}
return out;
};
});
var oldUpdate=Game.prototype.update;
if(oldUpdate)Game.prototype.update=function(dt){
var pre=this.player,preCd=pre?pre.fireCd||0:0,out=oldUpdate.apply(this,arguments),pl=this.player;if(!pl)return out;var s=state(this),tm=now(this);
if(s.reloading&&preCd>.001&&(pl.fireCd||0)<=.001){s.reloading=false;if(s.reloadPeak>=.34&&!s.reloadBeam&&pl.alive!==false){s.readyUntil=tm+.22;mark(this);if(this.sfx&&this.sfx.novaFeedbackReady)this.sfx.novaFeedbackReady();}}
var frac=(Number(pl.hp)||0)/Math.max(1,Number(pl.maxHp)||Number(pl.hp)||1),crit=pl.alive!==false&&frac>0&&frac<=.28;
if(crit){var intensity=clamp((.30-frac)/.22,.18,1),interval=1.18-intensity*.38;if(!s.critical){s.critical=true;s.lowBeatAt=tm-interval;}if(tm-s.lowBeatAt>=interval){s.lowBeatAt=tm;if(this.sfx&&this.sfx.novaFeedbackHeartbeat)this.sfx.novaFeedbackHeartbeat(intensity);}}
else if(frac>.32||pl.alive===false){s.critical=false;s.lowBeatAt=-99;}
if(tm>s.hitUntil){s.hitPower=0;s.hitKill=false;}if(tm>s.damageUntil)s.damagePower=0;
return out;
};
});
wrap('game/render',function(render){
var old=render.render;if(!old||old.__novaImpactLanguage)return;
function alpha(until,tm,life){return clamp((until-tm)/Math.max(.001,life),0,1);}
function tickCross(ctx,cx,cy,r,len,col,a,w){ctx.save();ctx.strokeStyle=col;ctx.globalAlpha=a;ctx.lineWidth=w||1.5;ctx.lineCap='round';for(var i=0;i<4;i++){var q=i*Math.PI*.5+.785398,ux=Math.cos(q),uy=Math.sin(q);ctx.beginPath();ctx.moveTo(cx+ux*r,cy+uy*r);ctx.lineTo(cx+ux*(r+len),cy+uy*(r+len));ctx.stroke();}ctx.restore();}
function draw(g,w,h){
var s=g.__v191Feedback;if(!s||!g.ctx)return;var ctx=g.ctx,tm=now(g),dpr=g.dpr||1,cx=w*.5,cy=h*.5,min=Math.min(w,h),pl=g.player;
ctx.save();ctx.setTransform(dpr,0,0,dpr,0,0);
var a=alpha(s.shotUntil,tm,REDUCED?.045:.075);if(a>0){var rr=7+(1-a)*5;tickCross(ctx,cx,cy,rr,4+(s.shotPower||.4)*3,'#e9fbff',.24+.42*a,1.2+(s.shotPower||.4)*.6);}
a=alpha(s.hitUntil,tm,s.hitKill?.24:.12);if(a>0){var hr=s.hitKill?11:8;tickCross(ctx,cx,cy,hr,5,s.hitKill?'#ffffff':'#d8f7ff',.35+.62*a,s.hitKill?2.2:1.55);if(s.hitKill){ctx.save();ctx.translate(cx,cy);ctx.rotate(Math.PI*.25);ctx.strokeStyle='#ffffff';ctx.globalAlpha=.72*a;ctx.lineWidth=1.5;ctx.strokeRect(-7,-7,14,14);ctx.restore();}var z=(g.cam&&g.cam.zoom)||1,sx=(s.hitX-g.cam.x)*z+w*.5,sy=(s.hitY-g.cam.y)*z+h*.5;if(sx>-24&&sx<w+24&&sy>-24&&sy<h+24)tickCross(ctx,sx,sy,5,3,s.hitColor||'#fff',.18+.45*a,1.1);}
a=alpha(s.damageUntil,tm,s.deathUntil>tm?.72:.40);if(a>0){var ang=s.damageAngle||0,r=min*.30;ctx.save();ctx.translate(cx,cy);ctx.rotate(ang);ctx.strokeStyle=s.damageCritical?'#ff5f78':'#ff9b7a';ctx.globalAlpha=(.18+.62*a)*(s.damagePower||.4);ctx.lineWidth=2.5+3*(s.damagePower||.4);ctx.lineCap='round';ctx.beginPath();ctx.arc(0,0,r,-.24,.24);ctx.stroke();ctx.beginPath();ctx.moveTo(r-7,-8);ctx.lineTo(r+3,0);ctx.lineTo(r-7,8);ctx.stroke();ctx.restore();}
if(pl&&s.critical&&pl.alive!==false){var frac=(Number(pl.hp)||0)/Math.max(1,Number(pl.maxHp)||Number(pl.hp)||1),urg=clamp((.29-frac)/.22,.1,1),pulse=.5+.5*Math.sin(tm*(6.2+urg*2.8));ctx.save();ctx.strokeStyle='#ff4f6f';ctx.globalAlpha=.055+urg*.09+pulse*.055;ctx.lineWidth=6+urg*4;ctx.strokeRect(5,5,w-10,h-10);ctx.restore();}
a=alpha(s.readyUntil,tm,.22);if(a>0){ctx.save();ctx.strokeStyle='#bff7ff';ctx.globalAlpha=.22+.50*a;ctx.lineWidth=1.4;var rr2=17+(1-a)*3;ctx.beginPath();ctx.moveTo(cx-rr2-6,cy-4);ctx.lineTo(cx-rr2,cy-4);ctx.lineTo(cx-rr2,cy+4);ctx.lineTo(cx-rr2-6,cy+4);ctx.moveTo(cx+rr2+6,cy-4);ctx.lineTo(cx+rr2,cy-4);ctx.lineTo(cx+rr2,cy+4);ctx.lineTo(cx+rr2+6,cy+4);ctx.stroke();ctx.restore();}
a=alpha(s.powerUntil,tm,.42);if(a>0){ctx.save();ctx.strokeStyle=s.powerColor||COLORS.default;ctx.globalAlpha=.20+.48*a;ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(cx,cy,25+(1-a)*13,-Math.PI*.82,-Math.PI*.18);ctx.stroke();ctx.beginPath();ctx.arc(cx,cy,25+(1-a)*13,Math.PI*.18,Math.PI*.82);ctx.stroke();ctx.restore();}
a=alpha(s.abilityUntil,tm,.28);if(a>0){ctx.save();ctx.strokeStyle=s.abilityColor||COLORS.default;ctx.globalAlpha=.15+.42*a;ctx.lineWidth=1.2;ctx.setLineDash([4,5]);ctx.beginPath();ctx.arc(cx,cy,30+(1-a)*7,0,TAU);ctx.stroke();ctx.restore();}
a=alpha(s.evolveUntil,tm,REDUCED?.38:.72);if(a>0){ctx.save();ctx.strokeStyle=pl&&pl.color?pl.color:'#d8f7ff';ctx.globalAlpha=.10+.34*a;ctx.lineWidth=1.5;ctx.strokeRect(10+(1-a)*8,10+(1-a)*8,w-20-(1-a)*16,h-20-(1-a)*16);ctx.strokeStyle='#ffffff';ctx.globalAlpha=.12+.30*a;ctx.lineWidth=1;for(var i=0;i<8;i++){var q=i/8*TAU,ux=Math.cos(q),uy=Math.sin(q),r0=35+(1-a)*12,r1=46+(1-a)*28;ctx.beginPath();ctx.moveTo(cx+ux*r0,cy+uy*r0);ctx.lineTo(cx+ux*r1,cy+uy*r1);ctx.stroke();}ctx.restore();}
a=alpha(s.droneUntil,tm,.30);if(a>0){var zz=(g.cam&&g.cam.zoom)||1,dx=(s.droneX-g.cam.x)*zz+w*.5,dy=(s.droneY-g.cam.y)*zz+h*.5;if(dx>-30&&dx<w+30&&dy>-30&&dy<h+30){ctx.save();ctx.strokeStyle=s.droneFriendly?'#ff8fa6':'#d8f7ff';ctx.globalAlpha=.18+.48*a;ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(dx,dy,9+(1-a)*7,0,TAU);ctx.stroke();ctx.restore();}}
a=alpha(s.deathUntil,tm,.85);if(a>0){ctx.save();ctx.strokeStyle='#ff4d6d';ctx.globalAlpha=.10+.32*a;ctx.lineWidth=12;ctx.strokeRect(6,6,w-12,h-12);ctx.restore();}
ctx.restore();
}
function patched(g,w,h){old(g,w,h);if(g&&g.ctx)draw(g,w,h);}patched.__novaImpactLanguage=true;render.render=patched;
});
window.__NOVA_FEEDBACK__={version:VERSION,events:0,throttled:0,presentationOnly:true};
window.__NOVA_FEEDBACK_TEST__={state:state,colorFor:colorFor,sourceAngle:sourceAngle,atten:atten,version:VERSION};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' sensory feedback online');
})();
