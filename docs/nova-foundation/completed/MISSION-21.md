# Mission 21 — UI, HUD, Menus & Settings

**Status:** COMPLETE

## Sequence gate

- Predecessor: Mission 20 — Lobby Canonical Battlefield Scene.
- Canonical predecessor integration: `4aaeef8c28a34080b771ca52261f3efe63fd5902` on `NOVASTAR-INITIATIVE`.
- Predecessor post-merge CI: run `31531984706`, successful.
- Production `main` remained `52009c406b948a7b9a9402bb56495f20b3918ba6`; no newer mainline reconciliation was required.

## Implementation

Mission 21 establishes a presentation-only canonical UI boundary under `src/ui/`:

- immutable authoritative snapshot → selectors → `UIStore` → React;
- `CanonicalUI` covers lobby/menu, match HUD, evolution, Pilot settings, tips, Blackglass chrome, debug data, touch-control presentation, swarm commands, and contact messages;
- user intent returns only through `UIController` / `UIApplicationPort` and canonical Mission 13 `GameCommand`s;
- evolution/mastery/gene UI requests are delegated to application APIs rather than mutating progression state in React;
- `LiveSettings` preserves the v1.7.7 fair-play control/presentation ranges;
- canonical `InputSettings` now carries backward-compatible move sensitivity and `TouchInputAdapter` applies it before the existing deadzone/normalization path, preserving command bounds and tank speed authority;
- `MessageFeed` preserves v1.9.3 Quiet Relay callout canonicalization and 1400/1900/1200 ms duplicate-message suppression without changing perception, relay, AI, targeting, or audio state;
- UI authority regression tests explicitly forbid imports/use of `GameWorld`, `EntityStore`, `CombatSystem`, movement, damage, or projectile-spawn authority.

Preference persistence intentionally remains behind the stable Mission 21 settings interface for Mission 23's persistence ownership; React itself owns no storage or gameplay truth.

## Validation

- Focused branch: `novastar/mission-21-ui-hud-menus-settings`.
- Corrected validated implementation head: `6e792447dea04f08114cc6de615649c0950a077e`.
- CI run `31536786588`: SUCCESS — production build/typecheck, complete Node regression suite, and production Tailwind validation.
- An earlier validation failed only because the new Node harness compiled React into a temporary directory where Node could not resolve `react/jsx-runtime`; no failed head was sealed or merged. The harness was corrected to runtime-test pure UI modules while the production typecheck validates React.
- Branch diff is scoped to canonical UI, input sensitivity bridge, documentation, and regression tests; no simulation, combat, AI, rendering, or content authority files were changed.

## Acceptance

A UI implementation may now be replaced or re-rendered from the immutable `UIReadModel` and explicit application port without changing authoritative match state. React component state has no gameplay authority.
