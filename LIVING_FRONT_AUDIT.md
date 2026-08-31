# NOVA TANKS v1.12.0 — Living Front Completion Audit

**Audit date:** 2026-08-30  
**Purpose:** adversarial design-to-runtime verification after initial implementation.  
**Standard:** a design point does not count as complete merely because a helper, comment, release flag, or regex exists. It must be reachable through the canonical runtime, preserve NOVA fairness/performance contracts, and have regression evidence where deterministic verification is possible.

## Audit perspectives

1. **Design → code traceability:** every normative Living Front rule was mapped to an actual runtime owner.
2. **Canonical lifecycle:** wrappers were checked against the real `game/engine`, terrain, Fair Engagement, performance hash, minimap, Debug, and materialization ownership.
3. **Player-experience semantics:** mechanics were tested against the reason they exist, not just their names (e.g. a Star must actually reward interception rather than tail-chasing).
4. **Information fairness:** shape instincts and AI ecology were checked for through-cover or hidden-sector information leaks.
5. **Performance/lifecycle:** decimated work, spatial queries, DOM observers, scratch reuse, and update ownership were inspected for hidden churn.
6. **Test-the-test:** the strengthened suite was executed from a repository-shaped filesystem so CI-relative paths and module lifecycle assumptions were verified.
7. **Semantic accounting:** telemetry and reward bookkeeping were checked against the actual shared engine containers rather than assuming an array represents only one reward source.

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
| Square negative space | No bespoke Square combat mechanic; only weak physical disturbance susceptibility |
| Cascade geometry | Final impact direction biases Pentagon/Hexagon child velocity |
| Hexagon keystone | Bounded 310-radius, 18-neighbor, terrain-visible attraction |
| Star interception | Fixed ~152 cruise, route/terrain behavior, bounded lifetime, no boss phases |
| Crasher predator grammar | Explicit Track/Telegraph/Charge/Overshoot/Recover, locked commitment, terrain collision |
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
| UI restraint | Short minimap signals, world telegraphs, integrated tactical tips, no permanent ecology HUD |
| Debug observability | Copyable full snapshot + compact behavior/sector metrics + player neutral XP/min |
| Neutral XP attribution | Shape/bounty orbs are tagged and distinguished from tank-death reward orbs |
| Performance cadence | ~4.55 Hz sectors, ~8.33 Hz shape intent, ~1.39 Hz Director, ~3.57 Hz AI |
| Spatial reuse | Canonical entity hash used when available; bounded local queries/scratch arrays |
| Director-off acceptance | Ecology/spawn geography/instincts remain active with Director disabled |

## Automated audit result

The strengthened Living Front suite contains **19 focused tests**. It covers distribution semantics, ecological age, terrain visibility, bounded disturbance, explicit Crasher overshoot, Star chase geometry, Director truthfulness, AI information/route fairness, neutral-vs-PvP XP attribution, performance cadence, UI lifecycle behavior, and canonical `Game` integration.

The three runtime files pass `node --check`. The test suite passes when executed from a repository-shaped directory with repository-relative paths.

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

1. the hardened branch passes the repository-wide build/test CI;
2. it is merged into authoritative `main`;
3. the production materializer emits `index.html` with all three v1.12.0 runtime stages after Fair Engagement;
4. the materialized runtime is smoke-verified;
5. real-device play validates/tunes the empirical gates above.

Until those repository integration steps occur, implementation is complete on the feature branch but the release is not yet legitimately called live.
