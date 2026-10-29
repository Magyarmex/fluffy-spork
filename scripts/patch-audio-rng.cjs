'use strict';
/* The canonical Sfx.ensure 0.5s white-noise buffer consumed 22,050 global
 * Math.random draws at 44.1kHz. A matched real-engine causal experiment
 * (PR #507) found 24/24 physical divergences when this buffer was initialized,
 * versus 0/24 when its waveform was erased after consuming the same draws.
 * Keep sound generation local: never advance gameplay RNG for audio.
 */
const fs=require('node:fs');
const before=[
 '            for (let i = 0; i < len; i++)',
 '                d[i] = Math.random() * 2 - 1;'
].join('\n');
const after=[
 '            // Stable local noise stream; never perturb gameplay decisions.',
 '            let noiseSeed = ((this.ctx.sampleRate >>> 0) ^ 0x6d2b79f5) >>> 0 || 1;',
 '            for (let i = 0; i < len; i++) {',
 '                noiseSeed ^= noiseSeed << 13;',
 '                noiseSeed ^= noiseSeed >>> 17;',
 '                noiseSeed ^= noiseSeed << 5;',
 '                d[i] = (noiseSeed >>> 0) / 2147483648 - 1;',
 '            }'
].join('\n');
const count=(s,x)=>s.split(x).length-1;
function patchAudioRng(html){
 if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
 if(!html.includes('window.__defineModule("game/audio"')||
    !html.includes('class Sfx {'))throw Error('canonical Sfx owner missing');
 const old=count(html,before),patched=count(html,after);
 if(old===0&&patched===1)return html;
 if(old!==1||patched!==0)throw Error('canonical audio noise owner drift');
 return html.replace(before,after);
}
module.exports={patchAudioRng,before,after};
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw Error('Usage: node scripts/patch-audio-rng.cjs <index.html>');
 const raw=fs.readFileSync(file,'utf8'),patched=patchAudioRng(raw);
 if(patched!==raw)fs.writeFileSync(file,patched,'utf8');
 process.stdout.write('NOVA core audio RNG isolated and validated\n');
}
