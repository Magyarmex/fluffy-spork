/* NOVA TANKS v1.7.8 — Signal Flow slot compatibility
 * The visible briefing surface is now Tips, but Contained First Contact still
 * probes the legacy "briefing" slot during its DOM refresh cycle. Keep a hidden
 * alias after Tips so the legacy enhancer never recreates a second panel.
 */
(function(){'use strict';
function ensureAlias(){
 var menu=document.querySelector('#root .menu-grid-bg');if(!menu)return;
 var tips=menu.querySelector('[data-nova-slot="tips"]');if(!tips)return;
 if(menu.querySelector('[data-nova-slot="briefing"]'))return;
 var alias=document.createElement('span');
 alias.hidden=true;alias.setAttribute('aria-hidden','true');alias.dataset.novaSlot='briefing';
 alias.innerHTML='<span class="nv-brief-v"></span>';
 tips.insertAdjacentElement('afterend',alias);
}
function start(){
 ensureAlias();
 var root=document.getElementById('root');
 if(root)new MutationObserver(ensureAlias).observe(root,{childList:true,subtree:true});
}
window.__NOVA_MENU_SLOT_COMPAT__={version:'1.7.8',ensureAlias:ensureAlias};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
