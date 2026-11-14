'use strict';
// Research-only HTML response transform. Never write the transformed source
// into the canonical runtime or deploy it as a gameplay change.
const CALLS = Object.freeze([
  'this.damageShape(e, b.dmg, b.vx, b.vy);',
  'this.damageTank(e, b.dmg, b.ownerId, Math.cos(ang) * (b.knock || 0) * 0.006, Math.sin(ang) * (b.knock || 0) * 0.006);',
  'this.damageDrone(e, b.dmg, b.ownerId);'
]);
function guardedShotCall(call, receiver, source) {
  // An observer is not combat authority. Invoke the real callback exactly
  // once even if a malformed callable observer throws, ignores, or replays it.
  const pre='(()=>{let ledger,method;try{ledger='+receiver+'.__novaShotLedger;method=ledger?.withProjectile;}catch(_){}';
  const once='(()=>{let called=false,ok=false,result,error;const invoke=()=>{' +
    'if(called){if(!ok)throw error;return result;}called=true;' +
    'try{result='+call+';ok=true;return result;}catch(e){error=e;throw e;}};' +
    "try{method.call(ledger,b,()=>invoke(),'direct','"+source+"');}catch(_){}" +
    'if(!called)return invoke();if(!ok)throw error;return result;})()';
  return pre+"return typeof method==='function' ? "+once+' : '+call+';})()';
}
function patchMaterializedCore(html) {
  if (typeof html !== 'string') throw new TypeError('materialized HTML required');
  const start = html.indexOf('    updateBullets(dt) {');
  const end = html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {', start);
  if (start < 0 || end <= start) throw new Error('shipping core boundaries changed');
  let body = html.slice(start, end);
  if (body.includes('let ledger,method;try{ledger=this.__novaShotLedger'))
    throw new Error('research callback patch already installed');
  for (const call of CALLS) {
    if (body.split(call).length !== 2) throw new Error('expected one core callback: ' + call);
    // Only observer property access is guarded. Never catch the real callback:
    // doing so could run damage twice or swallow a legitimate combat error.
    const guarded = guardedShotCall(call.slice(0,-1),'this','core')+';';
    body = body.replace(call, guarded);
  }
  return html.slice(0, start) + body + html.slice(end);
}

/** Research-only witness at the real core endpoint interception owner.
 * The pair has already been weakened before observation. This is NOT an
 * authoritative continuous first-contact time or a new combat solver. */
function patchMaterializedInterception(html) {
  if (typeof html !== 'string') throw new TypeError('materialized HTML required');
  const start=html.indexOf('    resolveBulletCollisions() {');
  const end=html.indexOf('    updateBullets(dt) {',start);
  if(start<0||end<=start)throw new Error('shipping interception boundaries changed');
  let body=html.slice(start,end);
  if(body.includes('recordProjectileInterception'))throw new Error('research interception patch already installed');
  const owner='                this.weakenBullet(a, bh);\n                this.weakenBullet(b, ah);';
  if(body.split(owner).length!==2)throw new Error('core endpoint interception owner changed');
  const witness='\n                try { const ledger = this.__novaShotLedger;\n' +
    '                    const method = ledger?.recordProjectileInterception;\n' +
    '                    if (typeof method === \'function\') method.call(ledger,a,b,ah,bh);\n' +
    '                } catch (_) { /* research observation cannot interrupt combat */ }';
  body=body.replace(owner,owner+witness);
  return html.slice(0,start)+body+html.slice(end);
}

/** Research-only core terminal retirement witness. The authoritative core
 * checks TTL and arena bounds before collision resolution. Record only a
 * previously live projectile's transition to dead, after the real mutation;
 * this is frame-end evidence, not an exact impact timestamp or missed hit. */
function patchMaterializedRetirement(html) {
  if (typeof html !== 'string') throw new TypeError('materialized HTML required');
  const start=html.indexOf('    updateBullets(dt) {');
  const end=html.indexOf('    splashAt(x, y, radius, frac, ownerId, knock, color, dmg) {',start);
  if(start<0||end<=start)throw new Error('shipping core boundaries changed');
  let body=html.slice(start,end);
  const original='                b.dead = true;\n            }\n        }\n        this.resolveBulletCollisions();';
  if(body.includes('recordProjectileRetirement'))throw new Error('research retirement patch already installed');
  if(body.split(original).length!==2)throw new Error('core terminal retirement owner changed');
  const guarded='                const wasAlive = !b.dead;\n                b.dead = true;\n' +
    '                if (wasAlive) {\n' +
    '                    try { const ledger = this.__novaShotLedger;\n' +
    '                        const method = ledger?.recordProjectileRetirement;\n' +
    "                        if (typeof method === 'function') method.call(ledger,b,b.ttl<=0 ? (b.x < -M+20 || b.x > M-20 || b.y < -M+20 || b.y > M-20 ? 'ttl-or-bounds' : 'ttl') : 'bounds');\n" +
    '                    } catch (_) { /* observation never blocks retirement */ }\n' +
    '                }\n            }\n        }\n        this.resolveBulletCollisions();';
  body=body.replace(original,guarded);
  // Frame-start liveness excludes already-intercepted shots. A second
  // terminal check excludes shots killed during the core advance; shell
  // bursts happen afterward and cannot erase a witnessed TTL transition.
  const first='            const b = this.bullets[i];\n            this.initBulletIntegrity(b);';
  if(body.split(first).length!==2)throw new Error('core frame-start bullet owner changed');
  body=body.replace(first,'            const b = this.bullets[i];\n            const wasAlive = !b.dead;\n            this.initBulletIntegrity(b);');
  const beforeBurst='                if (b.shell)\n                    this.clusterBurst(b);\n                const wasAlive = !b.dead;';
  if(body.split(beforeBurst).length!==2)throw new Error('core shell retirement owner changed');
  body=body.replace(beforeBurst,'                const eligibleAtTerminal = wasAlive && !b.dead;\n                if (b.shell)\n                    this.clusterBurst(b);');
  body=body.replace('                if (wasAlive) {','                if (eligibleAtTerminal) {');
  return html.slice(0,start)+body+html.slice(end);
}

/**
 * Research-only Battlefield response transform. All ten known direct
 * projectile damage calls have a lexical bullet named b in scope. Fail
 * closed on source drift; never infer projectile IDs from owner IDs.
 * Does not instrument cover HP, interception, splash or expiry.
 */
// These are the ten actual shipping Battlefield damage owners, not merely a
// count of calls. A renamed/reordered argument can change attribution while
// preserving the count, so the research transform must refuse source drift.
const BATTLEFIELD_CALL_SIGNATURES = Object.freeze([
  'this.damageShape(e,b.dmg,b.vx,b.vy)',
  'this.damageTank(e,b.dmg,b.ownerId,Math.cos(ang)*(b.knock||0)*.006,Math.sin(ang)*(b.knock||0)*.006)',
  'this.damageDrone(e,b.dmg,b.ownerId)',
  'g.damageTank(hit.e,b.dmg,b.ownerId,kx,ky)',
  'g.damageTank(best.e,b.dmg,b.ownerId,Math.cos(ang)*(b.knock||0)*.006,Math.sin(ang)*(b.knock||0)*.006)',
  'g.damageShape(best.e,b.dmg,vx,vy)',
  'g.damageDrone(best.e,b.dmg,b.ownerId)',
  'g.damageShape(hit.e,b.dmg,b.vx,b.vy)',
  'g.damageTank(victim,b.dmg,b.ownerId,0,0)',
  'g.damageShape(victim,b.dmg,b.vx,b.vy)'
]);
function normalizedCall(s) { return s.replace(/\s+/g, ''); }
function patchBattlefieldCallbacks(source) {
  if (typeof source !== 'string') throw new TypeError('Battlefield source required');
  if (source.includes('let ledger,method;try{ledger='))
    throw new Error('Battlefield research callback patch already installed');
  const re = /\b(?:g|this)\.damage(?:Tank|Shape|Drone)\s*\(/g;
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
    const actual = normalizedCall(source.slice(match.index,end));
    const expected = normalizedCall(BATTLEFIELD_CALL_SIGNATURES[matches.indexOf(match)]);
    if (actual !== expected) throw new Error('Battlefield callback signature drift at '+match.index);
    return {start:match.index,end};
  });
  let out = source;
  for (const {start,end} of spans.reverse()) {
    const call = source.slice(start,end);
    const receiver = call.startsWith('this.') ? 'this' : 'g';
    const guarded = guardedShotCall(call,receiver,'battlefield');
    out = out.slice(0,start) + guarded + out.slice(end);
  }
  return out;
}

/** Record actual cover HP writes after the authoritative mutation. This is
 * not a first-contact timestamp; it cannot classify terrain chronology. */
function patchBattlefieldCover(source) {
  if (typeof source !== 'string') throw new TypeError('Battlefield source required');
  const target = 'var oldHp=s.hp;s.hp-=dmg*mult;';
  if (source.includes('method.call(ledger,bullet,s,oldHp,s.hp)'))
    throw new Error('research cover patch already installed');
  if (source.split(target).length !== 2)
    throw new Error('expected one authoritative cover HP write');
  const witness = 'try{var ledger=g.__novaShotLedger;var method=ledger?.recordCoverDamage;' +
    "if(bullet!=null&&Object.hasOwn(bullet,'id')&&typeof method==='function')method.call(ledger,bullet,s,oldHp,s.hp);" +
    '}catch(_){/* research observation must not interrupt cover damage */}';
  return source.replace(target,target+witness);
}
module.exports = {patchMaterializedCore, patchMaterializedRetirement, patchMaterializedInterception, patchBattlefieldCallbacks, patchBattlefieldCover, guardedShotCall, CALLS};
