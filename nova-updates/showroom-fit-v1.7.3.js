/* NOVA TANKS v1.10.6 — Blackglass Mirror
 * Full Blackglass visual parity pass. The historical v1.7.3 containment anchor
 * remains in this runtime slot so old materialized builds keep their stylesheet
 * ordering guarantees, while the simulator itself now mirrors canonical tank,
 * barrel, muzzle and projectile semantics from ./game/classes.
 */
(function(){
'use strict';
var FIT_ID='nova-showroom-fit-v173';
var PARITY_ID='nova-blackglass-mirror-v1106';
var VERSION='1.10.6';
var CODENAME='Blackglass Mirror';
var TAU=Math.PI*2;
var CSS=`
/* Portrait showroom: preserve width containment while giving the simulation
   enough vertical room to read as a display bay instead of a letterbox. */
html.nvs-portrait-mobile .nvs-canvaswrap{
  position:relative!important;width:100%!important;max-width:100%!important;
  aspect-ratio:4 / 3!important;height:auto!important;min-height:0!important;
  max-height:none!important;overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-canvas,
html.nvs-portrait-mobile .nvs-parity-canvas{
  position:absolute!important;inset:0!important;display:block!important;
  width:100%!important;height:100%!important;min-height:0!important;max-height:none!important;
}
html.nvs-portrait-mobile .nvs-stagehint{
  top:8px!important;right:8px!important;bottom:auto!important;left:auto!important;
  width:auto!important;max-width:48%!important;padding:4px 6px!important;
  border:1px solid rgba(125,243,255,.16)!important;border-radius:999px!important;
  background:rgba(3,7,18,.72)!important;box-shadow:0 3px 14px rgba(0,0,0,.32)!important;
  color:rgba(182,233,255,.76)!important;font-size:0!important;line-height:1!important;
  letter-spacing:0!important;white-space:nowrap!important;overflow:hidden!important;
  text-overflow:ellipsis!important;backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);
  z-index:4!important;
}
html.nvs-portrait-mobile .nvs-stagehint::after{
  content:'DRAG TO STEER';font:800 6.5px/1 Orbitron,system-ui!important;letter-spacing:.09em!important;
}
html.nvs-portrait-mobile .nvs-name{margin-top:10px!important;}
.nvs-canvaswrap>.nvs-canvas{opacity:0!important;pointer-events:none!important;}
.nvs-parity-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:2;touch-action:none;cursor:crosshair;}
.nvs-canvaswrap:has(.nvs-parity-canvas)::after{
  content:'CANONICAL VISUAL MIRROR';position:absolute;left:9px;top:8px;z-index:3;pointer-events:none;
  color:rgba(177,231,255,.58);font:800 6.5px/1 Orbitron,system-ui;letter-spacing:.12em;
  padding:4px 6px;border:1px solid rgba(125,243,255,.10);border-radius:999px;background:rgba(3,7,18,.42);
}
@media(max-width:380px){
  html.nvs-portrait-mobile .nvs-canvaswrap{aspect-ratio:1.28 / 1!important;}
  html.nvs-portrait-mobile .nvs-stagehint{top:7px!important;right:7px!important;max-width:52%!important;}
  html.nvs-portrait-mobile .nvs-stagehint::after{font-size:6.1px!important;}
  .nvs-canvaswrap:has(.nvs-parity-canvas)::after{font-size:5.8px;left:7px;top:7px;}
}
`;

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function hexA(hex,a){
  if(!/^#[0-9a-f]{6}$/i.test(hex||''))return 'rgba(125,243,255,'+a+')';
  var n=parseInt(hex.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
}
function rr(ctx,x,y,w,h,r){
  r=Math.min(r,Math.abs(w)/2,Math.abs(h)/2);ctx.beginPath();ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
}
function poly(ctx,r,n,a){
  ctx.beginPath();for(var i=0;i<n;i++){var q=a+i*TAU/n,px=Math.cos(q)*r,py=Math.sin(q)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();
}

/* Gameplay's logical projectile spawn intentionally lives slightly beyond the
 * rendered tube and rotates barrel.x as a lateral offset. Keep that semantic
 * available for parity tests, but do not use it as the Blackglass visual source. */
function muzzleLocal(barrel,angle,scale){
  barrel=barrel||{len:24,x:0};scale=scale||1;
  var side=(barrel.x||0)*scale,reach=((barrel.len||24)+8)*scale;
  return {x:Math.cos(angle)*reach-Math.sin(angle)*side,y:Math.sin(angle)*reach+Math.cos(angle)*side,angle:angle};
}
/* The visible barrel is rendered by translating to (barrel.x,barrel.y), then
 * rotating the tube and drawing exactly barrel.len forward. Blackglass fire
 * starts at that visible tip so every animated round is optically attached to
 * the cannon the player is looking at, including offset Twin/Prism/Ravager guns. */
function visualMuzzleLocal(barrel,angle,scale){
  barrel=barrel||{len:24,x:0,y:0};scale=scale||1;
  var len=(barrel.len||24)*scale;
  return {x:(barrel.x||0)*scale+Math.cos(angle)*len,y:(barrel.y||0)*scale+Math.sin(angle)*len,angle:angle};
}
function shotPlan(def,shotIndex){
  def=def||{};var bs=def.barrels&&def.barrels.length?def.barrels:[{off:0,len:24,w:6,x:0,y:0}],b=def.bullet||{},out=[],i;
  if(def.fireMode==='twin'||def.fireMode==='minigun'){
    i=((shotIndex%bs.length)+bs.length)%bs.length;out.push({barrel:i,off:bs[i].off||0,dmgMul:1,rMul:1});
  }else if(def.fireMode==='shotgun'){
    var count=Math.max(1,b.pellets||5),spread=b.spread==null?.2:b.spread;
    for(i=0;i<count;i++){var f=count===1?.5:i/(count-1);out.push({barrel:0,off:-spread/2+f*spread,dmgMul:1,rMul:.95});}
  }else if(def.fireMode==='beam'){
    var mult=bs.length>1?.72:1;for(i=0;i<bs.length;i++)out.push({barrel:i,off:bs[i].off||0,dmgMul:mult,rMul:1});
  }else out.push({barrel:0,off:(bs[0]&&bs[0].off)||0,dmgMul:1,rMul:1});
  return out;
}
function projectileProfile(def,dmgMul,rMul){
  def=def||{};var b=def.bullet||{},isBeam=def.fireMode==='beam',d=(b.dmg||0)*(dmgMul==null?1:dmgMul);
  var bonus=clamp(d*(isBeam?.0038:.0085),0,isBeam?.30:.45);
  return {
    mode:def.fireMode||'single',radius:(b.r||4)*(rMul==null?1:rMul)*(1+bonus),speed:b.speed||400,
    ttl:b.ttl==null?1.05:b.ttl,pen:b.pen||0,splash:b.splash||0,cluster:b.cluster||0,
    pellets:b.pellets||0,spread:b.spread||0,knock:b.knock||0,damage:d
  };
}
window.__NOVA_BLACKGLASS_VISUAL_PARITY__={version:VERSION,codename:CODENAME,muzzleLocal:muzzleLocal,visualMuzzleLocal:visualMuzzleLocal,shotPlan:shotPlan,projectileProfile:projectileProfile};

function installFit(){
  var style=document.getElementById(FIT_ID);
  if(!style){style=document.createElement('style');style.id=FIT_ID;style.textContent=CSS;document.head.appendChild(style);}
  else if(style.textContent!==CSS)style.textContent=CSS;
  var containment=document.getElementById('nova-showroom-containment-v172');
  if(containment&&style.previousElementSibling!==containment)document.head.appendChild(style);
}

var req=window.__novaMakeRequire,classes=null,CLASSES={};
try{classes=req&&req('blackglass-mirror')('./game/classes');CLASSES=classes&&classes.CLASSES||{};}catch(e){console.error('[NOVA v1.10.6] canonical class registry unavailable',e);}
var nameToId={};Object.keys(CLASSES).forEach(function(id){nameToId[String(CLASSES[id].name||id).trim().toUpperCase()]=id;});
var state={canvas:null,ctx:null,aim:null,raf:0,lastId:'scout',wrap:null};

function selectedId(){
  var el=document.querySelector&&document.querySelector('.nvs-name'),name=el&&String(el.textContent||'').trim().toUpperCase();
  return nameToId[name]||state.lastId||'scout';
}
function ensureCanvas(){
  if(!document.querySelector)return null;var wrap=document.querySelector('.nvs-canvaswrap');if(!wrap)return null;
  var base=wrap.querySelector('.nvs-canvas');if(!base)return null;
  var cv=wrap.querySelector('.nvs-parity-canvas');
  if(!cv){
    cv=document.createElement('canvas');cv.className='nvs-parity-canvas';cv.setAttribute('aria-label','Canonical Blackglass tank preview');
    var hint=wrap.querySelector('.nvs-stagehint');hint?wrap.insertBefore(cv,hint):wrap.appendChild(cv);
    cv.addEventListener('pointermove',function(e){var r=cv.getBoundingClientRect();state.aim={x:(e.clientX-r.left)/Math.max(1,r.width),y:(e.clientY-r.top)/Math.max(1,r.height)};});
    cv.addEventListener('pointerleave',function(){state.aim=null;});
    cv.addEventListener('pointerdown',function(e){if(cv.setPointerCapture)try{cv.setPointerCapture(e.pointerId);}catch(_){};var r=cv.getBoundingClientRect();state.aim={x:(e.clientX-r.left)/Math.max(1,r.width),y:(e.clientY-r.top)/Math.max(1,r.height)};});
  }
  state.canvas=cv;state.ctx=cv.getContext&&cv.getContext('2d');state.wrap=wrap;return cv;
}

function tankScale(c,w,h){
  var base=Math.min(w,h),nominal=Math.max(12,c.size||14),target=clamp(base*.16,42,72);return target/nominal;
}
function drawBackground(x,w,h,c,t){
  var col=c.color||'#7df3ff',cx=w*.5,cy=h*.47;
  var bg=x.createRadialGradient(cx,cy,12,cx,cy,Math.max(w,h)*.72);bg.addColorStop(0,hexA(col,.12));bg.addColorStop(.55,'rgba(5,11,23,.80)');bg.addColorStop(1,'rgba(2,5,12,1)');x.fillStyle=bg;x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(120,190,255,.05)';x.lineWidth=1;var off=(t*10)%30;
  for(var gx=-30+off;gx<w+30;gx+=30){x.beginPath();x.moveTo(gx,0);x.lineTo(gx,h);x.stroke();}
  for(var gy=-30+off;gy<h+30;gy+=30){x.beginPath();x.moveTo(0,gy);x.lineTo(w,gy);x.stroke();}
}
function drawBarrels(x,c,angle,S){
  var col=c.color||'#7df3ff',bs=c.barrels&&c.barrels.length?c.barrels:[{off:0,len:24,w:6,x:0,y:0}];
  for(var i=0;i<bs.length;i++){var b=bs[i];x.save();x.translate((b.x||0)*S,(b.y||0)*S);x.rotate(angle+(b.off||0));
    var len=(b.len||24)*S,bw=Math.max(3,(b.w||6)*S),g=x.createLinearGradient(0,-bw/2,0,bw/2);g.addColorStop(0,'#101a30');g.addColorStop(.45,'#41537a');g.addColorStop(1,'#101a30');
    x.fillStyle=g;x.strokeStyle='rgba(0,0,0,.50)';x.lineWidth=Math.max(1,S*.35);rr(x,0,-bw/2,len,bw,bw/2);x.fill();x.stroke();
    x.strokeStyle=hexA(col,.46);x.lineWidth=Math.max(.7,S*.24);x.beginPath();x.moveTo(len*.12,-bw*.28);x.lineTo(len*.88,-bw*.28);x.stroke();x.restore();}
}
function drawBody(x,c,angle,S,t){
  var size=(c.size||14)*S,col=c.color||'#7df3ff';x.save();
  var g=x.createRadialGradient(-size*.28,-size*.34,size*.12,0,0,size*1.08);g.addColorStop(0,'#41537a');g.addColorStop(.42,'#1a2947');g.addColorStop(1,'#0a1020');
  x.fillStyle=g;x.strokeStyle=col;x.lineWidth=Math.max(1.5,S*.58);
  if(c.id==='fortress'){
    poly(x,size,6,angle);x.fill();x.stroke();poly(x,size*.62,6,angle+.52);x.strokeStyle=hexA(col,.5);x.lineWidth=Math.max(1,S*.42);x.stroke();
  }else if(c.id==='juggernaut'){
    x.beginPath();x.arc(0,0,size,0,TAU);x.fill();x.stroke();x.fillStyle='#1a2440';x.strokeStyle=col;x.lineWidth=Math.max(1,S*.4);
    for(var i=0;i<8;i++){var a=i/8*TAU+t*.8;x.save();x.rotate(a);x.beginPath();x.moveTo(size*.82,-size*.16);x.lineTo(size*1.30,0);x.lineTo(size*.82,size*.16);x.closePath();x.fill();x.stroke();x.restore();}
  }else{ x.beginPath();x.arc(0,0,size,0,TAU);x.fill();x.stroke(); }
  /* Hardlight Foundry material language, restrained so silhouette remains canonical. */
  x.strokeStyle=hexA(col,.22);x.lineWidth=Math.max(.7,S*.24);x.beginPath();x.arc(0,0,size*.72,-1.05,.55);x.stroke();
  for(var r=0;r<3;r++){var ra=-2.4+r*2.35;x.fillStyle='rgba(210,235,245,.35)';x.beginPath();x.arc(Math.cos(ra)*size*.67,Math.sin(ra)*size*.67,Math.max(1,S*.42),0,TAU);x.fill();}
  x.fillStyle='#0b1222';x.beginPath();x.arc(0,0,size*.42,0,TAU);x.fill();x.strokeStyle=hexA(col,.9);x.lineWidth=Math.max(1,S*.42);x.stroke();
  x.fillStyle=col;x.globalAlpha=.94;x.font='700 '+Math.max(15,size*.48)+'px Orbitron,system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(c.icon||'◇',0,1);x.globalAlpha=1;x.restore();
}
function drawMuzzleFlash(x,px,py,a,col,age,S){
  if(age>.055)return;var q=1-age/.055;x.save();x.translate(px,py);x.rotate(a);x.globalCompositeOperation='lighter';x.fillStyle='rgba(255,255,255,'+(.75*q)+')';
  x.beginPath();x.moveTo(0,-2*S*q);x.lineTo((8+10*q)*S,0);x.lineTo(0,2*S*q);x.closePath();x.fill();x.fillStyle=hexA(col,.36*q);x.beginPath();x.arc(0,0,(5+5*q)*S,0,TAU);x.fill();x.restore();
}
function drawProjectile(x,c,profile,origin,a,age,maxAge,S,w,h){
  var col=c.color||'#7df3ff',speedPx=clamp(profile.speed*.18,72,520),dist=age*speedPx;
  var px=origin.x+Math.cos(a)*dist,py=origin.y+Math.sin(a)*dist;
  if(px<-40||px>w+40||py<-40||py>h+40)return;
  var rad=Math.max(2.2,profile.radius*S*.72);x.save();x.translate(px,py);x.rotate(a);x.globalCompositeOperation='lighter';
  if(profile.mode==='beam'){
    var len=Math.min(dist,clamp(profile.speed*.075,80,235)),fade=clamp(1-age/Math.min(maxAge,.24),0,1),grad=x.createLinearGradient(-len,0,12,0);grad.addColorStop(0,'rgba(255,255,255,0)');grad.addColorStop(.66,hexA(col,.46*fade));grad.addColorStop(1,'rgba(255,255,255,'+(.95*fade)+')');x.strokeStyle=grad;x.lineWidth=Math.max(2.2,rad*1.1);x.beginPath();x.moveTo(-len,0);x.lineTo(8,0);x.stroke();
  }else{
    var trail=clamp(profile.speed*.035,10,45);x.strokeStyle=hexA(col,.34);x.lineWidth=Math.max(1.2,rad*.54);x.beginPath();x.moveTo(-trail,0);x.lineTo(-rad*.3,0);x.stroke();
    if(profile.pen>=3){x.fillStyle=hexA(col,.78);rr(x,-rad*1.35,-rad*.55,rad*2.7,rad*1.1,rad*.45);x.fill();x.fillStyle='#fff';rr(x,-rad*.66,-rad*.25,rad*1.32,rad*.5,rad*.22);x.fill();}
    else{x.fillStyle=profile.cluster?'#ffd49a':hexA(col,.84);x.shadowBlur=rad*1.45;x.shadowColor=col;x.beginPath();x.arc(0,0,rad,0,TAU);x.fill();x.shadowBlur=0;x.fillStyle='#fff';x.beginPath();x.arc(-rad*.2,-rad*.2,rad*.42,0,TAU);x.fill();}
    if(profile.cluster){x.strokeStyle='rgba(255,196,104,.46)';x.lineWidth=1;for(var k=0;k<Math.min(5,profile.cluster);k++){var qa=k/Math.min(5,profile.cluster)*TAU+age*5;x.beginPath();x.arc(Math.cos(qa)*rad*1.45,Math.sin(qa)*rad*1.45,Math.max(1,rad*.13),0,TAU);x.stroke();}}
    if(profile.splash){x.strokeStyle=hexA(col,.16);x.lineWidth=1;x.beginPath();x.arc(0,0,rad*(1.55+Math.min(1.2,profile.splash/110)),0,TAU);x.stroke();}
  }
  x.restore();
}
function drawShots(x,c,aim,t,S,cx,cy,w,h){
  var b=c.bullet||{},reload=Math.max(.055,b.reload||.7),ttl=b.ttl==null?1.05:b.ttl,windowT=clamp(ttl*.62,.24,1.15),idx=Math.floor(t/reload),count=Math.min(20,Math.ceil(windowT/reload)+1);
  for(var j=count-1;j>=0;j--){var shotIdx=idx-j,shotT=shotIdx*reload,age=t-shotT;if(age<0||age>windowT)continue;var plan=shotPlan(c,shotIdx);
    for(var p=0;p<plan.length;p++){var sp=plan[p],br=(c.barrels&&c.barrels[sp.barrel])||(c.barrels&&c.barrels[0])||{off:0,len:24,w:6,x:0,y:0};var a=aim+sp.off;
      /* Projectile spread changes flight angle, not where the visible tube ends.
       * This matters most for shotguns: every pellet shares one physical muzzle
       * and fans out only after leaving it. */
      var muzzleA=aim+(br.off||0),m=visualMuzzleLocal(br,muzzleA,S),origin={x:cx+m.x,y:cy+m.y};drawMuzzleFlash(x,origin.x,origin.y,muzzleA,c.color||'#7df3ff',age,S);drawProjectile(x,c,projectileProfile(c,sp.dmgMul,sp.rMul),origin,a,age,windowT,S,w,h);
    }
  }
}
function drawDrones(x,c,t,S,cx,cy){
  var n=Math.min(12,c.droneCount||0),hunter=c.droneRole==='hunter',col=c.color||'#7df3ff';if(!n)return;
  var size=(c.size||14)*S,rad=size*(hunter?1.72:1.48);
  for(var i=0;i<n;i++){var a=t*(hunter?1.08:.72)+i/n*TAU,rr=rad*(1+(i%2)*.11),px=cx+Math.cos(a)*rr,py=cy+Math.sin(a)*rr*.68,dr=Math.max(4,S*(hunter?2.5:2.0));x.save();x.translate(px,py);x.rotate(a+Math.PI/2);x.fillStyle='#07101b';x.strokeStyle=col;x.lineWidth=Math.max(1,S*.28);x.beginPath();x.moveTo(0,-dr*1.45);x.lineTo(dr,dr);x.lineTo(0,dr*.55);x.lineTo(-dr,dr);x.closePath();x.fill();x.stroke();x.fillStyle=col;x.globalAlpha=.7;x.beginPath();x.arc(0,0,dr*.32,0,TAU);x.fill();x.globalAlpha=1;if(hunter){x.strokeStyle=hexA(col,.32);x.beginPath();x.moveTo(-dr*.7,dr*.25);x.lineTo(dr*.7,dr*.25);x.stroke();}x.restore();}
}
function drawFooter(x,c,w,h){
  var b=c.bullet||{},bs=c.barrels||[],parts=[String(c.fireMode||'single').toUpperCase(),bs.length+' BARREL'+(bs.length===1?'':'S'),'R'+(b.r||4)];
  if(b.pellets)parts.push(b.pellets+' PELLETS');if(b.cluster)parts.push(b.cluster+' CLUSTER');if(b.pen>1)parts.push('PEN '+b.pen);
  x.fillStyle='rgba(220,235,255,.46)';x.font='700 8px Orbitron,system-ui';x.textAlign='center';x.textBaseline='alphabetic';x.fillText('LIVE CANONICAL PREVIEW · '+parts.join(' · '),w*.5,h-14);
}
function draw(now){
  var cv=ensureCanvas();if(!cv||!state.ctx)return;var r=cv.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(240,Math.floor(r.width)),h=Math.max(190,Math.floor(r.height));if(cv.width!==Math.floor(w*dpr)||cv.height!==Math.floor(h*dpr)){cv.width=Math.floor(w*dpr);cv.height=Math.floor(h*dpr);}var x=state.ctx;x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
  var id=selectedId(),c=CLASSES[id]||CLASSES.scout;if(!c)return;state.lastId=id;var t=now/1000,cx=w*.5,cy=h*.47,S=tankScale(c,w,h),aim=state.aim?Math.atan2((state.aim.y-.47)*h,(state.aim.x-.5)*w):Math.sin(t*.62)*.55;
  drawBackground(x,w,h,c,t);x.save();x.translate(cx,cy);x.globalCompositeOperation='lighter';var glow=x.createRadialGradient(0,0,2,0,0,(c.size||14)*S*2.8);glow.addColorStop(0,hexA(c.color||'#7df3ff',.24));glow.addColorStop(1,hexA(c.color||'#7df3ff',0));x.fillStyle=glow;x.beginPath();x.arc(0,0,(c.size||14)*S*2.8,0,TAU);x.fill();x.globalCompositeOperation='source-over';drawBarrels(x,c,aim,S);drawBody(x,c,aim,S,t);x.restore();
  drawShots(x,c,aim,t,S,cx,cy,w,h);drawDrones(x,c,t,S,cx,cy);drawFooter(x,c,w,h);
}
function visible(){var host=document.querySelector&&document.querySelector('.nvs-host.nvs-open');return !!host;}
function loop(t){state.raf=0;if(!visible())return;draw(t);state.raf=requestAnimationFrame(loop);}
function wake(){installFit();ensureCanvas();if(visible()&&!state.raf)state.raf=requestAnimationFrame(loop);}

installFit();
window.__NOVA_SHOWROOM_RELEASE__={version:VERSION,codename:CODENAME,date:'2026-08-10',headline:'Blackglass now mirrors live tank silhouettes, weapon geometry and projectile behavior, with visually exact muzzle attachment.'};
window.__NOVA_SHOWROOM_FIT_RELEASE__=window.__NOVA_SHOWROOM_RELEASE__;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){wake();requestAnimationFrame(wake);},{once:true});else wake();
var headObs=new MutationObserver(function(m){for(var i=0;i<m.length;i++){var n=m[i].addedNodes||[];for(var j=0;j<n.length;j++){var id=n[j]&&n[j].id;if(id==='nova-showroom-css'||id==='nova-showroom-containment-v172'){installFit();break;}}}});headObs.observe(document.head,{childList:true});
var root=document.getElementById&&document.getElementById('root');if(root){var obs=new MutationObserver(wake);obs.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});}
console.info('[NOVA TANKS] v1.10.6 Blackglass Mirror linked');
})();