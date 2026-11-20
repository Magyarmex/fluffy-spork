/* NOVA TANKS — opt-in, read-only final-render CPU timing for physical-device QA.
 * Inject this script after the playable game boots (for example via remote
 * Chrome DevTools). It is NOT included in production or the service worker.
 * Usage: const p=__novaFullRenderTiming.create({maxSamples:7200});
 *        p.start(); ...play...; p.stop(); copy(JSON.stringify(p.snapshot()));
 * Captures only duration samples, never game state, player input or location.
 * These are JavaScript render-call durations, NOT GPU completion, battery
 * consumption, physical touch latency or proof of fixed60 safety.
 */
(function(root){
'use strict';
if(root.__novaFullRenderTiming)return;
var currentOwner=null;
function create({maxSamples=7200}={}){
 if(!Number.isInteger(maxSamples)||maxSamples<60||maxSamples>20000)
  throw Error('invalid render sample bound');
 var active=false,mod=null,original=null,wrapper=null,count=0,sum=0,
  over16=0,over33=0,
  peak=0,reason='not-started',restored=true;
 var samples=new Float64Array(maxSamples);
 function clock(){
  var p=root.performance;
  if(!p||typeof p.now!=='function')throw Error('monotonic clock unavailable');
  var at=p.now();
  if(!Number.isFinite(at))throw Error('invalid monotonic clock');
  return at;
 }
 function onVisibility(){if(root.document&&root.document.hidden)stop('hidden',false);}
 function stop(why,summarize=true){
  if(!active)return summarize?snapshot():null;
  active=false;reason=why||'manual';
  if(currentOwner===api)currentOwner=null;
  restored=!!(mod&&mod.render===wrapper);
  if(restored)mod.render=original;
  if(root.document&&typeof root.document.removeEventListener==='function')
   root.document.removeEventListener('visibilitychange',onVisibility);
  return summarize?snapshot():null;
 }
 function percentile(sorted,p){
  if(!sorted.length)return null;
  return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
 }
 function snapshot(){
  var ordered=Array.from(samples.subarray(0,count)).sort((a,b)=>a-b);
  var round=x=>x==null?null:Math.round(x*1000)/1000;
  return {researchOnly:true,source:'final game/render export',active,reason,
   restored,frames:count,maxSamples,meanMs:count?round(sum/count):null,
   p50Ms:round(percentile(ordered,.5)),p95Ms:round(percentile(ordered,.95)),
   p99Ms:round(percentile(ordered,.99)),maxMs:count?round(peak):null,
   renderOver16_67Pct:count?round(over16*100/count):null,
   renderOver33_33Pct:count?round(over33*100/count):null,
   caveat:'JS render-call CPU only; excludes GPU completion and physical input latency'};
 }
 function start(){
  if(active)throw Error('render timing already active');
  if(currentOwner)throw Error('another render timing probe is active');
  if(root.document&&root.document.hidden)throw Error('foreground game required');
  if(typeof root.__novaMakeRequire!=='function')throw Error('production module loader unavailable');
  var candidate=root.__novaMakeRequire('')('game/render');
  if(!candidate||typeof candidate.render!=='function')
   throw Error('final game renderer unavailable');
  clock();
  mod=candidate;original=mod.render;count=0;sum=0;peak=0;over16=0;over33=0;
  reason='running';restored=false;
  wrapper=function(g){
   var eligible=active&&g&&g.status==='playing'&&!g.paused&&
    !g.__novaDecorativeWorld&&!(root.document&&root.document.hidden);
   if(!eligible)return original.apply(this,arguments);
   var t0,out,ms;
   try{t0=clock();}catch(error){stop('clock-error',false);throw error;}
   try{out=original.apply(this,arguments);}
   catch(error){stop('render-error',false);throw error;}
   try{ms=clock()-t0;}catch(error){stop('clock-error',false);throw error;}
   if(Number.isFinite(ms)&&ms>=0){
    samples[count++]=ms;sum+=ms;if(ms>peak)peak=ms;
    if(ms>1000/60)over16++;if(ms>1000/30)over33++;
   }else{stop('invalid-duration',false);return out;}
   if(count>=maxSamples)stop('limit',false);
   return out;
  };
  try{
   mod.render=wrapper;
   if(mod.render!==wrapper)throw Error('renderer export is not writable');
   active=true;currentOwner=api;
   if(root.document&&typeof root.document.addEventListener==='function')
    root.document.addEventListener('visibilitychange',onVisibility);
  }catch(error){
   active=false;
   if(currentOwner===api)currentOwner=null;
   if(mod&&mod.render===wrapper)mod.render=original;
   restored=mod&&mod.render===original;
   reason='start-error';
   throw error;
  }
 }
 var api={start,stop,snapshot,get active(){return active;}};
 return api;
}
root.__novaFullRenderTiming={create};
})(typeof window!=='undefined'?window:globalThis);
