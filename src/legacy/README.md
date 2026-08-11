# NOVA legacy compatibility boundary

`src/legacy/` is a temporary deletion target for the NOVASTAR migration. It is the only canonical TypeScript area allowed to know how the materialized NOVA runtime is exposed through browser globals and historical module-wrapper state.

## Rules

- Canonical code outside this directory must never read `window.__novaModules`, `window.__novaCache`, `window.__novaMakeRequire`, `window.__bootModule`, or equivalent runtime internals directly.
- New gameplay, rendering, UI, AI, audio, persistence, or content features must not be implemented here.
- Prefer the narrowest adapter: `LegacyRuntime` owns the actual global seam; `LegacyModules` exposes module inspection; `LegacyStateAdapter` exposes read-only migration state; `LegacyEvents` provides a typed signal seam.
- Adapters may grow only to support migration/parity work and should become smaller as canonical systems replace legacy ownership.
- This directory is scheduled for deletion once the materialized runtime and patch chain are retired by later NOVASTAR missions.

## Import boundary

`tests/node/legacy-boundary-mission-04.test.js` enforces that legacy-runtime global names do not appear in canonical `src/` code outside this directory. This is the repository-level prohibited-import/access rule until a dedicated lint layer is justified.
