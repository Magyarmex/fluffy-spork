/* Research-only opt-in RAF interval recorder. Never loaded by production HTML.
 * In a browser DevTools console after loading this file:
 * const c=__novaRafTraceCapture.create({durationMs:120000}); c.start();
 * Later: copy(JSON.stringify(c.snapshot()));
 * Feed that JSON to scripts/fixed60-raf-trace-replay.cjs.
 * Captures only frame timing, no input, location, account, or game state.
 */
(function(root){
'use strict';
if(root.__novaRafTraceCapture)return;
function create({durationMs=120000,maxFrames=200000}={}){
 if(!Number.isFinite(durationMs)||durationMs<=0||durationMs>600000||
    !Number.isInteger(maxFrames)||maxFrames<1||maxFrames>200000)
   throw Error('invalid RAF capture bounds');
 var active=false,first=null,last=null,raf=null,intervals=[],reason=null;
 var visibilityGuarded=false,generation=0,requestSeq=0;
 function schedule(){
  const epoch=generation,seq=++requestSeq;
  raf=root.requestAnimationFrame(ts=>{
   if(!active||epoch!==generation||seq!==requestSeq)return;
   tick(ts);
  });
 }
 function onVisibility(){if(root.document&&root.document.hidden)stop('hidden');}
 function stop(why){
  if(!active)return snapshot();
  active=false;reason=why||'manual';generation++;requestSeq++;
  if(visibilityGuarded&&root.document&&typeof root.document.removeEventListener==='function'){
   try{root.document.removeEventListener('visibilitychange',onVisibility);}catch(_ignored){}
  }
  const pending=raf;raf=null;
  if(pending!=null)root.cancelAnimationFrame(pending);
  return snapshot();
 }
 function snapshot(){
  return {frameIntervalsMs:intervals.slice(),capture:{
   reason:reason||'running',durationMs:first==null?0:last-first,
   frames:intervals.length,foregroundOnly:visibilityGuarded}};
 }
 function tick(ts){
  if(!active)return;
  raf=null;
  if(root.document&&root.document.hidden){stop('hidden');return;}
  if(!Number.isFinite(ts)){stop('invalid-timestamp');return;}
  if(first==null)first=ts;
  if(last!=null){
   var delta=ts-last;
   if(!(delta>0)){stop('nonmonotonic');return;}
   intervals.push(delta);
  }
  last=ts;
  if(intervals.length>=maxFrames||ts-first>=durationMs){
   stop('limit');return;
  }
  try{schedule();}
  catch(error){try{stop('raf-error')}catch(cleanupError){
   if(error&&typeof error==='object')try{error.cleanupError=cleanupError}catch(_ignored){}
  }throw error;}
 }
 return {start:function(){
  if(active)throw Error('RAF capture already active');
  if(root.document&&root.document.hidden)throw Error('capture requires foreground tab');
  active=true;generation++;requestSeq++;first=null;last=null;reason=null;intervals=[];
  visibilityGuarded=!!(root.document&&typeof root.document.addEventListener==='function'&&
   typeof root.document.removeEventListener==='function');
  try{
   if(visibilityGuarded)root.document.addEventListener('visibilitychange',onVisibility);
   schedule();
  }catch(error){try{stop('start-error')}catch(cleanupError){
   if(error&&typeof error==='object')try{error.cleanupError=cleanupError}catch(_ignored){}
  }throw error;}
 },stop:stop,snapshot:snapshot,get active(){return active;}};
}
root.__novaRafTraceCapture={create:create};
})(typeof window!=='undefined'?window:globalThis);
