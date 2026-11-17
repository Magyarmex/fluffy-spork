'use strict';
/* Repair the canonical compressed base AI owner before production composition.
 * The legacy think() treated departing bullets as approaching and could react
 * to bullets outside the observer's actual gameplay viewport or behind cover.
 * Fail closed if upstream source changes; never patch generated index.html.
 */
const fs=require('node:fs');
const before=[
'        if (b.ownerId === t.id)',
'            continue;',
'        const dx = b.x - t.x;',
'        const dy = b.y - t.y;',
'        const d2 = dx * dx + dy * dy;',
'        if (d2 > 150 * 150)',
'            continue;',
'        const sp = Math.hypot(b.vx, b.vy) || 1;',
'        const dot = (dx * b.vx + dy * b.vy) / sp;',
'        if (dot > 0) {'
].join('\n');
const after=[
'        if (b.ownerId === t.id)',
'            continue;',
'        const dx = b.x - t.x;',
'        const dy = b.y - t.y;',
'        const d2 = dx * dx + dy * dy;',
'        if (d2 > 150 * 150)',
'            continue;',
'        // React only to a currently visible projectile with an unobstructed lane.',
'        const fair = window.__NOVA_FAIR_ENGAGEMENT__;',
'        if (fair && typeof fair.inGameplayWorldPoint === "function" &&',
'            !fair.inGameplayWorldPoint(g, t, b.x, b.y))',
'            continue;',
'        if (g.hasLineOfSight && !g.hasLineOfSight(t.x, t.y, b.x, b.y, 3))',
'            continue;',
'        const sp = Math.hypot(b.vx, b.vy) || 1;',
'        const dot = (dx * b.vx + dy * b.vy) / sp;',
'        // dx points from tank to projectile: a negative dot means approaching.',
'        if (dot < 0) {'
].join('\n');
function count(s,needle){return s.split(needle).length-1;}
function patchLegacyProjectileDodge(html){
 if(typeof html!=='string'||!html.includes('function think(t, ai, g) {'))
  throw Error('canonical legacy AI think owner missing');
 const old=count(html,before),done=count(html,after);
 if(!((old===1&&done===0)||(old===0&&done===1)))
  throw Error('canonical legacy AI projectile owner drift; refuse materialization');
 return old===1?html.replace(before,after):html;
}
module.exports={patchLegacyProjectileDodge,before,after};
if(require.main===module){
 const file=process.argv[2];
 if(!file)throw Error('Usage: node scripts/patch-legacy-projectile-dodge.cjs <index.html>');
 const html=fs.readFileSync(file,'utf8'),patched=patchLegacyProjectileDodge(html);
 if(patched!==html)fs.writeFileSync(file,patched,'utf8');
 process.stdout.write('NOVA legacy projectile dodge validated\n');
}
