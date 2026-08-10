/* NOVA TANKS v1.9.4 — War Room
 * Efficient, menu-only live battlefield ambience.
 * All 36 canonical tank forms are represented by level-30 autonomous background bots.
 * This layer is decorative: it never enters the gameplay simulation or modifies saves/stats.
 */
(function(){
'use strict';

var VERSION='1.9.4',CODENAME='War Room',TAU=Math.PI*2;
var ROSTER=[
  ['tank','basic'],
  ['twin','gunner'],['minigun','gunner'],['shotgun','gunner'],['tempest','gunner'],['needlestorm','gunner'],['breachlord','gunner'],['flakmaster','gunner'],
  ['cannon','cannon'],['bomber','cannon'],['demolisher','cannon'],['clusterking','cannon'],['siegebomber','cannon'],['annihilator','cannon'],['quake','cannon'],
  ['marksman','sniper'],['railgun','sniper'],['ghost','sniper'],['singularity','sniper'],['prism','sniper'],['specter','sniper'],['assassin','sniper'],
  ['carrier','controller'],['overlord','controller'],['warden','controller'],['hivemind','controller'],['broodmother','controller'],['citadel','controller'],['valkyrie','controller'],
  ['guard','guardian'],['fortress','guardian'],['juggernaut','guardian'],['bastion','guardian'],['aegis','guardian'],['meteor','guardian'],['ravager','guardian']
];
var COLORS={basic:'#9cc8e8',gunner:'#65e8ff',cannon:'#ffb35b',sniper:'#c69aff',controller:'#83f0aa',guardian:'#ff8fcf'};
var TEAM_EDGE=['rgba(92,190,255,.78)','rgba(255,105,119,.72)'];
var SIM_HZ=20,RENDER_HZ=30,PAN_SPEED=13;

window.__NOVA_VERSION=VERSION;
window.__NOVA_LOBBY_BATTLEFIELD_RELEASE__={
  version:VERSION,codename:CODENAME,date:'2026-08-09',
  headline:'The lobby now looks through a dim war-room window onto a living level-30 battlefield.',
  groups:{
    'Living Battlefield':['All 36 canonical tank forms are present in a persistent level-30 background roster.','Bots move, acquire opposing traffic, fire, take damage, explode and respawn without touching the real match state.','Controller silhouettes carry orbiting micro-drones while Gunner, Cannon, Sniper and Guardian forms keep distinct visual weapon languages.'],
    'Camera and Scenery':['The lobby camera continuously drifts upward through a tall looping battlefield, revealing new fortifications, craters, rubble and different fights over time.','No cuts or attention-grabbing camera shake are used; menu controls remain visually dominant.'],
    'Atmosphere':['Muted tracers, muzzle flashes, shock rings, smoke, dust motes, distant sparks, scan haze and restrained cyan/purple bloom make the menu feel active without becoming foreground UI.'],
    'Performance':['The background sim runs at 20 Hz and normally renders at 30 FPS on a reduced-resolution canvas.','Particles are capped and reused, off-screen actors are culled, DPR is capped, low-end devices reduce effects rather than deleting the class roster, and the loop sleeps whenever the menu or tab is not visible.','prefers-reduced-motion freezes the camera drift and lowers the presentation rate.']
  }
};
window.__NOVA_LOBBY_BATTLEFIELD_TEST__={roster:ROSTER.slice(),level:30,simHz:SIM_HZ,renderHz:RENDER_HZ,panSpeed:PAN_SPEED};
if(typeof document==='undefined'||!document.createElement)return;
if(window.__NOVA_LOBBY_BATTLEFIELD_RUNTIME__)return;
window.__NOVA_LOBBY_BATTLEFIELD_RUNTIME__=true;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function wrap(v,m){v%=m;return v<0?v+m:v;}
function deltaWrap(a,b,m){var d=a-b;if(d>m*.5)d-=m;else if(d<-m*.5)d+=m;return d;}
function hashText(s){var h=2166136261;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function rng(seed){var x=seed>>>0;return function(){x+=0x6D2B79F5;var t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
function menu(){return document.querySelector('#root .menu-grid-bg');}
function reduced(){return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);}
function lowPower(){var dm=navigator.deviceMemory||8,hc=navigator.hardwareConcurrency||8;return dm<=4||hc<=4||window.innerWidth<390;}
function visibleMenu(m){return !!(m&&m.isConnected&&!document.hidden&&m.offsetParent!==null);}

function installCss(){
  if(document.getElementById('nova-war-room-css'))return;
  var s=document.createElement('style');s.id='nova-war-room-css';s.textContent=`
.menu-grid-bg.nv-war-room{isolation:isolate;background-color:#04060d!important;background-image:none!important}
.nv-lobby-battlefield,.nv-lobby-atmosphere{position:absolute;inset:0;width:100%;height:100%;pointer-events:none!important}
.nv-lobby-battlefield{z-index:0;opacity:.46;filter:saturate(.76) contrast(.96) brightness(.70);contain:strict}
.nv-lobby-atmosphere{z-index:1;overflow:hidden;background:radial-gradient(ellipse at 50% 40%,rgba(2,7,16,.20) 0,rgba(3,7,15,.39) 52%,rgba(2,4,10,.76) 100%),linear-gradient(180deg,rgba(77,227,255,.035),transparent 32%,rgba(176,107,255,.026) 76%,rgba(2,4,10,.22));box-shadow:inset 0 0 72px rgba(0,0,0,.42)}
.nv-lobby-atmosphere:before{content:'';position:absolute;inset:-25% -70%;background:linear-gradient(108deg,transparent 42%,rgba(91,216,255,.035) 49%,rgba(255,255,255,.018) 50%,transparent 56%);animation:nvWarSweep 15s ease-in-out infinite;will-change:transform}
.nv-lobby-atmosphere:after{content:'';position:absolute;inset:-30%;background:repeating-linear-gradient(116deg,transparent 0 32px,rgba(131,209,255,.018) 33px,transparent 34px 74px);opacity:.38;animation:nvWarHaze 24s linear infinite;will-change:transform}
.menu-grid-bg.nv-war-room>.nv-lobby-foreground{z-index:2}
@keyframes nvWarSweep{0%,14%{transform:translateX(-34%)}64%,100%{transform:translateX(34%)}}
@keyframes nvWarHaze{to{transform:translate3d(54px,-28px,0)}}
@media(max-width:430px){.nv-lobby-battlefield{opacity:.40;filter:saturate(.70) contrast(.94) brightness(.66)}.nv-lobby-atmosphere{box-shadow:inset 0 0 58px rgba(0,0,0,.48)}}
@media(prefers-reduced-motion:reduce){.nv-lobby-atmosphere:before,.nv-lobby-atmosphere:after{animation:none!important}.nv-lobby-battlefield{opacity:.36}}
`;
  document.head.appendChild(s);
}

function World(canvas,m){
  this.canvas=canvas;this.menu=m;this.ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  this.low=lowPower();this.reduced=reduced();this.pixelRatio=1;this.w=1;this.h=1;this.worldW=720;this.worldH=2800;this.cameraY=2120;
  this.rand=rng(0x4e4f5641);this.bots=[];this.shots=[];this.bursts=[];this.smoke=[];this.motes=[];this.cover=[];
  this.last=0;this.acc=0;this.lastRender=0;this.raf=0;this.dead=false;this.resizeTick=0;
  this.resize();this.makeWorld();
}
World.prototype.makeWorld=function(){
  var r=this.rand,i,row,col;
  for(i=0;i<ROSTER.length;i++){
    row=Math.floor(i/6);col=i%6;
    var cls=ROSTER[i][0],lin=ROSTER[i][1],margin=Math.min(58,this.worldW*.11),x=margin+col*((this.worldW-margin*2)/5)+(r()-.5)*Math.min(34,this.worldW*.045),y=170+row*445+(r()-.5)*135;
    this.bots.push({id:i,cls:cls,lineage:lin,level:30,team:(i+(i%3===0?1:0))&1,x:x,y:y,homeX:x,homeY:y,vx:0,vy:0,angle:r()*TAU,hp:100,maxHp:100,deadT:0,fire:r()*1.2,flash:0,seed:hashText(cls),strafe:r()>.5?1:-1});
  }
  for(i=0;i<30;i++){
    row=Math.floor(i/5);col=i%5;
    var cy=130+row*465+(r()-.5)*135,cx=52+col*((this.worldW-104)/4)+(r()-.5)*42;
    this.cover.push({x:cx,y:cy,w:55+r()*92,h:28+r()*44,kind:i%4,rot:(r()-.5)*.18});
  }
  for(i=0;i<42;i++)this.motes.push({x:r()*this.worldW,y:r()*this.worldH,s:.5+r()*1.3,a:.08+r()*.16,vy:5+r()*11});
};
World.prototype.resize=function(){
  var rect=this.menu.getBoundingClientRect(),w=Math.max(1,Math.round(rect.width)),h=Math.max(1,Math.round(rect.height));
  if(w===this.w&&h===this.h)return;
  var oldWorldW=this.worldW||w;this.w=w;this.h=h;var scale=this.low?.62:.78,dpr=Math.min(window.devicePixelRatio||1,this.low?1:1.25);this.pixelRatio=scale*dpr;
  this.canvas.width=Math.max(1,Math.round(w*this.pixelRatio));this.canvas.height=Math.max(1,Math.round(h*this.pixelRatio));this.canvas.style.width=w+'px';this.canvas.style.height=h+'px';
  this.worldW=Math.max(360,w);if(this.bots.length&&oldWorldW>0&&oldWorldW!==this.worldW){var sx=this.worldW/oldWorldW;for(var i=0;i<this.bots.length;i++){this.bots[i].x*=sx;this.bots[i].homeX*=sx;}for(i=0;i<this.cover.length;i++)this.cover[i].x*=sx;for(i=0;i<this.motes.length;i++)this.motes[i].x*=sx;}
};
World.prototype.sy=function(y){return deltaWrap(y,this.cameraY,this.worldH)+this.h*.5;};
World.prototype.onScreen=function(x,y,pad){var sy=this.sy(y);return x>-pad&&x<this.worldW+pad&&sy>-pad&&sy<this.h+pad;};
World.prototype.spawnBurst=function(x,y,power,color){
  var cap=this.low?18:32;if(this.bursts.length>=cap)this.bursts.shift();this.bursts.push({x:x,y:y,t:0,life:.28+power*.18,p:power,c:color});
  if(this.smoke.length<(this.low?18:38))this.smoke.push({x:x,y:y,t:0,life:1.5+this.rand()*1.2,r:8+power*8,dx:(this.rand()-.5)*10,dy:-5-this.rand()*10});
};
World.prototype.respawn=function(b){b.deadT=0;b.hp=b.maxHp;b.x=wrap(b.homeX+(this.rand()-.5)*120,this.worldW);b.y=wrap(b.homeY+(this.rand()-.5)*180,this.worldH);b.vx=b.vy=0;b.fire=.4+this.rand();};
World.prototype.blocked=function(x,y,rad){
  for(var i=0;i<this.cover.length;i++){var o=this.cover[i],dy=Math.abs(deltaWrap(y,o.y,this.worldH));if(Math.abs(x-o.x)<o.w*.5+rad&&dy<o.h*.5+rad)return o;}return null;
};
World.prototype.targetFor=function(b){
  var best=null,bd=Infinity;
  for(var i=0;i<this.bots.length;i++){var t=this.bots[i];if(t===b||t.deadT>0||t.team===b.team)continue;var dx=t.x-b.x,dy=deltaWrap(t.y,b.y,this.worldH),d=dx*dx+dy*dy;if(d<bd){bd=d;best=t;}}
  return best;
};
World.prototype.simulate=function(dt){
  if(!this.reduced)this.cameraY=wrap(this.cameraY-PAN_SPEED*dt,this.worldH);
  var r=this.rand;
  for(var i=0;i<this.bots.length;i++){
    var b=this.bots[i];if(b.deadT>0){b.deadT-=dt;if(b.deadT<=0)this.respawn(b);continue;}
    b.flash=Math.max(0,b.flash-dt);var t=this.targetFor(b);if(!t)continue;
    var dx=t.x-b.x,dy=deltaWrap(t.y,b.y,this.worldH),dist=Math.max(1,Math.hypot(dx,dy)),ux=dx/dist,uy=dy/dist;
    var ideal=b.lineage==='sniper'?350:b.lineage==='cannon'?265:b.lineage==='controller'?230:b.lineage==='guardian'?115:185;
    var push=dist>ideal+35?1:dist<ideal-45?-1:.12,strafe=(b.lineage==='guardian'?.12:.34)*b.strafe;
    var speed=b.lineage==='guardian'?46:b.lineage==='sniper'?52:b.lineage==='controller'?68:60;
    var ax=(ux*push-uy*strafe)*speed,ay=(uy*push+ux*strafe)*speed;
    var probe=this.blocked(b.x+ax*.28,b.y+ay*.28,16);if(probe){ax+=Math.sign(b.x-probe.x||b.strafe)*speed*.9;ay+=b.strafe*speed*.45;b.strafe*=-1;}
    b.vx+=(ax-b.vx)*Math.min(1,dt*2.5);b.vy+=(ay-b.vy)*Math.min(1,dt*2.5);b.x=clamp(b.x+b.vx*dt,45,this.worldW-45);b.y=wrap(b.y+b.vy*dt,this.worldH);b.angle=Math.atan2(dy,dx);
    b.fire-=dt;if(b.fire<=0&&dist<(b.lineage==='sniper'?650:480)){
      var cadence=b.lineage==='gunner'?.56:b.lineage==='cannon'?1.7:b.lineage==='sniper'?2.2:b.lineage==='controller'?1.05:b.lineage==='guardian'?1.15:1.0;
      b.fire=cadence*(.72+r()*.64);b.flash=.085;
      var speedShot=b.lineage==='sniper'?560:b.lineage==='cannon'?300:390,damage=b.lineage==='cannon'?28:b.lineage==='sniper'?34:b.lineage==='gunner'?11:17;
      if(this.shots.length>=(this.low?70:110))this.shots.shift();this.shots.push({x:b.x+ux*20,y:b.y+uy*20,vx:ux*speedShot,vy:uy*speedShot,team:b.team,t:0,life:1.65,damage:damage,c:COLORS[b.lineage],heavy:b.lineage==='cannon'||b.lineage==='sniper'});
    }
  }
  for(i=this.shots.length-1;i>=0;i--){
    var s=this.shots[i];s.t+=dt;s.x+=s.vx*dt;s.y=wrap(s.y+s.vy*dt,this.worldH);if(s.t>s.life||s.x<0||s.x>this.worldW||this.blocked(s.x,s.y,3)){this.spawnBurst(s.x,s.y,s.heavy?.75:.35,s.c);this.shots.splice(i,1);continue;}
    for(var j=0;j<this.bots.length;j++){var q=this.bots[j];if(q.deadT>0||q.team===s.team)continue;var qdy=deltaWrap(q.y,s.y,this.worldH);if((q.x-s.x)*(q.x-s.x)+qdy*qdy<18*18){q.hp-=s.damage;this.spawnBurst(s.x,s.y,s.heavy?.82:.42,s.c);this.shots.splice(i,1);if(q.hp<=0){q.deadT=2.8+r()*2.4;this.spawnBurst(q.x,q.y,1.45,COLORS[q.lineage]);}break;}}
  }
  for(i=this.bursts.length-1;i>=0;i--){this.bursts[i].t+=dt;if(this.bursts[i].t>this.bursts[i].life)this.bursts.splice(i,1);}
  for(i=this.smoke.length-1;i>=0;i--){var sm=this.smoke[i];sm.t+=dt;sm.x+=sm.dx*dt;sm.y=wrap(sm.y+sm.dy*dt,this.worldH);if(sm.t>sm.life)this.smoke.splice(i,1);}
  for(i=0;i<this.motes.length;i++){var mo=this.motes[i];mo.y=wrap(mo.y-mo.vy*dt,this.worldH);}
};
World.prototype.drawFloor=function(c){
  var w=this.w,h=this.h,worldW=this.worldW,step=70,startX=((worldW-w)*.5)%step;
  c.fillStyle='#07101a';c.fillRect(0,0,w,h);
  c.strokeStyle='rgba(91,155,200,.10)';c.lineWidth=1;c.beginPath();for(var x=startX;x<w;x+=step){c.moveTo(x,0);c.lineTo(x,h);}for(var y=wrap(-this.cameraY,step);y<h;y+=step){c.moveTo(0,y);c.lineTo(w,y);}c.stroke();
  c.strokeStyle='rgba(83,190,222,.07)';c.setLineDash([13,24]);c.beginPath();c.moveTo(w*.5,0);c.lineTo(w*.5,h);c.stroke();c.setLineDash([]);
  for(var k=0;k<9;k++){var yy=this.sy(270+k*510),xx=90+(k%3)*330;if(yy<-60||yy>h+60)continue;c.strokeStyle='rgba(138,197,219,.075)';c.beginPath();c.arc(xx,yy,22+(k%4)*8,0,TAU);c.stroke();c.fillStyle='rgba(2,5,9,.18)';c.beginPath();c.arc(xx,yy,13+(k%4)*5,0,TAU);c.fill();}
};
World.prototype.drawCover=function(c){
  for(var i=0;i<this.cover.length;i++){var o=this.cover[i],sy=this.sy(o.y);if(sy<-90||sy>this.h+90||o.x<-100||o.x>this.w+100)continue;c.save();c.translate(o.x,sy);c.rotate(o.rot);c.fillStyle=o.kind===3?'rgba(35,50,65,.78)':'rgba(22,41,55,.88)';c.strokeStyle=o.kind===1?'rgba(255,177,87,.16)':'rgba(95,208,235,.18)';c.lineWidth=1;c.fillRect(-o.w*.5,-o.h*.5,o.w,o.h);c.strokeRect(-o.w*.5,-o.h*.5,o.w,o.h);c.strokeStyle='rgba(181,218,231,.10)';c.beginPath();c.moveTo(-o.w*.32,-o.h*.5);c.lineTo(-o.w*.32,o.h*.5);c.moveTo(o.w*.32,-o.h*.5);c.lineTo(o.w*.32,o.h*.5);c.stroke();c.restore();}
};
World.prototype.drawBot=function(c,b){
  if(b.deadT>0)return;var sy=this.sy(b.y),x=b.x;if(x<-50||x>this.w+50||sy<-50||sy>this.h+50)return;
  var col=COLORS[b.lineage],sz=11+(b.seed%5)*.55,a=b.angle;
  c.save();c.translate(x,sy);c.rotate(a);c.globalAlpha=.84;
  c.shadowColor=col;c.shadowBlur=this.low?0:5;c.fillStyle='rgba(5,12,18,.92)';c.strokeStyle=col;c.lineWidth=1.2;
  c.beginPath();c.moveTo(sz,0);c.lineTo(sz*.48,sz*.72);c.lineTo(-sz*.72,sz*.58);c.lineTo(-sz,-sz*.58);c.lineTo(sz*.48,-sz*.72);c.closePath();c.fill();c.stroke();
  c.shadowBlur=0;c.strokeStyle=TEAM_EDGE[b.team];c.lineWidth=2;c.beginPath();c.moveTo(-sz*.65,-sz*.55);c.lineTo(-sz*.65,sz*.55);c.stroke();
  c.fillStyle=col;c.globalAlpha=.58;c.beginPath();c.arc(0,0,3.2,0,TAU);c.fill();c.globalAlpha=.72;c.strokeStyle=col;
  var barrel=b.lineage==='sniper'?25:b.lineage==='cannon'?20:16,width=b.lineage==='cannon'?4:2;
  c.lineWidth=width;c.beginPath();c.moveTo(2,0);c.lineTo(barrel,0);c.stroke();
  if(b.lineage==='gunner'){var count=b.cls==='twin'?2:b.cls==='shotgun'?3:b.cls==='minigun'?4:2;c.lineWidth=1.1;for(var n=0;n<count;n++){var off=(n-(count-1)/2)*3;c.beginPath();c.moveTo(1,off);c.lineTo(15+(n%2)*3,off);c.stroke();}}
  if(b.lineage==='guardian'){c.strokeStyle='rgba(255,154,205,.55)';c.lineWidth=2;c.beginPath();c.arc(3,0,sz*1.05,-.82,.82);c.stroke();}
  if(b.lineage==='controller'){for(var d=0;d<2;d++){var da=(performance.now()*.0012*(d?1:-1))+d*Math.PI,rr=sz*1.55,dx=Math.cos(da)*rr,dy=Math.sin(da)*rr;c.fillStyle=col;c.globalAlpha=.58;c.fillRect(dx-1.7,dy-1.7,3.4,3.4);}}
  if(b.flash>0){c.fillStyle='rgba(255,244,202,.88)';c.globalAlpha=clamp(b.flash/.085,0,1);c.beginPath();c.moveTo(barrel+2,0);c.lineTo(barrel+8,3);c.lineTo(barrel+7,-3);c.closePath();c.fill();}
  c.restore();
};
World.prototype.drawEffects=function(c){
  var i,s,sy;
  for(i=0;i<this.shots.length;i++){s=this.shots[i];sy=this.sy(s.y);if(sy<-20||sy>this.h+20)continue;var sp=Math.hypot(s.vx,s.vy),ux=s.vx/sp,uy=s.vy/sp;c.strokeStyle=s.c;c.globalAlpha=s.heavy?.56:.32;c.lineWidth=s.heavy?1.5:1;c.beginPath();c.moveTo(s.x,sy);c.lineTo(s.x-ux*(s.heavy?18:9),sy-uy*(s.heavy?18:9));c.stroke();}
  for(i=0;i<this.bursts.length;i++){var b=this.bursts[i],f=b.t/b.life;sy=this.sy(b.y);if(sy<-60||sy>this.h+60)continue;c.globalAlpha=(1-f)*.46;c.strokeStyle=b.c;c.lineWidth=1.1;c.beginPath();c.arc(b.x,sy,4+b.p*24*f,0,TAU);c.stroke();c.globalAlpha=(1-f)*.22;c.fillStyle='rgba(255,220,146,.9)';c.beginPath();c.arc(b.x,sy,Math.max(1,7*b.p*(1-f)),0,TAU);c.fill();}
  for(i=0;i<this.smoke.length;i++){var sm=this.smoke[i],sf=sm.t/sm.life;sy=this.sy(sm.y);if(sy<-80||sy>this.h+80)continue;c.globalAlpha=(1-sf)*.10;c.fillStyle='rgba(145,172,184,.95)';c.beginPath();c.arc(sm.x,sy,sm.r*(.7+sf*1.9),0,TAU);c.fill();}
  for(i=0;i<this.motes.length;i++){var m=this.motes[i];sy=this.sy(m.y);if(m.x>this.w||sy<0||sy>this.h)continue;c.globalAlpha=m.a;c.fillStyle=i%5?'#8cc6d8':'#ffc178';c.fillRect(m.x,sy,m.s,m.s);}
  c.globalAlpha=1;
};
World.prototype.render=function(){
  var c=this.ctx;if(!c)return;c.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);c.clearRect(0,0,this.w,this.h);this.drawFloor(c);this.drawCover(c);
  for(var i=0;i<this.bots.length;i++)this.drawBot(c,this.bots[i]);this.drawEffects(c);
  var g=c.createLinearGradient(0,0,0,this.h);g.addColorStop(0,'rgba(82,201,235,.035)');g.addColorStop(.5,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(176,107,255,.028)');c.fillStyle=g;c.fillRect(0,0,this.w,this.h);
};
World.prototype.frame=function(now){
  if(this.dead)return;if(!visibleMenu(this.menu)){this.last=now;this.raf=requestAnimationFrame(this.frame.bind(this));return;}
  if(!this.last)this.last=now;var dt=Math.min(.08,(now-this.last)/1000);this.last=now;this.acc+=dt;var step=1/SIM_HZ,loops=0;while(this.acc>=step&&loops<3){this.simulate(step);this.acc-=step;loops++;}
  var target=this.reduced?12:(this.low?22:RENDER_HZ);if(now-this.lastRender>=1000/target){if(now-this.resizeTick>900){this.resize();this.resizeTick=now;}this.render();this.lastRender=now;}
  this.raf=requestAnimationFrame(this.frame.bind(this));
};
World.prototype.start=function(){this.raf=requestAnimationFrame(this.frame.bind(this));};
World.prototype.destroy=function(){this.dead=true;if(this.raf)cancelAnimationFrame(this.raf);this.canvas.remove();};

var active=null,atmos=null,observer=null;
function markForeground(m){for(var i=0;i<m.children.length;i++){var ch=m.children[i];if(ch!==active?.canvas&&ch!==atmos)ch.classList.add('nv-lobby-foreground');}}
function attach(){
  var m=menu();if(!m)return;if(active&&active.menu===m)return;if(active)active.destroy();
  installCss();m.classList.add('nv-war-room');var c=document.createElement('canvas');c.className='nv-lobby-battlefield';c.setAttribute('aria-hidden','true');c.dataset.level='30';c.dataset.roster='36';
  atmos=document.createElement('div');atmos.className='nv-lobby-atmosphere';atmos.setAttribute('aria-hidden','true');m.insertBefore(atmos,m.firstChild);m.insertBefore(c,m.firstChild);active=new World(c,m);markForeground(m);active.start();
}
function reconcile(){var m=menu();if(active&&(!active.menu.isConnected||active.menu!==m)){active.destroy();active=null;atmos=null;}if(m&&!active)attach();if(m&&active)markForeground(m);}
function boot(){attach();var root=document.getElementById('root')||document.body;observer=new MutationObserver(reconcile);observer.observe(root,{childList:true,subtree:true});document.addEventListener('visibilitychange',reconcile,{passive:true});window.addEventListener('resize',function(){if(active)active.resize();},{passive:true});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
