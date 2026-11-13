'use strict';
// Research-only HTML response transform. Never write the transformed source
// into the canonical runtime or deploy it as a gameplay change.
const CALLS = Object.freeze([
  'this.damageShape(e, b.dmg, b.vx, b.vy);',
  'this.damageTank(e, b.dmg, b.ownerId, Math.cos(ang) * (b.knock || 0) * 0.006, Math.sin(ang) * (b.knock || 0) * 0.006);',
  'this.damageDrone(e, b.dmg, b.ownerId);'
]);
function patchMaterializedCore(html) {
  if (typeof html !== 'string') throw new TypeError('materialized HTML required');
  const start = html.indexOf('    updateBullets(dt) {');
  const end = html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {', start);
  if (start < 0 || end <= start) throw new Error('shipping core boundaries changed');
  let body = html.slice(start, end);
  if (body.includes('__novaShotLedger.withProjectile'))
    throw new Error('research callback patch already installed');
  for (const call of CALLS) {
    if (body.split(call).length !== 2) throw new Error('expected one core callback: ' + call);
    const guarded = '(this.__novaShotLedger ? this.__novaShotLedger.withProjectile(b, () => ' +
      call.slice(0, -1) + ') : ' + call.slice(0, -1) + ');';
    body = body.replace(call, guarded);
  }
  return html.slice(0, start) + body + html.slice(end);
}

/**
 * Research-only Battlefield response transform. All ten known direct
 * projectile damage calls have a lexical bullet named b in scope. Fail
 * closed on source drift; never infer projectile IDs from owner IDs.
 * Does not instrument cover HP, interception, splash or expiry.
 */
function patchBattlefieldCallbacks(source) {
  if (typeof source !== 'string') throw new TypeError('Battlefield source required');
  if (source.includes('__novaShotLedger.withProjectile'))
    throw new Error('Battlefield research callback patch already installed');
  const re = /NaN
  const matches = [...source.matchAll(re)];
  if (matches.length !== 10)
    throw new Error('expected ten Battlefield projectile damage callbacks, found ' + matches.length);
  const spans = matches.map(match => {
    const open = match.index + match[0].length - 1;
    let depth = 0, end = -1;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (ch === '(') depth++;
      else if (ch === ')' && --depth === 0) { end = i + 1; break; }
      // The known callsites have no string or template arguments. If that
      // changes, refuse to guess at JavaScript lexical boundaries.
      else if (ch === "'" || ch === '"' || ch === '`')
        throw new Error('unsupported Battlefield callback argument syntax');
    }
    if (end < 0) throw new Error('unbalanced Battlefield damage callback');
    return {start:match.index,end};
  });
  let out = source;
  for (const {start,end} of spans.reverse()) {
    const call = source.slice(start,end);
    const receiver = call.startsWith('this.') ? 'this' : 'g';
    const guarded = '(' + receiver + '.__novaShotLedger ? ' +
      receiver + '.__novaShotLedger.withProjectile(b,()=>'+call+') : '+call+')';
    out = out.slice(0,start) + guarded + out.slice(end);
  }
  return out;
}

module.exports = {patchMaterializedCore, patchBattlefieldCallbacks, CALLS};
