# NOVA Foundation — Legacy Patch Register

**Mission:** 01 — Initiative Control & Baseline Freeze  
**Frozen specimen:** `main@52009c406b948a7b9a9402bb56495f20b3918ba6`  
**`nova-updates` tree:** `62cd52b5c72f765bee57697f744d9a28c6ff3993`

This register classifies every JavaScript file present under `nova-updates/` at the Mission 01 freeze. Classification describes the behavior that Foundation must understand; it does **not** authorize removing any active layer during Mission 01.

## Classification meanings

- **CANONICAL** — required current intended behavior; must be preserved when ownership moves.
- **SUPERSEDED** — retained historical implementation that the production materializer intentionally no longer loads.
- **COMPATIBILITY** — active behavior whose reason for existing is primarily the legacy/runtime composition model; preserve current outcome while planning to eliminate the compatibility mechanism.
- **HOTFIX** — valid corrective behavior layered onto the old runtime; the fix must be incorporated into canonical ownership rather than discarded with the patch.
- **DEAD** — no longer active and not needed for current behavior.
- **DOCUMENTATION ONLY** — historical context without active runtime behavior.

## Coverage notation

`release-pipeline-reliability.test.js` protects the materializer's sequencing/safety contract, and the deployment workflow syntax-checks every `nova-updates/*.js` before materialization. Those pipeline checks prove that a file is loadable/present, not that its full behavior is correct.

Where this table says **transitive only**, there is no dedicated same-feature Node regression file in the frozen `tests/node/` tree. That is a recorded baseline coverage gap, not an invitation to weaken parity requirements.

## Complete JavaScript inventory

