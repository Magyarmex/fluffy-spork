# NOVA TANKS v1.12.0 — Living Front Completion Audit

**Audit date:** 2026-08-31  
**Purpose:** adversarial design-to-runtime verification after initial implementation.  
**Standard:** a design point does not count as complete merely because a helper, comment, release flag, or regex exists. It must be reachable through the canonical runtime, preserve NOVA fairness/performance/governance contracts, and have regression evidence where deterministic verification is possible.

## Audit perspectives

1. **Design → code traceability:** every normative Living Front rule was mapped to an actual runtime owner.
2. **Canonical lifecycle:** wrappers were checked against the real `game/engine`, terrain, Fair Engagement, performance hash, minimap, Debug, and materialization ownership.
3. **Player-experience semantics:** mechanics were tested against the reason they exist, not just their names (e.g. a Star must actually reward interception rather than tail-chasing).
4. **Information fairness:** shape instincts and AI ecology were checked for through-cover or hidden-sector information leaks.
5. **Performance/lifecycle:** decimated work, spatial queries, DOM observers, scratch reuse, and update ownership were inspected for hidden churn.
6. **Test-the-test:** the strengthened suite was executed from a repository-shaped filesystem so CI-relative paths and module lifecycle assumptions were verified.
7. **Semantic accounting:** telemetry and reward bookkeeping were checked against the actual shared engine containers rather than assuming an array represents only one reward source.
8. **Optimized-path parity:** fallback behavior was compared against the actual Zero Churn spatial-index path so an optimization could not silently remove information a mechanic depends on.
9. **Cross-release governance:** Living Front was checked against standing post-v1.10 contracts such as Signal Discipline instead of treating a new major update as exempt from prior design law.
10. **System ownership:** player-facing integrations were checked for use of canonical owners (Fieldcraft, Living Archive, Debug, materializer) rather than parallel DOM/runtime mechanisms that merely look correct on screen.
11. **External review:** automated PR review findings were rechecked against the current production owners, not dismissed merely because the focused suite was green.

## Misses found and corrected

### 1. Match-age ceiling was cosmetic to spawn concentration

The first implementation capped sector maturity, but high-value spawn placement divided maturity by that same ceiling. An early sector at its low ceiling could therefore still score as fully mature and attract Hexagons/Pentagons too strongly.

**Correction:** high-value geographic concentration is now explicitly multiplied by shared match-age progress. Early high-value seed/replenishment remains distributed; mature concentration strengthens gradually later in the match. Requested shape types and the 62/30/16/8/4 quotas remain untouched.

### 2. Some neutral instincts could react through solid cover

Circle schooling/danger response and Hexagon attraction used local proximity but did not consistently require terrain visibility.

**Correction:** relevant Circle, Triangle, Hexagon, Crasher, disturbance and predator interactions are line-of-sight gated where the physical interaction would otherwise cross a wall. Terrain still supplies collision/routing through the canonical Battlefield systems.

### 3. Near-fire/explosion herding was only partially real

Sector pressure reacted to combat and player proximity could move skittish shapes, but the documented ability for near fire/explosions to physically herd appropriate prey was incomplete.

**Correction:** Circles and Triangles now react locally to nearby visible fire; blast disturbance can physically nudge susceptible shapes. Squares resist strongly, Pentagons resist almost entirely, and Hexagons/Stars/Crashers do not become herding units. Per-shape disturbance memory creates diminishing response so empty-fire rituals do not become optimal play.

### 4. Crasher “Overshoot” existed only implicitly

The intended grammar was `Track → Telegraph → Commit → Charge → Overshoot → Recover`, but the initial state machine jumped directly from charge to recovery.

**Correction:** Overshoot is now an explicit committed state with locked bearing, short continued travel, telemetry, visual residue, and recovery afterward. Terrain collision can still abort commitment physically.

### 5. Rogue Star speed contradicted its gameplay identity

The initial Star cruise was about 92 world units/s (`78 × 1.18`), while an ordinary tank starts around 124 units/s before many class/stat bonuses. Tail-chasing was therefore often easier than interception.

**Correction:** Star cruise is now approximately 152 units/s (`78 × 1.95`). It materially outruns ordinary unbuffed tanks without rubber-banding to the player and remains readily interceptable by projectiles/route prediction.

### 6. Debug integration could wake itself repeatedly

The initial Debug MutationObserver could respond to DOM changes made by its own refresh rendering, causing avoidable repeated work while Debug was open.

**Correction:** Living Front Debug now binds once per Debug panel and refreshes from the existing Debug refresh action. The root observer is discovery-only.

### 7. Strengthened tests initially contained a local-only path

The adversarial test harness briefly used `/tmp/lf` paths, which proved local logic but would fail in CI.

