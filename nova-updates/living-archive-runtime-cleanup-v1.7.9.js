/* NOVA TANKS v1.7.9 — Living Archive runtime refinement
 * Gives every release post a stable individual tint while keeping semantic-version
 * families visually related, then removes the broad discovery test hook before boot.
 */
(function(){
'use strict';
function parts(v){var p=String(v||'0').split('.').map(function(x){return parseInt(x,10)||0});return[p[0]||0,p[1]||0,p[2]||0]}
function hash(s){var h=2166136261>>>0;s=String(s||'');for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h>>>0}
function colorFor(version,salt){
 var p=parts(version),major=p[0],minor=p[1],patch=p[2],hsh=hash(salt);
 var majorHue=(192+(Math.max(0,major-1)*71))%360;
 var minorShift=((minor%9)-4)*1.2;
 var patchShift=((patch%7)-3)*.55;
 var postShift=(((hsh%101)/100)-.5)*1.6;
 var h=(majorHue+minorShift+patchShift+postShift+360)%360;
 var sat=72+((minor%5)*2)+((hsh>>>8)%3);
 var light=57+((patch%5)*2.35)+(((hsh>>>16)%9)*.72);
 return'hsl('+h.toFixed(2)+' '+sat.toFixed(1)+'% '+light.toFixed(1)+'%)'
}
function recolorOne(node){
 if(!node||!node.querySelector)return;
 var ver=node.querySelector('.nvl-rel-ver'),name=node.querySelector('.nvl-rel-name');
 if(ver&&name){node.style.setProperty('--rel',colorFor(String(ver.textContent||'').replace(/^v/i,''),name.textContent||''));return}
 var lv=node.querySelector('.nvl-version'),ln=node.querySelector('.nvl-codename');
 if(lv&&ln)node.style.setProperty('--rel',colorFor(String(lv.textContent||'').replace(/^v/i,''),ln.textContent||''))
}
function recolor(root){
 if(!root||!root.querySelectorAll)return;
 if(root.matches&&root.matches('.nvl-release,.nvl-latest'))recolorOne(root);
 root.querySelectorAll('.nvl-release,.nvl-latest').forEach(recolorOne)
}
function bind(){
 recolor(document);
 if(!document.documentElement||typeof MutationObserver==='undefined')return;
 new MutationObserver(function(ms){for(var i=0;i<ms.length;i++)for(var j=0;j<ms[i].addedNodes.length;j++)recolor(ms[i].addedNodes[j])}).observe(document.documentElement,{childList:true,subtree:true})
}
window.__NOVA_ARCHIVE_COLOR_PATCH__={colorFor:colorFor,parts:parts};
try{delete window.__NOVA_LIVING_ARCHIVE_TEST__;}catch(_){window.__NOVA_LIVING_ARCHIVE_TEST__=null}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
