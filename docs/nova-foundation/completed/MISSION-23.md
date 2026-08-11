# NOVASTAR Mission 23 — Persistence & Structured Diagnostics

Status: COMPLETE

## Sequence gate

- Predecessor: Mission 22 — Audio, Feedback & Semantic Events.
- Mission 22 canonical integration: `b908946ca57cf6f416a8be783474d5e371c9a938`.
- Mission 22 exact post-merge CI: run `31541245413`, completed successfully before Mission 23 began.
- Mission 23 focused branch: `novastar/mission-23-persistence-diagnostics`, created from that exact integration commit.
- Production `main` was checked at mission start and remained `52009c406b948a7b9a9402bb56495f20b3918ba6`; no newer mainline reconciliation was required and Mission 23 does not authorize a production merge.

## Delivered

- `src/persistence/schema.ts` defines versioned `SaveFileV1` / `schemaVersion: 1` ownership for intentional durable NOVA state: best score, highest reached level, graphics/audio preferences, Pilot Console settings, profile data, and forward-compatible extensions.
- `src/persistence/migrations.ts` provides explicit legacy-key and current-schema migration paths for every intentional storage key documented by the frozen legacy runtime map.
- `src/persistence/PersistenceService.ts` provides a storage-agnostic persistence boundary that catches unavailable-storage failures, never deletes legacy data, leaves malformed foundation data untouched, and mirrors legacy keys on explicit save for rollback/offline compatibility during migration.
- Pilot Console percentage values migrate into the canonical normalized settings representation while preserving the established fair-play ranges.
- PWA update observation keys are preserved as extension metadata; `pwa-register.js`, `sw.js`, and their existing storage/cache behavior are left intact.
- `src/diagnostics/` defines a versioned, stable, machine-readable diagnostic snapshot with explicit sections for build/version, simulation, player, AI, perception, navigation, drones, input, rendering, audio, persistence, scene, and performance.
- Diagnostics consume explicit providers rather than scraping `window`, `__NOVA_*`, arbitrary globals, or gameplay internals. Missing/erroring providers remain represented explicitly instead of breaking snapshot capture.
- Copy output uses deterministic key ordering and valid JSON suitable for pasting into an agent/debugging workflow.
- `tests/node/persistence-diagnostics-mission-23.test.js` protects legacy migration, no-silent-deletion behavior, legacy mirroring, malformed-save recovery, unknown-field retention, diagnostics section coverage, stable copy output, explicit-provider boundaries, and PWA/offline safety.

## Migration invariants

- No intentional shipped NOVA localStorage key is silently deleted or reset.
- Loading legacy state is side-effect free; migration does not overwrite user storage merely by reading it.
- Explicit foundation saves mirror the old keys so a legacy/offline build can still read score, level, preferences, audio flags, and Pilot Console settings.
- Persistence and diagnostics own no simulation, combat, targeting, collision, movement, AI-decision, rendering, or audio authority.
- The structured diagnostic boundary observes supplied canonical state; it does not reach into arbitrary globals.
- Production `main` remains untouched.

## Validation

Implementation head `3eb7e60d362fe763ae59b81689d0ab6550058fe5` passed GitHub Actions CI run `31545025543`:

- production build: PASS
- complete Node regression suite: PASS
- Mission 23 legacy-save/diagnostics regressions: PASS
- production Tailwind validation: PASS

The completion-marker commit is intentionally validated again as the sealed Mission 23 branch head before integration.

## Acceptance

Mission 23 satisfies the mother specification acceptance condition: existing player state has an explicit, non-destructive migration into a versioned canonical save, and an agent/debugging consumer can receive a stable structured diagnostic snapshot of the canonical game through explicit subsystem providers.
