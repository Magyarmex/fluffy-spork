'use strict';
/* Repair only the canonical decoded Game/menu persistence reads.
 * This is applied to nova-gz's decoded base before the real shipping
 * index.html is assembled. Do not patch generated index.html directly.
 * Reject drift rather than silently shipping an unprotected constructor.
 */
const fs = require('node:fs');

const changes = [
  {
    name: 'engine score record',
    before: "        this.best = Number((0, storage_1.lsGet)('novatanks_best') || 0);",
    after: [
      "        const savedBestScore = Number((0, storage_1.lsGet)('novatanks_best') || 0);",
      '        this.best = Number.isFinite(savedBestScore) && savedBestScore >= 0 ? savedBestScore : 0;'
    ].join('\n')
  },
  {
    name: 'engine level record',
    before: "        this.bestRunLevel = Number((0, storage_1.lsGet)('novatanks_bestlevel') || 0);",
    after: [
      "        const savedBestLevel = Number((0, storage_1.lsGet)('novatanks_bestlevel') || 0);",
      '        this.bestRunLevel = Number.isInteger(savedBestLevel) && savedBestLevel >= 0 && savedBestLevel <= types_1.MAX_LEVEL ? savedBestLevel : 0;'
    ].join('\n')
  },
  {
    name: 'React menu score record',
    before: "best: Number((0, storage_1.lsGet)('novatanks_best') || 0),",
    after: "best: (() => { const score = Number((0, storage_1.lsGet)('novatanks_best') || 0); return Number.isFinite(score) && score >= 0 ? score : 0; })(),"
  }
];

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function patchSavedRecords(html) {
  if (typeof html !== 'string') throw new TypeError('expected UTF-8 HTML');
  if (!html.includes('exports.Game = Game;') ||
      !html.includes('function MenuScreen(') ||
      !html.includes('exports.MAX_LEVEL = 45;')) {
    throw new Error('canonical Game/menu/level owners missing; refuse materialization');
  }
  let out = html;
  for (const {name, before, after} of changes) {
    const original = count(out, before);
    const updated = count(out, after);
    if (original === 0 && updated === 1) continue; // idempotent
    if (original !== 1 || updated !== 0)
      throw new Error(name + ' changed unexpectedly; refuse unsafe materialization');
    out = out.replace(before, after);
  }
  return out;
}

module.exports = {patchSavedRecords, changes};
if (require.main === module) {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: node scripts/patch-saved-records.cjs <index.html>');
  const html = fs.readFileSync(file, 'utf8');
  const patched = patchSavedRecords(html);
  if (patched !== html) fs.writeFileSync(file, patched, 'utf8');
  process.stdout.write('NOVA saved record owners validated\n');
}
