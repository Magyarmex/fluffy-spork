# NOVA Foundation — Mission 24 Parity Report

## Purpose

Mission 24 establishes a deterministic replay artifact and a legacy-vs-Foundation comparison boundary before production cutover. The harness compares meaningful gameplay/presentation outcomes with explicit numeric tolerance instead of requiring irrelevant floating-point identity. A parity case cannot pass the mission-level report while any mother-spec coverage surface is missing.

## Runtime boundary

The development shell accepts `?runtime=legacy` and `?runtime=foundation` only while Vite reports a development build. Production selection always resolves to Foundation, so this mission introduces **no production cutover**. The legacy route uses the existing `LegacyRuntime` bridge and does not create a second legacy implementation.

## Deterministic artifact

A replay contains:

- schema version;
- simulation seed;
- build version;
- runtime version;
- fixed simulation step;
- tick-stamped player/AI command envelopes, including source and sequence;
- tick-stamped semantic events.

Commands are canonically ordered by tick, command sequence, and actor ID. Semantic events are canonically ordered by tick and event type. Playback drives either runtime through the same recording contract.

## Required parity matrix

| Surface | Evidence / comparison rule | Status |
|---|---|---|
| Desktop | Included in required coverage gate; compare authoritative outcomes and semantic events | PASS — harness gate |
| Portrait mobile | Included in required coverage gate; orientation is scenario metadata, not a gameplay fork | PASS — harness gate |
| Landscape mobile | Included in required coverage gate; orientation is scenario metadata, not a gameplay fork | PASS — harness gate |
| Touch | Canonical command envelopes are replayed independent of device adapter | PASS — harness gate |
| Mouse | Canonical command envelopes are replayed independent of device adapter | PASS — harness gate |
| Keyboard | Canonical command envelopes preserve source and deterministic sequence | PASS — harness gate |
| Gamepad | Canonical command envelopes are replayed through the same command contract | PASS — harness gate |
| Gunner | Required content surface; existing Gunner regressions remain in the full Node suite | PASS — coverage gate + existing regressions |
| Cannon | Required content surface; existing Cannon regressions remain in the full Node suite | PASS — coverage gate + existing regressions |
| Guardian | Required content surface; existing Guardian regressions remain in the full Node suite | PASS — coverage gate + existing regressions |
| Sniper | Required content surface; existing canonical tank/content regressions remain in the full Node suite | PASS — coverage gate + existing regressions |
| Controller | Required content and command surface; existing Controller/drone regressions remain in the full Node suite | PASS — coverage gate + existing regressions |
| Major evolutions | Required coverage surface; progression/evolution regressions remain part of the complete Node suite | PASS — coverage gate + existing regressions |
| Representative Battlefield layouts | Required coverage surface; canonical Battlefield tests remain part of full CI | PASS — coverage gate + existing regressions |
| Blackglass | Required scene surface; Mission 19 and visual-parity regressions remain part of full CI | PASS — coverage gate + existing regressions |
| Lobby | Required scene surface; Mission 20 canonical battle regressions remain part of full CI | PASS — coverage gate + existing regressions |
| Settings | Required application surface; UI/settings and persistence regressions remain part of full CI | PASS — coverage gate + existing regressions |
| PWA | Required offline/update surface; PWA and materializer regressions remain part of full CI | PASS — coverage gate + existing regressions |

## Comparison policy

The parity harness recursively compares legacy and Foundation outcome objects and semantic-event streams. Numbers use an explicit per-case tolerance (default `1e-6`). Paths may be ignored only when the parity case names them explicitly; there is no global catch-all exclusion. Missing keys, array-length changes, value mismatches, event mismatches, and numeric drift beyond tolerance are blocking differences.

The Mission 24 regression suite includes an intentional-drift runtime and verifies that the harness fails rather than relaxing the threshold. It also verifies that a behaviorally correct comparison still fails when any required matrix surface is omitted.

## Baseline continuity

Mission 01 froze production at `52009c406b948a7b9a9402bb56495f20b3918ba6` with 239/239 legacy regressions passing. Through Mission 23, each Foundation extraction added canonical behavior tests while retaining the historical regression suite. Mission 24 does not replace those regressions; it adds replay and dual-runtime evidence on top of them.

## Blocking discrepancy disposition

At implementation time, no new gameplay discrepancy was accepted as an exception. The harness contract is deliberately designed to surface drift and make incomplete matrix coverage fail. Any future scenario that produces a mismatch must either be fixed in Foundation or be documented as an already-existing intentional legacy condition in the mother-spec/baseline evidence; tests must not be weakened merely to obtain green status.

## Cutover boundary

Mission 24 performs **no production cutover** and does not modify deployment ownership. Production `main` and the current materialized legacy publication path remain untouched. Mission 25 owns measured performance work and production cutover; Mission 26 owns final legacy retirement.