| # | File | Production | Class | Effective responsibility | Direct / strongest frozen protection |
|---:|---|---|---|---|---|
| 1 | `sniper-v1.2.0.js` | ACTIVE 01 | CANONICAL | Original Sniper/precision lineage mechanics layered onto the base class/engine. | Transitive only: later Sniper/AI/Blackglass scenarios + full 239-test suite; pipeline syntax/existence checks. |
| 2 | `controller-v1.3.0.js` | ACTIVE 02 | CANONICAL | Original Controller lineage and drone-bearing gameplay foundation. | Transitive: `controller-command-weave-v1.10.0.test.js`, `second-body-live-vector-v1.10.7.test.js`, drone tests; pipeline checks. |
| 3 | `polish-v1.3.1.js` | ACTIVE 03 | CANONICAL | Cross-cutting shipped gameplay/UI/presentation polish on legacy modules. | Transitive only through current regression suite; pipeline checks. |
| 4 | `stability-v1.4.0.js` | ACTIVE 04 | HOTFIX | Cross-cutting safety/stability corrections that later releases assume. | Transitive only through later gameplay regression suite; pipeline checks. |
| 5 | `sniper-lineage-v1.4.1.js` | ACTIVE 05 | CANONICAL | Expanded Sniper lineage/evolution behavior. | Transitive through later class/AI/Blackglass tests; pipeline checks. |
| 6 | `showroom-v1.5.0.js` | ACTIVE 06 | CANONICAL | Original showroom/Blackglass-style tank inspection scene and presentation. | Transitive: `showroom-containment-v1.7.2.test.js`, `showroom-fit-v1.7.3.test.js`, `blackglass-visual-parity-v1.10.6.test.js`. |
| 7 | `showroom-polish-v1.5.1.js` | ACTIVE 07 | CANONICAL | Showroom interaction/visual refinements. | Transitive: showroom containment/fit + Blackglass parity tests. |
| 8 | `drone-discipline-v1.5.1.js` | ACTIVE 08 | CANONICAL | Drone formation/behavior discipline and low-churn squad operation. | `drone-performance-v1.5.1.test.js`; later drone/terrain tests. |
| 9 | `drone-targeting-v1.5.1.js` | ACTIVE 09 | CANONICAL | Drone target selection/targeting behavior. | Transitive: drone performance, Terrain Intelligence, Field Service, Shared Battlefield View scenarios. |
| 10 | `spotter-intelligence-v1.5.1.js` | ACTIVE 10 | CANONICAL | Observer/Spotter sensing and relay intelligence behavior. | Transitive: `tactical-framing-v1.8.2.test.js`, `spotter-comms-v1.9.3.test.js`, `shared-battlefield-view-v1.10.5.test.js`. |
| 11 | `ui-fixes-v1.5.1.js` | ACTIVE 11 | HOTFIX | Corrective UI behavior layered over the base App/UI. | Transitive only through menu/showroom/current full suite; pipeline checks. |
| 12 | `lobby-music-v1.5.1.js` | ACTIVE 12 | CANONICAL | Lobby music behavior and presentation state. | No dedicated Node behavior test; full-suite/pipeline coverage only. |
| 13 | `battlefield-v1.6.0.js` | ACTIVE 13 | CANONICAL | Battlefield terrain, solid cover, line of sight, spawn safety and projectile/terrain interaction. | `battlefield-v1.6.test.js`; `performance-v1.7.5.test.js`; Combined Arms tests. |
| 14 | `disciplines-v1.7.0.js` | ACTIVE 14 | CANONICAL | Gunner/Cannon/Guardian discipline mechanics including class-specific combat rules. | `disciplines-v1.7.test.js`; `apex-disciplines-v1.7.1.test.js`. |
| 15 | `apex-disciplines-v1.7.1.js` | ACTIVE 15 | CANONICAL | Apex/evolved discipline mechanics and structural specialization. | `apex-disciplines-v1.7.1.test.js`. |
| 16 | `combined-arms-v1.7.2.js` | ACTIVE 16 | CANONICAL | Cover-aware combat, blast exposure, routing support, Cannon structural intent and AI memory behavior. | `combined-arms-v1.7.2.test.js`; blast/terrain/AI tests. |
| 17 | `blast-cover-hardening-v1.7.2.js` | ACTIVE 17 | HOTFIX | Correct blast occlusion/exposure at cover surfaces without leaking full damage through walls. | `blast-cover-hardening-v1.7.2.test.js`; Combined Arms tests. |
| 18 | `showroom-containment-v1.7.2.js` | ACTIVE 18 | HOTFIX | Mobile/portrait containment rules for the legacy showroom/Blackglass surface. | `showroom-containment-v1.7.2.test.js`; `lobby-containment-v1.7.7.test.js`. |
| 19 | `showroom-fit-v1.7.3.js` | ACTIVE 19 | HOTFIX | Responsive display-bay sizing and touch-fit corrections for Blackglass. | `showroom-fit-v1.7.3.test.js`; Blackglass parity tests. |
| 20 | `blackglass-mirror-v1.10.6.js` | ACTIVE 20 | HOTFIX | Corrects Blackglass drift by mirroring real muzzle geometry, barrel selection, projectile profiles and current tank weapon visuals. | `blackglass-visual-parity-v1.10.6.test.js`; release-pipeline order check. |
| 21 | `performance-v1.7.5.js` | ACTIVE 21 | CANONICAL | Spatial broad phase, bounded AI terrain probes and decimated drone route planning while preserving current outcomes. | `performance-v1.7.5.test.js`. |
| 22 | `drone-allegiance-glow-v1.7.6.js` | ACTIVE 22 | CANONICAL | Friendly/hostile drone IFF visual language with culling discipline. | `drone-allegiance-glow-v1.7.6.test.js`. |
| 23 | `settings-v1.7.7.js` | ACTIVE 23 | CANONICAL | Mid-game fair-play Pilot Console: aim/move sensitivity, stick size/opacity, screen shake, fullscreen handling, persistence. | No dedicated settings test in frozen tree; current input/menu regressions + pipeline checks are transitive only. |
| 24 | `performance-v1.7.8.js` | ACTIVE 24 | CANONICAL | Zero-Churn allocations: reusable spatial buckets/maps and pointer vectors without React updates during continuous stick movement. | `performance-v1.7.8.test.js`. |
| 25 | `lobby-history.js` | ACTIVE 25 | CANONICAL | Shipped lobby release-history content/presentation layer. | Transitive: `living-archive-v1.7.9.test.js`, `menu-debug-motion-v1.7.8.test.js`; pipeline checks. |
| 26 | `menu-debug-motion-v1.7.8.js` | ACTIVE 26 | CANONICAL | Lobby/menu contract, debug snapshot surface, Tips presentation and reduced-motion behavior. | `menu-debug-motion-v1.7.8.test.js`; `fieldcraft-tips-v1.7.9.test.js`. |
| 27 | `menu-slot-compat-v1.7.8.js` | ACTIVE 27 | COMPATIBILITY | Resolves composition/capacity conflicts among legacy menu/lobby extension slots. | Transitive: `lobby-containment-v1.7.7.test.js`, living archive/menu tests; pipeline checks. |
| 28 | `living-archive-v1.7.9.js` | ACTIVE 28 | CANONICAL | Current scrollable release archive/living-history presentation and associated menu behavior. | `living-archive-v1.7.9.test.js`; Fieldcraft tips test. |
| 29 | `living-archive-runtime-cleanup-v1.7.9.js` | ACTIVE 29 | COMPATIBILITY | Cleans historical discovery/test residue and reconciles rendered archive state after legacy menu layers. | `living-archive-v1.7.9.test.js`; release-pipeline order checks. |
| 30 | `predator-doctrine-v1.8.0.js` | ACTIVE 30 | CANONICAL | Fair-play high-level AI hunting: interception, evasion, target saturation, role distance, cover seeking and bounded reaction planning. | `predator-doctrine-v1.8.0.test.js`. |
| 31 | `battle-sense-v1.8.1.js` | ACTIVE 31 | CANONICAL | Strategic AI sensing/prioritization, punish windows, resource awareness and fair hidden-information memory. | `battle-sense-v1.8.1.test.js`. |
| 32 | `tactical-framing-v1.8.2.js` | ACTIVE 32 | CANONICAL | Tactical camera framing for off-screen Controller command space/Sniper relay plus bounded reliability/navigation glue. | `tactical-framing-v1.8.2.test.js`. |
| 33 | `precision-contact-v1.8.3.js` | ACTIVE 33 | CANONICAL | Incoming precision-fire communication: distance-aware shot sound, directional glint/spark, engagement swoosh, removal of the old `SHOT` word. | `precision-contact-v1.8.3.test.js`. |
| 34 | `visual-overhaul-v1.9.0.js` | ACTIVE 34 | CANONICAL | Presentation-only visual detail pass while preserving canonical gameplay/LoS and cached render resources. | `visual-overhaul-v1.9.0.test.js`. |
| 35 | `sensory-feedback-v1.9.1.js` | ACTIVE 35 | CANONICAL | Impact/feedback language for fire, hit/kill, incoming damage, powerups, evolution, drone loss and critical-health cues. | `sensory-feedback-v1.9.1.test.js`. |
| 36 | `upgrade-dwell-v1.9.2.js` | ACTIVE 36 | HOTFIX | Prevents the upgrade tray from interfering with active stick input by enforcing the intended 500 ms dwell/cancel behavior. | `upgrade-dwell-v1.9.2.test.js`. |
| 37 | `spotter-comms-v1.9.3.js` | ACTIVE 37 | HOTFIX | Deduplicates friendly/hostile Spotter and observer-link messages without throttling unrelated combat text. | `spotter-comms-v1.9.3.test.js`. |
| 38 | `lobby-battlefield-v1.10.1.js` | ACTIVE 38 | CANONICAL | Busy simulated War Room lobby battlefield, camera drift, level-30 roster and explicit background performance/presentation budgets. | `lobby-battlefield-v1.10.1.test.js`. |
| 39 | `terrain-intelligence-v1.10.2.js` | ACTIVE 39 | CANONICAL | Tank/drone terrain-aware path planning, serial-wall/U-pocket routing, anti-stuck recovery and bounded pathfinding work. | `terrain-intelligence-v1.10.2.test.js`; tactical/performance tests. |
| 40 | `drone-field-service-v1.10.3.js` | ACTIVE 40 | CANONICAL | Out-of-combat drone repair with threat/commitment gates; Controller repair remains owned by its Controller doctrine. | `drone-field-service-v1.10.3.test.js`. |
| 41 | `shared-battlefield-view-v1.10.5.js` | ACTIVE 41 | CANONICAL | Current AI/player map-information parity: global target knowledge without through-cover firing cheats, with bounded reaction cadence. | `shared-battlefield-view-v1.10.5.test.js`. |
| 42 | `second-body-live-vector-v1.10.7.js` | ACTIVE 42 | CANONICAL | Current two-stick Controller control model: live polar swarm vector, direct-fire isolation, designation/committed-dive preservation, AI virtual-stick translation and telemetry. | `second-body-live-vector-v1.10.7.test.js`; Command Weave retirement assertion. |
| 43 | `applied-power-parity-v1.10.8.js` | ACTIVE 43 | HOTFIX | Scales rival AI from actually assigned upgrade power rather than banked/raw player level; preserves raw player level separately. | `applied-power-parity-v1.10.8.test.js`. |
| 44 | `visual-language-v1.10.9.js` | ACTIVE 44 | CANONICAL | Signal Discipline: one decision-relevant primary cue per channel, clean player chassis baseline, surgical suppression of redundant legacy visuals, forward visual-intent contract. | `visual-language-v1.10.9.test.js`; materializer-last/order assertions. |
| 45 | `controller-command-weave-v1.10.0.js` | INACTIVE | SUPERSEDED | Previous persistent Controller command-weave implementation; retained in Git/tree but intentionally not materialized after Live Vector. | `controller-command-weave-v1.10.0.test.js` documents its historical contract; `release-pipeline-reliability.test.js` asserts it is absent from production. |

