# NOVA Foundation
## Complete Migration Plan for NOVA TANKS

**Status:** Architectural migration specification and sequential agent execution contract  
**Project:** NOVA TANKS  
**Initiative:** NOVASTAR INITIATIVE  
**Canonical integration branch:** `NOVASTAR-INITIATIVE`  
**Execution model:** 26 strictly sequential agent missions  
**Purpose:** Migrate NOVA TANKS from a materialized, patch-layered HTML application into a canonical, source-driven, fully-fledged web game architecture.

---

## 1. Executive Summary

NOVA TANKS has outgrown its prototype-derived runtime model.

The current production architecture still depends on a large materialized `index.html`, a historical compressed payload, globally exposed runtime modules, and a long sequence of versioned JavaScript patches that modify the game after the base runtime is reconstructed.

This architecture succeeded at allowing NOVA to evolve rapidly from an experiment into a sophisticated game. It should now be retired before it becomes the permanent ceiling on development.

The target state is a conventional, production-grade web game in which:

- `index.html` is only an application shell.
- The game is built from canonical TypeScript source.
- Simulation owns gameplay truth.
- AI and human players interact with the same game systems.
- Tank, weapon, drone, projectile, evolution, audio, and visual definitions have a single source of truth.
- Rendering, UI, audio, Blackglass, and lobby scenes consume authoritative game state rather than reimplementing mechanics.
- The simulation can run without the DOM or renderer.
- Deterministic tests and scenarios can reproduce bugs and evaluate balance.
- Runtime monkey-patching and historical update injection are eliminated.
- The production deployment is built directly from the current source tree.
- The repository structure itself helps agents identify the authoritative implementation of any mechanic.

The migration is explicitly **not a rewrite of NOVA's game design**. It is a behavior-preserving architectural transplant followed by deliberate retirement of the legacy runtime.

---


# 1A. NOVASTAR INITIATIVE — Sequential Agent Execution Program

This document is also the **mother specification for every migration agent**.

Every agent receives the same document. The only variable in the assignment is the mission number.

The mission number determines exactly what that agent owns, when it is allowed to begin, what it must preserve, what it must deliver, and what condition unlocks the next agent.

The initiative name is:

> **NOVASTAR INITIATIVE**

Git branch references cannot contain spaces. Therefore the canonical Git integration branch for the initiative is:

```text
NOVASTAR-INITIATIVE
```

Whenever an instruction refers conversationally to the **"NOVASTAR INITIATIVE" development branch**, it means the Git branch `NOVASTAR-INITIATIVE`.

During the initiative, `NOVASTAR-INITIATIVE` is the canonical integration state of the migration. Agents must **not** merge the initiative into `main` unless a separate explicit instruction authorizes final promotion.

---

## 1A.1 Sequential Execution Law

The missions are intentionally serial.

For Mission `N > 1`, the agent may inspect the repository and evaluate its assigned task while waiting, but it must not begin implementation until Mission `N - 1` is demonstrably complete.

A predecessor is complete only when all of the following are true:

1. The predecessor's work has been merged into the remote `NOVASTAR-INITIATIVE` branch.
2. The predecessor's completion marker exists on that remote branch.
3. Required CI and validation for the predecessor are green.
4. The remote `NOVASTAR-INITIATIVE` branch contains the predecessor's integrated state.

A local branch, unmerged commit, draft PR, verbal claim, or partially completed implementation does **not** satisfy the gate.

If the predecessor is not complete, the agent must remain out of line.

It may perform read-only evaluation of its future task, but it must not:

- modify production code;
- create competing implementations;
- preemptively migrate its subsystem;
- merge speculative work;
- alter the initiative branch;
- perform a successor mission;
- reinterpret waiting as permission to "help" by taking over the predecessor's scope.

If the predecessor merge exists but its required CI is failing, the predecessor is still incomplete.

---

## 1A.2 Mission 1 Exception

Mission 1 has no predecessor and therefore may begin immediately.

Mission 1 is responsible for establishing or verifying the `NOVASTAR-INITIATIVE` branch and the initiative tracking mechanism.

If the branch already exists, Mission 1 must **not reset, recreate, or overwrite it**. It must first inspect its state and preserve any valid initiative work already present.

---

## 1A.3 Start Protocol for Every Mission

Once the predecessor gate is satisfied, the assigned agent must:

1. Fetch the latest remote repository state.
2. Verify the predecessor completion marker on `origin/NOVASTAR-INITIATIVE`.
3. Verify the required predecessor validation is green.
4. Check whether `main` has advanced since the previous initiative integration.
5. Reconcile new `main` behavior into `NOVASTAR-INITIATIVE` when necessary before beginning subsystem work.
6. Preserve all already-shipped game behavior while reconciling.
7. Create a focused mission branch from the current `NOVASTAR-INITIATIVE`, recommended as:

```text
novastar/mission-XX-short-name
```

8. Implement only the assigned mission and dependency repairs genuinely necessary to complete it.
9. Run the mission-specific tests plus the repository-wide validation required by the current state of the migration.
10. Create the mission completion marker.
11. Merge the mission branch into `NOVASTAR-INITIATIVE`.
12. Push the integrated branch.
13. Verify that the remote branch contains the merge and that required CI is green.
14. Clearly report Mission `XX` as complete.

No agent may declare completion before integration into the remote canonical initiative branch.

---

## 1A.4 Mainline Reconciliation Rule

NOVA may continue evolving on `main` while NOVASTAR is in progress.

Therefore each mission must check for new shipped work before implementing its own scope.

When `main` contains a new feature or fix affecting a subsystem already migrated into NOVASTAR, the agent must **port the behavior into the canonical architecture** rather than blindly restoring the old patch architecture.

The hierarchy is:

```text
main
  = latest shipped gameplay intent and user-facing behavior

NOVASTAR-INITIATIVE
  = canonical migration architecture and accumulated migration work
```

Reconciliation must preserve both:

- the newest intended NOVA behavior;
- the architectural rules already established by prior NOVASTAR missions.

A new patch on `main` is not permission to reintroduce patch-based design into a subsystem that NOVASTAR has already canonicalized.

---

## 1A.5 Completion Marker Contract

Each mission must add:

```text
docs/nova-foundation/completed/MISSION-XX.md
```

The marker must contain at minimum:

```markdown
# Mission XX Completion

Status: COMPLETE

## Scope completed
- ...

## Legacy components retired or bypassed
- ...

## Validation performed
- ...

## Behavior/parity notes
- ...

## Mainline changes reconciled
- ...

## Known limitations
- None
  OR an explicit list that does not violate the mission acceptance criteria.

## Next mission
Mission YY is unblocked after this marker is present on the remote
NOVASTAR-INITIATIVE branch and required CI is green.
```

The file existing only on a feature branch does not unlock the next mission.

The unlock occurs only after it is merged into the remote `NOVASTAR-INITIATIVE` branch and validation is green.

---

## 1A.6 Idempotency and Duplicate Assignment

If an agent is assigned a mission whose completion marker already exists on the remote `NOVASTAR-INITIATIVE` branch:

1. verify that the marker is genuine;
2. verify that the mission's acceptance criteria remain satisfied;
3. verify that CI is green;
4. do not redo or replace the completed mission merely because it was reassigned.

The agent should report that the mission is already complete unless current repository state has genuinely invalidated its acceptance criteria.

---

## 1A.7 Scope Discipline

An agent may use internal subagents or tools to complete its own mission.

It may not use them to execute later missions early.

Every mission has three boundaries:

### In Scope

The systems and architectural work explicitly assigned to that mission.

### Necessary Integration Work

Repairs immediately required to make the assigned subsystem compose with already completed missions or newly shipped `main` behavior.

### Out of Scope

Unrelated redesigns, successor mission work, speculative improvements, and opportunistic rewrites.

If a migration reveals a desirable gameplay redesign that is not necessary for parity, document it for later rather than mixing it into the architectural transplant.

---

## 1A.8 Behavioral Preservation Rule

Unless a mission explicitly says otherwise, the migration objective is:

> **Preserve current intended gameplay behavior while changing ownership and architecture.**

Do not simultaneously "improve" a mechanic merely because its implementation is being moved.

Behavioral differences must be one of:

- required to reproduce newer `main` behavior;
- required to fix a migration regression;
- explicitly required by the mission;
- separately authorized by the user.

This separation is essential to distinguishing architectural regressions from game-design decisions.

---

## 1A.9 Testing Rule

Every mission must leave the initiative in a coherent, testable state.

A mission may not knowingly merge:

- broken build output;
- failing required tests;
- partially migrated authority;
- two conflicting canonical implementations;
- hidden dependency on a deleted patch;
- unexplained loss of current gameplay behavior.

