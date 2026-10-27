'use strict';
/* Research-only intervention: isolate the *live* public BLOOM tactical turn.
 * It does not remove the signal, stale memory, ecology, or any AI information.
 * The spent-key sentinel exists ONLY for the synchronous composed AI call.
 * Never include this script in the 48-module shipping composition. */
(function(root){
 function liveKey(g){
  const st=g&&g.__lfState,now=Number(g&&g.time),s=st&&st.signal,m=st&&st.bloomMemory;
  if(!st||st.directorEnabled===false||!Number.isFinite(now)||!s||!m||
     s.type!=='BLOOM'||!Number.isInteger(s.sector)||s.sector<0||s.sector>=16||
     !Number.isFinite(s.started)||!Number.isFinite(s.until)||
     !(now>=s.started&&now<s.until)||
     m.sector!==s.sector||m.announcedAt!==s.started||
     !(now<m.until))return null;
  return 'BLOOM:'+s.sector+':'+s.started;
 }
 function suppressLiveStart(original,t,g,dt){
  if(typeof original!=='function')throw TypeError('composed AI update required');
  const key=t&&t.ai&&liveKey(g);
  if(!key)return original(t,g,dt);
  const a=t.ai;
  /* A turn already legitimately spent must not be rearmed or altered.
   * The OFF arm must never start one; the post-match audit checks this. */
  if(a.__lfFrontTurnSpentKey===key)return original(t,g,dt);
  const had=Object.prototype.hasOwnProperty.call(a,'__lfFrontTurnSpentKey');
  const before=a.__lfFrontTurnSpentKey;
  a.__lfFrontTurnSpentKey=key;
  try{return original(t,g,dt);}
  finally{
   if(had)a.__lfFrontTurnSpentKey=before;
   else delete a.__lfFrontTurnSpentKey;
  }
 }
 const api={liveKey,suppressLiveStart};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.__novaResearchLiveTurnIntervention=api;
})(typeof window!=='undefined'?window:globalThis);
