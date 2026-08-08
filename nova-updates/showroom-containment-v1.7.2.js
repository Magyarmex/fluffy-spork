/* NOVA TANKS v1.7.2 — Blackglass Containment
 * Definitive portrait-mobile containment for the showroom.
 * Loaded after the historical showroom layers; it also re-appends itself after
 * the base showroom stylesheet appears so late DOMContentLoaded injection
 * cannot restore the old desktop grid over the mobile layout.
 */
(function(){
'use strict';
var ID='nova-showroom-containment-v172';
var CSS=`
/* hard containment shared by all viewport sizes */
.nvs-host,.nvs-panel,.nvs-body,.nvs-library,.nvs-stage,.nvs-intel,.nvs-canvaswrap,
.nvs-head,.nvs-filters,.nvs-card,.nvs-stat,.nvs-ability,.nvs-graft,.nvs-deltas,.nvs-delta{
  box-sizing:border-box;
  min-width:0;
}
.nvs-panel,.nvs-body{max-width:100%;}
.nvs-panel{overflow:hidden!important;}
.nvs-title,.nvs-sub,.nvs-name,.nvs-quote,.nvs-desc,.nvs-bread,.nvs-ability-n,
.nvs-gene-name,.nvs-gene-desc,.nvs-note,.nvs-trade,.nvs-stat-l,.nvs-stat-v,.nvs-delta span{
  overflow-wrap:anywhere;
  word-break:normal;
}
.nvs-stagebar,.nvs-stat-top,.nvs-delta{min-width:0;}

/* Portrait/coarse-pointer mode is also applied by JS. This deliberately does
   not depend solely on CSS pixel width, because some Android WebViews report
   a wide layout viewport even while physically portrait. */
html.nvs-portrait-mobile .nvs-host.nvs-open{
  position:relative!important;
  left:auto!important;
  right:auto!important;
  transform:none!important;
  width:100%!important;
  max-width:100%!important;
  margin-left:0!important;
  margin-right:0!important;
}
html.nvs-portrait-mobile .nvs-panel{
  width:100%!important;
  max-width:100%!important;
  margin:8px 0 0!important;
  border-radius:14px!important;
  overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-body{
  display:grid!important;
  grid-template-columns:minmax(0,1fr)!important;
  grid-template-rows:auto auto auto!important;
  width:100%!important;
  max-width:100%!important;
  min-height:0!important;
  overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-library{
  order:1!important;
  display:flex!important;
  flex-direction:row!important;
  align-items:stretch!important;
  gap:6px!important;
  width:100%!important;
  max-width:100%!important;
  max-height:none!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  border-right:0!important;
  border-bottom:1px solid rgba(255,255,255,.08)!important;
  padding:8px!important;
  scroll-snap-type:x proximity;
  overscroll-behavior-x:contain;
}
html.nvs-portrait-mobile .nvs-library-h{display:none!important;}
html.nvs-portrait-mobile .nvs-card{
  flex:0 0 142px!important;
  width:142px!important;
  max-width:142px!important;
  margin:0!important;
  padding:7px!important;
  display:grid!important;
  grid-template-columns:30px minmax(0,1fr)!important;
  gap:7px!important;
  scroll-snap-align:start;
  overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-card-icon{width:30px!important;height:30px!important;}
html.nvs-portrait-mobile .nvs-card-name,
html.nvs-portrait-mobile .nvs-card-role{
  display:block!important;
  max-width:100%!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  white-space:nowrap!important;
}
html.nvs-portrait-mobile .nvs-tier{display:none!important;}
html.nvs-portrait-mobile .nvs-stage{
  order:2!important;
  width:100%!important;
  max-width:100%!important;
  padding:9px!important;
  border-right:0!important;
  border-bottom:1px solid rgba(255,255,255,.08)!important;
  overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-stagebar{
  width:100%!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr)!important;
  gap:3px!important;
}
html.nvs-portrait-mobile .nvs-lineage{font-size:7.5px!important;line-height:1.2!important;}
html.nvs-portrait-mobile .nvs-bread{
  margin-left:0!important;
  width:100%!important;
  max-width:100%!important;
  text-align:left!important;
  white-space:normal!important;
  font-size:7.5px!important;
  line-height:1.25!important;
}
html.nvs-portrait-mobile .nvs-canvaswrap{
  width:100%!important;
  max-width:100%!important;
  min-height:178px!important;
  height:178px!important;
  margin-top:6px!important;
  overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-canvas{
  width:100%!important;
  max-width:100%!important;
  min-height:178px!important;
  height:178px!important;
}
html.nvs-portrait-mobile .nvs-stagehint{
  left:7px!important;
  right:7px!important;
  bottom:6px!important;
  max-width:none!important;
  font-size:6.4px!important;
  letter-spacing:.06em!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
}
html.nvs-portrait-mobile .nvs-name{
  max-width:100%!important;
  margin-top:8px!important;
  font-size:16px!important;
  line-height:1.12!important;
  letter-spacing:.055em!important;
}
html.nvs-portrait-mobile .nvs-quote{font-size:11.5px!important;line-height:1.22!important;}
html.nvs-portrait-mobile .nvs-desc{font-size:10px!important;line-height:1.34!important;max-width:100%!important;}
html.nvs-portrait-mobile .nvs-tags{max-width:100%!important;gap:4px!important;}
html.nvs-portrait-mobile .nvs-tag{font-size:6.8px!important;line-height:1.15!important;}
html.nvs-portrait-mobile .nvs-intel{
  order:3!important;
  display:block!important;
  width:100%!important;
  max-width:100%!important;
  max-height:none!important;
  overflow-x:hidden!important;
  overflow-y:visible!important;
  padding:10px 9px 12px!important;
}
html.nvs-portrait-mobile .nvs-section{font-size:7.8px!important;line-height:1.3!important;}
html.nvs-portrait-mobile .nvs-stat{width:100%!important;margin-top:7px!important;}
html.nvs-portrait-mobile .nvs-stat-top{
  display:grid!important;
  grid-template-columns:minmax(0,1fr) auto!important;
  align-items:end!important;
  gap:8px!important;
  width:100%!important;
  font-size:8.4px!important;
  line-height:1.15!important;
}
html.nvs-portrait-mobile .nvs-stat-l{min-width:0!important;}
html.nvs-portrait-mobile .nvs-stat-v{max-width:46vw!important;text-align:right!important;white-space:normal!important;}
html.nvs-portrait-mobile .nvs-ability{width:100%!important;padding:8px!important;}
html.nvs-portrait-mobile .nvs-ability-n{font-size:9.7px!important;line-height:1.3!important;}
html.nvs-portrait-mobile .nvs-graft{width:100%!important;max-width:100%!important;}
html.nvs-portrait-mobile .nvs-gene-row{
  display:flex!important;
  width:100%!important;
  max-width:100%!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  gap:6px!important;
}
html.nvs-portrait-mobile .nvs-gene{flex:0 0 40px!important;width:40px!important;height:34px!important;}
html.nvs-portrait-mobile .nvs-deltas{width:100%!important;max-width:100%!important;}
html.nvs-portrait-mobile .nvs-delta{
  width:100%!important;
  max-width:100%!important;
  display:grid!important;
  grid-template-columns:minmax(0,1fr) minmax(0,1.15fr)!important;
  align-items:start!important;
  gap:8px!important;
  font-size:8.3px!important;
  line-height:1.25!important;
}
html.nvs-portrait-mobile .nvs-delta span:last-child{
  max-width:none!important;
  min-width:0!important;
  text-align:right!important;
  white-space:normal!important;
}
html.nvs-portrait-mobile .nvs-head{padding:11px 10px 9px!important;}
html.nvs-portrait-mobile .nvs-title{font-size:10.5px!important;line-height:1.3!important;letter-spacing:.12em!important;}
html.nvs-portrait-mobile .nvs-sub{font-size:8.5px!important;line-height:1.3!important;}
html.nvs-portrait-mobile .nvs-filters{
  width:100%!important;
  max-width:100%!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  padding:7px 8px!important;
}
html.nvs-portrait-mobile .nvs-filter{flex:0 0 auto!important;font-size:7px!important;}

@media(max-width:760px){
  .nvs-host.nvs-open{position:relative!important;left:auto!important;right:auto!important;transform:none!important;width:100%!important;max-width:100%!important;margin-inline:0!important;}
  .nvs-panel{width:100%!important;max-width:100%!important;overflow:hidden!important;}
  .nvs-body{display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto auto!important;width:100%!important;max-width:100%!important;overflow:hidden!important;}
  .nvs-library{display:flex!important;flex-direction:row!important;width:100%!important;max-width:100%!important;overflow-x:auto!important;overflow-y:hidden!important;border-right:0!important;}
  .nvs-stage,.nvs-intel{width:100%!important;max-width:100%!important;border-right:0!important;overflow-x:hidden!important;}
}
@media(max-width:380px){
  html.nvs-portrait-mobile .nvs-card{flex-basis:132px!important;width:132px!important;max-width:132px!important;}
  html.nvs-portrait-mobile .nvs-canvaswrap,html.nvs-portrait-mobile .nvs-canvas{height:166px!important;min-height:166px!important;}
  html.nvs-portrait-mobile .nvs-name{font-size:15px!important;}
  html.nvs-portrait-mobile .nvs-stat-v{max-width:42vw!important;}
}
`;

function portraitMode(){
  var coarse=false,portrait=false;
  try{coarse=matchMedia('(pointer:coarse)').matches;portrait=matchMedia('(orientation:portrait)').matches;}catch(_){coarse=('ontouchstart' in window);portrait=innerHeight>=innerWidth;}
  var on=innerWidth<=760||(coarse&&portrait);
  document.documentElement.classList.toggle('nvs-portrait-mobile',!!on);
}
function ensureLast(){
  var style=document.getElementById(ID);
  if(!style){style=document.createElement('style');style.id=ID;style.textContent=CSS;document.head.appendChild(style);}
  else if(style.textContent!==CSS)style.textContent=CSS;
  var base=document.getElementById('nova-showroom-css');
  if(base&&style.previousElementSibling!==base){document.head.appendChild(style);}
  portraitMode();
}

ensureLast();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){ensureLast();requestAnimationFrame(ensureLast);},{once:true});
window.addEventListener('resize',portraitMode,{passive:true});
window.addEventListener('orientationchange',function(){setTimeout(function(){portraitMode();ensureLast();},80);},{passive:true});
var obs=new MutationObserver(function(m){for(var i=0;i<m.length;i++){var n=m[i].addedNodes||[];for(var j=0;j<n.length;j++){if(n[j]&&n[j].id==='nova-showroom-css'){ensureLast();return;}}}});
obs.observe(document.head,{childList:true});

window.__NOVA_SHOWROOM_CONTAINMENT__={version:'1.7.2',portraitMode:portraitMode};
console.info('[NOVA TANKS] v1.7.2 Blackglass containment linked');
})();
