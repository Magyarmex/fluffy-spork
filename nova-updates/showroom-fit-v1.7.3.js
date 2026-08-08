/* NOVA TANKS v1.7.3 — Blackglass Fit
 * Final portrait-stage proportion and caption separation pass.
 * Keeps the v1.7.2 containment model, but restores a natural 4:3 simulator
 * viewport and moves the touch steering instruction away from the canvas's
 * own LIVE CHASSIS SIMULATION footer.
 */
(function(){
'use strict';
var ID='nova-showroom-fit-v173';
var CSS=`
/* Portrait showroom: preserve width containment while giving the simulation
   enough vertical room to read as a display bay instead of a letterbox. */
html.nvs-portrait-mobile .nvs-canvaswrap{
  position:relative!important;
  width:100%!important;
  max-width:100%!important;
  aspect-ratio:4 / 3!important;
  height:auto!important;
  min-height:0!important;
  max-height:none!important;
  overflow:hidden!important;
}
html.nvs-portrait-mobile .nvs-canvas{
  position:absolute!important;
  inset:0!important;
  display:block!important;
  width:100%!important;
  height:100%!important;
  min-height:0!important;
  max-height:none!important;
}
/* The canvas already draws LIVE CHASSIS SIMULATION at the bottom. The old
   DOM hint occupied the same baseline. On touch devices it becomes a compact
   top-right control hint instead, with mobile-accurate wording. */
html.nvs-portrait-mobile .nvs-stagehint{
  top:8px!important;
  right:8px!important;
  bottom:auto!important;
  left:auto!important;
  width:auto!important;
  max-width:48%!important;
  padding:4px 6px!important;
  border:1px solid rgba(125,243,255,.16)!important;
  border-radius:999px!important;
  background:rgba(3,7,18,.72)!important;
  box-shadow:0 3px 14px rgba(0,0,0,.32)!important;
  color:rgba(182,233,255,.76)!important;
  font-size:0!important;
  line-height:1!important;
  letter-spacing:0!important;
  white-space:nowrap!important;
  overflow:hidden!important;
  text-overflow:ellipsis!important;
  backdrop-filter:blur(5px);
  -webkit-backdrop-filter:blur(5px);
}
html.nvs-portrait-mobile .nvs-stagehint::after{
  content:'DRAG TO STEER';
  font:800 6.5px/1 Orbitron,system-ui!important;
  letter-spacing:.09em!important;
}
/* Keep the identity block visually detached from the viewport footer. */
html.nvs-portrait-mobile .nvs-name{margin-top:10px!important;}
@media(max-width:380px){
  html.nvs-portrait-mobile .nvs-canvaswrap{aspect-ratio:1.28 / 1!important;}
  html.nvs-portrait-mobile .nvs-stagehint{top:7px!important;right:7px!important;max-width:52%!important;}
  html.nvs-portrait-mobile .nvs-stagehint::after{font-size:6.1px!important;}
}
`;
function install(){
  var style=document.getElementById(ID);
  if(!style){style=document.createElement('style');style.id=ID;style.textContent=CSS;document.head.appendChild(style);}
  else if(style.textContent!==CSS)style.textContent=CSS;
  /* Keep this after both historical showroom styles and v1.7.2 containment. */
  var containment=document.getElementById('nova-showroom-containment-v172');
  if(containment&&style.previousElementSibling!==containment)document.head.appendChild(style);
}
install();
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){install();requestAnimationFrame(install);},{once:true});
var obs=new MutationObserver(function(m){for(var i=0;i<m.length;i++){var n=m[i].addedNodes||[];for(var j=0;j<n.length;j++){var id=n[j]&&n[j].id;if(id==='nova-showroom-css'||id==='nova-showroom-containment-v172'){install();return;}}}});
obs.observe(document.head,{childList:true});
window.__NOVA_SHOWROOM_FIT_RELEASE__={version:'1.7.3',codename:'Blackglass Fit',date:'2026-08-08',headline:'Portrait Blackglass gets a properly proportioned simulator and collision-free guidance.'};
console.info('[NOVA TANKS] v1.7.3 Blackglass Fit linked');
})();
