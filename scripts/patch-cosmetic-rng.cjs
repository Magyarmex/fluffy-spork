'use strict';
/* Surgical separation of canonical base presentation RNG from gameplay RNG.
 * Proven causal leak: 24/24 matched 8s real-engine A/B worlds diverged when
 * addParticles draws were muted; 0/24 diverged when the same draws were
 * consumed but the visual particle state was erased (PR #505 / issue #504).
 *
 * Do not replace global Math.random or touch gameplay spread, AI, ecology,
 * or spawning. The per-Game xorshift stream is seeded solely from already
 * established game state, never by drawing from the gameplay stream.
 */
const fs=require('node:fs');
const marker="    addParticles(x, y, color, n, speed, kind = 'spark') {";
const methods=[
 '    cosmeticRandom() {',
 '        let s = this.__novaCosmeticRngState;',
 '        if (!s) {',
 '            const id = (this.nextId || 1) >>> 0;',
 '            const tick = Number.isFinite(this.time) ? Math.floor(this.time * 1000) : 0;',
 '            s = (Math.imul(id, 0x9e3779b1) ^ tick ^ 0x85ebca6b) >>> 0;',
 '            if (!s) s = 0x6d2b79f5;',
 '        }',
 '        s ^= s << 13;',
 '        s ^= s >>> 17;',
 '        s ^= s << 5;',
 '        this.__novaCosmeticRngState = s >>> 0;',
 '        return this.__novaCosmeticRngState / 4294967296;',
 '    }',
 '    cosmeticRnd(a = 1, b) {',
 '        const r = this.cosmeticRandom();',
 '        return b === undefined ? r * a : a + r * (b - a);',
 '    }'
].join('\n')+'\n';
const patches=[
 ['    addParticles(', '    addRing(', [
  ['(0, types_1.rnd)(types_1.TAU)','this.cosmeticRnd(types_1.TAU)',1],
  ['(0, types_1.rnd)(speed * 0.3, speed)','this.cosmeticRnd(speed * 0.3, speed)',1],
  ['(0, types_1.rnd)(0.25, 0.6)','this.cosmeticRnd(0.25, 0.6)',1],
  ['(0, types_1.rnd)(20, 50)','this.cosmeticRnd(20, 50)',1],
  ['(0, types_1.rnd)(2, 4.5)','this.cosmeticRnd(2, 4.5)',1]
 ]],
 ['    addImpactDebris(', '    feedMsg(', [
  ['(0, types_1.rnd)(-0.6, 0.6)','this.cosmeticRnd(-0.6, 0.6)',1],
  ['(0, types_1.rnd)(70, 180)','this.cosmeticRnd(70, 180)',1],
  ['(0, types_1.rnd)(0.18, 0.42)','this.cosmeticRnd(0.18, 0.42)',1],
  ['(0, types_1.rnd)(1.8, 3.8)','this.cosmeticRnd(1.8, 3.8)',1]
 ]],
 ['    damageTank(', '    killTank(', [
  ['else if (Math.random() < 0.5)', 'else if ((typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random()) < 0.5)',1],
  ['        if (Math.random() < 0.5)\n            this.addText', '        if ((typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random()) < 0.5)\n            this.addText',1],
  ['(0, types_1.rnd)(-10, 10)', '(typeof this.cosmeticRnd === "function" ? this.cosmeticRnd(-10, 10) : (0, types_1.rnd)(-10, 10))',1]
 ]],
 ['    updateBullets(', '    splashAt(', [
  ['if (b.beam && Math.random() < 0.85)', 'if (b.beam && (typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random()) < 0.85)',1],
  ['else if (Math.random() < 0.22)', 'else if ((typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random()) < 0.22)',1]
 ]],
 ['function render(g, w, h) {', '    ctx.setTransform(', [
  ['(Math.random() - 0.5) * cam.shake * 14', '(g.cosmeticRandom() - 0.5) * cam.shake * 14',2]
 ]]
];
function count(s,needle){return s.split(needle).length-1;}
function patchCosmeticRng(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('window.__defineModule("game/engine"')||
    !html.includes('window.__defineModule("game/render"'))
  throw Error('canonical shipping Game/render owners missing');
 let out=html;
 if(count(out,methods)===0){
  if(count(out,marker)!==1)throw Error('canonical addParticles owner drift');
  out=out.replace(marker,methods+marker);
 }else if(count(out,methods)!==1)throw Error('duplicate cosmetic RNG owner');
 for(const [start,end,changes] of patches){
  const a=out.indexOf(start),b=out.indexOf(end,a+start.length);
  if(a<0||b<a)throw Error('canonical cosmetic region missing: '+start);
  let part=out.slice(a,b);
  for(const [before,after,expected] of changes){
   const old=count(part,before),newCount=count(part,after);
   if(old===expected&&newCount===0)part=part.split(before).join(after);
   else if(old===0&&newCount===expected){} // idempotent
   else if(old===expected&&newCount===expected&&after.includes(before)){} // guarded fallback contains original expression
   else {
    // Older materialized shells already contain the direct cosmetic call.
    // Upgrade them without weakening the canonical Game path; isolated
    // regression harnesses may lack the cosmetic method entirely.
    const legacy=after.replace('(typeof this.cosmeticRandom === "function" ? this.cosmeticRandom() : Math.random())','this.cosmeticRandom()')
      .replace('(typeof this.cosmeticRnd === "function" ? this.cosmeticRnd(-10, 10) : (0, types_1.rnd)(-10, 10))','this.cosmeticRnd(-10, 10)');
    if(old===0&&legacy!==after&&count(part,legacy)===expected)
     part=part.split(legacy).join(after);
    else throw Error('canonical cosmetic source drift: '+start+' '+before);
   }
  }
  out=out.slice(0,a)+part+out.slice(b);
 }
 const beforeRing='if (ah + bh > 40 || Math.random() < 0.18)';
 const afterRing='if (ah + bh > 40 || this.cosmeticRandom() < 0.18)';
 if(count(out,beforeRing)===1&&count(out,afterRing)===0)
  out=out.replace(beforeRing,afterRing);
 else if(count(out,beforeRing)!==0||count(out,afterRing)!==1)
  throw Error('canonical bullet ring visual RNG drift');
 return out;
}
module.exports={patchCosmeticRng,marker,methods};
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw Error('Usage: node scripts/patch-cosmetic-rng.cjs <index.html>');
 const source=fs.readFileSync(file,'utf8');
 const patched=patchCosmeticRng(source);
 if(patched!==source)fs.writeFileSync(file,patched,'utf8');
 process.stdout.write('NOVA cosmetic RNG isolated and validated\n');
}
