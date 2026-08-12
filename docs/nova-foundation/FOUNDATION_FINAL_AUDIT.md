# NOVA Foundation — Final Acceptance Audit

**Mission:** 26 — Legacy Retirement, Enforcement & Final Foundation Audit  
**Audit date:** 2026-08-11 / 2026-08-12 boundary (America/Mexico_City)  
**Mission 25 integration base:** `6a73ee8f2515f3a3ef02541dcea4e49c7410f580`  
**Production `main` baseline:** `52009c406b948a7b9a9402bb56495f20b3918ba6`  
**Pre-retirement archival ref:** `archive/pre-mission-26-legacy-runtime` → `6a73ee8f2515f3a3ef02541dcea4e49c7410f580`  
**Final green implementation head:** `c718126aae61f2322e535ffe25a16468df14ae2f`  
**Final green implementation CI:** `31559781592`

## 1. Disposition

NOVA Foundation has reached the architectural end state required by the mother specification. The active game is now a conventional TypeScript/Vite product whose gameplay, AI, input, rendering, scenes, UI, audio, persistence, diagnostics, replay, PWA and release machinery live in explicit source-owned domains.

The final audit did more than prove that legacy files were deleted. It intentionally challenged whether the resulting Foundation build still represented **NOVA TANKS itself**. That review found several composition/product surfaces that earlier migration gates had not fully connected. Mission 26 corrected them before certification rather than accepting a mechanically green but functionally incomplete cutover.

The final implementation head `c718126aae61f2322e535ffe25a16468df14ae2f` passed the complete repository gate in CI run `31559781592`: locked install, TypeScript typecheck, the full Node regression suite (including executable Mission 26 product tests), production build, hardened `validate:dist`, and production Tailwind validation.

## 2. Legacy runtime retirement

The active tree no longer contains or depends on `nova-gz/`, `nova-payload/`, `nova-updates/`, the historical materializer/reconstruction pipeline, standalone `pwa-register.js`, `src/legacy/`, `src/app/runtimeSelector.ts`, the development dual-runtime switch, migration-only `src/replay/ParityHarness.ts`, historical module-registry globals, versioned runtime script injection, or patch-presence tests whose only purpose was to prove a historical JavaScript patch was present.

The last pre-retirement state remains available only as history at `archive/pre-mission-26-legacy-runtime` → `6a73ee8f2515f3a3ef02541dcea4e49c7410f580`.

## 3. Single production architecture

The production flow is now `index.html → src/main.ts → src/app/bootstrap.ts → GameApp / FoundationRuntime → canonical scenes/systems → Vite dist/`. `index.html` is only a small host shell. Deployment builds and validates `dist/`; it no longer materializes a giant runtime HTML file, reconstructs payload chunks, injects release scripts, or commits generated runtime HTML.

The PWA worker validates and stages the canonical Vite shell/assets atomically and retains previous complete builds for rollback without depending on retired runtime markers.

## 4. Final-audit corrections required before certification

### 4.1 Real browser input composition

Mission 26 wires independent movement/aim touch sticks through `TouchInputAdapter`, fire/ability/ultimate through canonical `GameCommand`s, gamepad polling through `GamepadInputAdapter`, and keyboard/mouse through the same player-command boundary. Touch activity cannot be overwritten by desktop sampling. No gameplay authority moved into React or browser presentation.

### 4.2 Main gameplay scene restored as the real game

The audit found that the production match surface had been reusing `LobbyBattle`, which is intentionally the War Room exhibition/background battle. Mission 26 created a distinct canonical `GameplayScene` / `GameplayBattle` which composes the systems migrated in Missions 05–18.

The player-facing run now restores the core NOVA TANKS loop: Scout start, pity-start level from saved best run, eight AI rivals, the 121-neutral initial shape population (62 circles, 30 triangles, 16 squares, 8 pentagons, 4 hexagons, 1 star), crashers, powerups, XP, stat points, effective builds, Tier 1/Tier 2/mastery/gene/apex decisions, score/kills, death/redeploy, persistent best score/best level, and canonical rendering for shapes/powerups. Lobby War Room and Blackglass remain distinct canonical scenes.

Executable Mission 26 tests instantiate the actual main-game session and verify Scout start, player + eight rivals, exact neutral seed, pity start, stat spending and deterministic identical-seed command streams.

### 4.3 Fieldcraft restored as canonical content

All 50 reviewed v1.7.9 Fieldcraft tips survive in `src/content/tips/FieldcraftTips.ts`, with the 10.4-second dwell contract, tags, non-repeating shuffle-bag rotation and deprecation support. Regression tests verify exact count, dwell, uniqueness and non-repeating selection.

### 4.4 Living Archive restored canonically

Release history survives as canonical content/UI, including latest-release summary, expandable history, release-family metadata and reduced-motion-compatible presentation. The old runtime implementation is gone; the player-facing feature remains.

### 4.5 Browser audio becomes an actual downstream consumer

A browser-only `WebAudioPresenter` now sits downstream of Mission 22's `AudioEngine`. Combat semantic events map to restrained audio cues/music without granting audio any simulation authority. Mute/music-off persistence remains data driven.

