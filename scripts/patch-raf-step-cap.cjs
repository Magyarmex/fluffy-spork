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

// The shipping RAF is already queued before update. Cancelling that future RAF
// does not abort the callback currently executing, so guard every boundary.
const lifecycleGuards=[
 ['            this.raf = requestAnimationFrame(loop);\n            const workStart = performance.now();',
  '            if (this.__novaDestroyed) return;\n            this.raf = requestAnimationFrame(loop);\n            const workStart = performance.now();'],
 ['                this.update(dt);\n            /* A slow but active display',
  '                this.update(dt);\n            if (this.__novaDestroyed) return;\n            /* A slow but active display'],
 ['                this.update(1 / 30);\n                this.mmTimer -= 1 / 30;',
  '                this.update(1 / 30);\n                if (this.__novaDestroyed) return;\n                this.mmTimer -= 1 / 30;'],
 ['            (0, render_1.render)(this, this.w, this.h);\n            // minimap',
  '            (0, render_1.render)(this, this.w, this.h);\n            if (this.__novaDestroyed) return;\n            // minimap'],
 ['                this.drawMinimap();\n            }\n            earlierWork = priorWork;',
  '                this.drawMinimap();\n                if (this.__novaDestroyed) return;\n            }\n            earlierWork = priorWork;'],
 ['            this.cb.event({ type: \'gameover\', stats });\n        }\n        // player',
  '            this.cb.event({ type: \'gameover\', stats });\n            if (this.__novaDestroyed) return;\n        }\n        // player'],
 ['    destroy() {\n        cancelAnimationFrame(this.raf);',
  '    destroy() {\n        if (this.__novaDestroyed) return;\n        this.__novaDestroyed = true;\n        cancelAnimationFrame(this.raf);']
];
function protectLifecycle(html){
 const complete=lifecycleGuards.every(([,after])=>count(html,after)===1);
 if(complete)return html;
 if(!lifecycleGuards.every(([before,after])=>count(html,before)===1&&count(html,after)===0))
  throw Error('canonical RAF lifecycle owner drift; refuse materialization');
 for(const [before,after] of lifecycleGuards)html=html.replace(before,after);
 return html;
}


// The React boot effect constructs Game (and attaches listeners) before
// starting its RAF. A synchronous startup failure must release that owner.
const bootBefore="        try {\n            const game = new engine_1.Game(canvas, mm, {";
const bootAfter="        let bootGame = null;\n        try {\n            const game = new engine_1.Game(canvas, mm, {";
const bootConstructorEnd="            }, qualityRef.current);";
const bootConstructorGuard="            }, qualityRef.current);\n            bootGame = game;";
const bootCatchBefore="            console.error('Failed to boot game:', err);\n            gameRef.current = null;";
const bootCatchAfter="            console.error('Failed to boot game:', err);\n            if (bootGame) {\n                try { bootGame.destroy(); }\n                catch (cleanupError) { console.error('Failed to clean up game after boot failure:', cleanupError); }\n            }\n            gameRef.current = null;";
function protectBootCleanup(html){
 const hasBoot=html.includes("Failed to boot game:");
 if(!hasBoot){
  if(html.includes('new engine_1.Game(canvas, mm'))
   throw Error('canonical React boot cleanup owner drift; refuse materialization');
  return html; // standalone RAF owner fixtures do not contain React
 }
 if(count(html,bootAfter)===1&&count(html,bootConstructorGuard)===1&&count(html,bootCatchAfter)===1)return html;
 if(count(html,bootBefore)!==1||count(html,bootConstructorEnd)!==1||
    count(html,bootCatchBefore)!==1||count(html,bootAfter)!==0||
    count(html,bootCatchAfter)!==0)
  throw Error('canonical React boot cleanup owner drift; refuse materialization');
 return html.replace(bootBefore,bootAfter)
  .replace(bootConstructorEnd,bootConstructorGuard)
  .replace(bootCatchBefore,bootCatchAfter);
}


