'use strict';
/* A 30 Hz display delivers 1/30s between frames. The historical 0.033s
 * cap silently discarded ~1% of wall time at exactly 30 Hz, slowing every
 * simulation system while the renderer continued at real wall time. Keep
 * the existing one-step safety cap; express it at the intended 30Hz rate.
 */
const fs=require('node:fs');
const before='            const dt = Math.min(0.033, (ts - this.last) / 1000);';
const after='            const dt = Math.min(1 / 30, (ts - this.last) / 1000);';
function count(s,needle){return s.split(needle).length-1;}
function patchRafStepCap(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('    start() {')||!html.includes('this.raf = requestAnimationFrame(loop);'))
  throw Error('canonical game RAF owner missing');
 const b=count(html,before),a=count(html,after);
 if(!((b===1&&a===0)||(b===0&&a===1)))throw Error('canonical RAF time cap drift; refuse materialization');
 return b===1?html.replace(before,after):html;
}
module.exports={patchRafStepCap,before,after};
if(require.main===module){
 const file=process.argv[2];if(!file)throw Error('Usage: node scripts/patch-raf-step-cap.cjs <index.html>');
 const html=fs.readFileSync(file,'utf8'),out=patchRafStepCap(html);
 if(out!==html)fs.writeFileSync(file,out,'utf8');
 console.log('NOVA RAF 30Hz cap validated');
}
