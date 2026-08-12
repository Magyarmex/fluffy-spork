# NOVA TANKS — Agent Architecture Contract

NOVA TANKS is a conventional TypeScript/Vite game. `src/` is the authoritative application and gameplay source tree. `index.html` is only the Vite shell; production artifacts are emitted to `dist/`.

## Canonical ownership

- `src/app/` — browser composition and application lifecycle only.
- `src/game/` — authoritative headless gameplay/simulation systems.
- `src/content/` — the single canonical registries for tanks, weapons, drones, upgrades, evolutions, battlefield definitions, balance and visual metadata.
- `src/input/` — device-neutral command contracts and device adapters.
- `src/ai/` — perception-bounded knowledge, navigation and tactical controllers.
- `src/rendering/` — presentation of snapshots/events; never gameplay authority.
- `src/scenes/` — composition of canonical systems for gameplay-facing scenes.
- `src/ui/` — React presentation and player intent only.
- `src/audio/` — semantic audio/feedback consumers only.
- `src/persistence/` — versioned saves and migrations.
- `src/diagnostics/` — structured read-only diagnostics.
- `src/replay/` — deterministic Foundation replay tooling.

## Non-negotiable boundaries

1. Do not add gameplay code to `index.html`, service-worker code, build scripts, React components, or renderer code.
2. Do not create runtime patch directories, generated module registries, materializers, monkey-patch layers, or browser globals as architecture.
3. Do not reintroduce retired migration identifiers or aliases such as the historical NOVA module registry or a legacy runtime selector.
4. Do not duplicate canonical content in scenes, AI, UI, rendering, or tests. Extend `src/content/` and consume the registry.
5. Simulation must remain deterministic and runnable without DOM/browser APIs.
6. AI dynamic hostile knowledge must come through canonical perception/AI-knowledge interfaces, never hidden raw world/entity state.
7. Rendering, UI, audio and diagnostics may observe state/events but may not decide damage, targeting, collision, allegiance, movement or progression outcomes.
8. Human controllers and AI should express intent through canonical `GameCommand` contracts where the architecture provides them.
9. Battlefield geometry/LoS/collision/pathing must use the canonical battlefield and spatial-query systems rather than private scene geometry.
10. Persistence changes require explicit schema/version/migration behavior and PWA/offline compatibility review.

## Validation

Before integration, run the relevant focused tests plus the repository gate:

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run validate:dist
```

CI is authoritative. Do not weaken tests merely to make a change green; fix the implementation or correct an invalid fixture with the reason recorded.

## Integration and release

`main` is the normal destination for completed NOVA TANKS work. Agents own their changes through integration: implement on a focused branch, reconcile concurrent repository changes, run the required validation, and once the branch is green, merge their own completed update into `main` and verify the integrated branch. An ordinary task is not complete merely because a pull request is open or ready for review, and agents must not leave routine work awaiting human merge approval.

Only an explicitly designated special integration/design initiative may use a different canonical integration branch or require a separate promotion approval before reaching `main`. Such an exception must be stated in the governing task or initiative specification; do not infer one from historical branch names or old workflows. When a special integration branch is active, agents should still merge their own assigned work into that branch once green unless its specification explicitly says otherwise.

Before any merge, reconcile newer canonical behavior rather than overwriting it. After merging, verify the destination branch CI/status where available and fix integration failures rather than treating the feature-branch result as sufficient.

The historical `NOVASTAR-INITIATIVE` branch was a temporary special integration branch during the Foundation migration. Its former promotion gate no longer applies to ordinary development.

The pre-retirement runtime is preserved by Git history and the archival ref `archive/pre-mission-26-legacy-runtime`; it is historical evidence, not an alternative implementation to revive.
