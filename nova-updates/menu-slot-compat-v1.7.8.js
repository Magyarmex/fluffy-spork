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

/* NOVA TANKS v1.7.9 — Fieldcraft
 * Living tactical-tip layer.
 *
 * Release contract for future gameplay updates:
 * - add tips only when they teach a real interaction, timing window, tradeoff,
 *   counterplay rule, or useful UI signal;
 * - register new mechanic tips through window.NOVATips.register/registerMany;
 * - deprecate or replace tips in the same release that changes/removes a rule;
 * - never keep stale copy merely to preserve a numeric target.
 */
(function(){'use strict';
if(window.__NOVA_FIELDCRAFT_TIPS__)return;

var VERSION='1.7.9',CODENAME='Fieldcraft';
var DISPLAY_MS=10400; // exactly 2x the legacy 5200ms rotation
var tips=[],bags={},lastByBag={},mainTimer=0,contextTimer=0,mainMenu=null,observer=null;

function tip(id,text,tags){return{id:id,text:text,tags:tags||['general'],active:true,reviewed:'2026-08-08',source:'live-runtime'};}
var BASE_TIPS=[
 tip('cover-partial-blast',"Hard cover can fully occlude a blast, but exposing part of your hull around an edge can still take partial blast damage.",['battlefield','combat']),
 tip('cover-penetration',"A penetrating round only carries through destructible cover when that impact actually breaks the barricade and the projectile still has integrity left.",['battlefield','combat']),
 tip('cover-breach-route',"Destroying a barricade is a route change, not just damage: a breach permanently turns that blocker into non-blocking rubble for the rest of the run.",['battlefield','combat']),
 tip('cover-last-seen-ai',"Breaking line of sight denies AI a live target. It may investigate your last legitimately seen position, so relocate instead of waiting behind the same corner.",['battlefield','combat','ai']),
 tip('cover-cannon-ai',"Cannon AI can deliberately shell destructible cover that blocks a recent legitimate contact. Do not treat a damaged barricade as permanent safety.",['battlefield','combat','ai']),
 tip('cover-observer-relay',"A wall can break a sniper reconnaissance chain without killing the Observer: remote contact requires clear terrain sight.",['battlefield','sniper','combat']),
 tip('cover-layouts',"Crossfire, Split Horizon, and Four Gates are mirrored layouts. Learn the repeatable lanes and crossings; spawn side should not change the geometry problem.",['battlefield','general']),
 tip('cover-strip',"The battlefield strip reports remaining destructible cover. A falling count means routes and sightlines may have changed even if the breach happened off-screen.",['battlefield','ui']),
 tip('gunner-burst-discipline',"Gunner spread is deterministic: stable aim and controlled bursts tighten fire, while excessive heat adds predictable dispersion and hull recoil.",['gunner','discipline','combat']),
 tip('gunner-midheat',"Base Minigun descendants want sustainable mid-heat cadence. Holding fire until the meter is cooked sacrifices accuracy and forces a worse vent cycle.",['gunner','discipline','combat']),
 tip('tempest-redline',"Tempest peaks inside its broad redline band. Overshooting the band buys severe recoil and recovery rather than extra useful throughput.",['gunner','apex','discipline']),
 tip('needle-storm-gate',"Needle Storm has a narrow precision gate: exact heat plus stable tracking makes needles faster, stronger, and harder. Heat alone is not the payoff.",['gunner','apex','discipline']),
 tip('breachlord-brace',"Breachlord rewards a settled, cooled brace volley. Firing the payoff creates a short movement-recovery opening, so choose the firing position before committing.",['gunner','apex','discipline']),
 tip('flakmaster-stability',"Flakmaster converts stability into tighter, faster, longer-lived pellets. Bracing before the shot matters more at range than simply closing distance.",['gunner','apex','discipline']),
 tip('cannon-stick-depth',"For Cannons, right-stick direction aims while stick depth programs detonation distance. You can change burst range without changing the bearing.",['cannon','discipline','controls']),
 tip('cannon-impact-before-fuse',"The FUSE marker is a program, not a promise. If terrain is hit first, IMPACT marks the physical collision and the planned airburst becomes unreachable.",['cannon','battlefield','discipline']),
 tip('cannon-cover-fuse',"Program Cannon bursts around the geometry you can actually reach. A deep fuse behind intact cover does not make splash ignore the wall.",['cannon','battlefield','combat']),
 tip('cluster-king-sector',"Cluster King fuse depth also shapes the child-bomb sector: short programs spread wide; deep programs focus the sector forward.",['cannon','apex','discipline']),
 tip('siege-bomber-structure',"Siege Bomber is the structural Cannon specialist. When opening a lane matters, its extra barricade damage is often more valuable than chasing hull damage.",['cannon','apex','battlefield']),
 tip('annihilator-deep-fuse',"Annihilator gains stronger commitment from deep fuse programs, but the payoff leaves a larger reload opening. Place the burst where the reload can be survived.",['cannon','apex','discipline']),
 tip('quake-fuse-displacement',"Quake Cannon converts deeper fuse programs into wider, stronger displacement rather than simple damage inflation. Use depth to move a fight, not only finish one.",['cannon','apex','discipline']),
 tip('guardian-facing',"Guardian armor is directional. Your aim direction is also your strongest defensive facing, so tracking the wrong target can expose the hull you meant to protect.",['guardian','discipline','combat']),
 tip('guardian-perfect-guard',"The opening fraction of a defensive activation is the Perfect Guard window. A correct read negates the incoming hit and banks Countercharge for your next projectile.",['guardian','discipline','combat']),
 tip('guardian-counterstructure',"A Countercharged Guardian shot has modest structural authority. A successful Perfect Guard can therefore turn defense into limited lane pressure.",['guardian','battlefield','discipline']),
 tip('bastion-anchor',"Bastion gains frontal lane efficiency while nearly stationary. Repositioning or letting a flank develop breaks the anchor advantage.",['guardian','apex','discipline']),
 tip('aegis-flow',"Aegis converts a successful Perfect Guard into a brief mobility-flow window. Spend that window on angle or distance before the normal movement state returns.",['guardian','apex','discipline']),
 tip('meteor-straight-line',"Meteor owns the highest straight-line Stampede peak, but steering bleeds momentum quickly. Build the route first; correct the aim before the charge.",['guardian','apex','discipline']),
 tip('ravager-steering',"Ravager preserves more Stampede charge through moderate steering than Meteor. Trade peak impact for routes that need correction mid-charge.",['guardian','apex','discipline']),
 tip('stampede-collision',"Sharp turns and terrain collisions dump stored Stampede charge. A wall scrape can erase the hit before contact with the target.",['guardian','battlefield','discipline']),
 tip('sniper-direct-vs-relay',"Purple sniper hulls keep ordinary direct sight. Long-range authorization comes from the Forward Observer, so losing the relay does not disable close direct combat.",['sniper','observer','combat']),
 tip('sniper-kill-observer',"Destroying the active Forward Observer temporarily removes remote sniper authorization. Use that downtime to cross lanes that were unsafe under relay.",['sniper','observer','combat']),
 tip('observer-cone',"Forward Observers search a broad cone of roughly 700 units and about 149 degrees, plus short point-blank awareness. Approaching outside the cone can matter until suspicion turns it.",['sniper','observer','combat']),
 tip('observer-suspicion',"Recent contacts and nearby hostile projectile paths create decaying suspicion bearings for Observers. Firing near a scout can rotate its search even without revealing exact coordinates.",['sniper','observer','combat']),
 tip('observer-search-after-loss',"An Observer keeps searching purposeful sectors after contact is lost. Breaking sight is the first step; changing the expected re-acquisition angle is the second.",['sniper','observer','combat']),
 tip('observer-contact-ui',"Cyan CONTACT relays and off-screen distance markers are authorization information, not decoration. They tell a sniper when the Observer has established the remote link.",['sniper','observer','ui']),
 tip('sniper-postshot',"Non-beam purple forms telegraph precision dwell and carry punishable post-shot reveal. Survive the lined-up shot, then exploit the recovery instead of peeking during the dwell.",['sniper','discipline','combat']),
 tip('controller-bearing-depth',"Controller right-stick direction sets swarm bearing, analog depth sets deployment distance, and releasing the command recalls the squad while the left stick keeps driving the hull.",['controller','drones','controls']),
 tip('controller-command-node-cover',"A Controller Command Node can be placed beyond cover, but it does not teleport threat through terrain: the squad still has to physically reach that space.",['controller','drones','battlefield']),
 tip('controller-committed-dive',"A locked Controller attack dive stays committed. If the route intersects hard cover, the drone crashes into recovery instead of pathfinding around the wall mid-dive.",['controller','drones','battlefield']),
 tip('controller-routing-states',"Controller drones use local corner routing while forming, farming, defending, and recalling. Attack dives are the exception, so issue them from geometry the swarm can actually clear.",['controller','drones','battlefield']),
 tip('controller-shape-reservations',"Friendly Controller drones reserve different harvest shapes when alternatives exist. Spreading the swarm over nearby resources reduces redundant travel.",['controller','drones','economy']),
 tip('controller-auto-defense',"Automatic Controller defense intercepts nearby hostile combat drones but deliberately ignores Forward Observer spotters.",['controller','drones','observer']),
 tip('controller-manual-spotter',"Manual swarm commands can target hostile Forward Observers even though automatic drone defense ignores them. Spotter removal is a deliberate command decision.",['controller','drones','observer','combat']),
 tip('drone-iff',"Drone IFF halos encode allegiance without replacing lineage color: faint blue is friendly or allied; faint red is hostile.",['controller','drones','ui']),
 tip('graft-preview',"Blackglass graft previews show exact base-before-to-after stat changes. Judge the actual weapon, hull, mobility, splash, drone, or reduction delta instead of the gene name.",['blackglass','graft','lineage']),
 tip('apex-sidegrade',"Apex forms are mastery sidegrades, not automatic upgrades: Tempest, Cluster King, Bastion, and their peers ask you to exploit a specific discipline to earn the ceiling.",['blackglass','apex','lineage']),
 tip('aim-sensitivity-clamp',"Aim sensitivity changes how much thumb travel crosses the stick response, but the game still uses its existing clamp. Raising it does not grant extra aim range or combat stats.",['settings','controls']),
 tip('move-sensitivity-clamp',"Move sensitivity changes touch-stick response before normalized movement. A higher value reaches full input sooner; it does not increase tank top speed.",['settings','controls']),
 tip('stick-presentation',"Joystick size and opacity are presentation-only. Use size to improve thumb leverage and opacity to keep battlefield information visible beneath the controls.",['settings','controls','ui']),
 tip('screen-shake-render',"Screen shake is scaled only for rendering and restored immediately after the frame. Reducing it changes readability, not recoil, explosions, or simulation state.",['settings','controls','ui'])
];

function normalize(t){
 if(!t||typeof t.id!=='string'||!t.id||typeof t.text!=='string'||!t.text.trim())return null;
 var out={id:t.id,text:t.text.trim(),tags:Array.isArray(t.tags)&&t.tags.length?t.tags.slice():['general'],active:t.active!==false,reviewed:t.reviewed||'unreviewed',source:t.source||'runtime'};
 return out;
}
function resetBags(){bags={};lastByBag={};}
function register(t){
 var n=normalize(t);if(!n)return false;
 for(var i=0;i<tips.length;i++)if(tips[i].id===n.id){tips[i]=n;resetBags();refreshCount();return true;}
 tips.push(n);resetBags();refreshCount();return true;
}
function registerMany(list){var n=0;if(!Array.isArray(list))return n;for(var i=0;i<list.length;i++)if(register(list[i]))n++;return n;}
function deprecate(id){for(var i=0;i<tips.length;i++)if(tips[i].id===id){tips[i].active=false;resetBags();refreshCount();return true;}return false;}
function current(tags){
 var all=tips.filter(function(t){return t.active!==false;});
 if(!tags||!tags.length)return all;
 return all.filter(function(t){for(var i=0;i<tags.length;i++)if(t.tags.indexOf(tags[i])>=0)return true;return false;});
}
function shuffled(pool,lastId){
 var a=pool.slice();for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1)),x=a[i];a[i]=a[j];a[j]=x;}
 if(a.length>1&&a[0].id===lastId){var swap=1+Math.floor(Math.random()*(a.length-1)),y=a[0];a[0]=a[swap];a[swap]=y;}
 return a.map(function(t){return t.id;});
}
function byId(id){for(var i=0;i<tips.length;i++)if(tips[i].id===id&&tips[i].active!==false)return tips[i];return null;}
function next(key,tags){
 var pool=current(tags);if(!pool.length)pool=current();if(!pool.length)return null;
 var allowed={};for(var i=0;i<pool.length;i++)allowed[pool[i].id]=true;
 var bag=bags[key]||[];bag=bag.filter(function(id){return !!allowed[id]&&!!byId(id);});
 if(!bag.length)bag=shuffled(pool,lastByBag[key]);
 var id=bag.shift(),picked=byId(id);bags[key]=bag;if(picked)lastByBag[key]=picked.id;return picked;
}
function audit(){
 var seenId={},seenText={},duplicateIds=[],duplicateTexts=[],invalid=[];
 for(var i=0;i<tips.length;i++){
  var t=tips[i];if(!normalize(t)){invalid.push(t&&t.id||String(i));continue;}
  if(seenId[t.id])duplicateIds.push(t.id);seenId[t.id]=true;
  var text=t.text.toLowerCase();if(seenText[text])duplicateTexts.push(t.id);seenText[text]=true;
 }
 return{version:VERSION,current:current().length,total:tips.length,duplicateIds:duplicateIds,duplicateTexts:duplicateTexts,invalid:invalid,displayMs:DISPLAY_MS};
}

