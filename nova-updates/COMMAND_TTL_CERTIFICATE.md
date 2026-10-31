# Controller commanded-motion TTL certificate — shipping safety contract

Status: shipped through PR #593 (2026-10-31). This is a narrow certified active-command FORM lane, **not** a general chronological collision solver. The 48-overlay playable game remains canonical.

## Root cause
The core can expire a projectile before querying bodies. Battlefield already recovers certain physically guaranteed pre-expiry contacts, but its generic unknown-motion 1,200u/s drone bound rejected real single-command movements bounded near 200u/s. The exact eight-overlay Run 494 fixture had 189/605 hits across 605 mathematically guaranteed commanded contacts. The regression-first PR #593 test commit failed at 30/60/120/240Hz; the final 605-world replay now registers 605/605 hits.

## Movement authority
1. Battlefield snapshots drone start/phase/speed/epoch and arms an optional trace only for relevant short-TTL shots.
2. Controller records a **single** active `form` `steerDrone` integration when the start matches that snapshot, phase remains ordinary FORM, movement is finite and uncommitted, and the recorded speed bound (max of declared speed and actual integrated velocity) is <=4,000u/s.
3. Battlefield terrain response, Performance cached steering, Terrain Intelligence escape/routing/separation, and Live Vector repair/peel each invalidate or refuse the witness if they alter its movement authority.
4. Live Vector certifies only if all Battlefield/terrain/route/final positions match the Controller endpoint, the drone is still ordinary FORM, there was no dash/commit/terrain bump, and the real terrain segment is clear. Missing or throwing terrain APIs fail closed.
5. Battlefield substitutes the certified speed bound **only** in its existing convex guaranteed-contact proof. The generic 1,200u/s fallback and all other cover, competing-body/projectile, ownership, shield, pierce, arena and damage-authority vetoes remain unchanged.

## Mathematical invariant
For projectile P(t), witnessed drone start D0, certified maximum speed V and combined collision radius R, a positive time t before projectile expiry satisfying `distance(P(t),D0) + V*t < R` proves overlap with **every** continuous drone path obeying V, by the triangle inequality. This does **not** infer an intermediate path from endpoints, nor establish an exact first-contact timestamp; ambiguous earlier events still veto the shortcut.

## Regression and limits
- `tests/node/idle-drone-certified-ttl-contact.test.js`: actual shipping-composition tests at 30/60/120/240Hz, exact 605-contact Run 494 replay, seeded independent positive-time oracles, and negative controls for beyond-TTL, cover, earlier bodies, friendly fire, competing projectiles, dash, windup, cached steering, swarm separation and repair.
- `tests/browser/controller-command-ttl-contact.cjs`: actual 48-overlay desktop/mobile Chromium Game and physical TTL cases, included in the full browser smoke workflow.
- PR #593 exact-head gates: 5,446 Node tests, Android Owner, six natural cover-pressure pairs/collator and Chromium passed.
- Natural-match frequency, real-device FPS and human balance remain unmeasured. Full multi-stage first-contact chronology stays open in issue #234. Do not broaden this certificate without time-stamped motion segments and chronological arbitration.
