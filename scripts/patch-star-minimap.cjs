'use strict';
/* Surgical source-level correction to the decoded canonical engine.
 * The legacy base minimap deliberately shows ordinary neutral resource dots,
 * but a Rogue Star must not become an always-on through-cover live tracker.
 * Apply before the shipping HTML is composed, never by swapping g.shapes or
 * painting over pixels after the original draw. Fail closed on source drift. */
const fs=require('node:fs');

const BEFORE=[
  '        for (const s of this.shapes) {',
  '            ctx.fillStyle = types_1.SHAPE_DEFS[s.type].color;'
].join('\n');
const AFTER=[
  '        for (const s of this.shapes) {',
  '            // Rogue Stars are interception prey, not global live radar.',
  '            // Ordinary resource dots retain the established farming map.',
  '            if (s.type === \'star\') {',
  '                const p = this.player;',
  '                const fair = window.__NOVA_FAIR_ENGAGEMENT__;',
  '                if (!p || !p.alive || !fair || !fair.inGameplayViewport ||',
  '                    !fair.inGameplayViewport(this, p, s) ||',
  '                    (this.hasLineOfSight && !this.hasLineOfSight(p.x, p.y, s.x, s.y, 3)))',
  '                    continue;',
  '            }',
  '            ctx.fillStyle = types_1.SHAPE_DEFS[s.type].color;'
].join('\n');
function count(haystack,needle){return haystack.split(needle).length-1;}
function patchStarMinimap(html){
  if(typeof html!=='string')throw new TypeError('expected UTF-8 HTML');
  if(count(html,AFTER)===1&&count(html,BEFORE)===0)return html;
  if(count(html,BEFORE)!==1||count(html,AFTER)!==0)
    throw new Error('canonical Game.drawMinimap shape loop drifted; refuse unsafe materialization');
  if(!html.includes('    drawMinimap() {')||!html.includes('exports.Game = Game;'))
    throw new Error('canonical Game.drawMinimap owner missing');
  return html.replace(BEFORE,AFTER);
}
module.exports={patchStarMinimap,BEFORE,AFTER};
if(require.main===module){
  const file=process.argv[2];
  if(!file)throw new Error('Usage: node scripts/patch-star-minimap.cjs <index.html>');
  const html=fs.readFileSync(file,'utf8');
  const patched=patchStarMinimap(html);
  if(patched!==html)fs.writeFileSync(file,patched,'utf8');
  process.stdout.write('Rogue Star minimap visibility owner validated\n');
}
