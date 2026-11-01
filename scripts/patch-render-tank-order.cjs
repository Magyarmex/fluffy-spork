'use strict';
// The compressed base renderer must never mutate the live simulation tank list.
// Its visual depth sort is performed on a temporary array; simulation ownership
// of the previous 60Hz order is supplied by the final runtime overlay.
const fs = require('node:fs');
const oldComment = '    // PERF: sort g.tanks in place instead of spreading into a fresh array every\n    // frame — draw order is the only thing that depends on this ordering, and\n    // nothing else in the engine relies on tanks[] being in insertion order.\n';
const newComment = '    // Render-only depth sort: simulation tank iteration order must not depend on\n    // display refresh cadence. The simulation owner maintains gameplay order.\n';
const oldLoop = '    g.tanks.sort((a, b) => a.y - b.y);\n    for (const t of g.tanks) {';
const newLoop = '    const drawTanks = g.tanks.slice().sort((a, b) => a.y - b.y);\n    for (const t of drawTanks) {';
const count = (text, needle) => text.split(needle).length - 1;
function patchRenderTankOrder(html) {
  if (typeof html !== 'string') throw new TypeError('expected UTF-8 HTML');
  if (count(html,newLoop)===1 && count(html,newComment)===1 &&
      count(html,oldLoop)===0 && count(html,oldComment)===0) return html;
  if (count(html,oldLoop)!==1 || count(html,oldComment)!==1 ||
      count(html,newLoop)!==0 || count(html,newComment)!==0 ||
      !html.includes('window.__defineModule("game/render"'))
    throw new Error('canonical tank-render owner drift; refuse materialization');
  return html.replace(oldComment,newComment).replace(oldLoop,newLoop);
}
module.exports={patchRenderTankOrder,oldLoop,newLoop,oldComment,newComment};
if (require.main===module) {
  const file=process.argv[2];
  if (!file) throw Error('Usage: node scripts/patch-render-tank-order.cjs <index.html>');
  const html=fs.readFileSync(file,'utf8');
  const out=patchRenderTankOrder(html);
  if (out!==html) fs.writeFileSync(file,out,'utf8');
  console.log('NOVA render-only tank depth order validated');
}
