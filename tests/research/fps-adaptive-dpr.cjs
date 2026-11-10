'use strict';
/* Research only for #669; NOT imported by shipping runtime.
 * A temporary, reversible DPR probe measures whether lowering backing pixels
 * improves real frame pacing before accepting a quality loss. No simulation,
 * input, CSS dimensions, timers, quality setting, or minimap modifications.
 */
function createAdaptiveDprPilot(game, options={}) {
  if (!game || !game.canvas || !Number.isFinite(game.dpr) ||
      game.quality!=='low' || game.__novaDecorativeWorld || game.dpr<1)
    throw new Error('Adaptive DPR pilot requires a real low-quality game');
  const original=game.dpr, floor=1;
  let lastApplied=original, width=game.w, height=game.h, phase='baseline';
  let slowSince=null, fastSince=null, lastTransition=-Infinity, lastSample=null;
  let trialStart=null, baseline=null, warmupUntil=-Infinity, stopped=false;
  let cooldownUntil=-Infinity, externalOwner=false;
  const visible=typeof options.visible==='function'?options.visible:
    ()=>typeof document==='undefined'||!document.hidden;
  const result=(kind,changed=false)=>({kind,changed,dpr:game.dpr,phase});
  const resetStreaks=()=>{slowSince=null;fastSince=null;};
  function apply(dpr,now){
    if(game.dpr===dpr)return false;
    game.dpr=dpr;
    game.canvas.width=Math.max(1,Math.round(game.w*dpr));
    game.canvas.height=Math.max(1,Math.round(game.h*dpr));
    lastApplied=dpr;lastTransition=now;warmupUntil=now+2500;
    resetStreaks();return true;
  }
  function rollback(now){
    phase='baseline';baseline=null;trialStart=null;
    cooldownUntil=now+30000;
    return apply(original,now);
  }
  function sample(now,p){
    if(stopped)return result('stopped');
    // A player setting or another owner changed DPR. Never take it back.
    if(externalOwner)return result('external-owner');
    if(!Number.isFinite(now)||(lastSample!==null&&now<=lastSample))return result('invalid-time');
    // Observe external DPR ownership BEFORE a long-gap rollback can restore
    // stale pixels over a user's explicit clarity choice.
    if(game.dpr!==lastApplied){
      externalOwner=true;width=game.w;height=game.h;lastApplied=game.dpr;
      phase='baseline';baseline=null;trialStart=null;resetStreaks();
      return result('external-resize');
    }
    if(lastSample!==null&&now-lastSample>3500){
      resetStreaks();warmupUntil=now+2500;
      if(phase==='probing')return result('probe-interrupted',rollback(now));
      if(phase==='low')return result('low-interrupted-rollback',rollback(now));
    }
    lastSample=now;
    if(game.w!==width||game.h!==height||game.dpr!==lastApplied||
      game.canvas.width!==Math.max(1,Math.round(game.w*lastApplied))||
      game.canvas.height!==Math.max(1,Math.round(game.h*lastApplied))){
      if(game.dpr!==lastApplied)externalOwner=true;
      width=game.w;height=game.h;lastApplied=game.dpr;
      phase='baseline';baseline=null;trialStart=null;resetStreaks();
      warmupUntil=now+2500;cooldownUntil=now+8000;
      return result('external-resize');
    }
    if(game.quality!=='low'||!visible()||game.paused||game.status!=='playing'){
      resetStreaks();warmupUntil=now+2500;
      if(phase==='probing')return result('probe-cancelled',rollback(now));
      if(phase==='low')return result('low-inactive-rollback',rollback(now));
      return result('inactive');
    }
    if(!p||p.frameSamples<90||![p.fps,p.frameP95Ms,p.updateP95Ms,p.renderP95Ms,p.simulationPacePct]
      .every(Number.isFinite)){
      resetStreaks();
      if(phase==='probing'&&now-trialStart>8000)return result('probe-no-evidence',rollback(now));
      return result('insufficient-evidence');
    }
    if(phase==='probing'){
      // A 120-frame rolling window can still contain pre-probe frames at low
      // FPS. Do not accept a blur decision before the window can turn over.
      // Reuse the existing eight-second evidence budget instead of holding
      // a blurry research probe indefinitely on a very slow device.
      const cleanWindowMs=120000/Math.min(baseline.fps,p.fps);
      if(cleanWindowMs>8000&&now-trialStart>=8000)
        return result('probe-window-too-slow',rollback(now));
      if(now-trialStart<Math.max(6000,cleanWindowMs)||p.frameSamples<110)
        return result('probing');
      const gain=p.fps-baseline.fps,frameGain=baseline.frameP95Ms-p.frameP95Ms;
      // A faster renderer is not a win if the world advances less per wall second.
      // Require explicit simulation-pace evidence, not just FPS and update cost.
      const pacePreserved=p.simulationPacePct>=baseline.simulationPacePct-2;
      if(gain>=5&&frameGain>=3&&p.updateP95Ms<=baseline.updateP95Ms+5&&pacePreserved){
        phase='low';baseline=null;trialStart=null;resetStreaks();
        return result('probe-accepted');
      }
      return result('probe-rejected',rollback(now));
    }
    if(now<warmupUntil)return result('warmup');
    const slow=p.fps<=50&&p.frameP95Ms>=22&&p.updateP95Ms<=20&&
      p.renderP95Ms>=3;
    const fast=p.fps>=58&&p.frameP95Ms<=19&&p.updateP95Ms<=5&&
      p.renderP95Ms<=5;
    if(phase==='baseline'&&game.dpr>floor&&slow&&now>=cooldownUntil){
      if(slowSince===null)slowSince=now;
      if(now-slowSince>=1000&&now-lastTransition>=8000){
        baseline={fps:p.fps,frameP95Ms:p.frameP95Ms,updateP95Ms:p.updateP95Ms,
          simulationPacePct:p.simulationPacePct};
        trialStart=now;phase='probing';apply(floor,now);
        return result('probe-started',true);
      }
    }else if(phase==='low'&&fast){
      if(fastSince===null)fastSince=now;
      if(now-fastSince>=10000&&now-lastTransition>=12000){
        phase='baseline';baseline=null;trialStart=null;
        cooldownUntil=now+12000;
        return result('headroom-restored',apply(original,now));
      }
    }else resetStreaks();
    return result(slow?'slow':fast?'fast':'hold');
  }
  function stop(){
    if(stopped)return false;
    stopped=true;
    if(!externalOwner&&game.dpr===lastApplied&&game.w===width&&game.h===height&&
       game.canvas.width===Math.round(game.w*lastApplied)&&
       game.canvas.height===Math.round(game.h*lastApplied)&&
       game.dpr!==original)apply(original,lastSample||0);
    return true;
  }
  return {sample,stop,get state(){return {original,lastApplied,phase,stopped};}};
}
module.exports={createAdaptiveDprPilot};