Where a subsystem becomes canonical, its relevant legacy regression tests should be converted or supplemented with direct tests of the canonical module.

Tests should increasingly validate behavior rather than patch injection.

---

## 1A.10 Legacy Reduction Rule

After canonical migration begins, legacy dependence should move monotonically downward.

Agents must not add new `nova-updates` patches as the normal solution to migration problems.

When a mission fully replaces a legacy implementation, the agent should retire or bypass the corresponding legacy layer as soon as doing so is safe and covered by parity tests.

The final target remains:

```text
legacy runtime patches = 0
legacy gameplay logic in index.html = 0
legacy runtime globals = 0
active materializer dependency = 0
```

---

# 1B. Mission Index

| Mission | Name | Primary Phase Coverage |
|---:|---|---|
| 01 | Initiative Control & Baseline Freeze | Phase 0 |
| 02 | Repository Identity & Source Ownership | Phase 1 |
| 03 | Application Shell & Legacy Boot | Phase 2 |
| 04 | Legacy Compatibility Boundary | Phase 3 |
| 05 | Canonical Content & Schemas | Phase 4 |
| 06 | Simulation Kernel & Deterministic Primitives | Phase 5 |
| 07 | Battlefield, Terrain & Spatial Queries | Phase 6A–B |
| 08 | Canonical Entity Model | Phase 6C |
| 09 | Movement, Collision & Projectile Kinematics | Phase 6D |
| 10 | Combat, Weapons & Abilities | Phase 6E |
| 11 | Progression, Upgrades & Effective Builds | Phase 6F |
| 12 | Targeting, Contacts & Perception Core | Phase 6G |
| 13 | Unified Commands & Input | Phase 7 |
| 14 | AI Perception & Memory | Phase 8 |
| 15 | AI Navigation & Terrain Intelligence | Phase 8 |
| 16 | AI Tactics & Class Controllers | Phase 8 |
| 17 | Drone Systems | Phase 9 |
| 18 | Rendering & Canonical Visual Language | Phase 10 |
| 19 | Blackglass Canonical Scene | Phase 11 |
| 20 | Lobby Canonical Battlefield Scene | Phase 12 |
| 21 | UI, HUD, Menus & Settings | Phase 13 |
| 22 | Audio, Feedback & Semantic Events | Phase 14 |
| 23 | Persistence & Structured Diagnostics | Phases 15–16 |
| 24 | Deterministic Replay, Parity Harness & Dual Runtime | Phase 17 |
| 25 | Performance Engineering & Production Cutover | Phases 18–19 |
| 26 | Legacy Retirement, Enforcement & Final Foundation Audit | Phases 20–21 |

The mission count is deliberately more granular than the architectural phase count. Large phases are split so that no single agent is responsible for an unreasonably broad transplant.

---

# 1C. Mission Specifications

## Mission 01 — Initiative Control & Baseline Freeze

### Objective

Freeze an authoritative specimen of current NOVA behavior and establish the sequential migration control plane.

### Required Work

- Create or verify the remote `NOVASTAR-INITIATIVE` branch from the correct current integration point.
- Do not reset it if it already contains valid work.
- Add this master specification to the repository under `docs/nova-foundation/`.
- Create `docs/nova-foundation/completed/`.
- Inventory the current production runtime.
- Record the current materialization and deployment path.
- Record the large `index.html` baseline, including a reproducible fingerprint/hash.
- Enumerate every active and inactive `nova-updates/*.js` file.
- Record current patch load order.
- Classify every patch as `CANONICAL`, `SUPERSEDED`, `COMPATIBILITY`, `HOTFIX`, `DEAD`, or `DOCUMENTATION ONLY`.
- Record which tests protect each active patch or behavior.
- Inventory the exposed legacy module/global mechanism.
- Inventory current save/localStorage/settings formats.
- Inventory PWA/service-worker behavior.
- Inventory current tank, weapon, drone, evolution, battlefield, AI, input, lobby, Blackglass, audio, diagnostics, and persistence responsibilities.
- Run the current build and test suite and record the baseline result.
- Record known current failures separately rather than silently treating them as migration regressions.

### Required Deliverables

At minimum:

```text
docs/nova-foundation/NOVA_FOUNDATION_MIGRATION_PLAN.md
docs/nova-foundation/legacy-runtime-map.md
docs/nova-foundation/legacy-patch-register.md
docs/nova-foundation/baseline-validation.md
docs/nova-foundation/completed/MISSION-01.md
```

### Forbidden

- No gameplay redesign.
- No deletion of active runtime behavior.
- No speculative extraction.
- No materializer replacement yet.

### Acceptance Criteria

- Every runtime patch has an owner/behavior classification.
- The current production path can be explained end-to-end.
- Baseline build/test status is documented.
- Current persistence and PWA behavior are documented.
- The initiative branch and completion-marker protocol exist remotely.
- Mission 02 can determine exactly what it inherits.

---

## Mission 02 — Repository Identity & Source Ownership

### Objective

Make the repository structurally belong to NOVA TANKS and eliminate ambiguity caused by unrelated historical application scaffolding.

### Required Work

- Audit the existing TypeScript/Vite `src/`, `runtime/`, package metadata, and build scripts.
- Identify unrelated Aquascape or terrain-modeling application code.
- Determine whether any apparently unrelated code is nevertheless required by current NOVA tooling or CI.
- Move, archive, or delete verified unrelated application code without losing required NOVA behavior.
- Rename package/project metadata to NOVA TANKS where appropriate.
- Establish the canonical target source directories described by this document.
- Update TypeScript path aliases and build configuration to reflect NOVA domains.
- Keep legacy NOVA playable during this structural normalization.
- Explicitly document any temporary legacy code that remains and why.

### Required Deliverables

- NOVA-owned project/package identity.
- Canonical source directory skeleton.
- A repository map documenting remaining legacy/non-NOVA code.
- Tests/build still green.
- `MISSION-02.md`.

### Forbidden

- Do not migrate gameplay systems yet.
- Do not remove a legacy dependency merely because its name looks unrelated without proving it is unused.

### Acceptance Criteria

- A new agent can distinguish NOVA source, temporary legacy source, tooling, tests, and historical artifacts from directory structure alone.
- There is no ambiguous unrelated application masquerading as the canonical NOVA source tree.
- Mission 03 has a clean place to install the application shell.

---

## Mission 03 — Application Shell & Legacy Boot

### Objective

Make NOVA launch through a normal Vite/TypeScript application shell while preserving current gameplay through a temporary legacy boot path.

### Required Work

Create or complete:

```text
src/main.ts
src/app/bootstrap.ts
src/app/lifecycle.ts
src/app/GameApp.ts
```

Move application-level concerns out of the giant historical page where practical:

- startup lifecycle;
- root DOM containers;
- PWA registration;
- service-worker registration;
- manifest linkage;
- global styles and font setup;
- startup error handling;
- startup diagnostics.

Establish a transitional mechanism that allows the new application shell to launch the current game without requiring gameplay migration yet.

The exact bridge may be ugly internally; it must be explicitly temporary.

### Required Deliverables

- A small, source-driven application entry.
- Current NOVA still launches and remains playable from the new development architecture.
- Build and local development commands documented.
- `MISSION-03.md`.

### Forbidden

- Do not redesign gameplay.
- Do not hide legacy dependencies outside the future compatibility boundary.
- Do not declare the giant legacy runtime removed merely because it was moved elsewhere.

### Acceptance Criteria

- Vite/TypeScript owns application startup.
- `index.html` is moving toward entry-shell responsibility rather than game ownership.
- Current gameplay remains behaviorally intact.
- Mission 04 can isolate all remaining legacy access.

---

## Mission 04 — Legacy Compatibility Boundary

### Objective

Contain every remaining dependency on the materialized runtime behind one explicit deletion-target API.

### Required Work

Create:

```text
src/legacy/
├── LegacyRuntime.ts
├── LegacyModules.ts
├── LegacyEvents.ts
├── LegacyStateAdapter.ts
└── README.md
```

or an equivalent clean boundary.

- Move all direct access to `window.__novaModules`, `window.__novaCache`, `window.__novaMakeRequire`, and equivalent runtime internals behind this boundary.
- Define typed interfaces for new code to communicate with the legacy game.
- Add lint/import checks or tests that prohibit new code from reaching directly into legacy globals.
- Mark the entire legacy boundary as temporary and scheduled for deletion.
- Ensure the new application shell uses the boundary rather than legacy internals directly.

### Required Deliverables

- Typed legacy bridge.
- Explicit prohibited-import rules.
- Legacy boundary documentation.
- `MISSION-04.md`.

### Forbidden

- No new feature may be implemented in `src/legacy`.
- No new direct access to runtime globals outside the boundary.
- No opportunistic gameplay redesign.