**Correction:** all test inputs are repository-relative (`../../nova-updates/...`) and the suite was rerun from a repo-shaped temporary tree.

### 8. Neutral XP/min telemetry was contaminated by tank-kill orbs

NOVA intentionally uses the same `orbs` array for neutral-shape XP and a fraction of defeated-tank rewards. The first Living Front farming telemetry wrapper counted every player XP gain occurring during `updateOrbs`, so PvP reward orbs could inflate the metric intended to evaluate ecological farming skill.

**Correction:** Living Front marks only shape/bounty orbs as neutral and associates the player XP delta with the exact orb being removed. A player can collect a neutral orb and an equal-value tank-kill orb in the same update; total XP correctly includes both while `playerNeutralXP` includes only the neutral one. This keeps the intended 15–25% skilled-farming validation metric meaningful.

### 9. The optimized entity hash silently omitted bullets

Zero Churn's canonical spatial hash intentionally indexes shapes and living tanks, not projectiles. Living Front's fallback local query scanned bullets, but the optimized path returned immediately after `g.hash.query`. On the real production path this could therefore remove bullets from Triangle threat recognition and near-fire herding while the simpler test harness still passed.

**Correction:** Wild Instincts now builds one reusable bullet spatial index per decimated behavior tick. Living Front merges nearby bullets from that index into canonical local hash queries, preserving optimized locality without reintroducing shape×all-projectile scans. A dedicated regression supplies a canonical-style hash that omits bullets and verifies the incoming projectile still reaches Triangle threat logic.

### 10. Living Front visuals initially violated Signal Discipline metadata governance

Repository-wide CI caught a release-integration problem the focused gameplay suite did not: post-v1.10.9 runtime files that directly draw player-facing visuals must declare `NOVA_VISUAL_INTENT`. Living Front registered its individual world effects with `NOVAVisuals`, but the Stage I minimap owner and Stage II world-telegraph owner did not carry the required file-level declarations.

**Correction:** Stage I now declares its minimap spatial-navigation intent and Stage II declares its world-telegraph intent. The standing Signal Discipline test was preserved unchanged, and Living Front has its own focused visual-intent regressions so future edits cannot silently drop the declaration.

### 11. Tactical tips bypassed Fieldcraft and rewrote the rendered tip line

The first Stage III implementation stored seven useful tactical tips but inserted them by observing `.nv-tip-line` and replacing every third rendered tip. This looked functional while bypassing Fieldcraft's stable IDs, tags, freshness metadata, randomized shuffle bags, anti-repeat behavior, and canonical 10.4-second cadence.

**Correction:** all seven Living Front tips are now registered through `window.NOVATips.registerMany` with stable `living-front-*` IDs, relevant tags, reviewed date, and release source. Fieldcraft exclusively owns rendering, randomization, and cadence. Living Front no longer queries, observes, or rewrites the rendered tip line. Focused tests inject a fake Fieldcraft registry, verify exactly seven valid registrations, and forbid the old DOM interception patterns.

### 12. Crasher terrain collision state could poison every future charge

Automated PR review found a cross-owner lifecycle mismatch that the prior Living Front tests did not model. Battlefield's `circleResolve()` writes `__novaTerrainBumpT = .22` on any colliding shape, while Battlefield's built-in decrement occurs only in its AI-tank wrapper. Neutral shapes therefore retain the marker indefinitely after leaving terrain. Living Front correctly checked the marker to make a wall collision interrupt a committed Crasher charge, but the stale value could make every later charge abort instantly as well.

**Correction:** Wild Instincts now decays the Battlefield bump marker for Crashers at the same decimated behavior cadence, before charge evaluation. A marker freshly refreshed by the just-finished physics step remains positive and still interrupts the current charge; if terrain no longer refreshes it, the next behavior tick expires it to zero, allowing later charges to work normally. `living-front-crasher-terrain-v1.12.0.test.js` verifies both the `.22 → positive → 0` lifecycle and execution order.

## Verified contracts

