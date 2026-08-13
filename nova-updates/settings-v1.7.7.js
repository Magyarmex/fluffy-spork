/* NOVA TANKS v1.7.7 — Pilot Console
 * Mid-game player settings for control feel and presentation only.
 *
 * Fair-play contract:
 * - no aim assist, targeting, FOV/zoom, enemy visibility, hitbox, damage,
 *   speed, cooldown, fire-rate, evolution, or AI state is exposed;
 * - touch sensitivity changes stick response before the game's existing clamp;
 * - stick size/opacity and camera shake are presentation-only;
 * - opening the console pauses the current run and safely restores its prior
 *   pause state when the console closes.
 */
(function(){
'use strict';

var mods=window.__novaModules;
if(!mods){console.error('[NOVA v1.7.7] module registry unavailable');return;}
if(window.__NOVA_PILOT_CONSOLE__)return;

var VERSION='1.7.7', CODENAME='Pilot Console';
var STORAGE_KEY='novatanks_pilot_settings_v1';
var DEFAULTS={aimSensitivity:100,moveSensitivity:100,stickSize:100,stickOpacity:82,screenShake:100};
var state=loadSettings();
var activeGame=null;
var gearButton=null;
var overlay=null;
var resumeAfterClose=false;
var refreshers=[];

window.__NOVA_PILOT_CONSOLE__={
  version:VERSION,codename:CODENAME,date:'2026-08-08',
  headline:'Tune the controls you feel, not the rules you play by.',
  fairPlay:[
    'Sensitivity only changes touch-stick response before the existing clamp and never increases tank top speed.',
    'Camera shake, stick size and stick opacity affect presentation only.',
    'No aim assist, enemy information, zoom, hitbox, combat stat or AI setting is exposed.'
  ]
};

function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function num(v,fallback,min,max){v=Number(v);return Number.isFinite(v)?clamp(v,min,max):fallback;}
function loadSettings(){
  var raw=null;
  try{raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');}catch(_){raw=null;}
  raw=raw&&typeof raw==='object'?raw:{};
  return{
    aimSensitivity:num(raw.aimSensitivity,DEFAULTS.aimSensitivity,60,160),
    moveSensitivity:num(raw.moveSensitivity,DEFAULTS.moveSensitivity,60,160),
    stickSize:num(raw.stickSize,DEFAULTS.stickSize,80,130),
    stickOpacity:num(raw.stickOpacity,DEFAULTS.stickOpacity,30,100),
    screenShake:num(raw.screenShake,DEFAULTS.screenShake,0,100)
  };
}
function saveSettings(){
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch(_){}
}
function setSetting(key,value){
  var ranges={
    aimSensitivity:[60,160],moveSensitivity:[60,160],stickSize:[80,130],
    stickOpacity:[30,100],screenShake:[0,100]
  };
  var r=ranges[key];if(!r)return;
  state[key]=clamp(Number(value)||0,r[0],r[1]);
  saveSettings();applyVisualSettings();refreshUI();
}
function resetSettings(){state=Object.assign({},DEFAULTS);saveSettings();applyVisualSettings();refreshUI();}
function wrap(id,after){var old=mods[id];if(!old)return;mods[id]=function(module,exports,require){old(module,exports,require);after(module.exports,require);};}

/* Touch-stick response. The base game already hard-clamps stick travel and
 * normalizes movement, so this changes how much thumb travel is required to
 * cross the dead zone / reach the rim without raising maximum movement speed. */
wrap('game/input',function(input){
  var Input=input.Input;if(!Input||Input.prototype.__novaPilotSensitivity)return;
  Input.prototype.__novaPilotSensitivity=true;
  var oldUpdate=Input.prototype.updateStick;
  if(oldUpdate)Input.prototype.updateStick=function(s,x,y){
    var factor=1;
    if(s===this.aim)factor=state.aimSensitivity/100;
    else if(s===this.move)factor=state.moveSensitivity/100;
    if(s&&Number.isFinite(s.ox)&&Number.isFinite(s.oy)&&factor!==1){
      x=s.ox+(x-s.ox)*factor;
      y=s.oy+(y-s.oy)*factor;
    }
    return oldUpdate.call(this,s,x,y);
  };
});

/* Track only the active player game instance so the external console can pause
 * safely. No combat state is modified or exposed to the UI. */
wrap('game/engine',function(engine){
  var Game=engine.Game;if(!Game||Game.prototype.__novaPilotConsole)return;
  Game.prototype.__novaPilotConsole=true;
  var oldStart=Game.prototype.start, oldDestroy=Game.prototype.destroy;
  if(oldStart)Game.prototype.start=function(){
    activeGame=this;
    var out=oldStart.apply(this,arguments);
    scheduleVisibilityRefresh();
    return out;
  };
  if(oldDestroy)Game.prototype.destroy=function(){
    if(activeGame===this){
      if(overlay&&!overlay.hidden)closeConsole(false);
      activeGame=null;
    }
    var out=oldDestroy.apply(this,arguments);
    scheduleVisibilityRefresh();
    return out;
  };
});

/* Scale camera shake only for rendering. The underlying shake value is restored
 * immediately after the frame so gameplay simulation and effects remain intact. */
wrap('game/render',function(render){
  if(!render||typeof render.render!=='function'||render.render.__novaPilotShake)return;
  var oldRender=render.render;
  function pilotRender(g,w,h){
    if(!g||!g.cam||state.screenShake>=100)return oldRender(g,w,h);
    var original=g.cam.shake;
    g.cam.shake=original*(state.screenShake/100);
    try{return oldRender(g,w,h);}finally{g.cam.shake=original;}
  }
  pilotRender.__novaPilotShake=true;
  render.render=pilotRender;
});

function applyVisualSettings(){
  var root=document.documentElement;
  if(!root)return;
  root.style.setProperty('--nova-pilot-stick-scale',String(state.stickSize/100));
  root.style.setProperty('--nova-pilot-stick-opacity',String(state.stickOpacity/100));
}

function installStyles(){
  if(document.getElementById('nova-pilot-console-style'))return;
  var style=document.createElement('style');
  style.id='nova-pilot-console-style';
  style.textContent=[
    ':root{--nova-pilot-stick-scale:1;--nova-pilot-stick-opacity:.82}',
    '.stick-base{transform:scale(var(--nova-pilot-stick-scale))!important;transform-origin:center center!important;opacity:var(--nova-pilot-stick-opacity)!important}',
    '#nova-pilot-gear{position:fixed;z-index:44;top:calc(env(safe-area-inset-top,0px) + 76px);right:calc(env(safe-area-inset-right,0px) + 8px);width:42px;height:42px;border:1px solid rgba(110,190,255,.42);border-radius:12px;background:linear-gradient(160deg,rgba(13,20,40,.94),rgba(6,10,22,.96));box-shadow:0 8px 24px rgba(0,0,0,.42),inset 0 1px 0 rgba(255,255,255,.07);color:#bfe9ff;font:700 19px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px);touch-action:manipulation}',
    '#nova-pilot-gear:active{transform:scale(.94);border-color:rgba(125,243,255,.9)}',
    '#nova-pilot-overlay{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top,0px) + 14px) calc(env(safe-area-inset-right,0px) + 14px) calc(env(safe-area-inset-bottom,0px) + 14px) calc(env(safe-area-inset-left,0px) + 14px);background:rgba(0,0,0,.68);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);touch-action:none}',
    '#nova-pilot-overlay[hidden],#nova-pilot-gear[hidden]{display:none!important}',
    '#nova-pilot-panel{width:min(360px,100%);max-height:100%;overflow:auto;border:1px solid rgba(90,160,255,.28);border-radius:18px;background:linear-gradient(160deg,rgba(13,20,40,.985),rgba(6,10,22,.99));box-shadow:0 18px 60px rgba(0,0,0,.62),inset 0 1px 0 rgba(255,255,255,.06);color:#dcecff;padding:18px;font-family:var(--font-body,"Rajdhani"),system-ui,sans-serif;touch-action:pan-y}',
    '.nova-pilot-title{font-family:var(--font-display,"Orbitron"),system-ui,sans-serif;font-size:17px;font-weight:900;letter-spacing:.22em;color:#bff5ff;text-align:center;text-shadow:0 0 20px rgba(77,227,255,.35)}',
    '.nova-pilot-sub{margin:5px 2px 14px;text-align:center;color:#7f9bb8;font-size:11px;font-weight:700;letter-spacing:.08em}',
    '.nova-pilot-row{margin:12px 0 15px}',
    '.nova-pilot-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;color:#bdd7ef;font-size:12px;font-weight:800;letter-spacing:.06em}',
    '.nova-pilot-value{min-width:50px;text-align:right;color:#7df3ff;font-family:var(--font-display,"Orbitron"),system-ui,sans-serif;font-size:11px}',
    '.nova-pilot-range{width:100%;accent-color:#4de3ff;touch-action:pan-x}',
    '.nova-pilot-note{margin:-2px 1px 12px;padding:9px 10px;border:1px solid rgba(77,227,255,.12);border-radius:10px;background:rgba(40,100,150,.09);color:#7893ad;font-size:10px;line-height:1.35;font-weight:650}',
    '.nova-pilot-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}',
    '.nova-pilot-btn{min-height:40px;border:1px solid rgba(110,190,255,.32);border-radius:11px;background:rgba(20,40,80,.52);color:#bfe9ff;font-family:var(--font-display,"Orbitron"),system-ui,sans-serif;font-size:10px;font-weight:800;letter-spacing:.08em;touch-action:manipulation}',
    '.nova-pilot-btn:active{transform:scale(.97);background:rgba(30,60,110,.68)}',
    '.nova-pilot-btn.primary{grid-column:1/-1;color:#031018;background:linear-gradient(180deg,#7df3ff,#2bc9f5 55%,#0e9ed8);border-color:rgba(125,243,255,.8);font-size:11px}',
    '.nova-pilot-btn[disabled]{opacity:.38}',
    '@media(max-height:560px){#nova-pilot-panel{padding:14px}.nova-pilot-row{margin:8px 0 10px}.nova-pilot-sub{margin-bottom:8px}}'
  ].join('\n');
  document.head.appendChild(style);
}

function makeSlider(panel,label,key,min,max,step){
  var row=document.createElement('div');row.className='nova-pilot-row';
  var head=document.createElement('label');head.className='nova-pilot-label';
  var name=document.createElement('span');name.textContent=label;
  var value=document.createElement('span');value.className='nova-pilot-value';
  var input=document.createElement('input');input.className='nova-pilot-range';input.type='range';
  input.min=String(min);input.max=String(max);input.step=String(step);input.setAttribute('aria-label',label);
  function sync(){input.value=String(state[key]);value.textContent=Math.round(state[key])+'%';}
  input.addEventListener('input',function(){setSetting(key,input.value);});
  head.appendChild(name);head.appendChild(value);row.appendChild(head);row.appendChild(input);panel.appendChild(row);
  refreshers.push(sync);sync();
}

function refreshUI(){for(var i=0;i<refreshers.length;i++)refreshers[i]();}
function updateFullscreenButton(){
  var btn=document.getElementById('nova-pilot-fullscreen');if(!btn)return;
  var supported=!!(document.documentElement.requestFullscreen||document.documentElement.webkitRequestFullscreen);
  btn.disabled=!supported;
  btn.textContent=document.fullscreenElement||document.webkitFullscreenElement?'EXIT FULLSCREEN':(supported?'FULLSCREEN':'FULLSCREEN N/A');
}
function toggleFullscreen(){
  var root=document.documentElement;
  try{
    if(document.fullscreenElement||document.webkitFullscreenElement){
      var exit=document.exitFullscreen||document.webkitExitFullscreen;if(exit)exit.call(document);
    }else{
      var enter=root.requestFullscreen||root.webkitRequestFullscreen;if(enter)enter.call(root);
    }
  }catch(_){}
}

function installUI(){
  if(!document.body||gearButton)return;
  installStyles();applyVisualSettings();

  gearButton=document.createElement('button');
  gearButton.id='nova-pilot-gear';gearButton.type='button';gearButton.hidden=true;
  gearButton.textContent='⚙';gearButton.setAttribute('aria-label','Gameplay settings');gearButton.title='Gameplay settings';
  gearButton.addEventListener('pointerdown',function(e){e.stopPropagation();});
  gearButton.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();openConsole();});
  document.body.appendChild(gearButton);

  overlay=document.createElement('div');overlay.id='nova-pilot-overlay';overlay.hidden=true;
  overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Gameplay settings');
  var panel=document.createElement('div');panel.id='nova-pilot-panel';
  panel.addEventListener('pointerdown',function(e){e.stopPropagation();});
  var title=document.createElement('div');title.className='nova-pilot-title';title.textContent='PILOT SETTINGS';
  var sub=document.createElement('div');sub.className='nova-pilot-sub';sub.textContent='MID-RUN CONTROL & COMFORT';
  panel.appendChild(title);panel.appendChild(sub);

  makeSlider(panel,'Aim stick sensitivity','aimSensitivity',60,160,5);
  makeSlider(panel,'Move stick sensitivity','moveSensitivity',60,160,5);
  makeSlider(panel,'Joystick size','stickSize',80,130,5);
  makeSlider(panel,'Joystick opacity','stickOpacity',30,100,5);
  makeSlider(panel,'Screen shake','screenShake',0,100,5);

  var note=document.createElement('div');note.className='nova-pilot-note';
  note.textContent='Fair-play only: sensitivity changes touch-stick response, while size, opacity and shake are visual. No aim assist, zoom, enemy intel, hitbox or combat-stat controls are available.';
  panel.appendChild(note);

  var actions=document.createElement('div');actions.className='nova-pilot-actions';
  var reset=document.createElement('button');reset.type='button';reset.className='nova-pilot-btn';reset.textContent='RESET DEFAULTS';reset.addEventListener('click',resetSettings);
  var full=document.createElement('button');full.type='button';full.className='nova-pilot-btn';full.id='nova-pilot-fullscreen';full.addEventListener('click',toggleFullscreen);
  var done=document.createElement('button');done.type='button';done.className='nova-pilot-btn primary';done.textContent='DONE · RESUME';done.addEventListener('click',function(){closeConsole(true);});
  actions.appendChild(reset);actions.appendChild(full);actions.appendChild(done);panel.appendChild(actions);
  overlay.appendChild(panel);document.body.appendChild(overlay);

  overlay.addEventListener('click',function(e){if(e.target===overlay)closeConsole(true);});
  document.addEventListener('fullscreenchange',updateFullscreenButton);
  document.addEventListener('webkitfullscreenchange',updateFullscreenButton);
  document.addEventListener('keydown',function(e){
    if(!overlay||overlay.hidden||e.key!=='Escape')return;
    e.preventDefault();e.stopImmediatePropagation();closeConsole(true);
  },true);
  updateFullscreenButton();refreshUI();scheduleVisibilityRefresh();
}

function gameVisible(){
  if(!activeGame||!document.getElementById('root'))return false;
  return !!document.querySelector('#root canvas.absolute.inset-0');
}
function refreshVisibility(){
  if(!gearButton)return;
  var visible=gameVisible();gearButton.hidden=!visible;
  if(!visible&&overlay&&!overlay.hidden)closeConsole(false);
}
function scheduleVisibilityRefresh(){setTimeout(refreshVisibility,0);setTimeout(refreshVisibility,80);}
function openConsole(){
  if(!overlay||!activeGame||!gameVisible())return;
  resumeAfterClose=!activeGame.paused;
  if(resumeAfterClose&&activeGame.setPaused)activeGame.setPaused(true);
  overlay.hidden=false;gearButton.hidden=true;refreshUI();updateFullscreenButton();
  var first=overlay.querySelector('input,button');if(first&&first.focus)first.focus({preventScroll:true});
}
function closeConsole(restorePause){
  if(!overlay||overlay.hidden)return;
  overlay.hidden=true;
  var game=activeGame,shouldResume=!!(restorePause&&resumeAfterClose&&game&&game.setPaused);
  resumeAfterClose=false;
  if(shouldResume)game.setPaused(false);
  refreshVisibility();
}

/* React boot happens immediately after runtime layers load. A DOM observer is
 * cheap here because it only refreshes one button's visibility on screen swaps. */
function bootUI(){
  installUI();
  var root=document.getElementById('root');
  if(root&&window.MutationObserver){new MutationObserver(scheduleVisibilityRefresh).observe(root,{childList:true,subtree:false});}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bootUI,{once:true});else bootUI();

})();
