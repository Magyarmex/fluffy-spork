# NOVA Foundation Application Shell

Mission 03 changes who owns NOVA startup without migrating gameplay ahead of schedule.

## Canonical development entry

The normal development architecture is now Vite + TypeScript:

```bash
npm install
npm run dev
```

`src/main.ts` calls `src/app/bootstrap.ts`, which creates the application root, attaches the web-app manifest, exposes startup diagnostics, starts the current game through `GameApp`, and registers the service worker/update loop.

Production validation uses:

```bash
npm run typecheck
npm run build
npm run test
```

`npm run build` is the source-architecture build used by CI. Production `main` remains untouched by the NOVASTAR initiative until a later mission explicitly owns rollout.

## Transitional legacy boot

The current materialized gameplay runtime and its ordered `nova-updates/` patch chain remain in the historical `index.html` during Mission 03. This is intentional preservation, not a claim that the legacy runtime has been migrated.

During Vite HTML processing, the `nova-application-shell` plugin removes four historical app-level responsibilities from the served/built page:

1. the legacy `<div id="root">` container;
2. the direct `pwa-register.js` startup script;
3. the static manifest link;
4. the final direct `window.__bootModule('main')` call.

It then injects the TypeScript `src/main.ts` entry. `bootstrap.ts` recreates the root and manifest link, owns PWA/service-worker startup, and `GameApp.start()` crosses one explicit temporary seam by calling the already-materialized `window.__bootModule('main')` runtime.

That seam is deliberately narrow and visible. Mission 04 is responsible for containing remaining legacy access behind `src/legacy/`; Mission 03 does not hide or prematurely reclassify the giant runtime.

## Preserved behavior

Mission 03 does not change gameplay modules, patch ordering, class behavior, controls, persistence schemas, simulation rules, rendering, balancing, or release deployment. The historical CSS/font payload also remains in the materialized page because it is still coupled to the legacy UI and moving it now would create visual-regression risk outside this mission's startup scope.

## Startup diagnostics

`window.__NOVA_STARTUP_STATUS` reports `idle`, `booting`, `running`, or `failed`, with timestamps and an error string when applicable. The shell also emits a `nova:startup` `CustomEvent` and mirrors the phase to `document.documentElement.dataset.novaStartup`.

If the legacy boot bridge is unexpectedly absent, the shell fails visibly inside the application root instead of leaving a blank page, and logs the original startup error.

## Boundary for Mission 04

The application shell is source-owned, but the materialized module registry remains legacy. Mission 04 may now isolate that registry and its globals without having to solve startup, PWA registration, root creation, or lifecycle diagnostics at the same time.
