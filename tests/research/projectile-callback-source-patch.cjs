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
  for (const call of CALLS) {
    if (body.split(call).length !== 2) throw new Error('expected one core callback: ' + call);
    const guarded = '(this.__novaShotLedger ? this.__novaShotLedger.withProjectile(b, () => ' +
      call.slice(0, -1) + ') : ' + call.slice(0, -1) + ');';
    body = body.replace(call, guarded);
  }
  return html.slice(0, start) + body + html.slice(end);
}
module.exports = {patchMaterializedCore, CALLS};
