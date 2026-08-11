# Mission 03 Completion

Status: COMPLETE

## Scope completed
- Added `src/main.ts` as the canonical source-owned application entry.
- Added `src/app/bootstrap.ts` to own DOM readiness, root-container creation, manifest attachment, PWA/service-worker startup, update synchronization, startup failure rendering, and application launch.
- Added `src/app/lifecycle.ts` with explicit `idle` / `booting` / `running` / `failed` startup state, timestamps, browser-visible diagnostics, a `nova:startup` event, and a document dataset mirror.
- Added `src/app/GameApp.ts` as the deliberately narrow transitional bridge between the new application shell and the still-materialized NOVA gameplay runtime.
- Added a Vite `nova-application-shell` HTML transform that removes the historical root container, manifest link, `pwa-register.js` startup hook, and direct `window.__bootModule('main')` call from served/built HTML, then injects `src/main.ts`.
- Preserved the giant materialized gameplay module registry and the ordered `nova-updates/` patch chain rather than migrating gameplay ahead of schedule.
- Added `docs/nova-foundation/APPLICATION_SHELL.md` documenting local development, build validation, startup ownership, the transitional seam, preserved behavior, diagnostics, and the Mission 04 boundary.
- Added `tests/node/application-shell-mission-03.test.js` to guard the required source files, Vite ownership transform, materialized runtime preservation, PWA startup, diagnostics, and explicit temporary boot seam.

## Legacy components retired or bypassed
- Bypassed the historical direct application boot (`window.__bootModule('main')`) when NOVA is served or built through Vite.
- Bypassed the historical `pwa-register.js` startup hook under the Vite shell; equivalent registration/update behavior is now source-owned in `bootstrap.ts`.
- Bypassed historical ownership of the root container and manifest link under Vite; the typed bootstrap now owns both.
- Did not retire, move, or reclassify the materialized gameplay runtime, patch chain, legacy CSS/font payload, PWA worker assets, persistence, or gameplay modules. Their remaining compatibility boundary is intentionally Mission 04+ work.

## Validation performed
- Predecessor `MISSION-02.md` was present on remote `NOVASTAR-INITIATIVE`.
- Predecessor integration commit `b8383d7b2075fc4f57200344e4eca322f595f344` had successful push CI on `NOVASTAR-INITIATIVE` before Mission 03 began.
- Production `main` was re-checked and remained at `52009c406b948a7b9a9402bb56495f20b3918ba6`; no newer shipped changes required reconciliation.
- Mission implementation/docs head before this marker: `ba28fa1a60f94cb5243532eca8336259db090448`.
- Mission-branch CI run `31451935328`: PASS.
- `npm install --no-audit --no-fund --no-package-lock`: PASS.
- `npm run build` (`npm run typecheck && vite build`): PASS.
- `npm run test`: PASS.
- Production Tailwind compilation validation: PASS.
- Branch comparison remained strictly ahead of `NOVASTAR-INITIATIVE` with no divergence before integration.

## Behavior/parity notes
- No gameplay module, balance value, AI rule, input mapping, rendering rule, audio rule, persistence schema, runtime patch order, or production release artifact was intentionally changed.
- Vite now owns the application startup sequence while `GameApp.start()` invokes the same existing materialized `main` module through one explicit temporary seam.
- The legacy CSS/font payload remains embedded because it is coupled to the current UI; moving it in Mission 03 would create visual-regression risk outside the startup mission. Later UI/rendering missions can migrate it with visual parity checks.
- PWA registration retains the existing service-worker registration, latest-build synchronization, online/visibility/interval refresh, controller-change handling, update-ready persistence, and opportunistic periodic-sync behavior.

## Mainline changes reconciled
- `main` did not advance after the Mission 02 baseline. No forward-port or behavioral reconciliation was necessary.

## Known limitations
- The giant historical `index.html` still physically contains the materialized gameplay runtime and historical app-level tags; Vite removes only the app-level ownership hooks during HTML transformation. This is deliberate until the compatibility layer is established.
- `GameApp` still references the legacy global `window.__bootModule` directly. Mission 04 owns replacing that direct global access with the typed `src/legacy/` compatibility boundary.
- The standalone historical `pwa-register.js` file remains in the repository for the unchanged production/materialized path; it is not invoked by the Vite shell.
- Production `main` remains intentionally untouched.

## Next mission
Mission 04 is unblocked only after this marker is integrated on remote `NOVASTAR-INITIATIVE` and CI for that integrated commit is green.