| Design contract | Runtime evidence |
| --- | --- |
| 4×4 invisible ecology | Stage I sector state, bounds/index helpers, 16-sector lifecycle tests |
| Quiet maturity / disturbance decay | Stage I `advanceSector`, pressure/harvest/combat decay tests |
| Global quotas preserved | Stage I relocates requested types; no type substitution; lifecycle regression |
| Age-based richer late game | Stage I age-progress spawn weighting + Stage III Bloom age gate |
| No XP multiplier zones | Value remains physical entities/orbs only |
| Circle schooling | Stage II local, terrain-visible alignment and danger drift |
| Triangle committed evade | Threat intersection + LOS + cooldown + committed lateral displacement |
| Projectile optimized-path parity | Canonical entity hash is augmented by a reused local bullet index |
| Square negative space | No bespoke Square combat mechanic; only weak physical disturbance susceptibility |
| Cascade geometry | Final impact direction biases Pentagon/Hexagon child velocity |
| Hexagon keystone | Bounded 310-radius, 18-neighbor, terrain-visible attraction |
| Star interception | Fixed ~152 cruise, route/terrain behavior, bounded lifetime, no boss phases |
| Crasher predator grammar | Explicit Track/Telegraph/Charge/Overshoot/Recover, locked commitment, terrain collision |
| Crasher terrain lifecycle | Fresh Battlefield bump interrupts current commitment; stale shape marker decays before future charge evaluation |
| Fed Crasher reward only | Capped bounty modifies eventual XP only; no HP/damage/speed growth |
| Physical migration | Neighbor bias + actual boundary-crossing records; no teleportation |
| Bounded herding | Local proximity/fire/blast response + resistance + diminishing returns |
| Bloom truthfulness | Reports existing value only; Bloom branch never spawns value |
| Migration truthfulness | Requires accumulated real crossings |
| Rogue Star uniqueness | Sole Director-created opportunity; max one live Star gate |
| AI fairness | Public signals + Fair Engagement viewport + terrain LOS; no hidden maturity read |
| AI anti-dogpile | Opportunity saturation penalty + deterministic damping + fight/health gates |
| AI difficulty by judgment | Elite cadence/judgment differs without extra information or stats |
| Controller strategy remains player-owned | No ecology command/autonomous cross-map Controller objective layer added |
| Signal Discipline | Stage I/II visual owners declare `NOVA_VISUAL_INTENT`; existing cross-release governance remains green |
| UI restraint | Short minimap signals, world telegraphs, no permanent ecology HUD |
| Fieldcraft ownership | Seven stable tagged tips register through `NOVATips`; no rendered-tip DOM interception |
| Living Archive ownership | Stage III exposes a normal `__NOVA_*_RELEASE__` object for the existing archive collector instead of creating a second history UI |
| Debug observability | Copyable full snapshot + compact behavior/sector metrics + player neutral XP/min |
| Neutral XP attribution | Shape/bounty orbs are tagged and distinguished from tank-death reward orbs |
| Performance cadence | ~4.55 Hz sectors, ~8.33 Hz shape intent, ~1.39 Hz Director, ~3.57 Hz AI |
| Spatial reuse | Canonical entity hash + reusable bullet buckets; bounded local queries/scratch arrays |
| Director-off acceptance | Ecology/spawn geography/instincts remain active with Director disabled |

## Automated audit result

Living Front now carries **26 focused tests across four test files**:

- 20 gameplay/runtime/integration tests in `living-front-v1.12.0.test.js`;
- 2 Signal Discipline declaration tests in `living-front-visual-intent-v1.12.0.test.js`;
- 2 Fieldcraft ownership tests in `living-front-fieldcraft-v1.12.0.test.js`;
- 2 Crasher terrain-lifecycle tests in `living-front-crasher-terrain-v1.12.0.test.js`.

They cover distribution semantics, ecological age, terrain visibility, optimized projectile-query parity, bounded disturbance, explicit Crasher overshoot, Crasher terrain-marker expiry, Star chase geometry, Director truthfulness, AI information/route fairness, neutral-vs-PvP XP attribution, performance cadence, Debug lifecycle, canonical `Game` integration, visual-governance declarations, and canonical tactical-tip registration.

The three runtime files pass `node --check`. Repository-wide CI remains the authoritative integration gate.

## What automation cannot truthfully certify

The following remain **empirical release validation**, not missing implementation:

- exact touch-screen annoyance/readability of Triangle evades;
- ideal Crasher telegraph timing under real phone input/display latency;
- Star route difficulty on portrait versus landscape devices;
- whether skilled ecological play lands in the intended ~15–25% XP/min advantage over ordinary farming;
- subjective visual/audio salience in very dense Controller/projectile fights;
- device-specific thermal/frame stability over long sessions.

These are deliberately instrumented so real play can tune them without inventing new systems. A failure in these gates should cause tuning/simplification, not feature expansion.

## Completion criterion

Living Front counts as structurally complete only after:

1. the frozen candidate head passes the repository-wide build/test CI;
2. all current review findings are resolved against that head;
3. it is merged into authoritative `main`;
4. the production materializer emits `index.html` with all three v1.12.0 runtime stages after Fair Engagement;
5. the materialized runtime is smoke-verified, including Living Archive recognition of v1.12.0;
6. real-device play validates/tunes the empirical gates above.

Until those repository integration steps occur, implementation is complete on the feature branch but the release is not yet legitimately called live.