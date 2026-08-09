/* NOVA TANKS v1.9.2 — Upgrade Dwell
 * Keep the stat-upgrade tray out of the player's way until movement/aim input
 * has stayed released for a continuous half-second.
 */
(function(){
'use strict';
if(window.__NOVA_UPGRADE_DWELL__)return;
var React=window.React;
if(!React||typeof React.createElement!=='function'||typeof React.useState!=='function'||typeof React.useEffect!=='function'){
  console.error('[NOVA v1.9.2] React hooks unavailable; upgrade dwell not installed');
  return;
}
var VERSION='1.9.2',CODENAME='Upgrade Dwell',DWELL_MS=500;
var originalCreateElement=React.createElement;
var upgradeTrayType=null;

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

React.createElement=function(type,props){
  if(type&&typeof type==='function'&&type.name==='UpgradeTray'){
    upgradeTrayType=type;
    var args=Array.prototype.slice.call(arguments);
    args[0]=DwellUpgradeTray;
    return originalCreateElement.apply(this,args);
  }
  return originalCreateElement.apply(this,arguments);
};

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
console.info('[NOVA TANKS] v'+VERSION+' '+CODENAME+' linked');
})();