const blurBefore="        window.addEventListener('blur', () => {\n            this.keyboard.up = this.keyboard.down = this.keyboard.left = this.keyboard.right = false;\n            this.firing = false;\n        });";
const blurAfter="        if (!this.__novaBlurHandler) this.__novaBlurHandler = () => {\n            this.keyboard.up = this.keyboard.down = this.keyboard.left = this.keyboard.right = false;\n            this.firing = false;\n        };\n        window.addEventListener('blur', this.__novaBlurHandler);";
const detachBefore="        window.removeEventListener('keyup', this.ku);\n        this.canvas = null;";
const detachAfter="        window.removeEventListener('keyup', this.ku);\n        window.removeEventListener('blur', this.__novaBlurHandler);\n        this.canvas = null;";
function protectInputBlurCleanup(html){
 if(!html.includes('class Input {'))return html;
 if(count(html,blurAfter)===1&&count(html,detachAfter)===1)return html;
 if(count(html,blurBefore)!==1||count(html,detachBefore)!==1||
    count(html,blurAfter)!==0||count(html,detachAfter)!==0)
  throw Error('canonical Input blur lifecycle owner drift; refuse materialization');
 return html.replace(blurBefore,blurAfter).replace(detachBefore,detachAfter);
}
function protectLifecycleCleanup(html){
 return protectInputBlurCleanup(protectBootCleanup(html));
}

function patchRafStepCap(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('    start() {')||!html.includes('this.raf = requestAnimationFrame(loop);'))
  throw Error('canonical game RAF owner missing');
 if(count(html,after)===1&&count(html,withCarry)===1&&
    lifecycleGuards.every(([,guard])=>count(html,guard)===1))return protectLifecycleCleanup(html);
 if(count(html,after)===1&&count(html,withCarry)===1&&count(html,newStep)===1&&
    count(html,newLoopTail)===1&&count(html,before)===0&&count(html,intermediate)===0)return protectLifecycleCleanup(protectLifecycle(html));
 /* The materializer always starts from the compressed canonical shell.
  * Existing materialized HTML can also be upgraded idempotently in tests. */
 const old=count(html,before),mid=count(html,intermediate),prior=count(html,priorStep);
 if(old+mid+prior!==1||count(html,withCarry)!==0||count(html,newStep)!==0||
    count(html,priorCarry)>1||count(html,loopTail)!==1)
  throw Error('canonical RAF time cap drift; refuse materialization');
 if(prior===1){
  if(count(html,priorCarry)!==1)throw Error('canonical RAF time cap drift; refuse materialization');
  return protectLifecycleCleanup(protectLifecycle(html.replace(priorCarry,withCarry)
   .replace(priorStep,newStep).replace(priorLoop,priorLoop+'\n            const workStart = performance.now();').replace(loopTail,newLoopTail)));
 }
 if(count(html,priorCarry)!==0||count(html,anchor)!==1||count(html,oldStep)!==1)
  throw Error('canonical RAF time cap drift; refuse materialization');
 const original=old?before:intermediate;
 const legacy=html.replace(anchor,priorCarry).replace(original,
  '            const elapsed = Math.max(0, (ts - this.last) / 1000);\n'+after)
  .replace(oldStep,priorStep);
 return protectLifecycleCleanup(protectLifecycle(legacy.replace(priorCarry,withCarry)
  .replace(priorStep,newStep).replace(priorLoop,priorLoop+'\n            const workStart = performance.now();').replace(loopTail,newLoopTail)));
}
module.exports={patchRafStepCap,protectBootCleanup,protectInputBlurCleanup,before,intermediate,after};
if(require.main===module){
 const file=process.argv[2];if(!file)throw Error('Usage: node scripts/patch-raf-step-cap.cjs <index.html>');
 const html=fs.readFileSync(file,'utf8'),out=patchRafStepCap(html);
 if(out!==html)fs.writeFileSync(file,out,'utf8');
 console.log('NOVA bounded RAF jitter carry validated');
}
