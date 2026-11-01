/* Research-only legal evolution-offer policy for manual full-match simulations.
 * Does not modify the shipping engine. The real RAF never updates a paused offer.
 * Explicitly report the decision: defer grants the canonical evolution grace. */
(function(root){
  'use strict';
  const TIER1=['cannon','twin','marksman','carrier','guard'];
  function parse(raw){
    if(raw==='censor'||raw==='defer')return {kind:raw};
    if(typeof raw==='string'&&raw.startsWith('tier1:')&&TIER1.includes(raw.slice(6)))
      return {kind:'tier1',classId:raw.slice(6)};
    throw Error('NOVA_OFFER_POLICY must be censor, defer, or tier1:<cannon|twin|marksman|carrier|guard>');
  }
  function physicalHash(g){
    // Pre-decision witness: no game mutations, and no render-only fields.
    const bodies=a=>(a||[]).map(x=>x&&[x.id,x.x,x.y,x.hp,x.alive,x.cls,x.type]);
    const state=JSON.stringify({time:g.time,rng:g.__novaTrialRng,
      player:g.player&&[g.player.id,g.player.x,g.player.y,g.player.hp,
        g.player.level,g.player.cls,g.player.score,g.player.kills],
      tanks:bodies(g.tanks),shapes:bodies(g.shapes),drones:bodies(g.drones),
      bullets:bodies(g.bullets),terrain:bodies(g.__novaTerrain),
      orbs:bodies(g.orbs),powerups:bodies(g.powerups)});
    let h1=2166136261,h2=0x9e3779b9;
    for(let i=0;i<state.length;i++){const c=state.charCodeAt(i);
      h1=Math.imul(h1^c,16777619);h2=Math.imul(h2^c,2246822519);}
    return (h1>>>0).toString(16).padStart(8,'0')+':'+(h2>>>0).toString(16).padStart(8,'0');
  }
  function handle(g,policy){
    if(!g||!policy||!['censor','defer','tier1'].includes(policy.kind))throw Error('invalid research offer owner or policy');
    if(!g.pendingOffer||g.paused!==true)return {action:'none'};
    const tier=g.pendingOffer,at=Number(g.time),player=g.player;
    if(!Number.isInteger(tier)||tier<1||tier>5||!Number.isFinite(at)||!player)
      throw Error('invalid pending evolution offer; fail closed');
    const record={time:+at.toFixed(6),tier,level:player.level,playerId:player.id,
      beforePhysicalHash:physicalHash(g),choice:null};
    if(policy.kind==='censor'){
      record.choice='censor';
      if(g.__novaResearchOfferCensor)throw Error('duplicate offer censor');
      g.__novaResearchOfferCensor=record;
      return {action:'censor',censored:true};
    }
    if(policy.kind==='tier1'&&tier===1){
      if(typeof g.applyClass!=='function')throw Error('canonical applyClass missing');
      g.applyClass(policy.classId);
      if(g.player!==player||g.player.cls!==policy.classId||g.paused||g.pendingOffer===tier)
        throw Error('tier-1 class choice failed to resolve real offer');
      record.choice='class';record.classId=policy.classId;
    }else{
      if(typeof g.dismissOffer!=='function')throw Error('canonical dismissOffer missing');
      g.dismissOffer();
      if(g.paused)throw Error('legal Later action failed to resume simulation');
      // At level cap, the engine intentionally retains the earned offer.
      if(g.pendingOffer===tier&&!(player.level>=45))
        throw Error('Later unexpectedly retained a non-cap offer');
      record.choice='later';
      record.shieldAfter=Number(player.spawnShieldT)||0;
    }
    (g.__novaResearchOfferActions||(g.__novaResearchOfferActions=[])).push(record);
    return {action:record.choice,censored:false};
  }
  const api=Object.freeze({parse,handle,physicalHash});
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.__novaResearchOfferPolicy=api;
})(typeof window!=='undefined'?window:globalThis);