### 4.6 Drone attack/harvest intents receive their canonical consumer

Mission 17 intentionally made `DroneSystem` responsible for formation, routing, target choice, recovery and attack/harvest intent while reserving damage and reward accounting for combat/progression ownership. Mission 26 found that main-game composition initially moved/repaired drones without consuming those attack/harvest intents.

This is now closed correctly: `DroneSystem` still chooses intent; `DroneContactCombat` lives under `src/game/combat/` and delegates contact damage through canonical `CombatSystem.resolveDirectHit()`; `GameplayBattle` consumes attack/harvest intents; hostile tanks/drones can receive combat-owned drone damage; neutral shapes/player powerups can be harvested; and XP/score/resource credit remains progression/session owned. A dedicated Mission 26 regression protects this handoff.

### 4.7 Persistence composition

The live Foundation runtime loads/saves canonical best score, best run level and Pilot settings through the versioned Mission 23 persistence service. Historical localStorage compatibility remains only as a data-migration/rollback aid, not executable legacy architecture.

## 5. Durable architectural enforcement

Mission 26 adds root/domain `AGENTS.md` ownership contracts, final source/repository maps and mechanical guards for headless simulation, AI perception authority, rendering authority, canonical registry uniqueness, physical legacy retirement, forbidden legacy identifiers, production artifact cleanliness, live touch/gamepad command composition, distinct Gameplay/Lobby/Blackglass scenes, and executable product-level behavior.

## 6. Mother-spec Definition of Done

All 21 final requirements are audited PASS:

1. `index.html` is only a web entry shell — PASS.
2. `src/` is entirely NOVA — PASS.
3. `npm run build` produces the playable game from canonical source — PASS.
4. No gameplay implementation lives in HTML — PASS.
5. No `nova-gz` reconstruction exists — PASS.
6. No versioned release JS is injected at runtime — PASS.
7. No module-registry global mutation remains — PASS.
8. All tanks come from one canonical registry — PASS.
9. Gameplay, Blackglass and lobby share canonical definitions — PASS.
10. Human and AI tanks operate through common command/simulation systems — PASS.
11. AI dynamic knowledge passes through explicit perception — PASS.
12. Simulation can run without DOM/rendering — PASS.
13. Deterministic headless scenarios work — PASS.
14. Existing saves migrate correctly — PASS.
15. Desktop/mobile/touch/keyboard/mouse/gamepad regression paths pass — PASS.
16. Lobby simulation uses real gameplay entities — PASS.
17. Blackglass uses real rendering definitions — PASS.
18. Diagnostics use structured subsystem data — PASS.
19. Production deployment serves the Vite build — PASS.
20. Legacy materialization code is deleted from the active tree — PASS.
21. An unfamiliar agent can locate authoritative mechanics without reverse-engineering releases — PASS.

Final migration scoreboard:

```text
legacy patches = 0
legacy gameplay logic in index.html = 0
legacy runtime globals = 0
```

## 7. Parity evidence — precise interpretation

Mission 24 remains the formal migration parity evidence set covering desktop/mobile orientations, touch/mouse/keyboard/gamepad, major lineages/evolutions, Battlefield layouts, Blackglass, lobby, settings and PWA. This audit does **not** overstate Mission 24 as a full live-browser two-complete-runtime E2E certification. Mission 26 found composition gaps those gates did not expose, corrected them, and added executable product-level regressions before permanent legacy deletion. No gameplay discrepancy discovered by the final audit was accepted as a migration exception.

## 8. Performance evidence — precise interpretation

Mission 25 remains the quantitative cutover/performance evidence: the materialized 265,431-byte production shell and 44-script runtime patch chain are gone in favor of a small Vite shell and bundled assets, bounded subsystem policies and artifact validation. Mission 26 does not invent unmeasured mobile FPS, thermal, battery or physical-device results.

## 9. Persistence, PWA and rollback continuity

Mission 23's versioned save schema/migrations remain authoritative. Mission 25's service-worker v4 remains the canonical offline updater, staging complete immutable candidates, promoting atomically and keeping the previous complete build as rollback reserve.

## 10. Production-main reconciliation

Production `main` remained at `52009c406b948a7b9a9402bb56495f20b3918ba6`; there was no newer behavior to reconcile. Mission 26 integrates only into `NOVASTAR-INITIATIVE` and does **not** authorize or perform production promotion.

## 11. Final acceptance

**Implementation result:** PASS  
**Final green implementation:** `c718126aae61f2322e535ffe25a16468df14ae2f`  
**Implementation CI:** PASS — `31559781592`  
**Legacy runtime:** retired from active tree  
**Historical recovery:** preserved at `archive/pre-mission-26-legacy-runtime`  
**Gameplay/product audit:** PASS after Mission 26 restoration work  
**Production `main`:** unchanged

After the documentation-sealed Mission 26 head passes the same complete CI gate and the resulting merge commit on `NOVASTAR-INITIATIVE` passes exact post-merge CI, the initiative disposition is **READY FOR MAIN PROMOTION**. Promotion remains a separate explicit action.