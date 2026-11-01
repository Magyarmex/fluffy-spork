/* NOVA TANKS v1.9.2 — Upgrade Dwell + Multi-touch Ultimate Hotfix
 * Keep the stat-upgrade tray out of the player's way until movement/aim input
 * has stayed released for a continuous half-second.
 *
 * Mobile combat hotfix: the ultimate button listens to real pointer-down
 * events at capture phase so a second touch can activate it while another
 * finger is still steering/aiming. The normal React click remains the single
 * execution path, preserving desktop/keyboard behavior and cooldown guards.
 */
(function(){
'use strict';
if(window.__NOVA_UPGRADE_DWELL__)return;
var React=window.React;
if(!React||typeof React.createElement!=='function'||typeof React.useState!=='function'||typeof React.useEffect!=='function'){
  console.error('[NOVA v1.9.2] React hooks unavailable; interaction patch not installed');
  return;
}
var VERSION='1.9.2',CODENAME='Upgrade Dwell',DWELL_MS=500,TOUCH_CLICK_GUARD_MS=900;
var originalCreateElement=React.createElement;
var upgradeTrayType=null;
var touchGuardButton=null,touchGuardUntil=0,dispatchingUltimateClick=false;

function DwellUpgradeTray(props){
  var pair=React.useState(true),holdCollapsed=pair[0],setHoldCollapsed=pair[1];
  var opt=React.useState(false),touchOptIn=opt[0],setTouchOptIn=opt[1];
  var inputActive=!!(props&&props.sticksActive);
  var compactTouch=!!(window.matchMedia&&window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches);
  var points=props&&props.hud&&props.hud.statPoints||0;
  React.useEffect(function(){
    if(inputActive){
      setHoldCollapsed(true);
      return;
    }
    var timer=setTimeout(function(){setHoldCollapsed(false);},DWELL_MS);
    return function(){clearTimeout(timer);};
  },[inputActive]);
  React.useEffect(function(){
    if(inputActive||points<=0)setTouchOptIn(false);
  },[inputActive,points]);
  // A newly earned point must not place an expanded panel over the FIRST touch.
  // The player can deliberately open the chip; movement re-arms this guard.
  var nextProps=Object.assign({},props,{sticksActive:inputActive||holdCollapsed||(compactTouch&&!touchOptIn)});
  return originalCreateElement('div',{
    'data-nova-upgrade-tray':true,
    style:{display:'contents'},
    onClickCapture:function(){if(compactTouch&&!inputActive)setTouchOptIn(true);}
  },originalCreateElement(upgradeTrayType,nextProps));
}

function findUltimateButton(target){
  if(!target)return null;
  var button=typeof target.closest==='function'?target.closest('button[data-ui]'):null;
  if(!button||!button.classList||!button.classList.contains('h-[68px]')||!button.classList.contains('w-[68px]'))return null;
  var holder=button.parentElement;
  if(!holder||!holder.classList||!holder.classList.contains('bottom-6')||!holder.classList.contains('right-4'))return null;
  return button;
}

function onUltimatePointerDown(event){
  if(!event||(event.pointerType!=='touch'&&event.pointerType!=='pen'))return;
  var button=findUltimateButton(event.target);
  if(!button||typeof button.click!=='function')return;

  if(event.cancelable&&typeof event.preventDefault==='function')event.preventDefault();
  if(typeof event.stopPropagation==='function')event.stopPropagation();

  touchGuardButton=button;
  touchGuardUntil=Date.now()+TOUCH_CLICK_GUARD_MS;
  dispatchingUltimateClick=true;
  try{
    button.click();
  }finally{
    dispatchingUltimateClick=false;
  }
}

function onUltimateClickCapture(event){
  if(dispatchingUltimateClick||!event)return;
  var button=findUltimateButton(event.target);
  if(!button||button!==touchGuardButton||Date.now()>touchGuardUntil)return;
  /* Do not eat a real mouse/keyboard activation that follows a touch on a
   * hybrid device. The original touch's compatibility click remains guarded. */
  var touchClick=event.pointerType==='touch'||event.pointerType==='pen'||
     (event.sourceCapabilities&&event.sourceCapabilities.firesTouchEvents===true);
  if(!touchClick&&(event.detail===0||event.pointerType==='mouse'||
     (event.sourceCapabilities&&event.sourceCapabilities.firesTouchEvents===false)))return;

  if(event.cancelable&&typeof event.preventDefault==='function')event.preventDefault();
  if(typeof event.stopImmediatePropagation==='function')event.stopImmediatePropagation();
  else if(typeof event.stopPropagation==='function')event.stopPropagation();
  touchGuardButton=null;
  touchGuardUntil=0;
}

React.createElement=function(type,props){
  if(type&&typeof type==='function'&&type.name==='UpgradeTray'){
    upgradeTrayType=type;
    var args=Array.prototype.slice.call(arguments);
    args[0]=DwellUpgradeTray;
    return originalCreateElement.apply(this,args);
  }
  return originalCreateElement.apply(this,arguments);
};

if(typeof document!=='undefined'&&document&&typeof document.addEventListener==='function'){
  // Keep even the expanded, deliberately opened tray above both mobile sticks.
  // Target only the UpgradeTray owner; desktop and other HUD panels are untouched.
  if(document.createElement&&document.head){
    var upgradeStyle=document.createElement('style');
    upgradeStyle.id='nova-touch-upgrade-clearance';
    upgradeStyle.textContent='@media (pointer:coarse) and (max-width:900px){[data-nova-upgrade-tray] > div{top:82px!important;bottom:auto!important;}}@media (pointer:coarse) and (orientation:landscape) and (max-height:400px){[data-nova-upgrade-tray] > div{top:64px!important;}}';
    document.head.appendChild(upgradeStyle);
  }
  document.addEventListener('pointerdown',onUltimatePointerDown,true);
  document.addEventListener('click',onUltimateClickCapture,true);
}

window.__NOVA_VERSION=VERSION;
window.__NOVA_UPGRADE_DWELL__={
  version:VERSION,
  codename:CODENAME,
  date:'2026-08-08',
  dwellMs:DWELL_MS,
  behavior:'500 ms joystick dwell; compact touch screens require explicit chip activation and keep the opened tray above the joystick landing zones.'
};
window.__NOVA_UPGRADE_DWELL_TEST__={
  dwellMs:DWELL_MS,
  targetName:'UpgradeTray',
  effectiveInputActive:function(inputActive,holdCollapsed){return !!inputActive||!!holdCollapsed;},
  compactEffectiveInputActive:function(inputActive,holdCollapsed,compactTouch,optIn){return !!inputActive||!!holdCollapsed||(!!compactTouch&&!optIn);}
};
window.__NOVA_MULTITOUCH_ULTIMATE__={
  version:VERSION,
  date:'2026-08-08',
  touchClickGuardMs:TOUCH_CLICK_GUARD_MS,
  behavior:'Touch and pen pointer-down on the ultimate button activate immediately, including non-primary second touches while movement or aim remains held; the follow-up synthetic click is suppressed.'
};
window.__NOVA_MULTITOUCH_ULTIMATE_TEST__={
  findUltimateButton:findUltimateButton,
  onPointerDown:onUltimatePointerDown,
  onClickCapture:onUltimateClickCapture,
  touchClickGuardMs:TOUCH_CLICK_GUARD_MS
};
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' + Multi-touch Ultimate linked');
})();