### Acceptance Criteria

- Searching canonical source for legacy runtime globals finds only the permitted boundary.
- New systems can be migrated without understanding module-wrapper mechanics.
- Mission 05 can extract data through a stable bridge.

---

## Mission 05 — Canonical Content & Schemas

### Objective

Create one authoritative source of truth for game definitions before migrating complex behavior.

### Required Work

Create typed schemas and registries for:

- tanks;
- lineages;
- weapons;
- projectiles where definition-driven;
- drones;
- upgrades;
- evolutions;
- battlefields;
- balance values;
- canonical visual metadata;
- canonical audio metadata where definition-driven.

Resolve effective current values from the combination of the historical base runtime and active patches.

Build registries such as:

```text
TankRegistry
WeaponRegistry
DroneRegistry
EvolutionRegistry
BattlefieldRegistry
```

Add parity tests comparing canonical definitions against current effective legacy values.

Where safe, begin making legacy adapters consume canonical definitions instead of maintaining duplicate literals.

### Required Deliverables

- Typed content schemas.
- Canonical registries.
- Definition parity tests.
- Documentation of any values whose legacy source was ambiguous and how the effective value was resolved.
- `MISSION-05.md`.

### Forbidden

- Do not rebalance stats.
- Do not redesign lineages or evolution trees.
- Do not create separate Blackglass or lobby definitions.

### Acceptance Criteria

- Every major content definition has one canonical representation.
- Current balance values are preserved.
- Future gameplay, lobby, Blackglass, AI, and UI systems can reference the same data.

---

## Mission 06 — Simulation Kernel & Deterministic Primitives

### Objective

Create a headless, DOM-independent simulation foundation.

### Required Work

Create canonical infrastructure for:

- `GameWorld`;
- `GameClock`;
- fixed or controlled simulation stepping;
- `GameState`;
- semantic `GameEvent`;
- entity IDs;
- vector/math primitives;
- deterministic seeded random;
- snapshots;
- lifecycle/start/pause/stop semantics.

The simulation kernel must have no dependency on:

- React;
- canvas;
- DOM;
- CSS;
- WebAudio;
- touch input.

Add tests proving the kernel runs under the test environment without browser presentation code.

### Required Deliverables

- Headless simulation kernel.
- Seeded RNG service.
- Core snapshot/event interfaces.
- Determinism sanity tests.
- `MISSION-06.md`.

### Forbidden

- Do not migrate all gameplay into the kernel in one mission.
- Do not introduce renderer or UI ownership into simulation.

### Acceptance Criteria

A test can instantiate, step, inspect, and stop a simulation with no renderer or DOM.

---

## Mission 07 — Battlefield, Terrain & Spatial Queries

### Objective

Move battlefield authority and environmental geometry into canonical simulation modules.

### Required Work

Migrate:

- battlefield/map definitions;
- walls and solid geometry;
- battlefield bounds;
- spawn zones and spawn-safety queries;
- line-of-sight geometry;
- destructible-cover state representation;
- rubble/terrain state required by current gameplay;
- spatial queries;
- spatial indexing where justified by current behavior;
- geometry hooks needed later by navigation.

Do not migrate AI decision logic yet.

Add deterministic terrain scenarios and legacy parity cases.

### Required Deliverables

- Canonical battlefield subsystem.
- Canonical terrain queries.
- Headless line-of-sight and collision-query tests.
- Legacy parity fixtures.
- `MISSION-07.md`.

### Forbidden

- No AI tactics implementation.
- No visual terrain ownership in simulation.
- No battlefield redesign unless required to reproduce newer `main`.

### Acceptance Criteria

Canonical simulation can answer authoritative battlefield, occupancy, and line-of-sight questions without using the legacy renderer.

---

## Mission 08 — Canonical Entity Model

### Objective

Create authoritative entity state models before moving their higher-level behavior.

### Required Work

Create canonical entity types/state for:

- tanks;
- base drones;
- projectiles;
- shapes;
- powerups;
- teams/allegiance;
- health/liveness;
- ownership;
- spawn/despawn lifecycle;
- entity snapshots.

Keep behavior minimal where later missions own it.

Ensure entity state is serializable enough for deterministic tests and diagnostic snapshots.

### Required Deliverables

- Entity model.
- Entity lifecycle tests.
- Snapshot contracts.
- `MISSION-08.md`.

### Forbidden

- Do not implement full drone doctrine.
- Do not implement AI tactics.
- Do not let rendering objects become authoritative entities.

### Acceptance Criteria

The simulation can create, track, snapshot, and destroy all major entity categories independently of presentation.

---

## Mission 09 — Movement, Collision & Projectile Kinematics

### Objective

Migrate authoritative physical movement and collision behavior.

### Required Work

Migrate and parity-test:

- tank movement;
- acceleration/deceleration where applicable;
- hull/turret orientation semantics;
- battlefield boundary handling;
- tank-terrain collision;
- entity collision rules;
- sliding;
- projectile movement;
- swept collision / anti-tunneling behavior;
- projectile lifetime/range;
- low-level drone movement primitives needed by later drone behavior.

Preserve current movement feel and timings.

### Required Deliverables

- Canonical movement subsystem.
- Canonical collision subsystem.
- Projectile kinematics.
- Deterministic movement/collision parity scenarios.
- `MISSION-09.md`.

### Forbidden

- Do not rebalance mobility.
- Do not add new movement mechanics.
- No AI routing logic beyond interfaces required to command movement.

### Acceptance Criteria

Movement outcomes important to gameplay match current intended NOVA behavior within defined parity tolerances.

---

## Mission 10 — Combat, Weapons & Abilities

### Objective

Move combat authority into canonical simulation systems.

### Required Work

Migrate:

- weapon firing;
- fire cadence/cooldowns;
- muzzle semantics;
- projectile spawning;
- hit resolution;
- damage;
- armor;
- penetration;
- splash;
- cover damage;
- status effects;
- defensive mechanics;
- active abilities;
- ultimate gameplay semantics;
- class-specific weapon rules.

Use canonical content definitions from Mission 05.

Emit semantic events for later presentation systems rather than directly triggering visual/audio effects.

### Required Deliverables

- Canonical combat subsystem.
- Weapon/ability interfaces.
- Combat semantic events.
- Representative deterministic scenarios for every lineage and major weapon family.
- `MISSION-10.md`.

### Forbidden

- No visual effect implementation.
- No weapon rebalance unless newer `main` requires it.
- No class redesign.

### Acceptance Criteria

Core combat outcomes no longer require legacy gameplay authority for migrated systems.

---

## Mission 11 — Progression, Upgrades & Effective Builds

### Objective

Move progression and applied-power computation into canonical source.

### Required Work

Migrate:

- score and XP;
- levels;
- upgrade points;
- assigned upgrades;
- effective tank builds;
- evolution eligibility;
- evolution transitions;
- hybridization;
- lineage progression;
- stat application;
- current effective-power behavior used to compare player and AI strength.

Ensure raw level and applied build power remain distinct concepts wherever current intended gameplay requires it.

### Required Deliverables

- Canonical progression subsystem.
- `TankBuild` or equivalent authoritative applied-build representation.
- Upgrade/evolution parity tests.
- `MISSION-11.md`.

### Forbidden

- Do not redesign progression pacing.
- Do not add pity systems.
- Do not rebalance evolution thresholds unless required to match current intended behavior.

### Acceptance Criteria

The canonical simulation can reproduce current upgrade, evolution, and effective-build results independently of legacy state.

---

## Mission 12 — Targeting, Contacts & Perception Core

### Objective

Create the authoritative information/targeting layer that both players and AI will consume.

### Required Work

Migrate or establish:

- target acquisition primitives;
- target validity;
- contacts;
- designation;
- observer/spotter relay;
- battlefield visibility information;
- line-of-sight integration;
- last-known information interfaces where appropriate;
- `PerceivedWorld` or equivalent read model;
- rules governing what dynamic hostile state is legitimately observable.

Separate:

```text
GameWorld
```

from:

```text
PerceivedWorld
```

Do not yet implement full AI reasoning.

### Required Deliverables

- Canonical targeting/contact subsystem.
- Canonical perception API.
- Tests proving hidden or unavailable information cannot leak through the normal AI-facing interface.
- Observer/designation regression scenarios.
- `MISSION-12.md`.

### Forbidden

- No class AI tactics.
- No UI message presentation.
- No deliberate AI omniscience through unrestricted world access.

### Acceptance Criteria

A later AI controller can operate using an explicit perception interface rather than raw hostile dynamic state.

---

## Mission 13 — Unified Commands & Input

### Objective

Make human input, AI, replay, tests, and lobby controllers converge on common game commands.

### Required Work

Define canonical commands, including as needed:

