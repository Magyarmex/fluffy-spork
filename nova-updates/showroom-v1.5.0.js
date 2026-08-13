/* NOVA TANKS v1.5.0 — Blackglass Showroom
 * Animated lobby tank library, full inspection dossiers, real class stats,
 * lineage navigation, and per-build foreign gene-graft simulation.
 */
(function(){
'use strict';

var VERSION='1.5.0';
var CODENAME='Blackglass Showroom';
var req=window.__novaMakeRequire;
if(!req){console.error('[NOVA v1.5.0] module runtime unavailable');return;}
var classes;
try{classes=req('showroom')('./game/classes');}catch(e){console.error('[NOVA v1.5.0] class registry unavailable',e);return;}
var CLASSES=classes.CLASSES||{};
var GENES=classes.GENES||{};
var ABILITIES=classes.ABILITIES||{};
var GENE_OPTIONS=classes.GENE_OPTIONS||[];
var ALL_IDS=Object.keys(CLASSES);

window.__NOVA_SHOWROOM_RELEASE__={version:VERSION,codename:CODENAME,date:'2026-08-08',headline:'The Evolution Tree becomes a living tank intelligence archive.'};

var CATCH={
 scout:'Speed is a weapon before it becomes a stat.',
 twin:'Two barrels. No wasted angles.',
 cannon:'Every problem has a blast radius.',
 marksman:'You were in range before you knew it.',
 carrier:'The swarm arrives before I do.',
 guard:'Come break yourself on me.',
 minigun:'The answer is more metal.',
 shotgun:'Step closer. I insist.',
 bomber:'The first explosion is only the invitation.',
 demolisher:'One shell. New geography.',
 railgun:'I only need one clean line.',
 ghost:'If you saw me, I already moved.',
 overlord:'You are not fighting one tank.',
 warden:'Advance behind me or die ahead of me.',
 fortress:'The map moves around me.',
 juggernaut:'There is no such thing as through me.',
 tempest:'Weather warning: bullets.',
 needlestorm:'Precision, at industrial scale.',
 breachlord:'Doors are suggestions.',
 flakmaster:'Distance will not save you.',
 clusterking:'One shell. Ten consequences.',
 siegebomber:'Fortifications are just coordinates.',
 annihilator:'Arguments end in craters.',
 quake:'Every shot moves the front line.',
 singularity:'The horizon is my barrel.',
 prism:'Two lines. No second chance.',
 specter:'Catch the shadow if you can.',
 assassin:'You get one mistake.',
 hivemind:'I stopped counting bodies.',
 broodmother:'The swarm grows from your panic.',
 citadel:'Bring an army. I brought walls.',
 valkyrie:'The formation is already behind you.',
 bastion:'Immovable was only the prototype.',
 aegis:'Nothing reaches the core for free.',
 meteor:'I am the projectile.',
 ravager:'Run. I prefer moving targets.'
};

var LINEAGE={
 origin:{name:'ORIGIN',color:'#dce9ff',icon:'◇'},
 gunner:{name:'GUNNER',color:'#4de3ff',icon:'≣'},
 cannon:{name:'CANNON',color:'#ffb45e',icon:'☢'},
 sniper:{name:'SNIPER',color:'#b06bff',icon:'⌖'},
 controller:{name:'CONTROLLER',color:'#54e38a',icon:'❖'},
 guardian:{name:'GUARDIAN',color:'#ff6ea9',icon:'⬢'}
};

var state={open:false,selected:'scout',filter:'all',gene:null,host:null,panel:null,canvas:null,aim:null,raf:0};

function lineageOf(id){
 if(id==='scout')return 'origin';
 try{return classes.lineageForClass(id)||'origin';}catch(_){return 'origin';}
}
function tierName(c){return c.tier===3?'APEX':c.tier===2?'ULTIMATE':c.tier===1?'LINEAGE':'ORIGIN';}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}
function fmt(n,d){return Number(n).toFixed(d==null?(Math.abs(n)<10?2:0):d).replace(/\.00$/,'');}
function hexRgba(hex,a){if(!/^#[0-9a-f]{6}$/i.test(hex))return 'rgba(125,243,255,'+a+')';var n=parseInt(hex.slice(1),16);return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';}

var maxima=(function(){
 var m={damage:1,speed:1,range:1,cadence:1,hp:1,mobility:1,body:1,drones:1,pen:1};
 ALL_IDS.forEach(function(id){var c=CLASSES[id],b=c.bullet||{},ttl=b.ttl==null?1.05:b.ttl;m.damage=Math.max(m.damage,b.dmg||0);m.speed=Math.max(m.speed,b.speed||0);m.range=Math.max(m.range,(b.speed||0)*ttl);m.cadence=Math.max(m.cadence,1/Math.max(.03,b.reload||1));m.hp=Math.max(m.hp,c.hpMult||1);m.mobility=Math.max(m.mobility,c.moveMult||1);m.body=Math.max(m.body,c.bodyMult||1);m.drones=Math.max(m.drones,c.droneCount||0);m.pen=Math.max(m.pen,b.pen||0);});
 return m;
})();

function css(){
 if(document.getElementById('nova-showroom-css'))return;
 var s=document.createElement('style');s.id='nova-showroom-css';s.textContent=`
.nvs-host{transition:width .28s ease,transform .28s ease}.nvs-host.nvs-open{position:relative;left:50%;width:min(1040px,calc(100vw - 18px))!important;max-width:none!important;transform:translateX(-50%)}
.nvs-launch{width:100%;margin-top:9px;padding:10px 12px;border:1px solid #79ddff45;border-radius:13px;background:linear-gradient(135deg,#4de3ff16,#b06bff12 55%,#080d1ce8);box-shadow:inset 0 1px #fff0,0 8px 30px #0004;color:#dff8ff;text-align:left;display:flex;align-items:center;gap:10px;cursor:pointer;touch-action:manipulation}.nvs-launch:active{transform:scale(.99)}.nvs-launch-icon{width:34px;height:34px;border:1px solid #7df3ff66;border-radius:10px;display:grid;place-items:center;color:#7df3ff;background:#4de3ff0d;box-shadow:0 0 18px #4de3ff22;font-size:18px}.nvs-launch-copy{min-width:0;flex:1}.nvs-launch-k{font:900 10px Orbitron,system-ui;letter-spacing:.2em;color:#9beeff}.nvs-launch-s{margin-top:3px;font:600 11px Rajdhani,system-ui;color:#8393aa}.nvs-launch-go{font:800 9px Orbitron,system-ui;letter-spacing:.12em;color:#c7b0ff;white-space:nowrap}
.nvs-panel{margin-top:10px;border:1px solid #7dd2ff36;border-radius:18px;background:linear-gradient(160deg,#0d1428f5,#050812fc);box-shadow:0 20px 70px #0009,inset 0 1px #ffffff0a;overflow:hidden;text-align:left}.nvs-head{padding:13px 14px;border-bottom:1px solid #ffffff0d;background:linear-gradient(90deg,#4de3ff0a,#b06bff0d)}.nvs-title{font:900 13px Orbitron,system-ui;letter-spacing:.22em;color:#e7fbff}.nvs-sub{margin-top:4px;font:600 10px Rajdhani,system-ui;color:#78869c}.nvs-filters{display:flex;gap:6px;overflow-x:auto;padding:10px 12px;border-bottom:1px solid #ffffff0b;scrollbar-width:none}.nvs-filters::-webkit-scrollbar{display:none}.nvs-filter{flex:0 0 auto;border:1px solid var(--fc,#ffffff22);border-radius:999px;background:var(--fb,#ffffff08);padding:6px 9px;color:var(--ft,#aab7cc);font:800 8px Orbitron,system-ui;letter-spacing:.12em;cursor:pointer}.nvs-filter.on{box-shadow:0 0 16px var(--fg,#4de3ff22);color:#fff;background:var(--fb2,#4de3ff18)}
.nvs-body{display:grid;grid-template-columns:240px minmax(300px,1fr) 300px;min-height:570px}.nvs-library{border-right:1px solid #ffffff0d;max-height:640px;overflow:auto;padding:10px;overscroll-behavior:contain}.nvs-library-h{padding:2px 4px 8px;font:800 8px Orbitron,system-ui;letter-spacing:.18em;color:#6f8098}.nvs-card{width:100%;display:grid;grid-template-columns:34px 1fr auto;align-items:center;gap:8px;margin-bottom:6px;padding:8px;border:1px solid #ffffff12;border-radius:11px;background:#ffffff05;color:#c9d5e6;text-align:left;cursor:pointer}.nvs-card:hover,.nvs-card.sel{border-color:var(--cc,#7df3ff66);background:var(--cb,#4de3ff12);box-shadow:0 0 18px var(--cg,#4de3ff16)}.nvs-card-icon{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;border:1px solid var(--cc,#7df3ff66);color:var(--cc,#7df3ff);background:#030610;font-size:16px}.nvs-card-name{font:800 9px Orbitron,system-ui;letter-spacing:.06em;color:#eef5ff}.nvs-card-role{margin-top:2px;font:700 9px Rajdhani,system-ui;color:#718096}.nvs-tier{font:800 7px Orbitron,system-ui;letter-spacing:.1em;color:#64748b}
.nvs-stage{position:relative;display:flex;flex-direction:column;min-width:0;padding:12px;border-right:1px solid #ffffff0d;background:radial-gradient(circle at 50% 28%,#4de3ff0d,transparent 48%)}.nvs-stagebar{display:flex;align-items:center;gap:8px}.nvs-lineage{font:800 8px Orbitron,system-ui;letter-spacing:.16em}.nvs-bread{margin-left:auto;font:700 9px Rajdhani,system-ui;color:#68778e}.nvs-canvaswrap{position:relative;margin-top:8px;min-height:300px;flex:1;border:1px solid #ffffff10;border-radius:14px;overflow:hidden;background:#030712}.nvs-canvas{width:100%;height:100%;min-height:300px;display:block}.nvs-stagehint{position:absolute;left:10px;bottom:8px;font:700 8px Orbitron,system-ui;letter-spacing:.12em;color:#6b7990;pointer-events:none}.nvs-name{margin-top:11px;font:900 21px Orbitron,system-ui;letter-spacing:.08em;color:var(--tc,#e7faff);text-shadow:0 0 20px var(--tg,#4de3ff33)}.nvs-quote{margin-top:3px;font:700 italic 13px Rajdhani,system-ui;color:#d4ddea}.nvs-desc{margin-top:6px;font:600 11px/1.35 Rajdhani,system-ui;color:#8f9db1}.nvs-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.nvs-tag{border:1px solid #ffffff14;border-radius:999px;padding:4px 7px;background:#ffffff06;color:#9cacbf;font:800 8px Orbitron,system-ui;letter-spacing:.09em}
.nvs-intel{max-height:640px;overflow:auto;padding:12px;overscroll-behavior:contain}.nvs-section{font:900 9px Orbitron,system-ui;letter-spacing:.2em;color:#8feaff}.nvs-stat{margin-top:8px}.nvs-stat-top{display:flex;justify-content:space-between;gap:8px;font:700 9px Rajdhani,system-ui}.nvs-stat-l{color:#aab8ca}.nvs-stat-v{color:#e6f2ff;font-weight:800}.nvs-bar{margin-top:3px;height:5px;border-radius:999px;background:#ffffff0c;overflow:hidden}.nvs-bar>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,var(--bc,#4de3ff),#e3f8ff);box-shadow:0 0 9px var(--bc,#4de3ff)}.nvs-ability{margin-top:11px;padding:9px;border:1px solid #ffffff11;border-radius:10px;background:#ffffff05}.nvs-ability-k{font:800 8px Orbitron,system-ui;letter-spacing:.15em;color:#718198}.nvs-ability-n{margin-top:3px;font:800 11px Rajdhani,system-ui;color:#d7e3f2}.nvs-graft{margin-top:14px;padding-top:12px;border-top:1px solid #ffffff10}.nvs-gene-row{display:flex;gap:5px;overflow-x:auto;margin-top:8px;padding-bottom:2px;scrollbar-width:none}.nvs-gene-row::-webkit-scrollbar{display:none}.nvs-gene{flex:0 0 auto;width:39px;height:34px;border:1px solid var(--gc);border-radius:9px;background:var(--gb);color:var(--gc);font-size:15px;cursor:pointer}.nvs-gene.on{box-shadow:0 0 15px var(--gg);background:var(--gb2)}.nvs-gene-name{margin-top:8px;font:900 10px Orbitron,system-ui;letter-spacing:.1em;color:var(--gc,#d5b9ff)}.nvs-gene-desc{margin-top:4px;font:600 10px/1.3 Rajdhani,system-ui;color:#a5b2c4}.nvs-deltas{display:grid;gap:5px;margin-top:8px}.nvs-delta{display:flex;justify-content:space-between;gap:8px;padding:5px 7px;border:1px solid #ffffff0c;border-radius:8px;background:#0003;font:700 9px Rajdhani,system-ui}.nvs-delta span:first-child{color:#8796aa}.nvs-delta span:last-child{color:#e7f1ff;text-align:right}.nvs-trade{margin-top:7px;color:#dc9ba8;font:700 9px Rajdhani,system-ui}.nvs-note{margin-top:8px;color:#627086;font:600 8px/1.25 Rajdhani,system-ui}
@media(max-width:860px){.nvs-body{grid-template-columns:190px minmax(280px,1fr) 270px}.nvs-host.nvs-open{width:min(900px,calc(100vw - 12px))!important}}
@media(max-width:720px){.nvs-host.nvs-open{width:calc(100vw - 10px)!important}.nvs-body{display:flex;flex-direction:column;min-height:0}.nvs-library{order:1;max-height:none;border-right:0;border-bottom:1px solid #ffffff0d;display:flex;gap:6px;overflow-x:auto;padding:9px}.nvs-library-h{display:none}.nvs-card{flex:0 0 142px;margin:0;grid-template-columns:30px 1fr;padding:7px}.nvs-card-icon{width:30px;height:30px}.nvs-tier{display:none}.nvs-stage{order:2;border-right:0;border-bottom:1px solid #ffffff0d;padding:10px}.nvs-canvaswrap{min-height:260px}.nvs-canvas{min-height:260px}.nvs-intel{order:3;max-height:none;padding:11px}.nvs-name{font-size:18px}.nvs-launch-s{display:none}}
`;
 document.head.appendChild(s);
}

function pathFor(id){
 var out=[],cur=id,guard=0;
 while(cur&&CLASSES[cur]&&guard++<6){out.unshift(CLASSES[cur].name);cur=CLASSES[cur].parent;}
 return out.join(' › ');
}
function signature(c){
 var b=c.bullet||{},bits=[];
 if(c.fireMode==='beam')bits.push('HYPERVELOCITY BEAM');
 else if(c.fireMode==='minigun')bits.push('ROTARY FIRE');
 else if(c.fireMode==='shotgun')bits.push('PELLET BURST');
 else if(c.fireMode==='shell')bits.push('CLUSTER SHELL');
 else if(c.fireMode==='twin')bits.push('DUAL GUN');
 else bits.push('PRECISION GUN');
 if(b.splash)bits.push('SPLASH '+Math.round(b.splash));
 if((c.droneCount||0)>0)bits.push((c.droneCount||0)+' DRONE'+((c.droneCount||0)===1?'':'S'));
 if(c.aura)bits.push('AURA '+Math.round(c.aura*100)+'%');
 if(c.ability&&ABILITIES[c.ability])bits.push(ABILITIES[c.ability].name);
 return bits;
}

function statData(id){
 var c=CLASSES[id],b=c.bullet||{},ttl=b.ttl==null?1.05:b.ttl;
 return [
  ['DAMAGE',b.dmg||0,maxima.damage,fmt(b.dmg||0,1)],
  ['PROJECTILE SPEED',b.speed||0,maxima.speed,Math.round(b.speed||0)+' u/s'],
  ['EFFECTIVE RANGE',(b.speed||0)*ttl,maxima.range,Math.round((b.speed||0)*ttl)+' u'],
  ['FIRE CADENCE',1/Math.max(.03,b.reload||1),maxima.cadence,fmt(b.reload||0,2)+' s reload'],
  ['PENETRATION',b.pen||0,maxima.pen,String(b.pen||0)],
  ['HULL HP',c.hpMult||1,maxima.hp,fmt(c.hpMult||1,2)+'×'],
  ['MOBILITY',c.moveMult||1,maxima.mobility,fmt(c.moveMult||1,2)+'×'],
  ['BODY DAMAGE',c.bodyMult||1,maxima.body,fmt(c.bodyMult||1,2)+'×'],
  ['DRONE PRESENCE',c.droneCount||0,maxima.drones,String(c.droneCount||0)]
 ];
}

function graftDeltas(id,gid){
 var c=CLASSES[id],b=c.bullet||{},g=GENES[gid],out=[];
 if(!g)return out;
 if(gid==='gunner'){
  out.push(['ECHO ROUND','+'+fmt((b.dmg||0)*.45,1)+' dmg / trigger']);
  out.push(['RELOAD',fmt(b.reload||0,2)+' → '+fmt((b.reload||0)*1.08,2)+' s']);
 }else if(gid==='cannon'){
  out.push(['SPLASH RADIUS',Math.round(b.splash||0)+' → '+Math.round(Math.max(b.splash||0,62))]);
  out.push(['SPLASH FRACTION',Math.round((b.splashDmg||0)*100)+'% → '+Math.round(Math.max(b.splashDmg||0,.28)*100)+'%']);
  out.push(['KNOCKBACK',Math.round(b.knock||0)+' → '+Math.round(Math.max(b.knock||0,90))]);
  out.push(['RELOAD',fmt(b.reload||0,2)+' → '+fmt((b.reload||0)*1.10,2)+' s']);
 }else if(gid==='sniper'){
  var ttl=b.ttl==null?1.05:b.ttl;
  out.push(['DAMAGE',fmt(b.dmg||0,1)+' → '+fmt((b.dmg||0)*1.10,1)]);
  out.push(['PROJECTILE SPEED',Math.round(b.speed||0)+' → '+Math.round((b.speed||0)*1.35)]);
  out.push(['PENETRATION',(b.pen||0)+' → '+((b.pen||0)+1)]);
  out.push(['RANGE',Math.round((b.speed||0)*ttl)+' → '+Math.round((b.speed||0)*ttl*1.35)]);
  out.push(['RELOAD',fmt(b.reload||0,2)+' → '+fmt((b.reload||0)*1.08,2)+' s']);
 }else if(gid==='controller'){
  out.push(['HUNTER DRONES',(c.droneCount||0)+' base + 2 roaming hunters']);
  out.push(['ROLE','Adds autonomous pursuit pressure']);
 }else if(gid==='guardian'){
  out.push(['MAX HP',fmt(c.hpMult||1,2)+'× → '+fmt((c.hpMult||1)*1.22,2)+'× class scale']);
  out.push(['BODY DAMAGE',fmt(c.bodyMult||1,2)+'× → '+fmt((c.bodyMult||1)*1.35,2)+'×']);
  out.push(['MOBILITY',fmt(c.moveMult||1,2)+'× → '+fmt((c.moveMult||1)*.93,2)+'×']);
  out.push(['DAMAGE TAKEN','100% → 90%']);
 }
 return out;
}

function filterIds(){
 if(state.filter==='all')return ALL_IDS;
 if(state.filter==='origin')return ALL_IDS.filter(function(id){return id==='scout';});
 return ALL_IDS.filter(function(id){return lineageOf(id)===state.filter;});
}

function renderFilters(){
 var el=state.panel&&state.panel.querySelector('.nvs-filters');if(!el)return;
 var ids=['all','gunner','cannon','sniper','controller','guardian'];
 el.innerHTML='';ids.forEach(function(id){var meta=id==='all'?{name:'ALL 36',color:'#7df3ff',icon:'◈'}:LINEAGE[id];var b=document.createElement('button');b.className='nvs-filter'+(state.filter===id?' on':'');b.textContent=meta.icon+' '+meta.name;b.style.setProperty('--fc',hexRgba(meta.color,.35));b.style.setProperty('--fb',hexRgba(meta.color,.05));b.style.setProperty('--fb2',hexRgba(meta.color,.16));b.style.setProperty('--ft',meta.color);b.style.setProperty('--fg',hexRgba(meta.color,.28));b.onclick=function(){state.filter=id;var ids2=filterIds();if(ids2.indexOf(state.selected)<0)state.selected=ids2[0]||'scout';state.gene=null;renderAll();};el.appendChild(b);});
}

function renderLibrary(){
 var el=state.panel&&state.panel.querySelector('.nvs-library');if(!el)return;
 var ids=filterIds();el.innerHTML='<div class="nvs-library-h">'+ids.length+' DOSSIERS · SELECT A TANK</div>';
 ids.forEach(function(id){var c=CLASSES[id],lin=LINEAGE[lineageOf(id)]||LINEAGE.origin,b=document.createElement('button');b.className='nvs-card'+(state.selected===id?' sel':'');b.style.setProperty('--cc',lin.color);b.style.setProperty('--cb',hexRgba(lin.color,.10));b.style.setProperty('--cg',hexRgba(lin.color,.14));b.innerHTML='<span class="nvs-card-icon">'+esc(c.icon)+'</span><span><span class="nvs-card-name">'+esc(c.name.toUpperCase())+'</span><span class="nvs-card-role">'+esc(signature(c).slice(0,2).join(' · '))+'</span></span><span class="nvs-tier">'+tierName(c)+'</span>';b.onclick=function(){state.selected=id;state.gene=null;renderAll();};el.appendChild(b);});
}

function renderStage(){
 var c=CLASSES[state.selected];if(!c)return;var lin=LINEAGE[lineageOf(state.selected)]||LINEAGE.origin;
 var stage=state.panel.querySelector('.nvs-stage');stage.style.setProperty('--tc',lin.color);stage.style.setProperty('--tg',hexRgba(lin.color,.35));
 stage.querySelector('.nvs-lineage').textContent=lin.icon+' '+lin.name+' · '+tierName(c);
 stage.querySelector('.nvs-lineage').style.color=lin.color;
 stage.querySelector('.nvs-bread').textContent=pathFor(state.selected);
 stage.querySelector('.nvs-name').textContent=c.name.toUpperCase();
 stage.querySelector('.nvs-quote').textContent='“'+(CATCH[state.selected]||'Built to evolve. Built to survive.')+'”';
 stage.querySelector('.nvs-desc').textContent=c.desc||'';
 var tags=stage.querySelector('.nvs-tags');tags.innerHTML='';signature(c).forEach(function(t){var x=document.createElement('span');x.className='nvs-tag';x.textContent=t;tags.appendChild(x);});
 state.canvas=stage.querySelector('.nvs-canvas');
}

function renderIntel(){
 var c=CLASSES[state.selected],lin=LINEAGE[lineageOf(state.selected)]||LINEAGE.origin,el=state.panel.querySelector('.nvs-intel');if(!c||!el)return;
 el.innerHTML='<div class="nvs-section">COMBAT TELEMETRY</div><div class="nvs-stats"></div><div class="nvs-ability"></div><div class="nvs-graft"><div class="nvs-section">FOREIGN TRAIT GRAFT LAB</div><div class="nvs-note">Preview how a level-35 foreign lineage gene changes this exact base class definition. Level/stat/perk scaling stacks separately in a live run.</div><div class="nvs-gene-row"></div><div class="nvs-gene-detail"></div></div>';
 var stats=el.querySelector('.nvs-stats');statData(state.selected).forEach(function(r){var p=Math.max(0,Math.min(100,r[1]/r[2]*100)),d=document.createElement('div');d.className='nvs-stat';d.innerHTML='<div class="nvs-stat-top"><span class="nvs-stat-l">'+esc(r[0])+'</span><span class="nvs-stat-v">'+esc(r[3])+'</span></div><div class="nvs-bar"><i style="width:'+p+'%;--bc:'+lin.color+'"></i></div>';stats.appendChild(d);});
 var ab=el.querySelector('.nvs-ability');if(c.ability&&ABILITIES[c.ability]){var a=ABILITIES[c.ability];ab.innerHTML='<div class="nvs-ability-k">ULTIMATE ABILITY</div><div class="nvs-ability-n">'+esc(a.icon)+' '+esc(a.name)+' · '+esc(a.desc)+' · '+fmt(a.cd,1)+'s cooldown</div>';}else ab.innerHTML='<div class="nvs-ability-k">ULTIMATE ABILITY</div><div class="nvs-ability-n">No dedicated ultimate on this chassis yet.</div>';
 renderGenes();
}

function renderGenes(){
 var c=CLASSES[state.selected],own=lineageOf(state.selected),row=state.panel.querySelector('.nvs-gene-row'),detail=state.panel.querySelector('.nvs-gene-detail');if(!c||!row||!detail)return;
 var opts=GENE_OPTIONS.filter(function(g){return own==='origin'||g!==own;});
 if(!state.gene||opts.indexOf(state.gene)<0)state.gene=opts[0]||null;
 row.innerHTML='';opts.forEach(function(id){var g=GENES[id],b=document.createElement('button');b.className='nvs-gene'+(state.gene===id?' on':'');b.title=g.name;b.textContent=g.icon;b.style.setProperty('--gc',g.color);b.style.setProperty('--gb',hexRgba(g.color,.06));b.style.setProperty('--gb2',hexRgba(g.color,.16));b.style.setProperty('--gg',hexRgba(g.color,.34));b.onclick=function(){state.gene=id;renderGenes();};row.appendChild(b);});
 if(!state.gene){detail.innerHTML='<div class="nvs-note">No foreign graft available.</div>';return;}
 var g=GENES[state.gene],ds=graftDeltas(state.selected,state.gene);detail.style.setProperty('--gc',g.color);detail.innerHTML='<div class="nvs-gene-name">'+esc(g.icon)+' '+esc(g.name.toUpperCase())+'</div><div class="nvs-gene-desc">'+esc(g.desc)+'</div><div class="nvs-deltas">'+ds.map(function(x){return '<div class="nvs-delta"><span>'+esc(x[0])+'</span><span>'+esc(x[1])+'</span></div>';}).join('')+'</div><div class="nvs-trade">TRADEOFF · '+esc(g.tradeoff)+'</div>'+(own==='origin'?'<div class="nvs-note">Scout is pre-lineage, so this is a sandbox preview; normal runs graft only after committing to a lineage.</div>':'');
}

function renderAll(){if(!state.panel)return;renderFilters();renderLibrary();renderStage();renderIntel();}

function buildPanel(host){
 var p=document.createElement('section');p.className='nvs-panel';p.innerHTML='<div class="nvs-head"><div class="nvs-title">BLACKGLASS TANK INTELLIGENCE</div><div class="nvs-sub">Animated armory · complete evolution archive · live class telemetry · foreign-gene simulator</div></div><div class="nvs-filters"></div><div class="nvs-body"><div class="nvs-library"></div><div class="nvs-stage"><div class="nvs-stagebar"><span class="nvs-lineage"></span><span class="nvs-bread"></span></div><div class="nvs-canvaswrap"><canvas class="nvs-canvas"></canvas><div class="nvs-stagehint">MOVE POINTER TO STEER THE DISPLAY TURRET</div></div><div class="nvs-name"></div><div class="nvs-quote"></div><div class="nvs-desc"></div><div class="nvs-tags"></div></div><aside class="nvs-intel"></aside></div>';
 host.appendChild(p);state.panel=p;
 var cv=p.querySelector('.nvs-canvas');cv.addEventListener('pointermove',function(e){var r=cv.getBoundingClientRect();state.aim={x:(e.clientX-r.left)/Math.max(1,r.width),y:(e.clientY-r.top)/Math.max(1,r.height)};});cv.addEventListener('pointerleave',function(){state.aim=null;});
 renderAll();
}

function toggle(host,button){
 state.open=!state.open;state.host=host;host.classList.toggle('nvs-open',state.open);button.querySelector('.nvs-launch-go').textContent=state.open?'COLLAPSE ▲':'OPEN INTELLIGENCE BAY →';
 if(state.open){if(!state.panel||!state.panel.isConnected)buildPanel(host);else state.panel.style.display='block';requestAnimationFrame(function(){state.panel&&state.panel.scrollIntoView({behavior:'smooth',block:'nearest'});});startAnim();}
 else{if(state.panel)state.panel.style.display='none';state.aim=null;}
}

function enhance(){
 css();var menu=document.querySelector('#root .menu-grid-bg');if(!menu){state.open=false;state.host=null;state.panel=null;return;}
 var divs=menu.querySelectorAll('div'),head=null;for(var i=0;i<divs.length;i++){if((divs[i].textContent||'').trim()==='— EVOLUTION TREE —'){head=divs[i];break;}}
 if(!head)return;var host=head.parentElement;if(!host||host.dataset.nvsEnhanced)return;host.dataset.nvsEnhanced='1';host.classList.add('nvs-host');head.textContent='— TANK INTELLIGENCE · SHOWROOM —';
 var launch=document.createElement('button');launch.className='nvs-launch';launch.innerHTML='<span class="nvs-launch-icon">⌬</span><span class="nvs-launch-copy"><span class="nvs-launch-k">BLACKGLASS ARCHIVE</span><span class="nvs-launch-s">Inspect every chassis, evolution, weapon profile and foreign gene graft.</span></span><span class="nvs-launch-go">OPEN INTELLIGENCE BAY →</span>';launch.onclick=function(){toggle(host,launch);};host.appendChild(launch);
}

function roundedRect(ctx,x,y,w,h,r){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();}
function drawTank(now){
 if(!state.open||!state.canvas||!state.canvas.isConnected)return;
 var cv=state.canvas,rect=cv.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1),w=Math.max(250,Math.floor(rect.width)),h=Math.max(240,Math.floor(rect.height));if(cv.width!==Math.floor(w*dpr)||cv.height!==Math.floor(h*dpr)){cv.width=Math.floor(w*dpr);cv.height=Math.floor(h*dpr);}var x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,w,h);
 var c=CLASSES[state.selected]||CLASSES.scout,b=c.bullet||{},lin=LINEAGE[lineageOf(state.selected)]||LINEAGE.origin,t=now/1000,cx=w*.5,cy=h*.46;
 var bg=x.createRadialGradient(cx,cy,20,cx,cy,Math.max(w,h)*.7);bg.addColorStop(0,hexRgba(lin.color,.12));bg.addColorStop(.55,'rgba(5,11,23,.78)');bg.addColorStop(1,'rgba(2,5,12,1)');x.fillStyle=bg;x.fillRect(0,0,w,h);
 x.strokeStyle='rgba(120,190,255,.055)';x.lineWidth=1;var off=(t*12)%28;for(var gx=-28+off;gx<w+28;gx+=28){x.beginPath();x.moveTo(gx,0);x.lineTo(gx,h);x.stroke();}for(var gy=-28+off;gy<h+28;gy+=28){x.beginPath();x.moveTo(0,gy);x.lineTo(w,gy);x.stroke();}
 x.save();x.translate(cx,cy);var hullA=Math.sin(t*.45)*.05;x.rotate(hullA);var size=Math.max(48,(c.size||14)*4.2);x.shadowBlur=28;x.shadowColor=hexRgba(lin.color,.42);x.fillStyle='#09101f';x.strokeStyle=lin.color;x.lineWidth=2.2;x.beginPath();for(var k=0;k<8;k++){var aa=Math.PI/8+k*Math.PI/4,rr=size*(k%2?1:.94),px=Math.cos(aa)*rr,py=Math.sin(aa)*rr;if(k===0)x.moveTo(px,py);else x.lineTo(px,py);}x.closePath();x.fill();x.stroke();x.shadowBlur=0;x.strokeStyle=hexRgba(lin.color,.25);x.lineWidth=5;x.beginPath();x.arc(0,0,size*.72,0,Math.PI*2);x.stroke();
 var aimA=state.aim?Math.atan2((state.aim.y-.46)*h,(state.aim.x-.5)*w)-hullA:Math.sin(t*.72)*.62-hullA;x.rotate(aimA);var barrels=c.barrels||[{off:0,len:24,w:6,x:0,y:0}];barrels.forEach(function(br){x.save();x.rotate(br.off||0);x.translate(0,br.x||0);var len=(br.len||24)*2.35,bw=Math.max(7,(br.w||6)*1.7);x.fillStyle='#101b31';x.strokeStyle=lin.color;x.lineWidth=1.5;roundedRect(x,size*.28,-bw/2,len,bw,bw*.35);x.fill();x.stroke();x.restore();});
 x.fillStyle='#111c34';x.strokeStyle=lin.color;x.lineWidth=2;x.beginPath();x.arc(0,0,size*.42,0,Math.PI*2);x.fill();x.stroke();x.fillStyle=lin.color;x.globalAlpha=.9;x.font='700 '+Math.max(18,size*.34)+'px Orbitron,system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(c.icon||'◇',0,1);x.globalAlpha=1;
 var cycle=Math.max(.42,Math.min(2.1,(b.reload||.7)*1.45)),phase=(t%cycle)/cycle;if(phase<.72){var prog=phase/.72,ang=0,dist=size*.55+(b.speed||400)/10*prog;if(c.fireMode==='beam'){var grad=x.createLinearGradient(size*.6,0,Math.min(w*.42,dist),0);grad.addColorStop(0,'#fff');grad.addColorStop(.25,lin.color);grad.addColorStop(1,'rgba(255,255,255,0)');x.strokeStyle=grad;x.lineWidth=Math.max(2,(b.r||4)*.7);x.beginPath();x.moveTo(size*.6,0);x.lineTo(Math.min(w*.42,dist),0);x.stroke();}else if(c.fireMode==='shotgun'){for(var sp=-2;sp<=2;sp++){x.save();x.rotate(sp*.055);x.fillStyle=sp===0?'#fff':lin.color;x.shadowBlur=10;x.shadowColor=lin.color;x.beginPath();x.arc(Math.min(w*.4,dist),0,Math.max(2,(b.r||4)*.45),0,Math.PI*2);x.fill();x.restore();}}else{x.fillStyle=c.fireMode==='shell'?'#ffd9a0':'#fff';x.shadowBlur=14;x.shadowColor=lin.color;x.beginPath();x.arc(Math.min(w*.42,dist),0,Math.max(2.5,(b.r||4)*.65),0,Math.PI*2);x.fill();x.shadowBlur=0;}}
 x.restore();
 var dc=Math.min(10,c.droneCount||0);for(var d=0;d<dc;d++){var da=t*(lineageOf(state.selected)==='controller'?1.15:.72)+(d/Math.max(1,dc))*Math.PI*2,rad=size*(1.45+(d%2)*.12),dx=cx+Math.cos(da)*rad,dy=cy+Math.sin(da)*rad*.62;x.save();x.translate(dx,dy);x.rotate(da+Math.PI/2);x.fillStyle='#07101b';x.strokeStyle=d===0&&lineageOf(state.selected)==='sniper'?'#efe4ff':lin.color;x.lineWidth=d===0&&lineageOf(state.selected)==='sniper'?2:1.2;x.beginPath();x.moveTo(0,-8);x.lineTo(7,6);x.lineTo(-7,6);x.closePath();x.fill();x.stroke();if(d===0&&lineageOf(state.selected)==='sniper'){x.strokeStyle=hexRgba(lin.color,.16);x.beginPath();x.moveTo(0,-7);x.arc(0,-7,42,da-.45,da+.45);x.closePath();x.stroke();}x.restore();}
 x.fillStyle='rgba(220,235,255,.45)';x.font='700 9px Orbitron,system-ui';x.textAlign='center';x.fillText('LIVE CHASSIS SIMULATION · '+tierName(c),cx,h-16);
}
function startAnim(){if(state.raf)return;function frame(t){state.raf=0;if(state.open){drawTank(t);state.raf=requestAnimationFrame(frame);}}state.raf=requestAnimationFrame(frame);}

function start(){css();enhance();var root=document.getElementById('root');if(root){var queued=false;new MutationObserver(function(){if(queued)return;queued=true;requestAnimationFrame(function(){queued=false;enhance();});}).observe(root,{childList:true,subtree:true});}document.addEventListener('keydown',function(e){if(e.key==='Escape'&&state.open&&state.host){var b=state.host.querySelector('.nvs-launch');if(b)toggle(state.host,b);}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
