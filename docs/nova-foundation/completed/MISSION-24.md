# NOVASTAR Mission 24 — Deterministic Replay, Parity Harness & Dual Runtime

Status: COMPLETE

## Sequence gate

- Predecessor: Mission 23 — Persistence & Structured Diagnostics.
- Mission 23 canonical integration: `148385d51c391eb431ce10c777877a4de1840f87`.
- Mission 23 exact post-merge CI: run `31545282991`, completed successfully before Mission 24 began.
- Mission 24 focused branch: `novastar/mission-24-deterministic-replay-parity`, created from that exact integration commit.
- Production `main` was rechecked before sealing and remains `52009c406b948a7b9a9402bb56495f20b3918ba6`; no newer mainline reconciliation is required and Mission 24 explicitly forbids production cutover.

## Delivered

- `src/replay/Replay.ts` defines a versioned deterministic recording containing simulation seed, build/runtime versions, fixed simulation step, tick-stamped command envelopes and important semantic events.
- `ReplayRecorder` validates inputs and canonicalizes command/event order so recordings are stable across adapters and capture player/AI command source and sequence.
- `ReplayPlayer` drives a common replay artifact against either a legacy or Foundation runtime adapter and captures resulting semantic events and meaningful outcomes for comparison.
- `src/replay/ParityHarness.ts` defines the required mother-spec behavioral matrix and refuses mission-level success while any required surface is absent.
- Meaningful parity comparison supports explicit bounded numeric tolerance rather than irrelevant floating-point identity; missing keys, array-size drift, value changes, event changes and numeric errors beyond tolerance remain blocking discrepancies.
- The harness has no global parity escape hatch. Any ignored path must be named by the individual parity case, and an intentional-drift regression proves mismatches still fail.
- `src/app/runtimeSelector.ts` plus `src/app/bootstrap.ts` provide the required `?runtime=legacy` / `?runtime=foundation` development selector. Legacy selection delegates to the existing `LegacyRuntime` bridge rather than creating another legacy implementation.
- Production builds cannot query-switch to legacy: outside development mode runtime selection always resolves to Foundation. Mission 24 therefore performs no production cutover.
- `docs/nova-foundation/PARITY_REPORT_MISSION_24.md` records the evidence matrix for desktop, portrait mobile, landscape mobile, touch, mouse, keyboard, gamepad, Gunner, Cannon, Guardian, Sniper, Controller, major evolutions, representative Battlefield layouts, Blackglass, lobby, settings and PWA behavior.
- The parity evidence remains additive to the full historical and Foundation regression suite accumulated since the Mission 01 baseline; Mission 24 does not replace or weaken those tests.
- `tests/node/deterministic-replay-parity-mission-24.test.js` protects recording determinism, equivalent-runtime replay, meaningful numeric tolerance, mandatory matrix coverage, intentional-drift failure behavior, development-only runtime selection and parity-report coverage.

## Migration invariants

- Replay records commands and outcomes; it does not introduce a second gameplay implementation.
- The same canonical `GameCommand` envelopes are preserved across touch, mouse, keyboard, gamepad, AI, test and replay sources.
- Runtime selection is development-only and cannot cut production over to the legacy bridge.
- Legacy and Foundation comparisons operate on meaningful outcomes and semantic events rather than renderer-owned or timing-noise state.
- No gameplay redesign is accepted as a parity exception.
- Existing legacy, canonical, scene, settings, persistence and PWA regressions remain active in the complete Node suite.
- Production `main` remains untouched.

## Validation

Implementation head `fdab999403d50c13aeeeef222e306245cad56d9f` passed GitHub Actions CI run `31549139979`:

- production build: PASS
- complete Node regression suite: PASS
- Mission 24 deterministic replay/parity regressions: PASS
- production Tailwind validation: PASS

The completion-marker commit is intentionally validated again as the sealed Mission 24 branch head before integration.

## Acceptance

Mission 24 satisfies the mother specification acceptance condition by creating deterministic command/event replay, a real legacy/Foundation adapter boundary, mandatory coverage for every specified behavioral surface, evidence that incomplete coverage or behavioral drift fails, and a development-only runtime selector while leaving production cutover to Mission 25.
