/* Research-only, opt-in browser timing observer.
 * Measures DOM event delivery -> next RAF callback opportunity, NOT
 * Game input application, projectile rendering, GPU presentation, or photon.
 * No keys, coordinates, pointer IDs, targets, game state, or raw timestamps
 * are exported. Never loaded by the shipping NOVA runtime.
 *
 * DevTools: const o=__novaInputRafObserver.create({durationMs:60000});
 * o.start(); ...play...; copy(JSON.stringify(o.snapshot()));
 */
(function(root){
'use strict';
if(root.__novaInputRafObserver)return;
const TYPES=['pointerdown','pointerup','keydown','keyup'];
const percentile=(arr,p)=>{
 if(!arr.length)return null;
 const sorted=arr.slice().sort((a,b)=>a-b);
 return Math.round(sorted[Math.ceil(sorted.length*p)-1]*1000)/1000;
};
function create({durationMs=60000,maxSamples=5000}={}){
 if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>600000||
    !Number.isInteger(maxSamples)||maxSamples<1||maxSamples>20000)
  throw Error('invalid input/RAF observer bounds');
 if(!root.performance||typeof root.performance.now!=='function'||
    typeof root.requestAnimationFrame!=='function'||
    typeof root.cancelAnimationFrame!=='function'||
    typeof root.addEventListener!=='function'||
    typeof root.removeEventListener!=='function')
  throw Error('browser timing APIs unavailable');
 let active=false,startedAt=null,endedAt=null,reason='idle',raf=null,generation=0,seq=0;
 let pending=[],samples={},count=0;
 const clock=()=>{try{return root.performance.now()}catch(_){return NaN}};
 function onEvent(e){
  if(!active||!e||!TYPES.includes(e.type))return;
  // A bounded queue prevents a burst of browser events from consuming memory.
  if(count+pending.length>=maxSamples)return;
  const at=clock();
  if(!Number.isFinite(at)){stop('invalid-clock');return;}
  pending.push({kind:e.type,at});
 }
 function onVisibility(){
  if(root.document&&root.document.hidden)stop('hidden');
 }
 function snapshot(){
  const kinds={};
  for(const type of TYPES){
   const values=samples[type]||[];
   kinds[type]={count:values.length,p50Ms:percentile(values,.5),
    p95Ms:percentile(values,.95),maxMs:values.length?
      Math.round(Math.max(...values)*1000)/1000:null};
  }
  return {researchOnly:true,metric:'DOM delivery to next RAF callback',
   notMeasured:['simulation application','first rendered projectile','GPU/photon latency'],
   status:reason,observedEvents:count,pendingEvents:pending.length,
   elapsedMs:startedAt===null?0:Math.round(Math.max(0,
    (endedAt===null?clock():endedAt)-startedAt)*1000)/1000,kinds};
 }
 function stop(why){
  if(!active)return snapshot();
  active=false;reason=why||'manual';endedAt=clock();generation++;seq++;
  for(const type of TYPES)root.removeEventListener(type,onEvent,true);
  if(root.document&&typeof root.document.removeEventListener==='function')
   root.document.removeEventListener('visibilitychange',onVisibility);
  const id=raf;raf=null;
  try{if(id!=null)root.cancelAnimationFrame(id)}
  catch(_){reason='cancel-error'}
  finally{pending.length=0}
  return snapshot();
 }
 function schedule(){
  const epoch=generation,ticket=++seq;
  raf=root.requestAnimationFrame(()=>{
   if(!active||epoch!==generation||ticket!==seq)return;
   raf=null;
   if(root.document&&root.document.hidden){stop('hidden');return;}
   const now=clock();
   if(!Number.isFinite(now)){stop('invalid-clock');return;}
   for(const e of pending){
    // A RAF callback cannot precede the DOM handler on the same clock.
    const ms=Math.max(0,now-e.at);
    samples[e.kind].push(ms);count++;
   }
   pending=[];
   if(count>=maxSamples||now-startedAt>=durationMs){
    stop('limit');return;
   }
   try{schedule();}catch(error){
    try{stop('raf-error');}catch(cleanup){
     if(error&&typeof error==='object')try{error.cleanupError=cleanup}catch(_){}
    }
    throw error;
   }
  });
 }
 return {start(){
  if(active)throw Error('observer already active');
  if(root.document&&root.document.hidden)throw Error('observer requires foreground tab');
  const now=clock();if(!Number.isFinite(now))throw Error('invalid browser clock');
  active=true;generation++;seq++;startedAt=now;endedAt=null;reason='running';
  pending=[];samples=Object.fromEntries(TYPES.map(type=>[type,[]]));count=0;
  try{
   for(const type of TYPES)root.addEventListener(type,onEvent,true);
   if(root.document&&typeof root.document.addEventListener==='function')
    root.document.addEventListener('visibilitychange',onVisibility);
   schedule();
  }catch(error){
   try{stop('start-error')}catch(cleanup){
    if(error&&typeof error==='object')try{error.cleanupError=cleanup}catch(_){}
   }
   throw error;
  }
 },stop,snapshot,get active(){return active;}};
}
root.__novaInputRafObserver={create};
})(typeof window!=='undefined'?window:globalThis);