- movement;
- aim;
- fire;
- abilities;
- ultimate;
- Controller/swarm orders;
- target designation.

Create controller/input adapters for:

- touch;
- mouse;
- keyboard;
- gamepad.

Preserve the intended twin-stick mobile control philosophy.

Ensure multitouch correctly supports actions such as pressing an ultimate while another touch remains active.

Ensure sensitivity and relevant live settings feed input adapters rather than gameplay authority.

Create test controllers that can issue commands without synthesizing DOM input.

### Required Deliverables

- Canonical command types.
- Human input adapters.
- Test/replay controller interfaces.
- Input regression tests.
- `MISSION-13.md`.

### Forbidden

- No AI tactics yet.
- No control redesign that changes current intended player behavior.
- No third virtual thumb requirement or hidden extra interaction channel.

### Acceptance Criteria

A tank can be driven entirely through canonical commands regardless of whether the command source is touch, mouse, keyboard, gamepad, test code, or future AI.

---

## Mission 14 — AI Perception & Memory

### Objective

Move AI knowledge acquisition and memory onto the canonical perception architecture.

### Required Work

Implement/migrate:

- contact ingestion;
- observation state;
- threat awareness inputs;
- last-seen/last-known state;
- memory decay;
- target memory;
- class-relevant awareness;
- current intended player-equivalent battlefield knowledge rules.

Audit existing AI for direct hostile-state reads.

Replace them with perception/memory interfaces unless a read is explicitly legitimate public geometry or global game state.

Add fairness tests that fail if AI gains unauthorized dynamic information.

### Required Deliverables

- `ai/perception/`.
- `ai/memory/`.
- AI knowledge-boundary tests.
- Legacy behavior parity scenarios.
- `MISSION-14.md`.

### Forbidden

- Do not redesign navigation or tactics yet.
- Do not compensate for migration difficulty by granting omniscience.

### Acceptance Criteria

AI knowledge is explicit, testable, and constrained.

---

## Mission 15 — AI Navigation & Terrain Intelligence

### Objective

Migrate path planning, obstacle handling, anti-stuck behavior, and tactical terrain navigation into canonical AI services.

### Required Work

Migrate current useful behavior including as applicable:

- route planning;
- A* or current canonical planner;
- route caching;
- local avoidance;
- wall navigation;
- stuck detection/recovery;
- path replanning;
- terrain-aware routing;
- cover traversal decisions that belong to navigation;
- performance budgets;
- hooks usable by tank and drone navigation.

Integrate with canonical battlefield geometry from Mission 07.

Add deterministic maps/scenarios for narrow passages, walls, blocked routes, dynamic obstructions, and anti-stuck behavior.

### Required Deliverables

- `ai/navigation/`.
- Canonical route planner.
- Navigation regression suite.
- Performance measurements for representative pathfinding loads.
- `MISSION-15.md`.

### Forbidden

- Do not embed class combat doctrine inside the route planner.
- Do not read renderer geometry as gameplay geometry.

### Acceptance Criteria

Migrated AI can reliably navigate current battlefields using canonical terrain data without legacy pathfinding patches.

---

## Mission 16 — AI Tactics & Class Controllers

### Objective

Move high-level AI decision making and lineage-specific combat behavior into canonical controllers.

### Required Work

Implement/migrate:

- target selection;
- positioning;
- engagement decisions;
- retreat/reposition decisions;
- firing decisions;
- ability usage;
- class/lineage-specific doctrine;
- Gunner AI;
- Cannon AI;
- Guardian AI;
- Sniper AI;
- Controller AI.

All AI must:

- consume canonical perception/memory;
- use canonical navigation;
- issue the same canonical command types available to player controllers;
- use canonical build/upgrade state;
- obey current intended difficulty and fairness rules.

### Required Deliverables

- `ai/tactics/`.
- `ai/controllers/`.
- Deterministic class-vs-class scenarios.
- Tests ensuring no AI-only movement/fire implementations bypass canonical simulation.
- `MISSION-16.md`.

### Forbidden

- No hidden AI-only weapon mechanics unless explicitly documented as an intentional difficulty mechanic already present in current behavior.
- No renderer-derived target information.

### Acceptance Criteria

Current tank AI can conduct a complete battle through canonical perception, navigation, tactics, commands, and simulation.

---

## Mission 17 — Drone Systems

### Objective

Turn drones into first-class canonical entities and behaviors rather than a web of historical patches.

### Required Work

Migrate:

- drone state;
- allegiance;
- command ownership;
- formations;
- movement orders;
- Controller drone behavior;
- repair/out-of-combat recovery;
- harvesting where applicable;
- attack runs;
- defense/interception;
- target selection;
- observer/spotter behavior;
- drone navigation integration;
- drone anti-stuck behavior;
- current IFF gameplay state consumed by rendering later.

Use canonical navigation and perception.

Retire corresponding legacy drone patches when their behavior is fully covered.

### Required Deliverables

- `game/entities/drones/`.
- drone AI/behavior modules.
- formation, repair, attack, observer, and pathfinding tests.
- `MISSION-17.md`.

### Forbidden

- Do not create a second drone physics model.
- Do not bypass canonical terrain or targeting systems.

### Acceptance Criteria

Controller and other drone-bearing systems can operate without legacy drone gameplay authority.

---

## Mission 18 — Rendering & Canonical Visual Language

### Objective

Separate presentation from gameplay and create shared canonical rendering implementations.

### Required Work

Create/migrate:

- renderer lifecycle;
- camera system;
- tank renderer;
- drone renderer;
- projectile renderer;
- battlefield renderer;
- effect renderer;
- canonical visual metadata consumption;
- muzzle alignment;
- weapon/projectile-type visual variation;
- allegiance/IFF presentation inputs;
- semantic effect hooks from game events.

Ensure rendering never determines gameplay outcomes.

Where possible, add automated visual regression or deterministic render-state tests.

Profile obvious rendering hot paths without performing the full performance campaign yet.

### Required Deliverables

- `rendering/`.
- Shared canonical visual factories.
- No gameplay authority in renderer.
- Representative visual parity checks.
- `MISSION-18.md`.

### Forbidden

- Do not duplicate tank definitions.
- Do not encode damage or targeting authority in rendering.
- Do not build Blackglass-specific copies yet.

### Acceptance Criteria

Gameplay can be rendered entirely from canonical definitions, simulation snapshots, and semantic events.

---

## Mission 19 — Blackglass Canonical Scene

### Objective

Make Blackglass a true client of canonical tank, weapon, projectile, drone, and rendering systems.

### Required Work

Rebuild or migrate Blackglass so it consumes:

- `TankRegistry`;
- canonical visual definitions;
- canonical renderer/factories;
- canonical weapon/projectile definitions;
- canonical muzzle origins;
- canonical drone visuals and behavior where animated previews require them.

Remove independent interpretations of tank geometry, projectile style, barrel alignment, or weapon behavior.

### Required Deliverables

- `scenes/blackglass/`.
- Blackglass parity tests/visual checks.
- Removal or bypass of redundant Blackglass-specific model logic.
- `MISSION-19.md`.

### Forbidden

- No manually maintained duplicate tank catalog.
- No separate projectile styling system.

### Acceptance Criteria

If a canonical tank or weapon visual changes correctly, Blackglass reflects it automatically without a separate implementation change.

---

## Mission 20 — Lobby Canonical Battlefield Scene

### Objective

Make the lobby background a real NOVA simulation scene using actual entities and AI under an explicit cheaper performance policy.

### Required Work

Create/migrate:

```text
scenes/lobby/
├── LobbyScene
├── LobbyBattle
└── LobbyPerformancePolicy
```

Use:

- canonical tanks;
- canonical AI;
- canonical drones;
- canonical battlefield systems;
- canonical rendering;
- canonical weapon behavior.

Control cost through policy such as:

- reduced AI think frequency;
- effect caps;
- offscreen/coarse updates;
- LOD;
- audio detail limits;
- background-specific camera behavior.

Do not achieve performance by inventing fake gameplay rules.

### Required Deliverables

- Canonical lobby battle scene.
- Performance policy.
- Tests ensuring representative lobby actors use real canonical classes/systems.
- `MISSION-20.md`.

### Forbidden

- No fake lobby-only tank behavior that can drift from gameplay.
- No lobby-specific duplicate AI implementation.

### Acceptance Criteria

The lobby looks and behaves like real NOVA because it is real NOVA, merely scheduled and rendered more cheaply.

---

## Mission 21 — UI, HUD, Menus & Settings

### Objective

Move the user interface onto explicit application/simulation APIs without giving React or presentation state gameplay authority.

### Required Work

Migrate:

