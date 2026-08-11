# NOVA Foundation — Mission 20 Completion Marker

**Mission:** 20 — Lobby Canonical Battlefield Scene  
**Status:** COMPLETE  
**Branch:** `novastar/mission-20-lobby`  
**Predecessor integration:** `a44434aea9b9f9e9cd9b1989ddf1007b5ea42416` (Mission 19)  
**Validated implementation head:** `9677c8edf9fce0e404dec273a2cbf5cc2d9c0f1c`  
**Validated implementation CI:** run `31531628360` — SUCCESS

## What Mission 20 establishes

- `src/scenes/lobby/LobbyScene.ts` is the canonical lobby presentation shell and consumes the shared Mission 18 `Renderer`.
- `src/scenes/lobby/LobbyBattle.ts` builds its roster directly from `TankRegistry.all()` and runs canonical `TankAIController`, Mission 15 navigation, Mission 12 `PerceptionCore`, Mission 17 `DroneSystem`, Mission 09 tank/drone movement, Mission 10 `CombatSystem` and projectile kinematics, and Mission 07 `Battlefield` state.
- The historical War Room baseline remains level 30, but Tier 3 actors whose canonical progression unlock is later are raised only to the canonical minimum legal apex level. This intentionally removes the old decorative scene's impossible "Tier 3 at level 30" state rather than preserving a fake gameplay rule.
- `LobbyPerformancePolicy` owns only scheduling/presentation cost: simulation/render cadence, staggered AI think cadence, off-screen think multiplier, effect/projectile presentation caps, camera drift, reduced-motion behavior, and low-power presentation cadence.
- Reduced-motion freezes camera drift without pausing the canonical battle simulation.
- Runtime Battlefield terrain/rubble state is passed to the shared renderer, so the lobby does not invent static scenery detached from canonical terrain state.

## Preserved migration invariants

- No lobby-private tank roster or class definitions.
- No lobby-specific AI implementation or lineage behavior switch.
- No lobby-private fire-mode implementation, projectile profile, damage table, movement tuning table, or visual palette.
- Canonical progression legality wins over the old decorative scene when the two conflict.
- Performance savings come from scheduling and presentation caps, not weaker/fake combat rules.
- Production `main` is not a target of this mission.

## Validation

The first full test gate correctly failed because the legacy lobby assumption that every form can be level 30 conflicts with canonical progression (`tempest tier 3 is impossible at level 30`). The implementation was corrected to use level 30 as a baseline while respecting each form's canonical minimum unlock. No test was weakened around the gameplay invariant.

Final implementation head `9677c8edf9fce0e404dec273a2cbf5cc2d9c0f1c` passed CI run `31531628360`, including:

- production build — SUCCESS
- complete Node regression suite — SUCCESS
- production Tailwind validation — SUCCESS

Mission 21 remains blocked until this sealed Mission 20 branch is merged into `NOVASTAR-INITIATIVE` and the exact integrated commit has green CI.
