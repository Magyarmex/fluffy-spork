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
  var inputActive=!!(props&&props.sticksActive);
  React.useEffect(function(){
    if(inputActive){
      setHoldCollapsed(true);
      return;
    }
    var timer=setTimeout(function(){setHoldCollapsed(false);},DWELL_MS);
    return function(){clearTimeout(timer);};
  },[inputActive]);
  var nextProps=Object.assign({},props,{sticksActive:inputActive||holdCollapsed});
  return originalCreateElement(upgradeTrayType,nextProps);
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
  document.addEventListener('pointerdown',onUltimatePointerDown,true);
  document.addEventListener('click',onUltimateClickCapture,true);
}

window.__NOVA_VERSION=VERSION;
window.__NOVA_UPGRADE_DWELL__={
  version:VERSION,
  codename:CODENAME,
  date:'2026-08-08',
  dwellMs:DWELL_MS,
  behavior:'The stat-upgrade tray remains collapsed until joystick input has been inactive continuously for 500 ms; renewed input cancels and resets the dwell.'
};
window.__NOVA_UPGRADE_DWELL_TEST__={
  dwellMs:DWELL_MS,
  targetName:'UpgradeTray',
  effectiveInputActive:function(inputActive,holdCollapsed){return !!inputActive||!!holdCollapsed;}
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