- HUD;
- lobby/menu UI;
- evolution UI;
- settings UI;
- tips surfaces;
- Blackglass UI chrome;
- debug UI shell;
- touch-control presentation;
- controller/swarm command UI;
- spotter/contact message presentation;
- current duplicate-message suppression behavior;
- live settings such as sensitivity.

Preferred flow:

```text
Simulation / Application APIs
        ↓
Selectors / UI Store
        ↓
React
```

### Required Deliverables

- Canonical UI structure.
- Stable selectors/store interfaces.
- UI regression tests for major flows.
- `MISSION-21.md`.

### Forbidden

- Do not move gameplay truth into React component state.
- Do not redesign progression or controls while migrating UI.

### Acceptance Criteria

UI can be replaced or re-rendered without changing authoritative match state.

---

## Mission 22 — Audio, Feedback & Semantic Events

### Objective

Formalize audio and sensory feedback as presentation consumers of semantic game events.

### Required Work

Create/migrate:

- `AudioEngine`;
- spatial/distance-aware audio;
- music director;
- shot/flyby audio;
- impact cues;
- combat-entry cues;
- semantic glint/spark/flyby presentation triggers;
- drone audio;
- ability/ultimate cues;
- UI audio where appropriate.

Use semantic events such as:

```text
ProjectileFired
ProjectileFlyby
ProjectileEnteredView
TankDamaged
DroneDestroyed
PerfectGuard
EvolutionAvailable
```

Rendering/VFX and audio may subscribe independently.

### Required Deliverables

- Canonical audio subsystem.
- Semantic feedback event contracts.
- Tests for event emission and cue selection logic where feasible.
- `MISSION-22.md`.

### Forbidden

- No gameplay authority inside audio/VFX.
- No direct coupling that forces combat simulation to know specific sound files or particle assets.

### Acceptance Criteria

Gameplay reports what happened; presentation systems decide how to communicate it.

---

## Mission 23 — Persistence & Structured Diagnostics

### Objective

Make saves/settings durable across the migration and make internal state legible to developers and agents.

### Required Work

Introduce versioned persistence:

```ts
interface SaveFile {
  schemaVersion: number;
}
```

Migrate and preserve:

- settings;
- scores;
- progression;
- preferences;
- profile data;
- any other intentional persistent state.

Create explicit legacy-to-foundation migration paths.

Build structured diagnostics for:

- build/version;
- simulation;
- player;
- AI;
- perception;
- navigation;
- drones;
- input;
- rendering;
- audio;
- persistence;
- scene;
- performance.

Make diagnostics copyable in a stable machine-readable form.

Ensure PWA/offline storage behavior still works.

### Required Deliverables

- versioned persistence schema;
- migration functions;
- legacy-save migration tests;
- structured diagnostics API;
- copyable debug output;
- `MISSION-23.md`.

### Forbidden

- No silent deletion/reset of existing user data.
- No debug interface that depends on scraping arbitrary globals.

### Acceptance Criteria

Existing player state migrates correctly and an agent can receive a structured diagnostic snapshot of the canonical game.

---

## Mission 24 — Deterministic Replay, Parity Harness & Dual Runtime

### Objective

Prove the migrated game reproduces intended legacy behavior before the production cutover.

### Required Work

Complete deterministic execution infrastructure around the seeded simulation.

Record and replay:

- seed;
- player/AI commands;
- important semantic events;
- runtime/build version.

Create a development-only dual-runtime switch, such as:

```text
?runtime=legacy
?runtime=foundation
```

or an equivalent test harness.

Build a parity matrix across:

- desktop;
- portrait mobile;
- landscape mobile;
- touch;
- mouse;
- keyboard;
- gamepad;
- Gunner;
- Cannon;
- Guardian;
- Sniper;
- Controller;
- major evolutions;
- representative Battlefield layouts;
- Blackglass;
- lobby;
- settings;
- PWA behavior.

Compare meaningful outcomes rather than requiring irrelevant floating-point identity.

Resolve migration regressions discovered by the harness.

Do not weaken tests merely to make the new runtime pass.

### Required Deliverables

- deterministic command/replay infrastructure;
- legacy-vs-foundation parity harness;
- parity report;
- resolved blocking discrepancies;
- development-only runtime selector;
- `MISSION-24.md`.

### Forbidden

- No production cutover yet.
- No gameplay redesign disguised as a parity exception.

### Acceptance Criteria

The team has evidence—not assumption—that Foundation reproduces the current intended game across the required behavioral matrix.

---

## Mission 25 — Performance Engineering & Production Cutover

### Objective

Optimize the canonical runtime based on measurements and make it the sole production build path.

### Required Work

Profile:

- simulation;
- AI;
- navigation;
- drones;
- rendering;
- particles;
- UI;
- audio;
- allocations/GC;
- lobby background;
- mobile/touch performance.

Use optimizations only where justified, including as appropriate:

- object pools;
- spatial indexing;
- update throttling;
- render interpolation;
- LOD;
- culling;
- worker workloads;
- OffscreenCanvas;
- cache discipline.

Compare representative performance against the legacy baseline recorded by Mission 01.

Then change build/deployment so production is:

```text
checkout
npm ci
typecheck
unit tests
simulation tests
regression/parity tests
production build
artifact validation
deploy dist/
```

Stop using materialization and runtime patch injection as the production path.

Keep the legacy runtime available only as a temporary development validation artifact until Mission 26 removes it.

### Required Deliverables

- performance report;
- justified optimizations;
- canonical production build;
- canonical deployment workflow;
- verified PWA/offline behavior;
- `MISSION-25.md`.

### Forbidden

- Do not sacrifice behavior or readability for unmeasured micro-optimizations.
- Do not delete all legacy validation assets until Mission 26's final audit.

### Acceptance Criteria

- The canonical NOVA build is production-capable.
- Performance is acceptable relative to the baseline and project budgets.
- Production no longer depends on reconstructing a giant patched HTML runtime.

---

## Mission 26 — Legacy Retirement, Enforcement & Final Foundation Audit

### Objective

Remove the old baseplate, enforce the new architecture, and leave `NOVASTAR-INITIATIVE` ready for explicit promotion to `main`.

### Required Work

Delete from the active runtime, when parity proves they are no longer required:

```text
nova-gz/
nova-payload/
nova-updates/
legacy materializer logic
window.__novaModules
window.__novaCache
window.__novaMakeRequire
legacy injection machinery
legacy dual-runtime boot path
materialized giant index.html
src/legacy/ migration bridge
```

Preserve history through Git and concise historical documentation rather than active runtime layers.

Add/complete architectural enforcement:

- import-boundary rules;
- no-DOM simulation checks;
- no renderer-to-gameplay authority;
- no AI access to forbidden raw dynamic state;
- no duplicated canonical content implementations.

Create/update subsystem agent guidance:

```text
AGENTS.md
src/game/AGENTS.md
src/ai/AGENTS.md
src/rendering/AGENTS.md
src/content/AGENTS.md
src/ui/AGENTS.md
```

Run the complete Definition of Done audit in this document.

Search explicitly for forbidden legacy identifiers and mechanisms.

Run all builds, tests, parity suites, persistence migrations, PWA validation, and production artifact checks.

Create a final Foundation audit report.

Mark the initiative:

```text
READY FOR MAIN PROMOTION
```

Do **not** merge `NOVASTAR-INITIATIVE` into `main` unless a separate explicit instruction authorizes that promotion.

### Required Deliverables

- no active materializer;
- no active runtime patches;
- no giant gameplay-owning `index.html`;
- no legacy module globals;
- no migration bridge;
- architectural enforcement;
- domain `AGENTS.md` guidance;
- final audit report;
- `MISSION-26.md`.

### Forbidden

- Do not keep legacy architecture active "just in case."
- Do not promote to `main` without separate authorization.
- Do not declare completion with unresolved Definition of Done failures.

### Acceptance Criteria

All items in the Definition of Done section pass.

The remote `NOVASTAR-INITIATIVE` branch is a coherent, production-capable, fully canonical NOVA TANKS architecture and is explicitly marked ready for final promotion.

---

# 1D. Final Promotion Is Not an Agent Mission in This Sequence

Mission 26 ends the migration sequence by producing a fully audited `NOVASTAR-INITIATIVE` branch.

Promotion of that branch into `main` is intentionally outside the 26-mission chain.

This provides one final release gate where the initiative can be reviewed as a whole before replacing the existing canonical production mainline.

A separate explicit instruction may then authorize:

```text
NOVASTAR-INITIATIVE
        ↓
       main
```

Until that instruction exists, agents must leave the completed initiative on its development branch.

---

# 2. Migration Objective

The migration is complete only when NOVA TANKS ceases to be assembled from a materialized HTML runtime and becomes a normal source-driven application.

The desired production flow is:

