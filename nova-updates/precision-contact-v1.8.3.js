/* NOVA TANKS v1.8.3 — Contact Spark
 * Replaces Violet Doctrine's literal post-shot SHOT label with a quieter sensory cue:
 * directional source glint, distance-shaped procedural shot audio, and a one-shot
 * spark/swoosh when an off-screen precision round actually crosses into the viewport.
 */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods){console.error('[NOVA v1.8.3] module registry unavailable');return;}
var VERSION='1.8.3',CODENAME='Contact Spark',TAU=Math.PI*2;
window.__NOVA_VERSION=VERSION;
window.__NOVA_CONTACT_SPARK_RELEASE__={version:VERSION,codename:CODENAME,date:'2026-08-08',headline:'Incoming precision fire stops shouting SHOT and starts arriving as direction, distance and motion.',groups:{
 'Incoming Fire Language':['The literal SHOT edge label is removed while Violet Doctrine keeps its directional glint, preserving where the danger came from without turning combat into UI signage.','Hostile non-Rail precision shots use three restrained procedural shot timbres whose loudness, brightness and body change continuously with shooter distance.','The firing cue stays deliberately faint; the projectile itself remains the important thing to read.'],
 'Contact Transition':['An off-screen precision round is tracked only while relevant to the player viewport.','The instant that round crosses into the visible playfield, its source glint yields to a brief physical spark at the entry edge.','A single spatial swoosh marks the start of that incoming exchange; clustered rounds share an engagement cooldown so automatic fire does not machine-gun the cue.'],
 'Readability and Restraint':['Rail weapons keep Silent Horizon\'s stronger pre-fire telegraph and rail crack instead of receiving duplicate generic audio.','No damage, velocity, aim, cooldown, visibility or targeting rules are changed.','Tracked volleys and spark events are hard-capped and expire quickly to respect NOVA\'s frame-budget discipline.']}};
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function worldToScreen(g,x,y){var z=g.cam&&g.cam.zoom?g.cam.zoom:1;return{x:(x-g.cam.x)*z+g.w*.5,y:(y-g.cam.y)*z+g.h*.5};}
function inside(p,w,h,pad){pad=pad==null?5:pad;return p.x>=pad&&p.x<=w-pad&&p.y>=pad&&p.y<=h-pad;}
function distanceMix(dist){return 1-clamp((dist-180)/(1780-180),0,1);}
function panFrom(g,x){if(!g.player)return 0;var span=Math.max(420,g.w/Math.max(.55,(g.cam&&g.cam.zoom)||1));return clamp((x-g.player.x)/span,-1,1);}
function segmentRectEntry(x0,y0,x1,y1,w,h,pad,out){
 pad=pad==null?5:pad;var xmin=pad,ymin=pad,xmax=w-pad,ymax=h-pad;
 if(x0>=xmin&&x0<=xmax&&y0>=ymin&&y0<=ymax)return null;
 var dx=x1-x0,dy=y1-y0,t0=0,t1=1;
 function clip(p,q){if(Math.abs(p)<1e-9)return q>=0;var r=q/p;if(p<0){if(r>t1)return false;if(r>t0)t0=r;}else{if(r<t0)return false;if(r<t1)t1=r;}return true;}
 if(!clip(-dx,x0-xmin)||!clip(dx,xmax-x0)||!clip(-dy,y0-ymin)||!clip(dy,ymax-y0)||t0<0||t0>1)return null;
 out=out||{};out.x=x0+dx*t0;out.y=y0+dy*t0;out.t=t0;return out;
}
function shouldSwoosh(last,now,gap){return !(last>=0)||now-last>(gap==null?1.35:gap);}
function pushCapped(a,v,cap){a.push(v);if(a.length>cap)a.splice(0,a.length-cap);}
function volleyRelevant(g,t,bullets){
 var pl=g.player;if(!pl||!pl.alive)return false;var near=Math.hypot(t.x-pl.x,t.y-pl.y)<760;if(near)return true;
 for(var i=0;i<bullets.length;i++){
  var b=bullets[i],vx=b.vx||0,vy=b.vy||0,v2=vx*vx+vy*vy;if(v2<100)continue;
  var rx=pl.x-b.x,ry=pl.y-b.y,along=(rx*vx+ry*vy)/v2;if(along<0)continue;
  var cross=Math.abs(rx*vy-ry*vx)/Math.sqrt(v2);if(cross<260)return true;
 }
 return false;
}
function ensureState(g){return g.__v183Contact||(g.__v183Contact={volleys:[],sparks:[],lastSwoosh:-99,nextId:1});}
function markVolley(g,t,bullets){
 if(!g.player||!g.player.alive||!bullets.length||!volleyRelevant(g,t,bullets))return;
 var first=bullets[0];if(first.__novaRail||first.beam)return;
 var dist=Math.hypot(t.x-g.player.x,t.y-g.player.y),mix=distanceMix(dist),state=ensureState(g),sp=worldToScreen(g,t.x,t.y),off=!inside(sp,g.w,g.h,30);
 if(g.sfx&&g.sfx.novaPrecisionShotCue)g.sfx.novaPrecisionShotCue(panFrom(g,t.x),mix,(Math.abs((t.id||0)+(state.nextId||0))%3),!!first.__novaSniperLineage);
 if(!off)return;
 var tracked=[];for(var i=0;i<bullets.length;i++){var b=bullets[i];if(!b||b.dead||b.__novaRail||b.beam)continue;b.__v183Volley=state.nextId;b.__novaPrecisionFlyby=true;tracked.push(b);}
 if(!tracked.length)return;
 pushCapped(state.volleys,{id:state.nextId++,born:g.time||0,until:(g.time||0)+3.2,bullets:tracked,mix:mix,pan:panFrom(g,t.x),shooter:t,entered:false},18);
}
function triggerEntry(g,state,v,hit,b){
 if(v.entered)return;v.entered=true;var now=g.time||0,ang=Math.atan2(b.vy||0,b.vx||0);if(v.shooter&&v.shooter.__novaLineageRevealUntil>now)v.shooter.__novaLineageRevealUntil=now;
 pushCapped(state.sparks,{x:hit.x,y:hit.y,ang:ang,born:now,until:now+.24,mix:v.mix},12);
 if(shouldSwoosh(state.lastSwoosh,now,1.35)){state.lastSwoosh=now;if(g.sfx&&g.sfx.novaPrecisionContactSwoosh)g.sfx.novaPrecisionContactSwoosh(clamp((hit.x-g.w*.5)/Math.max(1,g.w*.5),-1,1),.48+.52*v.mix);}
}
function scanEntries(g,dt){
 var state=g.__v183Contact;if(!state||!state.volleys.length)return;var now=g.time||0,out={x:0,y:0,t:0};
 for(var i=state.volleys.length-1;i>=0;i--){
  var v=state.volleys[i];if(!v||v.entered||now>v.until){state.volleys.splice(i,1);continue;}
  var live=false;
  for(var j=0;j<v.bullets.length;j++){
   var b=v.bullets[j];if(!b||b.dead)continue;live=true;
   var p0=worldToScreen(g,b.x,b.y);if(inside(p0,g.w,g.h,5)){triggerEntry(g,state,v,p0,b);break;}
   var p1=worldToScreen(g,b.x+(b.vx||0)*dt,b.y+(b.vy||0)*dt),hit=segmentRectEntry(p0.x,p0.y,p1.x,p1.y,g.w,g.h,5,out);
   if(hit){triggerEntry(g,state,v,hit,b);break;}
  }
  if(v.entered||!live)state.volleys.splice(i,1);
 }
}
function drawSpark(ctx,s,now){
 var life=clamp((s.until-now)/Math.max(.001,s.until-s.born),0,1),burst=1-life,pulse=Math.sin(Math.PI*life),r=4+burst*10+s.mix*4;
 ctx.save();ctx.translate(s.x,s.y);ctx.rotate(s.ang);ctx.globalCompositeOperation='lighter';ctx.globalAlpha=.30+.70*pulse;ctx.shadowBlur=12+s.mix*10;ctx.shadowColor='#fff1b8';
 ctx.strokeStyle='rgba(255,240,190,.95)';ctx.fillStyle='#fffdf2';ctx.lineWidth=1.25+s.mix*.8;
 ctx.beginPath();ctx.moveTo(-r*.55,0);ctx.lineTo(r,0);ctx.moveTo(0,-r*.62);ctx.lineTo(0,r*.62);ctx.moveTo(-r*.34,-r*.34);ctx.lineTo(r*.45,r*.45);ctx.moveTo(-r*.34,r*.34);ctx.lineTo(r*.45,-r*.45);ctx.stroke();
 ctx.beginPath();ctx.arc(0,0,1.5+s.mix,0,TAU);ctx.fill();ctx.restore();
}
/* Violet Doctrine owns the directional edge geometry. Suppress only its literal
   post-shot word while the game render stack is active; menus and arbitrary canvas
   consumers are not touched. */
