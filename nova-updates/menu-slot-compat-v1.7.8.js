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
 tip('drone-iff',"Drone IFF: blue ring = friendly/allied; red diamond = hostile. The colored drone body still identifies its class.",['controller','drones','ui']),
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
 '.nova-tip-line{min-height:clamp(28px,5.2vh,38px);height:auto;overflow:visible;margin-top:3px;font:700 clamp(9px,1.6vh,10.5px)/1.24 Rajdhani,system-ui;color:#d2deed;transition:opacity .18s ease,transform .18s ease}',
 /* Reserve enough lines on narrow handsets so the shuffle-bag rotation does
  * not crop advice or move the controls every 10.4 seconds. The text may
  * still grow if a future reviewed tip is unusually long. */
 '@media(max-width:430px){.nova-tip-line{min-height:56px}}',
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
 var k=surface.querySelector('.nv-brief-k'),label=surface.querySelector('.nv-brief-v');if(k&&k.textContent!=='TIPS')k.textContent='TIPS';
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

/* NOVA FIELDCRAFT DEATH INSIGHT — authoritative killer class, no guessed cause.
 * One optional matchup lesson on the existing TERMINATED panel; no new screen,
 * controls, currency, bonuses, or change to the damage/kill-credit path.
 * The canonical React GameOver is in the compressed shipping payload, so this
 * presentation-only extension is mounted after React creates its modal. */