```text
Source
  ↓
TypeScript / Vite
  ↓
Tests
  ↓
Production Build
  ↓
dist/
  ↓
Deployment
```

The legacy production flow:

```text
Compressed historical NOVA base
  ↓
Materialize large index.html
  ↓
Expose internal module registry
  ↓
Inject versioned runtime patches
  ↓
Boot game
```

must be completely removed from active production.

---

# 3. Target Repository Structure

The final architecture should approximately follow:

```text
nova-tanks/
│
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── public/
│   ├── audio/
│   ├── icons/
│   ├── manifest.webmanifest
│   └── static/
│
├── src/
│   ├── main.ts
│   │
│   ├── app/
│   │   ├── bootstrap.ts
│   │   ├── lifecycle.ts
│   │   └── GameApp.ts
│   │
│   ├── game/
│   │   ├── world/
│   │   ├── entities/
│   │   │   ├── tanks/
│   │   │   ├── drones/
│   │   │   ├── projectiles/
│   │   │   ├── shapes/
│   │   │   └── powerups/
│   │   │
│   │   ├── combat/
│   │   ├── movement/
│   │   ├── collision/
│   │   ├── battlefield/
│   │   ├── targeting/
│   │   ├── progression/
│   │   ├── spawning/
│   │   └── simulation/
│   │
│   ├── ai/
│   │   ├── perception/
│   │   ├── memory/
│   │   ├── navigation/
│   │   ├── tactics/
│   │   └── controllers/
│   │
│   ├── input/
│   │   ├── commands/
│   │   ├── touch/
│   │   ├── mouse/
│   │   ├── keyboard/
│   │   └── gamepad/
│   │
│   ├── content/
│   │   ├── tanks/
│   │   ├── lineages/
│   │   ├── weapons/
│   │   ├── drones/
│   │   ├── upgrades/
│   │   ├── evolutions/
│   │   └── balance/
│   │
│   ├── rendering/
│   │   ├── Renderer.ts
│   │   ├── camera/
│   │   ├── tanks/
│   │   ├── drones/
│   │   ├── projectiles/
│   │   ├── battlefield/
│   │   └── effects/
│   │
│   ├── scenes/
│   │   ├── gameplay/
│   │   ├── lobby/
│   │   └── blackglass/
│   │
│   ├── audio/
│   ├── ui/
│   │   ├── hud/
│   │   ├── menus/
│   │   ├── settings/
│   │   ├── evolution/
│   │   └── debug/
│   │
│   ├── persistence/
│   ├── diagnostics/
│   └── shared/
│
├── tests/
│   ├── unit/
│   ├── simulation/
│   ├── parity/
│   ├── regression/
│   ├── integration/
│   └── fixtures/
│
├── tools/
├── docs/
└── archive/
```

The production `index.html` should eventually be approximately:

```html
<body>
  <div id="app"></div>
  <canvas id="game"></canvas>
  <script type="module" src="/src/main.ts"></script>
</body>
```

Its job is to start NOVA, not to contain NOVA.

---

# 4. Architectural Laws

These rules define the new foundation and should be enforced by documentation, import rules, tests, and CI.

## 4.1 Simulation Owns Truth

Gameplay authority belongs to the simulation.

The following must never depend on presentation code:

- damage
- movement
- collision
- progression
- targeting
- visibility
- terrain
- upgrades
- abilities
- spawning
- AI state
- projectile behavior

Rendering may observe gameplay state, but must not determine it.

---

## 4.2 Human and AI Players Use the Same Game Systems

All controllers should produce canonical commands:

```text
Touch ─────┐
Mouse ─────┤
Gamepad ───┤
Keyboard ──┼──► TankCommand ───► Tank Simulation
AI ────────┘
```

AI should not maintain a parallel implementation of:

- movement
- firing
- aiming
- weapon mechanics
- abilities
- collision
- upgrade effects

Difficulty may affect decision quality, reaction time, planning depth, or explicitly documented rule modifiers, but should not arise from hidden alternate mechanics.

---

## 4.3 Perception Is Authoritative

Dynamic opponent knowledge must pass through a perception layer.

```text
WORLD
  ↓
PERCEPTION
  ├── Player Presentation
  └── AI Knowledge
```

AI must not read hidden enemy positions directly from world state when those positions would not legitimately be known.

This formalizes NOVA's intended AI/player information parity.

---

## 4.4 One Definition Per Thing

The project must have one canonical definition for each:

- tank
- weapon
- projectile
- drone
- evolution
- upgrade
- battlefield
- visual identity
- audio identity

Gameplay, Blackglass, lobby, UI, AI, and balancing tools consume the same definitions.

Alternative local definitions are prohibited where a canonical system exists.

---

## 4.5 Scenes Compose Systems; They Do Not Duplicate Them

Gameplay, lobby, and Blackglass are scenes that assemble existing systems.

The lobby should instantiate real tanks and real AI using a cheaper performance policy.

Blackglass should render canonical tanks using the same rendering definitions as gameplay.

There should not be separate gameplay, lobby, and showroom interpretations of the same tank.

---

## 4.6 Runtime Monkey-Patching Is Prohibited

The new runtime must not depend on:

- `window.__novaModules`
- dynamic module wrapping
- injected version scripts
- release-time runtime patch chains
- historical compatibility hooks as normal gameplay architecture

Legacy compatibility code may temporarily use such systems only inside an explicit migration boundary.

No new gameplay feature may be implemented by adding another runtime patch.

---

# 5. Migration Principles

## 5.1 Preserve Behavior Before Improving It

Migration and redesign must be separate operations.

A system being migrated should first reproduce current intended behavior.

Only after parity is established should the system receive gameplay improvements.

This prevents migration bugs from being confused with intentional changes.

---

## 5.2 Migrate by Dependency, Not Release Number

Historical release order does not define architectural ownership.

Subsystems should move in dependency order:

1. shared math and world primitives
2. terrain
3. entities
4. movement and collision
5. combat
6. progression
7. targeting and perception
8. input
9. AI
10. rendering
11. scenes
12. UI
13. audio
14. persistence
15. diagnostics

---

## 5.3 The Legacy Runtime Is a Deletion Target

Temporary legacy adapters are allowed.

Permanent coexistence is not.

Every migration component must have a clear removal path.

---

# 6. Phase 0 — Preserve the Current Game

Before moving gameplay logic, create a reliable baseline of the current production game.

Inventory:

- current production release
- deployed `index.html`
- compressed base payload
- all active `nova-updates/*.js`
- inactive or superseded updates
- global module registry behavior
- save/localStorage formats
- settings formats
- PWA behavior
- tank definitions
- weapon definitions
- drone definitions
- evolution trees
- upgrade tables
- battlefield layouts
- AI behavior
- controls
- mobile behavior
- audio behavior
- Blackglass
- lobby simulation
- diagnostics
- regression tests
- performance expectations

Classify every historical patch as:

```text
CANONICAL
Required current behavior.

SUPERSEDED
Replaced by a newer implementation.

COMPATIBILITY
Exists only because of the legacy architecture.

HOTFIX
Contains valid behavior that needs proper incorporation.

DEAD
No longer active.

DOCUMENTATION ONLY
Useful historical context but not active implementation.
```

### Exit Criteria

For every active legacy file, the team or agent can answer:

> What behavior disappears if this file is removed?

No migration should proceed without this map.

---

# 7. Phase 1 — Normalize the Repository Identity

The existing conventional TypeScript/Vite application should be evaluated separately from NOVA.

If it is unrelated legacy code, it should not remain mixed with the canonical NOVA source tree.

Actions:

- rename the package to `nova-tanks`
- determine whether old non-NOVA source is still needed
- delete verified irrelevant code, relying on Git for history
- temporarily archive anything uncertain
- create a clean canonical `src/` for NOVA
- ensure all path aliases and TypeScript settings reflect NOVA domains

### Exit Criteria

`src/` means NOVA TANKS and nothing else.

---

# 8. Phase 2 — Build the New Application Shell

Create:

```text
src/main.ts
src/app/bootstrap.ts
src/app/lifecycle.ts
src/app/GameApp.ts
```

Move application-level concerns out of the historical HTML:

- PWA registration
- service worker registration
- manifest handling
- global styles
- fonts
- root containers
- startup diagnostics
- error handling
- lifecycle management

During this phase, a temporary `LegacyRuntimeAdapter` may still boot the current game.

### Exit Criteria

- `index.html` is already small.
- The game launches through the new application shell.
- Gameplay remains unchanged.

---

# 9. Phase 3 — Establish the Legacy Compatibility Boundary

All remaining access to the historical runtime must be isolated under:

```text
src/legacy/
```

Suggested structure:

```text
legacy/
├── LegacyRuntime.ts
├── LegacyModules.ts
├── LegacyEvents.ts
├── LegacyStateAdapter.ts
└── README.md
```