if(typeof CanvasRenderingContext2D!=='undefined'&&!CanvasRenderingContext2D.prototype.__novaContactSparkText){
 var proto=CanvasRenderingContext2D.prototype,oldFill=proto.fillText;proto.__novaContactSparkText=true;
 proto.fillText=function(text){if(text==='SHOT'&&window.__NOVA_CONTACT_SPARK_RENDERING__)return;return oldFill.apply(this,arguments);};
}
wrap('game/audio',function(audio){
 var Sfx=audio.Sfx;if(!Sfx||Sfx.prototype.__novaContactSpark)return;Sfx.prototype.__novaContactSpark=true;
 function route(self,node,pan){if(!self.ctx||!self.master)return;if(self.ctx.createStereoPanner){var p=self.ctx.createStereoPanner();p.pan.value=clamp(pan||0,-1,1);node.connect(p);p.connect(self.master);}else node.connect(self.master);}
 function voice(self,f0,f1,dur,gain,pan,type,delay){self.resume();if(!self.ctx||!self.master||self.muted)return;var c=self.ctx,t0=c.currentTime+(delay||0),o=c.createOscillator(),gg=c.createGain();o.type=type||'triangle';o.frequency.setValueAtTime(Math.max(22,f0),t0);o.frequency.exponentialRampToValueAtTime(Math.max(22,f1),t0+dur);gg.gain.setValueAtTime(.0001,t0);gg.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t0+Math.min(.012,dur*.22));gg.gain.exponentialRampToValueAtTime(.0001,t0+dur);o.connect(gg);route(self,gg,pan);o.start(t0);o.stop(t0+dur+.02);}
 function noise(self,dur,gain,pan,hp,lp,delay){self.resume();if(!self.ctx||!self.master||self.muted)return;var c=self.ctx;if(!self.__novaContactNoise){var n=Math.max(1,Math.floor(c.sampleRate*.32)),buf=c.createBuffer(1,n,c.sampleRate),data=buf.getChannelData(0);for(var i=0;i<n;i++)data[i]=Math.random()*2-1;self.__novaContactNoise=buf;}var t0=c.currentTime+(delay||0),src=c.createBufferSource(),hi=c.createBiquadFilter(),lo=c.createBiquadFilter(),gg=c.createGain();src.buffer=self.__novaContactNoise;hi.type='highpass';hi.frequency.value=hp;lo.type='lowpass';lo.frequency.value=lp;gg.gain.setValueAtTime(Math.max(.0002,gain),t0);gg.gain.exponentialRampToValueAtTime(.0001,t0+dur);src.connect(hi);hi.connect(lo);lo.connect(gg);route(self,gg,pan);src.start(t0);src.stop(t0+dur+.02);}
 Sfx.prototype.novaPrecisionShotCue=function(pan,mix,variant){var q=clamp(mix==null?.5:mix,0,1),v=variant%3,body=.006+q*.017,bright=2500+q*7600;if(v===0){noise(this,.055+q*.018,body,pan,700+q*700,bright,0);voice(this,620+q*420,390+q*160,.065,body*.54,pan,'triangle',.006);}else if(v===1){voice(this,420+q*360,250+q*120,.075,body*.62,pan,'sine',0);noise(this,.045+q*.015,body*.86,pan,900+q*950,bright*.9,.008);}else{noise(this,.040+q*.020,body*.78,pan,1450+q*900,bright,0);voice(this,1320+q*540,650+q*210,.058,body*.48,pan,'triangle',.004);}};
 Sfx.prototype.novaPrecisionContactSwoosh=function(pan,intensity){var q=clamp(intensity==null?.7:intensity,0,1),now=performance.now();if(this.__novaContactSwooshAt&&now-this.__novaContactSwooshAt<220)return;this.__novaContactSwooshAt=now;noise(this,.105,.018+q*.025,pan,850,10500,0);voice(this,2100+q*700,430+q*120,.12,.013+q*.018,pan,'sawtooth',.004);};
});
wrap('game/engine',function(engine){
 var Game=engine.Game;if(!Game||Game.prototype.__novaContactSpark)return;Game.prototype.__novaContactSpark=true;
 var oldFire=Game.prototype.tryFire;if(oldFire)Game.prototype.tryFire=function(t){var before=this.bullets?this.bullets.length:0,out=oldFire.apply(this,arguments);if(t&&!t.isPlayer&&this.player&&this.player.alive&&this.bullets&&this.bullets.length>before){var shot=[];for(var i=before;i<this.bullets.length;i++){var b=this.bullets[i];if(b&&b.ownerId===t.id&&b.__novaSniperLineage&&!b.__novaRail&&!b.beam)shot.push(b);}if(shot.length)markVolley(this,t,shot);}return out;};
 var oldBullets=Game.prototype.updateBullets;if(oldBullets)Game.prototype.updateBullets=function(dt){if(this.status==='playing'&&this.player&&this.player.alive)scanEntries(this,dt);return oldBullets.apply(this,arguments);};
});
wrap('game/render',function(renderMod){
 var oldRender=renderMod.render;if(!oldRender||oldRender.__novaContactSpark)return;
 function patched(g,w,h){window.__NOVA_CONTACT_SPARK_RENDERING__=true;try{oldRender(g,w,h);}finally{window.__NOVA_CONTACT_SPARK_RENDERING__=false;}if(!g||!g.ctx||!g.player||!g.player.alive||!g.__v183Contact)return;var state=g.__v183Contact,now=g.time||0,ctx=g.ctx;ctx.save();ctx.setTransform(g.dpr||1,0,0,g.dpr||1,0,0);for(var i=state.sparks.length-1;i>=0;i--){var s=state.sparks[i];if(!s||now>s.until){state.sparks.splice(i,1);continue;}drawSpark(ctx,s,now);}ctx.restore();}
 patched.__novaContactSpark=true;renderMod.render=patched;
});
window.__NOVA_CONTACT_SPARK_TEST__={distanceMix:distanceMix,segmentRectEntry:segmentRectEntry,shouldSwoosh:shouldSwoosh,volleyRelevant:volleyRelevant};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' incoming-fire language online');
})();
