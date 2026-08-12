# Mission 25 — Performance Engineering & Production Cutover

Status: COMPLETE

Canonical predecessor: Mission 24 integration `21d3f4c10fdc32f290bb4edd5d03973a4c311c4a`
Focused branch: `novastar/mission-25-performance-cutover`
Validated implementation head: `92e4767e3527f02f9df1dca5658c744afbc44e35`
Implementation CI: `31554133149` — SUCCESS

## Delivered

- Replaced the production materialization/patch-injection path with a canonical TypeScript/Vite build that emits `dist/` directly.
- Made Foundation `GameApp` the production runtime owner while retaining legacy runtime access only through the development-only parity selector.
- Moved canonical browser presentation, lobby battle hosting, and application-shell ownership into the Foundation runtime instead of production patch scripts.
- Added reproducible `npm ci`, typecheck, full regression tests, production build, artifact validation, and `dist/` deployment gates.
- Added `docs/nova-foundation/PERFORMANCE_REPORT_MISSION_25.md` comparing the measured Mission 01 production baseline with the canonical cutover and recording why no speculative micro-optimizations were introduced.
- Added hardened production artifact validation: the built shell and offline worker must not depend on `nova-updates/`, `nova-gz/`, `__novaModules`, `__bootModule`, or the retired standalone PWA registration path.
- Advanced the transactional offline updater to v4 so it validates and atomically stages the canonical Vite module shell rather than the historical `__bootModule` boot marker. The previous complete build remains a rollback reserve and legacy cache fallback remains only as migration safety during worker replacement.
- Pointed Tailwind validation at canonical sources rather than historical patch directories while preserving explicit compiler/theme probes.
- Preserved existing simulation, AI, navigation, drone, rendering, lobby, mobile/touch, audio, progression, replay/parity, persistence, and UI authority boundaries; Mission 25 changes production/runtime ownership, not game rules.

## Validation history

The resumed branch was not sealed while CI was red. The first red gate showed production artifact validation was too dependent on the source-shell URL form; diagnostics were improved so CI surfaced the exact failure. After stabilizing the Vite PWA URLs and strengthening the artifact checker, the gate exposed a second cutover issue: Tailwind validation still scanned historical patch sources. That was redirected to canonical sources. Separately, audit of the emitted service worker found that the previous updater would reject the canonical shell because it still required `__bootModule`; this was corrected and covered by regressions before sealing.

Final implementation head `92e4767e3527f02f9df1dca5658c744afbc44e35` passed CI run `31554133149`: npm install, typecheck, complete Node regression suite, production build, production artifact validation, and Tailwind validation all succeeded.

Production `main` remained at `52009c406b948a7b9a9402bb56495f20b3918ba6` during the mission and was not modified.

## Acceptance

The canonical Foundation runtime is now the sole production build path, its production artifact is directly deployable from `dist/`, measured architectural production overhead from the giant patched HTML path has been removed, PWA/offline staging understands the canonical module shell, and legacy runtime material remains only for development/parity and Mission 26 retirement.