Rules:

- New code may call the legacy adapter.
- New code may not directly access legacy globals.
- No new gameplay features are added inside `src/legacy`.
- The directory is explicitly marked as a deletion target.

Temporary interfaces may include:

```ts
interface LegacyGameBridge {
  startMatch(): void;
  getTankDefinitions(): TankDefinition[];
  getWorldSnapshot(): WorldSnapshot;
  issueCommand(command: GameCommand): void;
}
```

The implementation may be imperfect internally; the boundary must be clean.

### Exit Criteria

All remaining legacy access is localized.

---

# 10. Phase 4 — Extract Canonical Content

Move pure definitions before complex runtime behavior.

Create:

```text
src/content/tanks/
src/content/weapons/
src/content/drones/
src/content/evolutions/
src/content/upgrades/
src/content/battlefields/
src/content/balance/
```

Create registries such as:

```text
TankRegistry
WeaponRegistry
DroneRegistry
EvolutionRegistry
BattlefieldRegistry
```

Example:

```ts
export const railgun: TankDefinition = {
  id: 'railgun',
  lineage: 'sniper',
  tier: 2,
  hull: {...},
  movement: {...},
  weapon: {...},
  visuals: {...},
  audio: {...}
};
```

### Exit Criteria

There is one authoritative source for every tank, weapon, drone, upgrade, battlefield, and evolution.

---

# 11. Phase 5 — Build the Simulation Kernel

Create a DOM-independent game simulation.

Suggested structure:

```text
game/simulation/
├── GameWorld.ts
├── GameClock.ts
├── GameState.ts
├── GameEvent.ts
└── Simulation.ts
```

Canonical interface:

```ts
const game = new Simulation(config);

game.step(dt);

const snapshot = game.snapshot();
```

The simulation must not require:

- DOM
- React
- canvas
- CSS
- WebAudio
- touch events

### Exit Criteria

A match can run headlessly in tests.

---

# 12. Phase 6 — Migrate Core Systems

## 12.1 Shared Math and World Primitives

Move:

- vectors
- geometry
- deterministic random
- IDs
- timers
- spatial queries
- collision helpers

## 12.2 Terrain

Move:

- battlefield definitions
- solid geometry
- destructible cover
- line of sight
- spawn safety
- rubble
- structural damage

## 12.3 Entities

Create canonical models for:

- tanks
- drones
- projectiles
- shapes
- powerups

## 12.4 Movement and Collision

Move:

- tank movement
- drone movement
- sliding
- terrain collision
- swept projectile collision
- anti-tunneling behavior

## 12.5 Combat

Move:

- weapons
- firing
- damage
- armor
- splash
- penetration
- abilities
- statuses
- defensive mechanics

## 12.6 Progression

Move:

- XP
- levels
- upgrades
- evolution
- hybridization
- lineage transitions

## 12.7 Targeting

Move:

- acquisition
- contact systems
- designation
- observer relay
- visibility authorization

### Exit Criteria

The primary gameplay loop can run entirely through canonical source modules.

---

# 13. Phase 7 — Introduce a Canonical Command Model

All player and AI control should converge on common command types.

Example:

```ts
interface TankCommand {
  movement: Vec2;
  aim: Vec2;
  fire: boolean;
  ability?: AbilityCommand;
  swarm?: SwarmCommand;
}
```

Controllers become:

```text
HumanInputController
AIController
ReplayController
LobbyController
TestController
```

All produce commands for the same simulation.

### Exit Criteria

A test can control a tank without simulating touch or mouse events.

---

# 14. Phase 8 — Rebuild AI as a First-Class System

Do not create a monolithic `ai.ts`.

Recommended structure:

```text
ai/
├── perception/
│   ├── Vision.ts
│   ├── Contacts.ts
│   └── Observation.ts
│
├── memory/
│   ├── LastSeen.ts
│   └── ThreatMemory.ts
│
├── navigation/
│   ├── RoutePlanner.ts
│   ├── LocalAvoidance.ts
│   └── TerrainTactics.ts
│
├── tactics/
│   ├── Positioning.ts
│   ├── TargetSelection.ts
│   ├── Engagement.ts
│   └── Retreat.ts
│
└── controllers/
    ├── GunnerAI.ts
    ├── CannonAI.ts
    ├── GuardianAI.ts
    ├── SniperAI.ts
    └── ControllerAI.ts
```

AI should reason from:

```text
PerceivedWorld
```

rather than unrestricted dynamic world state.

### Exit Criteria

- AI cannot accidentally gain hidden target information.
- AI issues normal game commands.
- AI behavior can be tested headlessly and deterministically.

---

# 15. Phase 9 — Formalize Drones

Controller drones should become proper entities rather than behavior spread across patches.

Suggested structure:

```text
game/entities/drones/
├── Drone.ts
├── DroneState.ts
├── DroneFormation.ts
├── DroneCommand.ts
├── DroneRepair.ts
└── DroneCombat.ts
```

AI support:

```text
ai/drones/
├── DroneNavigation.ts
├── DroneDefense.ts
├── DroneHarvest.ts
├── DroneAttackRun.ts
└── ObserverBehavior.ts
```

### Exit Criteria

Drone movement, repair, formation, targeting, attack runs, and observer behavior are owned by explicit subsystems.

---

# 16. Phase 10 — Separate Rendering

Rendering receives state and events.

```text
Simulation
   ↓
Snapshot / Events
   ↓
Rendering
```

Create:

```text
TankRenderer
DroneRenderer
ProjectileRenderer
TerrainRenderer
EffectsRenderer
CameraSystem
```

Canonical content provides visual definitions.

### Exit Criteria

No renderer contains gameplay authority.

---

# 17. Phase 11 — Convert Blackglass into a Client of Canonical Systems

Blackglass becomes a scene:

```text
scenes/blackglass/
```

It should inspect canonical definitions:

```ts
const definition = tankRegistry.get('singularity');
blackglass.inspect(definition);
```

It should share:

- tank rendering
- barrel alignment
- projectile visuals
- drone visuals
- weapon definitions
- muzzle origins
- class data

with gameplay.

### Exit Criteria

There is no independent Blackglass tank implementation that can drift from gameplay.

---

# 18. Phase 12 — Convert the Lobby into a Real Simulation Scene

The lobby background should instantiate real tanks, real weapons, real drones, and real AI.

Use a performance policy rather than separate gameplay rules.

Example:

```ts
{
  aiThinkRate: 'reduced',
  distantEffects: 'reduced',
  maxParticles: 'capped',
  offscreenSimulation: 'coarse',
  audioDetail: 'reduced'
}
```

### Exit Criteria

The lobby battlefield is actual NOVA gameplay under a cheaper simulation/rendering policy.

---

# 19. Phase 13 — Migrate UI

Organize UI by domain:

```text
ui/
├── hud/
├── lobby/
├── evolution/
├── settings/
├── tips/
├── blackglass/
└── debug/
```

React may remain the UI framework.

React must not become the authoritative simulation state.

Preferred flow:

```text
NOVA Simulation
      ↓
Selectors / UI Store
      ↓
React
```

### Exit Criteria

UI displays and controls the game through explicit application APIs.

---

# 20. Phase 14 — Formalize Audio and Feedback

Create:

```text
audio/
├── AudioEngine.ts
├── SpatialAudio.ts
├── MusicDirector.ts
└── cues/
```

The simulation produces semantic events:

```text
ProjectileFired
ProjectileFlyby
TankDamaged
DroneDestroyed
PerfectGuard
EvolutionAvailable
```

Audio and VFX independently subscribe.

### Exit Criteria

Gameplay does not directly own presentation effects.

---

# 21. Phase 15 — Version Persistence

Introduce versioned save schemas:

```ts
interface SaveFile {
  schemaVersion: number;
}
```

Add migrations:

```text
persistence/migrations/
├── v1_to_v2.ts
├── v2_to_v3.ts
└── ...
```

Preserve all intended existing user data:

- settings
- scores
- progression
- preferences
- profile data

### Exit Criteria

Existing players migrate without losing meaningful persistent data.

---

# 22. Phase 16 — Structured Diagnostics

Every major subsystem should expose structured diagnostics:

```text
simulation
renderer
AI
navigation
drones
input
audio
persistence
performance
scene
build
```

Example export:

```json
{
  "build": {},
  "simulation": {},
  "player": {},
  "ai": {},
  "navigation": {},
  "performance": {}
}
```

### Exit Criteria

Debug data can be copied for agents without scraping ad hoc globals.

---

# 23. Deterministic Simulation

Authoritative gameplay should use a seeded random source instead of arbitrary `Math.random()` calls.

Preferred:

```ts
game.random.next();
```