## Non-JavaScript update artifacts

These are not counted among the 45 JS patches but are part of the frozen legacy update surface:

| File | Status | Meaning |
|---|---|---|
| `nova-updates/releases.json` | ACTIVE INPUT | Historical/menu release metadata and PWA optional cache input. It is not the authoritative active patch list. |
| `nova-updates/shared-battlefield-view-v1.10.5.md` | DOCUMENTATION ONLY | Companion documentation for the Shared Battlefield View release. |
| `nova-updates/version-v1.7.4.json` | DEAD / HISTORICAL | Residue from the old auto-update discovery experiment. The production materializer explicitly asserts the v1.7.4 experiment is not shipped. |

## Dedicated frozen regression files

The Node suite contains direct release/behavior files for:

```text
apex-disciplines-v1.7.1
applied-power-parity-v1.10.8
battle-sense-v1.8.1
battlefield-v1.6
blackglass-visual-parity-v1.10.6
blast-cover-hardening-v1.7.2
combined-arms-v1.7.2
controller-command-weave-v1.10.0
disciplines-v1.7
drone-allegiance-glow-v1.7.6
drone-field-service-v1.10.3
drone-performance-v1.5.1
fieldcraft-tips-v1.7.9
living-archive-v1.7.9
lobby-battlefield-v1.10.1
lobby-containment-v1.7.7
materializer-runtime-fingerprint
menu-debug-motion-v1.7.8
performance-v1.7.5
performance-v1.7.8
precision-contact-v1.8.3
predator-doctrine-v1.8.0
pwa-updater
release-pipeline-reliability
second-body-live-vector-v1.10.7
sensory-feedback-v1.9.1
shared-battlefield-view-v1.10.5
showroom-containment-v1.7.2
showroom-fit-v1.7.3
spotter-comms-v1.9.3
tactical-framing-v1.8.2
terrain-intelligence-v1.10.2
upgrade-dwell-v1.9.2
visual-language-v1.10.9
visual-overhaul-v1.9.0
```

There are also non-NOVA/historical app tests (`grid`, `serialization`, `slump`) that Mission 02 must classify with the conventional `src/` tree.

## Migration use

For later missions, the rule is not “port every file one-for-one.” It is:

1. reproduce the **effective behavior after the full active chain**;
2. use the strongest direct regression scenarios above as parity anchors;
3. for transitive-only early layers, add canonical behavior tests as ownership is extracted rather than preserving patch-shape tests;
4. retire a legacy layer only when its surviving behavior has an explicit canonical owner and parity evidence;
5. never resurrect `controller-command-weave-v1.10.0.js` merely because it still exists in history—the active Controller intent is Live Vector.
