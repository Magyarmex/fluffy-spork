'use strict';
/* Keep every individual collision update capped at 30 Hz. At sustained
 * 20-30 Hz presentation, repay at most one additional 30 Hz step per frame
 * rather than slowing the entire game. Long stalls do not trigger the extra
 * step, and pause/evolution discards debt. Never catch up without a bound. */
const fs=require('node:fs');
const before='            const dt = Math.min(0.033, (ts - this.last) / 1000);';
const intermediate='            const dt = Math.min(1 / 30, (ts - this.last) / 1000);';
const after='            const dt = Math.min(1 / 30, elapsed + carry);';
const anchor='        this.sfx.startMusic();\n        const loop = (ts) => {';
const priorCarry='        this.sfx.startMusic();\n        let carry = 0;\n        const loop = (ts) => {';
const withCarry='        this.sfx.startMusic();\n        let carry = 0;\n        let priorWork = 0, earlierWork = 0;\n        const loop = (ts) => {';
const priorLoop='        const loop = (ts) => {\n            this.raf = requestAnimationFrame(loop);';
const loopTail='                this.drawMinimap();\n            }\n        };\n        this.raf = requestAnimationFrame(loop);';
const newLoopTail='                this.drawMinimap();\n            }\n            earlierWork = priorWork;\n            priorWork = performance.now() - workStart;\n        };\n        this.raf = requestAnimationFrame(loop);';
const oldStep='            this.last = ts;\n            if (!this.paused)\n                this.update(dt);';
const priorStep='            const excess = elapsed + carry - dt;\n            carry = excess > 1e-9 ? Math.min(1 / 30, excess) : 0;\n            this.last = ts;\n            if (!this.paused)\n                this.update(dt);\n            if (this.paused)\n                carry = 0;';
const newStep='            const excess = elapsed + carry - dt;\n            carry = excess > 1e-9 ? Math.min(1 / 30, excess) : 0;\n            this.last = ts;\n            if (!this.paused)\n                this.update(dt);\n            /* A slow but active display may need two safe updates to avoid\n             * 20 Hz time dilation. Never repay a long suspension in one draw. */\n            if (!this.paused && elapsed <= 1 / 12 && carry >= 1 / 30 - 1e-9 &&\n                priorWork < 18 && earlierWork < 18) {\n                this.update(1 / 30);\n                this.mmTimer -= 1 / 30;\n                carry = Math.max(0, carry - 1 / 30);\n            }\n            if (this.paused)\n                carry = 0;';
function count(s,needle){return s.split(needle).length-1;}
function patchRafStepCap(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('    start() {')||!html.includes('this.raf = requestAnimationFrame(loop);'))
  throw Error('canonical game RAF owner missing');
 if(count(html,after)===1&&count(html,withCarry)===1&&count(html,newStep)===1&&
    count(html,newLoopTail)===1&&count(html,before)===0&&count(html,intermediate)===0)return html;
 /* The materializer always starts from the compressed canonical shell.
  * Existing materialized HTML can also be upgraded idempotently in tests. */
 const old=count(html,before),mid=count(html,intermediate),prior=count(html,priorStep);
 if(old+mid+prior!==1||count(html,withCarry)!==0||count(html,newStep)!==0||
    count(html,priorCarry)>1||count(html,loopTail)!==1)
  throw Error('canonical RAF time cap drift; refuse materialization');
 if(prior===1){
  if(count(html,priorCarry)!==1)throw Error('canonical RAF time cap drift; refuse materialization');
  return html.replace(priorCarry,withCarry)
   .replace(priorStep,newStep).replace(priorLoop,priorLoop+'\n            const workStart = performance.now();').replace(loopTail,newLoopTail);
 }
 if(count(html,priorCarry)!==0||count(html,anchor)!==1||count(html,oldStep)!==1)
  throw Error('canonical RAF time cap drift; refuse materialization');
 const original=old?before:intermediate;
 const legacy=html.replace(anchor,priorCarry).replace(original,
  '            const elapsed = Math.max(0, (ts - this.last) / 1000);\n'+after)
  .replace(oldStep,priorStep);
 return legacy.replace(priorCarry,withCarry)
  .replace(priorStep,newStep).replace(priorLoop,priorLoop+'\n            const workStart = performance.now();').replace(loopTail,newLoopTail);
}
module.exports={patchRafStepCap,before,intermediate,after};
if(require.main===module){
 const file=process.argv[2];if(!file)throw Error('Usage: node scripts/patch-raf-step-cap.cjs <index.html>');
 const html=fs.readFileSync(file,'utf8'),out=patchRafStepCap(html);
 if(out!==html)fs.writeFileSync(file,out,'utf8');
 console.log('NOVA bounded RAF jitter carry validated');
}
