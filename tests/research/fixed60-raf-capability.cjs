'use strict';
// Shared summary and strict capability predicate for the research-only
// fixed60 90Hz RAF gate. Inputs are raw requestAnimationFrame intervals from
// a blank page; the controlled sample uses the same 11.111ms gate as the Game.
function summarizeRaf(intervals,measuredMs){
 if(!Array.isArray(intervals)||intervals.length<8)
  throw new TypeError('RAF sample needs at least eight intervals');
 if(!Number.isFinite(measuredMs)||measuredMs<=0)
  throw new TypeError('RAF sample needs positive measured wall time');
 if(intervals.some(value=>!Number.isFinite(value)||value<=0))
  throw new TypeError('RAF intervals must be finite and positive');
 const sorted=intervals.slice(3).sort((a,b)=>a-b);
 const total=sorted.reduce((sum,value)=>sum+value,0);
 const hz=sorted.length&&total>0?sorted.length*1000/total:null;
 const p95=sorted.length?sorted[Math.ceil(.95*sorted.length)-1]:null;
 const median=sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null;
 return {frames:intervals.length,measuredMs,hz,p95,median,
  min:sorted.length?sorted[0]:null,max:sorted.length?sorted[sorted.length-1]:null,
  supports90Hz:Number.isFinite(hz)&&hz>=80&&hz<=100&&p95<15};
}
module.exports={summarizeRaf};
