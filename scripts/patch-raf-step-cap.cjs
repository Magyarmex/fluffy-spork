'use strict';
/* Preserve the exact 30 Hz single-step collision cap while carrying at most
 * one additional step of elapsed wall time across uneven animation frames.
 * This recovers brief 30-60 Hz jitter without adding a second physics update
 * per draw or accumulating an unbounded catch-up spiral on slow devices.
 * The debt is discarded on pause/evolution to avoid resuming stale time.
 */
const fs=require('node:fs');
const before='            const dt = Math.min(0.033, (ts - this.last) / 1000);';
const intermediate='            const dt = Math.min(1 / 30, (ts - this.last) / 1000);';
const after='            const dt = Math.min(1 / 30, elapsed + carry);';
const anchor='        this.sfx.startMusic();\n        const loop = (ts) => {';
const withCarry='        this.sfx.startMusic();\n        let carry = 0;\n        const loop = (ts) => {';
const oldStep='            this.last = ts;\n            if (!this.paused)\n                this.update(dt);';
const newStep='            const excess = elapsed + carry - dt;\n            carry = excess > 1e-9 ? Math.min(1 / 30, excess) : 0;\n            this.last = ts;\n            if (!this.paused)\n                this.update(dt);\n            if (this.paused)\n                carry = 0;';
function count(s,needle){return s.split(needle).length-1;}
function patchRafStepCap(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('    start() {')||!html.includes('this.raf = requestAnimationFrame(loop);'))
  throw Error('canonical game RAF owner missing');
 if(count(html,after)===1&&count(html,withCarry)===1&&count(html,newStep)===1&&
    count(html,before)===0&&count(html,intermediate)===0)return html;
 const old=count(html,before),mid=count(html,intermediate);
 if(old+mid!==1||count(html,after)!==0||count(html,anchor)!==1||count(html,oldStep)!==1||count(html,withCarry)!==0)
  throw Error('canonical RAF time cap drift; refuse materialization');
 const original=old?before:intermediate;
 return html.replace(anchor,withCarry).replace(original,
  '            const elapsed = Math.max(0, (ts - this.last) / 1000);\n'+after)
  .replace(oldStep,newStep);
}
module.exports={patchRafStepCap,before,intermediate,after};
if(require.main===module){
 const file=process.argv[2];if(!file)throw Error('Usage: node scripts/patch-raf-step-cap.cjs <index.html>');
 const html=fs.readFileSync(file,'utf8'),out=patchRafStepCap(html);
 if(out!==html)fs.writeFileSync(file,out,'utf8');
 console.log('NOVA bounded RAF jitter carry validated');
}
