'use strict';
/* Research-only read-only witness for why public BLOOM commitments do or do not
 * materialize during natural matches. No gameplay imports or player-facing UI.
 * Sample after the real composed AI update; do not call any AI authority. */
(function(root){
 function create(){return{samples:0,enabledSamples:0,publicMemory:0,liveSignal:0,expiredWindow:0,
  eligibleWindow:0,alreadyInside:0,subset:0,healthy:0,memoryMode:0,
  meaningfulWeight:0,precombatIntersection:0,activeTurn:0,started:0,
  startedLive:0,startedMemory:0,activeTurnLive:0,activeTurnMemory:0,
  _seen:new Set()};}
 function sample(audit,g,t,enabled,sectorIndex){
  if(!audit||!g||!t||!t.ai)return;
  const a=t.ai,st=g.__lfState,now=Number(g.time)||0,m=st&&st.bloomMemory;
  audit.samples++;if(enabled)audit.enabledSamples++;
  if(!st||st.directorEnabled===false||!m||!(now>=m.announcedAt&&now<m.until))return;
  audit.publicMemory++;
  /* A turn may start AND physically arrive during the same composed AI
   * update. Count the actual spent key before any live/arrival/window return,
   * not only among rivals still outside when the observer samples them. */
  const live=!!(st.signal&&st.signal.type==='BLOOM'&&now<st.signal.until&&
   st.signal.sector===m.sector&&st.signal.started===m.announcedAt);
  const expected='BLOOM:'+m.sector+':'+m.announcedAt;
  if(a.__lfFrontTurnSpentKey===expected){
   const unique=String(t.id)+':'+expected;
   if(!audit._seen.has(unique)){
    audit._seen.add(unique);audit.started++;
    if(live)audit.startedLive++;else audit.startedMemory++;
   }
  }
  if(a.__lfFrontTurn&&a.__lfFrontTurn.key===expected&&now<a.__lfFrontTurn.until){
   audit.activeTurn++;
   if(live)audit.activeTurnLive++;else audit.activeTurnMemory++;
  }
  if(live){audit.liveSignal++;return;}
  if(now-m.announcedAt>12){audit.expiredWindow++;return;}
  audit.eligibleWindow++;
  if(typeof sectorIndex==='function'&&sectorIndex(t.x,t.y)===m.sector){audit.alreadyInside++;return;}
  const subset=Math.abs(Number(t.id)||0)%3===1;
  const healthy=t.alive!==false&&t.hp>0&&!(t.spawnShieldT>0)&&
   t.hp/Math.max(1,t.maxHp||t.hp||1)>=.65;
  const mode=a.__lfEcoMode==='memory'&&a.__lfEcoKey==='BLOOM:'+m.sector;
  const weight=Number(a.__lfEcoWeight)>.10;
  if(subset)audit.subset++;
  if(healthy)audit.healthy++;
  if(mode)audit.memoryMode++;
  if(weight)audit.meaningfulWeight++;
  if(subset&&healthy&&mode&&weight)audit.precombatIntersection++;

 }
 function summary(audit){
  const out={};
  for(const key of Object.keys(audit||{}))if(key[0]!=='_')out[key]=audit[key];
  return out;
 }
 const api={create,sample,summary};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
 else root.__novaResearchCommitmentAudit=api;
})(typeof window!=='undefined'?window:globalThis);