for(var baseIndex=0;baseIndex<BASE_TIPS.length;baseIndex++)tips.push(BASE_TIPS[baseIndex]);
window.NOVATips={version:VERSION,codename:CODENAME,displayMs:DISPLAY_MS,register:register,registerMany:registerMany,deprecate:deprecate,current:function(){return current().map(function(t){return Object.assign({},t,{tags:t.tags.slice()});});},next:function(key,tags){return next(key||'external',tags||null);},audit:audit};
window.__NOVA_TIPS_CONTRACT__={
 version:VERSION,
 policy:'Gameplay releases should register useful mechanic-aware tips and deprecate copy in the same release that makes it false.',
 quality:'Prefer interactions, timings, tradeoffs, counterplay and meaningful signals over generic advice.',
 staleTipsAllowed:false,
 minimumIsNotAQuota:true
};
window.__NOVA_FIELDCRAFT_TIPS__={version:VERSION,codename:CODENAME,date:'2026-08-08',count:BASE_TIPS.length,displayMs:DISPLAY_MS,rotation:'shuffle-bag'};

function installStyles(){if(document.getElementById('nova-fieldcraft-tip-style'))return;var s=document.createElement('style');s.id='nova-fieldcraft-tip-style';s.textContent=[
 '.nova-tip-line{height:clamp(28px,5.2vh,38px);overflow:hidden;margin-top:3px;font:700 clamp(9px,1.6vh,10.5px)/1.24 Rajdhani,system-ui;color:#d2deed;transition:opacity .18s ease,transform .18s ease}',
 '.nova-tip-line.swap,.nova-context-tip.swap .nova-context-tip-text{opacity:0;transform:translateY(3px)}',
 '.nova-context-tip{margin-top:10px;padding:8px 9px;border:1px solid rgba(125,243,255,.13);border-radius:9px;background:rgba(29,73,104,.08);min-width:0}',
 '.nova-context-tip-k{font:800 7px/1 Orbitron,system-ui;letter-spacing:.13em;color:#5d8da8;text-transform:uppercase}',
 '.nova-context-tip-text{margin-top:5px;font:650 9.5px/1.32 Rajdhani,system-ui;color:#9fb9ce;transition:opacity .18s ease,transform .18s ease}',
 '#nova-pilot-panel .nova-context-tip{margin:2px 1px 12px;background:rgba(40,100,150,.07)}',
 '.nvs-panel .nova-context-tip{margin:10px 0 0}',
 '[data-nova-slot="utility"] .nova-context-tip{margin:8px 0 0}',
 '@media(prefers-reduced-motion:reduce){.nova-tip-line,.nova-context-tip-text{transition:none!important}}'
].join('\n');document.head.appendChild(s);}
function menu(){return document.querySelector('#root .menu-grid-bg');}
function mainSurface(){var m=menu();return m&&m.querySelector('[data-nova-slot="tips"], [data-nova-slot="briefing"]');}
function refreshCount(){
 var count=current().length,tag=mainSurface();tag=tag&&tag.querySelector('.nv-brief-v');if(tag)tag.textContent='TACTICAL · '+count+' CURRENT';
 var labels=document.querySelectorAll('.nova-context-tip-k');for(var i=0;i<labels.length;i++)if(labels[i].dataset.count==='1')labels[i].textContent='TACTICAL NOTE · '+count+' CURRENT';
}
function paintMain(line,label){var t=next('main',null);if(!t)return;line.textContent=t.text;if(label)label.textContent='TACTICAL · '+current().length+' CURRENT';}
function mountMain(){
 var m=menu(),surface=mainSurface();if(!m||!surface)return;
 var old=surface.querySelector('.nv-tip-line'),line=surface.querySelector('.nova-tip-line');
 if(old){old.classList.remove('nv-tip-line');old.classList.add('nova-tip-line');line=old;}
 if(!line){line=document.createElement('div');line.className='nova-tip-line';surface.appendChild(line);}
 var k=surface.querySelector('.nv-brief-k'),label=surface.querySelector('.nv-brief-v');if(k)k.textContent='TIPS';
 if(mainMenu!==m){if(mainTimer)clearInterval(mainTimer);mainTimer=0;mainMenu=m;paintMain(line,label);}
 if(mainTimer)return;
 mainTimer=setInterval(function(){
  if(!mainMenu||!mainMenu.isConnected){clearInterval(mainTimer);mainTimer=0;mainMenu=null;return;}
  var s=mainSurface(),l=s&&s.querySelector('.nova-tip-line'),tag=s&&s.querySelector('.nv-brief-v');if(!l)return;
  l.classList.add('swap');setTimeout(function(){if(!l.isConnected)return;paintMain(l,tag);l.classList.remove('swap');},180);
 },DISPLAY_MS);
 refreshCount();
}
function makeCard(host,id,key,tags){
 if(!host||host.querySelector('[data-nova-context-tip="'+id+'"]'))return;
 var card=document.createElement('div');card.className='nova-context-tip';card.dataset.novaContextTip=id;card.dataset.tipKey=key;card.dataset.tipTags=tags.join(',');
 var label=document.createElement('div');label.className='nova-context-tip-k';label.textContent='TACTICAL NOTE';
 var text=document.createElement('div');text.className='nova-context-tip-text';card.appendChild(label);card.appendChild(text);host.appendChild(card);
 var picked=next(key,tags);if(picked)text.textContent=picked.text;
}
function mountContexts(){
 var controls=document.querySelector('[data-nova-slot="utility"]');if(controls)makeCard(controls,'controls','controls',['controls','settings','ui']);
 var blackglass=document.querySelector('.nvs-panel');if(blackglass)makeCard(blackglass,'blackglass','blackglass',['blackglass','graft','lineage','apex','discipline']);
 var pilot=document.getElementById('nova-pilot-panel');if(pilot){var actions=pilot.querySelector('.nova-pilot-actions'),existing=pilot.querySelector('[data-nova-context-tip="pilot"]');if(!existing){var holder=document.createElement('div');holder.className='nova-context-tip';holder.dataset.novaContextTip='pilot';holder.dataset.tipKey='pilot';holder.dataset.tipTags='settings,controls,ui';holder.innerHTML='<div class="nova-context-tip-k">TACTICAL NOTE</div><div class="nova-context-tip-text"></div>';if(actions)pilot.insertBefore(holder,actions);else pilot.appendChild(holder);var picked=next('pilot',['settings','controls','ui']);if(picked)holder.querySelector('.nova-context-tip-text').textContent=picked.text;}}
}
function rotateContexts(){
 var cards=document.querySelectorAll('.nova-context-tip');for(var i=0;i<cards.length;i++)(function(card){
  if(!card.isConnected)return;var tags=(card.dataset.tipTags||'').split(',').filter(Boolean),text=card.querySelector('.nova-context-tip-text'),picked=next(card.dataset.tipKey||card.dataset.novaContextTip,tags);if(!text||!picked)return;
  card.classList.add('swap');setTimeout(function(){if(!card.isConnected)return;text.textContent=picked.text;card.classList.remove('swap');},180);
 })(cards[i]);
}
function apply(){installStyles();mountMain();mountContexts();}
function schedule(){if(schedule.queued)return;schedule.queued=true;requestAnimationFrame(function(){schedule.queued=false;apply();});}
function start(){
 apply();var root=document.getElementById('root')||document.body;if(root){observer=new MutationObserver(schedule);observer.observe(root,{childList:true,subtree:true});}
 if(!contextTimer)contextTimer=setInterval(rotateContexts,DISPLAY_MS);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