(function(){
'use strict';
var mods=window.__novaModules;if(!mods||!mods['game/engine'])return;
// The React-owned death title is wider than its 320px panel content box.
// Scope the correction to that exact modal; do not change other red labels,
// large-phone/desktop typography, buttons, or the compressed game shell.
function installDeathTitleFit(){
 if(typeof document==='undefined'||!document.head||!document.createElement)return;
 if(document.getElementById&&document.getElementById('nova-death-title-fit'))return;
 var style=document.createElement('style');style.id='nova-death-title-fit';
 style.textContent='@media(max-width:360px){'+
  '.absolute.inset-0.z-50 > .panel.anim-pop > .font-display.text-red-400{'+
  'font-size:24px;letter-spacing:.12em;line-height:1.25}}'+
  /* A short landscape phone has only 320px of height. Keep the existing
   * death card and its earned statistics, but make its full contents
   * scrollable rather than clipping Redeploy or hiding the title offscreen.
   * :has scopes this to the actual React-owned TERMINATED modal, not Pause
   * or upgrade cards, and leaves taller phones/desktops unchanged. */
  '@media(max-height:400px) and (orientation:landscape){'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400){'+
  'max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);'+
  'overflow-y:auto;overscroll-behavior:contain;padding:8px 12px;}'+
  /* Preserve every earned stat and the opponent lesson, but reduce vertical
   * chrome so Redeploy and Main Menu are visible without discovering scroll. */
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > .font-display.text-red-400{font-size:20px;letter-spacing:.12em;line-height:1.1;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > .mt-4.grid{margin-top:6px;gap:4px;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > .mt-4.grid > div{padding:2px 6px;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > .mt-4.grid > div > div:first-child{font-size:8px;line-height:1.15;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > .mt-4.grid > div > div:last-child{font-size:11px;line-height:1.2;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > [data-nova-death-insight]{margin-top:5px!important;padding:4px 6px!important;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > button.btn-primary{margin-top:6px;padding-top:6px;padding-bottom:6px;font-size:11px;}'+
  '.absolute.inset-0.z-50 > .panel.anim-pop:has(> .font-display.text-red-400) > button.btn-ghost{margin-top:4px;padding-top:4px;padding-bottom:4px;font-size:10px;}}';
 document.head.appendChild(style);
}
installDeathTitleFit();
var lessons={
 gunner:'Break the firing lane with cover, then re-enter between bursts.',
 cannon:'Spread out from cover edges and read the fuse or impact cue.',
 sniper:'Break the sightline, then rotate before exposing the same angle.',
 controller:'Disrupt the drone approach; avoid chasing the swarm into crossfire.',
 guardian:'Avoid a frontal trade; make the defender turn before committing.'
};
/* Class-specific COUNTERPLAY, not a claim about the fatal hit. The killer's
 * canonical class is known; the actual damage source may be a drone, a
 * reflected shot or another actor. Keep each lesson actionable, concise,
 * and independent of private combat information or unobserved abilities. */
var matchupLessons={
 scout: "Use hard cover to break its single-shot lane; separate the hull from its escort before trading.",
 twin: "Bait the twin firing lane behind cover, then cross at an angle while its barrels reset.",
 minigun: "Break the rotary firing lane and force a turn; attack after heat and recoil spoil its tracking.",
 shotgun: "Stay outside the pellet cone; bait the close blast, then punish the long reload.",
 tempest: "Do not stand in its five-barrel lane; break sight, change angle, and punish overheated tracking.",
 needlestorm: "Its needles reach farther than a Minigun; change angle sharply and attack between bursts.",
 breachlord: "Avoid a point-blank trade: sidestep its wide nine-pellet burst, then punish the reload.",
 flakmaster: "Its tight pellet cone reaches surprisingly far; strafe across the line, not straight backward.",
 cannon: "Watch the fuse point, leave the predicted blast area, then push during the heavy reload.",
 bomber: "Read the shell burst point and cross the cluster lane before its child bombs spread.",
 demolisher: "Keep solid cover between you and the blast; exposed edges are unsafe. Punish its slow reload.",
 clusterking: "Escape the whole predicted cluster sector, not just the main shell; re-enter after fragments.",
 siegebomber: "Change speed before its heavy cluster lands; use hard cover, then punish the long reload.",
 annihilator: "Bait its enormous single shot into solid cover; push from a new angle during its long reload.",
 quake: "Do not count on a slow heavy reload; use solid cover and shift lanes after each faster shell.",
 marksman: "Break the sightline, then rotate before exposing the same angle.",
 railgun: "Avoid lining up in a straight lane; bait its piercing rail shot, then cross during recovery.",
 ghost: "Watch quiet lanes for stationary cloak; force movement, then punish its blink landing.",
 singularity: "Never approach down one open lane; bait the extreme rail shot and cross during its long reload.",
 prism: "Avoid its paired parallel beam lanes; shift sideways after a shot and close during recovery.",
 specter: "Expect frequent blinks; cover likely exits and punish its new position, not the old one.",
 assassin: "Bait its slow, high-damage opening shot; close during reload but keep room for its blink.",
 carrier: "Disrupt the drone approach; avoid chasing the swarm into crossfire.",
 overlord: "Do not fight six hunters in the open; split the swarm with cover and pressure the hull.",
 warden: "Its armored hunters protect a damage-soaking hull; peel the drones before committing to the core.",
 hivemind: "Nine hunters dominate open lanes; use a choke to separate the swarm from its hull.",
 broodmother: "Hunters return quickly; exploit their travel time to pressure the hull instead of farming drones.",
 citadel: "Its armored command core rewards flanks; avoid a prolonged head-on fight with six hunters.",
 valkyrie: "Fast hunters can outflank you; change lanes and force them around solid cover.",
 guard: "Avoid a frontal trade; make the defender turn before committing.",
 fortress: "Its bunker is slow; flank outside the defended front arc instead of trading into armor.",
 juggernaut: "Sidestep its committed Stampede; terrain contact drains momentum, then punish the recovery.",
 bastion: "Its strongest guard is narrow and frontal; split angles rather than fighting inside its choke.",
 aegis: "Bait its wide Perfect Guard before firing; change angle while the defense recovers.",
 meteor: "Do not race a straight Stampede; sidestep near cover and punish a wall collision.",
 ravager: "Its twin guns still pressure after a ram feint; dodge sideways and counter from cover."
};
function choose(victim,killer,classes){
 if(!victim||!victim.isPlayer||!killer||killer===victim||
    killer.id==null||killer.id===victim.id||!killer.cls||
    !classes||!classes.CLASSES)return null;
 var def=classes.CLASSES[killer.cls];
 var lineage=typeof classes.lineageForClass==='function'?
   classes.lineageForClass(killer.cls):null;
 if(!Object.prototype.hasOwnProperty.call(classes.CLASSES,killer.cls))return null;
 var lesson=Object.prototype.hasOwnProperty.call(matchupLessons,killer.cls)?
   matchupLessons[killer.cls]:lessons[lineage];
 if(!lesson)return null;
 return {name:String(def.name||killer.cls).slice(0,40),lesson:lesson};
}
function findPanel(){
 if(typeof document==='undefined'||!document.querySelectorAll)return null;
 var panels=document.querySelectorAll('.panel');
 for(var i=0;i<panels.length;i++){
  var p=panels[i],buttons=p.querySelectorAll('button'),redeploy=null;
  if(!p.textContent||p.textContent.indexOf('TERMINATED')<0)continue;
  for(var j=0;j<buttons.length;j++)
   if((buttons[j].textContent||'').indexOf('REDEPLOY')>=0){redeploy=buttons[j];break;}
  if(redeploy)return {panel:p,before:redeploy};
 }
 return null;
}
function paint(info){
 if(!info)return false;
 var target=findPanel();if(!target)return false;
 if(target.panel.querySelector('[data-nova-death-insight]'))return true;
 var box=document.createElement('div');
 box.setAttribute('data-nova-death-insight','');
 box.setAttribute('role','note');
 box.style.cssText='margin-top:10px;padding:8px 10px;border:1px solid rgba(125,243,255,.28);border-radius:8px;background:rgba(0,0,0,.42);text-align:left;overflow-wrap:anywhere;';
 var heading=document.createElement('div');
 heading.style.cssText='font-size:9px;line-height:1.4;font-weight:800;letter-spacing:.07em;color:#7df3ff;';
 heading.textContent='FIELDCRAFT · LAST OPPONENT: '+info.name.toUpperCase();
 var body=document.createElement('div');
 body.style.cssText='margin-top:3px;font-size:11px;line-height:1.35;color:#e2e8f0;';
 body.textContent=info.lesson;
 box.appendChild(heading);box.appendChild(body);
 target.panel.insertBefore(box,target.before);
 return true;
}
function cleanup(g){
 if(g.__novaDeathInsightObserver){g.__novaDeathInsightObserver.disconnect();g.__novaDeathInsightObserver=null;}
 if(g.__novaDeathInsightTimeout!=null&&typeof clearTimeout==='function'){
  clearTimeout(g.__novaDeathInsightTimeout);g.__novaDeathInsightTimeout=null;
 }
 if(typeof document!=='undefined'&&document.querySelector){
  var node=document.querySelector('[data-nova-death-insight]');
  if(node&&node.parentNode)node.parentNode.removeChild(node);
 }
 g.__novaDeathInsight=null;g.__novaDeathInsightAttempted=false;
}
function mount(g){
 if(!g.__novaDeathInsight||g.__novaDeathInsightAttempted)return;
 g.__novaDeathInsightAttempted=true;
 if(paint(g.__novaDeathInsight))return;
 if(typeof MutationObserver!=='function'||typeof document==='undefined')return;
 var root=document.getElementById('root')||document.body;if(!root)return;
 var observer=new MutationObserver(function(){
  if(paint(g.__novaDeathInsight)){observer.disconnect();g.__novaDeathInsightObserver=null;}
 });
 g.__novaDeathInsightObserver=observer;
 observer.observe(root,{childList:true,subtree:true});
 if(typeof setTimeout==='function')g.__novaDeathInsightTimeout=setTimeout(function(){
  if(g.__novaDeathInsightObserver===observer){observer.disconnect();g.__novaDeathInsightObserver=null;}
 },4000);
}
var original=mods['game/engine'];
mods['game/engine']=function(module,exports,require){
 original(module,exports,require);
 var Game=module.exports.Game;
 if(!Game||Game.prototype.__novaDeathInsightInstalled)return;
 var classes;try{classes=require('./classes');}catch(ignore){return;}
 Game.prototype.__novaDeathInsightInstalled=true;
 var oldKill=Game.prototype.killTank,oldUpdate=Game.prototype.update,oldRedeploy=Game.prototype.redeploy;
 if(typeof oldKill==='function')Game.prototype.killTank=function(victim,killer){
  var wasAlive=!!(!this.__novaDecorativeWorld&&victim&&victim.alive!==false&&victim.isPlayer);
  var note=null;
  if(wasAlive)try{
   note=choose(victim,killer,classes);
   if(note&&typeof this.areAllies==='function'&&this.areAllies(victim,killer))note=null;
  }catch(ignore){note=null;} // Presentation must never interrupt a lethal hit.

  var out=oldKill.apply(this,arguments);
  if(wasAlive&&victim.alive===false){this.__novaDeathInsight=note;this.__novaDeathInsightAttempted=false;}
  return out;
 };
 if(typeof oldUpdate==='function')Game.prototype.update=function(){
  var out=oldUpdate.apply(this,arguments);
  if(!this.__novaDecorativeWorld&&this.status==='dead'&&this.__novaDeathInsight)
   try{mount(this);}catch(ignore){this.__novaDeathInsight=null;}
  return out;
 };
 if(typeof oldRedeploy==='function')Game.prototype.redeploy=function(){
  var out=oldRedeploy.apply(this,arguments);
  try{cleanup(this);}catch(ignore){this.__novaDeathInsight=null;}return out;
 };
};
window.__NOVA_DEATH_INSIGHT_TEST__={choose:choose,paint:paint,cleanup:cleanup};
})();


/* Short-screen evolution access — keep the canonical React class/mastery
 * choices usable on compact phones without changing choices or combat.
 * Gene Splice already has a scroll contract; target only the two modal
 * families whose direct child is a vertical list of selectable cards. */
(function(){
 'use strict';
 if(typeof document==='undefined'||!document.head||!document.createElement)return;
 if(document.getElementById('nova-short-evolution-fit'))return;
 var style=document.createElement('style');
 style.id='nova-short-evolution-fit';
 style.textContent='@media(max-height:620px) and (max-width:700px){'+
  '#root .absolute.inset-0.z-50 > .panel.anim-pop:has(> .mt-3.flex.flex-col.gap-2){'+
  'min-height:0;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px);'+
  'overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;}}';
 document.head.appendChild(style);
})();


/* NOVA TANKS — Between-life front choice.
 * The battlefield persists across redeploy, including breached cover. A
 * player may return to the previous front or use the existing random
 * reposition. Neither option grants stats, information, or invulnerability.
 * The default remains exactly the legacy spawn algorithm. */
(function(){
'use strict';
var mods=window.__novaModules;
if(!mods||!mods['game/engine'])return;
var PI2=Math.PI*2;
function validOrigin(p){
 return !!(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&
  Math.abs(p.x)<=2250&&Math.abs(p.y)<=2250);
}
/* RETURN may revisit a dangerous fight, but it must not materialize inside
 * an existing hull. Only reject immediate physical overlaps; do not read
 * hidden threats to pick a strategically favorable lane or evade combat. */
function returnBodyClear(g,x,y){
 var tanks=g.tanks||[],drones=g.drones||[];
 for(var i=0;i<tanks.length;i++){
  var t=tanks[i];
  if(!t||t.alive===false||(t.hp!=null&&!(t.hp>0))||
     !Number.isFinite(t.x)||!Number.isFinite(t.y))continue;
  var dx=x-t.x,dy=y-t.y;
  if(Math.abs(dx)<64&&Math.abs(dy)<64&&dx*dx+dy*dy<64*64)return false;
 }
 for(var j=0;j<drones.length;j++){
  var d=drones[j];
  if(!d||!(d.hp>0)||!Number.isFinite(d.x)||!Number.isFinite(d.y))continue;
  var ux=x-d.x,uy=y-d.y;
  if(Math.abs(ux)<40&&Math.abs(uy)<40&&ux*ux+uy*uy<40*40)return false;
 }
 return true;
}
function sampleReturn(g,p){
 if(!validOrigin(p)||!g||typeof g.isTerrainSafe!=='function')return null;
 for(var i=0;i<64;i++){
  var a=Math.random()*PI2,r=420+Math.random()*430;
  var x=p.x+Math.cos(a)*r,y=p.y+Math.sin(a)*r;
  if(Math.abs(x)>2050||Math.abs(y)>2050)continue;
  var safe=false;
  try{safe=!!g.isTerrainSafe(x,y,75);}catch(ignore){return null;}
  if(!safe||!returnBodyClear(g,x,y))continue;
  return{x:x,y:y};
 }
 return null;
}
function findPanel(){
 if(typeof document==='undefined'||!document.querySelectorAll)return null;
 var panels=document.querySelectorAll('.panel');
 for(var i=0;i<panels.length;i++){
  var p=panels[i],buttons=p.querySelectorAll('button'),redeploy=null;
  if(!p.textContent||p.textContent.indexOf('TERMINATED')<0)continue;
  for(var j=0;j<buttons.length;j++)
   if((buttons[j].textContent||'').indexOf('REDEPLOY')>=0){redeploy=buttons[j];break;}
  if(redeploy)return{panel:p,before:redeploy};
 }
 return null;
}
function paint(g){
 var target=findPanel();if(!target)return false;
 if(target.panel.querySelector('[data-nova-front-choice]'))return true;
 var row=document.createElement('div');
 row.setAttribute('data-nova-front-choice','');
 row.setAttribute('role','group');
 row.setAttribute('aria-label','Redeploy: fresh front or return near the last position; no stat bonus');
 row.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:'+(window.innerHeight<=400?'4':'10')+'px;min-width:0;';
 function make(choice,caption,detail){
  var b=document.createElement('button');b.type='button';
  b.setAttribute('data-ui','true');
  b.setAttribute('data-nova-insertion',choice);
  b.style.cssText='min-width:0;border:1px solid rgba(125,243,255,.4);border-radius:7px;background:rgba(31,104,136,.24);padding:'+(window.innerHeight<=400?'8':'10')+'px 3px;font:700 12px/1.2 Rajdhani,system-ui;color:#d2deed;touch-action:manipulation;';
  b.textContent=caption;b.title=detail;
  b.addEventListener('click',function(){
   g.__novaRedeployChoice=choice;
   /* Keep React's original redeploy callback authoritative. */
   target.before.click();
  });
  row.appendChild(b);
 }
 make('fresh','⚡ REDEPLOY FRESH','Original random insertion, normally away from the last position.');
 make('return','↩ REDEPLOY RETURN','Re-enter 420–850 world units from the last death, where terrain allows.');
 g.__novaFrontOriginalButton=target.before;
 g.__novaFrontOriginalDisplay=target.before.style?target.before.style.display:'';
 g.__novaFrontOriginalTabIndex=target.before.tabIndex;
 if(target.before.style)target.before.style.display='none';
 target.before.setAttribute('aria-hidden','true');
 target.before.tabIndex=-1;
 target.panel.insertBefore(row,target.before);
 return true;
}
function cleanup(g){
 if(g.__novaFrontObserver){g.__novaFrontObserver.disconnect();g.__novaFrontObserver=null;}
 if(g.__novaFrontTimer!=null&&typeof clearTimeout==='function'){
  clearTimeout(g.__novaFrontTimer);g.__novaFrontTimer=null;
 }
 var original=g.__novaFrontOriginalButton;
 if(original){
  if(original.style)original.style.display=g.__novaFrontOriginalDisplay||'';
  if(typeof original.removeAttribute==='function')original.removeAttribute('aria-hidden');
  if(g.__novaFrontOriginalTabIndex!=null)original.tabIndex=g.__novaFrontOriginalTabIndex;
 }
 g.__novaFrontOriginalButton=null;
 if(typeof document!=='undefined'&&document.querySelector){
  var node=document.querySelector('[data-nova-front-choice]');
  if(node&&node.parentNode)node.parentNode.removeChild(node);
 }
 g.__novaFrontMounted=false;
}
function mount(g){
 if(g.__novaFrontMounted)return;
 if(paint(g)){g.__novaFrontMounted=true;return;}
 if(g.__novaFrontObserver||typeof MutationObserver!=='function')return;
 var root=document.getElementById('root')||document.body;if(!root)return;
 var observer=new MutationObserver(function(){
  if(paint(g)){observer.disconnect();g.__novaFrontObserver=null;g.__novaFrontMounted=true;}
 });
 g.__novaFrontObserver=observer;observer.observe(root,{childList:true,subtree:true});
 if(typeof setTimeout==='function')g.__novaFrontTimer=setTimeout(function(){
  if(g.__novaFrontObserver===observer){observer.disconnect();g.__novaFrontObserver=null;}
 },4000);
}
var original=mods['game/engine'];
mods['game/engine']=function(module,exports,require){
 original(module,exports,require);
 var Game=module.exports.Game;
 if(!Game||Game.prototype.__novaFrontChoiceInstalled)return;
 Game.prototype.__novaFrontChoiceInstalled=true;
 var oldKill=Game.prototype.killTank,oldUpdate=Game.prototype.update,
  oldRedeploy=Game.prototype.redeploy,oldRand=Game.prototype.randSpawnPos;
 /* A RETURN player already witnessed this location. A short-lived, fixed
  * minimap waypoint makes the geographic choice usable after the compass
  * toast disappears. It never tracks enemies, neutrals, or a live target. */
 var oldMap=Game.prototype.drawMinimap;
 if(typeof oldMap==='function')Game.prototype.drawMinimap=function(){
  var out=oldMap.apply(this,arguments),m=this.__novaLastFrontMarker;
  if(!m||this.status!=='playing'||!this.player||!this.player.alive)return out;
  if(!validOrigin(m)){this.__novaLastFrontMarker=null;return out;}
  if(!Number.isFinite(this.time)||this.time>=m.until||
     Math.hypot(this.player.x-m.x,this.player.y-m.y)<130){
   this.__novaLastFrontMarker=null;return out;
  }
  var ctx=this.mmCtx;
  if(!ctx||typeof ctx.save!=='function')return out;
  /* Same 216px / +/-2250 projection as the canonical minimap. */
  var x=(m.x+2250)*216/4500,y=(m.y+2250)*216/4500;
  if(!Number.isFinite(x)||!Number.isFinite(y))return out;
  /* Edge deaths still get a partially clipped, honest-position marker. */
  ctx.save();
  try{
   ctx.strokeStyle='#ffd166';ctx.lineWidth=2;
   ctx.beginPath();ctx.arc(x,y,6,0,PI2);ctx.stroke();
   ctx.beginPath();ctx.moveTo(x-9,y);ctx.lineTo(x-4,y);
   ctx.moveTo(x+4,y);ctx.lineTo(x+9,y);
   ctx.moveTo(x,y-9);ctx.lineTo(x,y-4);
   ctx.moveTo(x,y+4);ctx.lineTo(x,y+9);ctx.stroke();
  }finally{ctx.restore();}
  return out;
 };
 if(typeof oldKill==='function')Game.prototype.killTank=function(victim,killer){
  var player=!!(!this.__novaDecorativeWorld&&victim&&victim.isPlayer&&victim.alive!==false);
  var pos=player?{x:victim.x,y:victim.y}:null;
  var out=oldKill.apply(this,arguments);
  if(player&&victim.alive===false)this.__novaLastFrontMarker=null;
  if(player&&victim.alive===false&&validOrigin(pos)){
   this.__novaRedeployOrigin=pos;
   this.__novaRedeployChoice='fresh';
   this.__novaFrontMounted=false;
  }
  return out;
 };
 if(typeof oldUpdate==='function')Game.prototype.update=function(){
  var out=oldUpdate.apply(this,arguments);
  if(!this.__novaDecorativeWorld&&this.status==='dead'&&validOrigin(this.__novaRedeployOrigin))
   try{mount(this);}catch(ignore){cleanup(this);}
  return out;
 };
 if(typeof oldRand==='function')Game.prototype.randSpawnPos=function(minDist){
  if(this.__novaFrontSpawnArmed&&minDist===900){
   this.__novaFrontSpawnArmed=false;
   var near=sampleReturn(this,this.__novaRedeployOrigin);
   if(near){this.__novaFrontReturnAccepted=true;return near;}
  }
  return oldRand.apply(this,arguments);
 };
 if(typeof oldRedeploy==='function')Game.prototype.redeploy=function(){
  var returning=this.__novaRedeployChoice==='return'&&validOrigin(this.__novaRedeployOrigin);
  var origin=returning?{x:this.__novaRedeployOrigin.x,y:this.__novaRedeployOrigin.y}:null;
  this.__novaFrontSpawnArmed=returning;
  this.__novaFrontReturnAccepted=false;
  try{
   var out=oldRedeploy.apply(this,arguments);
   this.__novaLastFrontMarker=returning&&this.__novaFrontReturnAccepted&&
    this.status==='playing'&&origin?
    {x:origin.x,y:origin.y,until:this.time+24}:null;
   /* A return can fall back to the legacy random spawn. Never silently
    * misrepresent it as a successful return; on success orient the player
    * using only the death location they already witnessed. */
   if(returning&&this.status==='playing'&&this.player&&typeof this.toast==='function'){
    try{
     if(this.__novaFrontReturnAccepted){
      var a=Math.atan2(origin.y-this.player.y,origin.x-this.player.x);
      var directions=['E','SE','S','SW','W','NW','N','NE'];
      var bearing=directions[(Math.round(a/(Math.PI/4))+8)%8];
      this.toast('↩ RETURN · LAST FRONT '+bearing,'info');
     }else this.toast('↩ RETURN UNAVAILABLE · FRESH FRONT','info');
    }catch(ignore){} // Presentation cannot block a successful redeploy.
   }
   return out;
  }finally{
   this.__novaFrontSpawnArmed=false;
   this.__novaFrontReturnAccepted=false;
   cleanup(this);
   this.__novaRedeployOrigin=null;
   this.__novaRedeployChoice='fresh';
  }
 };
};
window.__NOVA_FRONT_CHOICE_TEST__={sampleReturn:sampleReturn,validOrigin:validOrigin,paint:paint,cleanup:cleanup};
})();
