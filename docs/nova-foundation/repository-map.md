# NOVA Foundation — Final Repository Map

## Authoritative product paths

| Path | Ownership |
|---|---|
| `index.html` | Thin Vite host shell only |
| `src/main.ts` | Application entry |
| `src/app/` | Browser composition, lifecycle, PWA registration |
| `src/game/` | Authoritative deterministic gameplay |
| `src/content/` | Canonical static registries and schema |
| `src/input/` | Canonical commands and human/script adapters |
| `src/ai/` | Perception-bounded AI, navigation and tactics |
| `src/rendering/` | Snapshot/event-driven presentation |
| `src/scenes/` | Canonical scene composition |
| `src/ui/` | React HUD, menus, settings and touch presentation |
| `src/audio/` | Semantic audio/feedback consumers |
| `src/persistence/` | Versioned saves/migrations |
| `src/diagnostics/` | Structured diagnostics |
| `src/replay/` | Foundation deterministic replay |
| `sw.js` / `manifest.webmanifest` | Canonical offline/PWA contract |
| `.github/workflows/ci.yml` | Required validation gate |
| `.github/workflows/deploy.yml` | Canonical `dist/` Pages deployment |
| `scripts/validate-dist.mjs` | Production-artifact architecture guard |

## Historical-only material

Legacy payload chunks, `nova-updates/`, the materializer, standalone PWA register, `src/legacy/`, injected module registries and the development dual-runtime selector are not part of the active tree after Mission 26. Their final pre-retirement snapshot is preserved by Git at commit `6a73ee8f2515f3a3ef02541dcea4e49c7410f580` and archival ref `archive/pre-mission-26-legacy-runtime`.

The documents `legacy-runtime-map.md`, `legacy-patch-register.md`, Mission 01 baseline evidence and Mission 24 parity report remain documentation/evidence only; they are not runtime dependencies.

## Change-location rule

Put changes in the domain that owns the behavior. Do not use `index.html`, build/deploy scripts, service-worker code, UI, renderer, globals, or runtime patches as a shortcut around canonical ownership. See root and domain `AGENTS.md` files for enforceable boundaries.
