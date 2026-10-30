'use strict';
/* Surgical repair to the canonical decoded base AI owner. The original
 * 0.004 chance is per AI update, not per second; 30/60/120Hz therefore
 * changed reversal frequency. Preserve the historical 60Hz rate while
 * keeping one random draw and the original strafe/counterplay grammar.
 * This patch is applied BEFORE production composition. Fail closed on drift.
 */
const fs = require('node:fs');
const before = [
  '        // strafe direction flips occasionally',
  '        if (Math.random() < 0.004)',
  '            ai.strafe *= -1;'
].join('\n');
const after = [
  '        // Strafe reversal probability is time-based (60 Hz reference).',
  '        if (Math.random() < 1 - Math.pow(0.996, Math.max(0, dt) * 60))',
  '            ai.strafe *= -1;'
].join('\n');
/* The legacy ability lottery still consumes a global random draw on every
 * ready AI tick even though Predator owns the actual tactical decision.
 * Suppress ONLY that dormant draw while Predator is actively executing.
 * Standalone legacy AI retains its 60Hz-equivalent chance per simulated second.
 */
const abilityBefore = [
  '        if (Math.random() < 0.02)',
  '            g.useAbility(t);'
].join('\n');
const abilityAfter = [
  '        // Predator owns ability intent: no unused gameplay RNG draw.',
  '        if (!ai.__novaPredatorAbilityOwned && dt > 0 && Math.random() < 1 - Math.pow(0.98, Math.max(0, dt) * 60))',
  '            g.useAbility(t);'
].join('\n');
function count(s, needle) { return s.split(needle).length - 1; }
function patchAIStrafeTimebase(html) {
  if(typeof html !== 'string') throw new TypeError('expected UTF-8 HTML');
  if(!html.includes('function updateAI(t, g, dt)') ||
     !html.includes('exports.updateAI = updateAI;'))
    throw Error('canonical AI owner missing; refuse materialization');
  const original=count(html,before),patched=count(html,after);
  if(!((original===1 && patched===0)||(original===0 && patched===1)))
    throw Error('canonical AI strafe timebase changed unexpectedly; refuse materialization');
  const abilityOriginal=count(html,abilityBefore),abilityPatched=count(html,abilityAfter);
  if(!((abilityOriginal===1 && abilityPatched===0)||
       (abilityOriginal===0 && abilityPatched===1)))
    throw Error('canonical AI ability owner changed unexpectedly; refuse materialization');
  let out=original===1?html.replace(before,after):html;
  if(abilityOriginal===1)out=out.replace(abilityBefore,abilityAfter);
  return out;
}
module.exports={patchAIStrafeTimebase,before,after,abilityBefore,abilityAfter};
if(require.main===module){
  const file=process.argv[2];
  if(!file)throw Error('Usage: node scripts/patch-ai-strafe-timebase.cjs <index.html>');
  const html=fs.readFileSync(file,'utf8');
  const patched=patchAIStrafeTimebase(html);
  if(patched!==html)fs.writeFileSync(file,patched,'utf8');
  process.stdout.write('NOVA AI strafe timebase validated\n');
}