Store:

```text
seed
commands
important events
version
```

This enables:

- replays
- bug reproduction
- deterministic regression tests
- AI benchmarking
- balance simulation
- performance profiling

### Exit Criteria

A recorded deterministic scenario can be replayed reliably.

---

# 24. Testing Strategy

Migration testing has three levels.

## 24.1 Unit Tests

Examples:

- projectile sweep
- line of sight
- evolution resolution
- damage calculations
- upgrade effects

## 24.2 Scenario Tests

Examples:

- Railgun versus barricade
- Controller swarm through Four Gates
- Guardian Perfect Guard
- Cannon airburst behind partial cover
- Sniper acquisition through Observer relay

## 24.3 Legacy Parity Tests

Run equivalent situations against:

```text
Legacy Runtime
New Runtime
```

Compare meaningful outputs:

- damage
- kills
- target acquisition
- projectile count
- evolution
- path result
- drone state
- cover destruction

Do not require irrelevant floating-point identity where gameplay outcome is unchanged.

---

# 25. Existing Regression Suite

Preserve NOVA's existing regression culture.

During migration, tests that currently validate injected patch presence should be converted into tests of actual game behavior and module contracts.

The target is:

```text
test gameplay
```

not:

```text
test whether a historical patch was injected
```

---

# 26. Phase 17 — Dual Runtime Validation

Before production cutover, temporarily support:

```text
Legacy NOVA
New NOVA
```

through a development-only switch.

For example:

```text
?runtime=legacy
?runtime=foundation
```

Compare:

- desktop
- portrait mobile
- landscape mobile
- touch
- mouse
- keyboard
- gamepad

Across:

- Gunner
- Cannon
- Guardian
- Sniper
- Controller
- all relevant evolutions
- all Battlefield layouts
- Blackglass
- lobby
- settings
- PWA behavior

The switch is a migration tool and must not survive final completion.

---

# 27. Phase 18 — Performance Pass

Performance optimization happens after architectural parity.

Profile:

- simulation
- AI
- navigation
- rendering
- particles
- UI
- audio
- memory allocation
- garbage collection
- lobby background

Potential optimizations only where justified:

- object pools
- spatial indexing
- fixed-step simulation
- update throttling
- render interpolation
- LOD
- culling
- workers
- OffscreenCanvas

Do not create complexity before profiling proves its value.

---

# 28. Phase 19 — Production Cutover

Production becomes:

```text
index.html
   ↓
src/main.ts
   ↓
Canonical NOVA
```

CI/deployment becomes approximately:

```text
checkout
npm ci
typecheck
unit tests
simulation tests
regression tests
production build
artifact validation
deploy dist/
```

The deployment no longer reconstructs or patches the runtime.

---

# 29. Phase 20 — Retire the Legacy Foundation

Once production parity is established, delete from active runtime:

```text
nova-gz/
nova-payload/
nova-updates/
legacy materializer logic
window.__novaModules
window.__novaCache
window.__novaMakeRequire
runtime injection machinery
materialized giant index.html
```

Preserve history with:

- Git history
- a final legacy tag
- release documentation
- migration notes

Do not retain dead production architecture indefinitely.

---

# 30. Phase 21 — Rewrite Agent Guidance

The new architecture should actively help future agents.

Root:

```text
AGENTS.md
```

Subsystem guidance:

```text
src/game/AGENTS.md
src/ai/AGENTS.md
src/rendering/AGENTS.md
src/content/AGENTS.md
src/ui/AGENTS.md
```

Example AI rules:

```text
AI may not obtain hostile dynamic state outside PerceivedWorld.

AI issues the same commands available to human controllers.

Do not introduce AI-only movement, weapon, or targeting rules unless
explicitly documented as difficulty mechanics.

Navigation changes require deterministic regression scenarios.
```

Example rendering rules:

```text
Rendering has no gameplay authority.

Never duplicate canonical tank or weapon definitions.

Visual effects must serve gameplay communication or deliberate atmosphere
without undermining readability.
```

Example content rules:

```text
Tank and weapon stats are authoritative here.

Gameplay, Blackglass, and lobby consume these definitions.

Do not hardcode class data elsewhere.
```

---

# 31. Architectural Enforcement

Documentation is not sufficient.

CI should enforce dependency direction.

Preferred direction:

```text
content      → shared
simulation   → content, shared
ai           → simulation APIs, perception
rendering    → simulation snapshots, content
ui           → application APIs
```

Prohibited examples:

```text
simulation → rendering
simulation → React
simulation → DOM
ai → renderer
content → UI
```

Invalid imports should fail CI.

---

# 32. Internal NOVA API

Expose a small, stable application boundary:

```ts
interface NovaGame {
  start(config: MatchConfig): void;
  pause(): void;
  resume(): void;
  stop(): void;

  issueCommand(command: PlayerCommand): void;

  getSnapshot(): GameSnapshot;
  getDiagnostics(): DiagnosticsSnapshot;

  subscribe(listener: GameEventListener): Unsubscribe;
}
```

This supports future:

- replay viewers
- spectator modes
- AI tournaments
- benchmark harnesses
- alternate frontends
- automated balancing
- worker-based simulation
- multiplayer experiments
- agent testing environments

---

# 33. Migration Scoreboard

Track migration by domain.

| Domain | Legacy | Dual | Canonical |
|---|---:|---:|---:|
| Content | ● | ○ | ○ |
| Tanks | ● | ○ | ○ |
| Weapons | ● | ○ | ○ |
| Projectiles | ● | ○ | ○ |
| Battlefield | ● | ○ | ○ |
| Drones | ● | ○ | ○ |
| AI perception | ● | ○ | ○ |
| AI navigation | ● | ○ | ○ |
| AI tactics | ● | ○ | ○ |
| Progression | ● | ○ | ○ |
| Input | ● | ○ | ○ |
| Rendering | ● | ○ | ○ |
| Blackglass | ● | ○ | ○ |
| Lobby | ● | ○ | ○ |
| Audio | ● | ○ | ○ |
| UI | ● | ○ | ○ |
| Persistence | ● | ○ | ○ |
| Diagnostics | ● | ○ | ○ |
| PWA | ● | ○ | ○ |

Also track:

```text
Legacy runtime patches remaining
Legacy global hooks remaining
Legacy gameplay LOC inside index.html
Canonical systems completed
Parity tests passing
```

Final required values:

```text
legacy patches = 0
legacy gameplay logic in index.html = 0
legacy runtime globals = 0
```

---

# 34. Definition of Done

The migration is not complete until all of the following are true:

1. `index.html` is only a web entry shell.
2. `src/` is entirely NOVA.
3. `npm run build` produces the playable game from canonical source.
4. No gameplay implementation lives in HTML.
5. No `nova-gz` reconstruction exists.
6. No versioned release JS is injected at runtime.
7. No `window.__novaModules` modification remains.
8. All tanks come from one registry.
9. Gameplay, Blackglass, and lobby share canonical definitions.
10. Human and AI tanks operate through common command and simulation systems.
11. AI dynamic knowledge passes through explicit perception.
12. Simulation can run without DOM or rendering.
13. Deterministic headless scenarios work.
14. Existing saves migrate correctly.
15. Desktop, mobile, touch, keyboard, mouse, and gamepad regressions pass.
16. Lobby simulation uses real gameplay entities.
17. Blackglass uses real rendering definitions.
18. Debug diagnostics operate on structured subsystem data.
19. Production deployment serves the Vite build.
20. Legacy materialization code is deleted from the active tree.
21. An unfamiliar agent can locate the authoritative implementation of a mechanic from the directory structure and documentation without reverse-engineering historical releases.

---

# 35. What the Migration Must Not Redesign

This is an architectural migration, not a blanket gameplay rewrite.

Unless separately approved, preserve:

- tank lineages
- current progression
- skill-expression philosophy
- Battlefield
- Controller doctrine
- Sniper doctrine
- Blackglass
- lobby
- current graphics
- intentional AI behavior
- mobile twin-stick controls
- audio language
- balance
- existing combat interactions
- existing user progression and preferences

The objective is to move **the game that exists** into an architecture capable of supporting **the game NOVA TANKS can become**.

---

# 36. Final Principle

NOVA TANKS should no longer be developed as a sequence of increasingly sophisticated extensions to an experimental runtime.

Its source tree should become the authoritative description of the game.

Historical releases should explain how NOVA arrived at its current state.

They should no longer be the physical layers from which the current game is assembled.

When this migration is complete, agents should spend their reasoning budget improving navigation, combat, balance, controls, AI, visuals, progression, and new systems—not reverse-engineering historical patches or preserving accidental coupling.

That is the purpose of **NOVA Foundation**:

> Preserve the game. Replace the baseplate. Remove the ceiling.
