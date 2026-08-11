# NOVA Foundation — Legacy Runtime Map

**Mission:** 01 — Initiative Control & Baseline Freeze  
**Initiative:** NOVASTAR INITIATIVE  
**Frozen production specimen:** `main@52009c406b948a7b9a9402bb56495f20b3918ba6`  
**Freeze date:** 2026-08-10 (America/Mexico_City)  
**Canonical migration branch:** `NOVASTAR-INITIATIVE`

This document is descriptive. Mission 01 deliberately does not redesign gameplay, extract systems, replace the materializer, or delete active legacy behavior.

## 1. Frozen specimen identity

The migration baseline is the exact production state from which `NOVASTAR-INITIATIVE` was created:

```text
repository: Magyarmex/fluffy-spork
main commit: 52009c406b948a7b9a9402bb56495f20b3918ba6
commit message: Materialize NOVA TANKS runtime release
index.html bytes: 265431
index.html Git blob: 2f865ff2aad486482ed0042ea73217c5c22d63dd
materialized runtime stamp: 7a65cee7182177c7f1ee7763
nova-gz tree: c1fd5d3fe044698a7161dafbce12f468235c51c6
nova-updates tree: 62cd52b5c72f765bee57697f744d9a28c6ff3993
```

Two fingerprints matter:

1. The Git blob ID pins the exact checked-in `index.html` bytes.
2. `<meta name="nova-runtime-build" content="7a65cee7182177c7f1ee7763">` is the production materializer's runtime-input fingerprint. It is derived from the ordered runtime patch bytes plus PWA inputs and is what returning/offline clients use indirectly to distinguish builds.

The runtime stamp is intentionally not a semantic version. `nova-updates/releases.json` is historical/menu metadata and must not be treated as the authoritative list of active runtime layers.

## 2. What is production today

Production NOVA is **not** built from the conventional TypeScript `src/` tree.

The repository currently contains two materially different application identities:

- a conventional Vite/TypeScript project whose package is still named `aquascape-lab` and whose `src/` / `runtime/` content is terrain/aquascape-oriented historical application code;
- the shipped NOVA TANKS game, whose authoritative executable base is reconstructed from `nova-gz/`, exposed through an in-page module registry, and modified by the active `nova-updates/*.js` chain.

Mission 02 owns repository identity cleanup. Mission 01 records the distinction and leaves it unchanged.

## 3. Production path, end to end

Current production flow:

```text
main source change
    ↓
.github/workflows/deploy.yml — "Materialize NOVA TANKS"
    ↓
validate update JS / PWA JS / JSON syntax
    ↓
npm install
npm run build
npm run test
    ↓
cat nova-gz/*.b64
    ↓
base64 decode
    ↓
gzip decompress
    ↓
index.html.new (historical NOVA base)
    ↓
inject PWA manifest/icon/register hooks when absent
    ↓
expose legacy module internals
    ↓
inject 44 ordered nova-updates scripts before main boot
    ↓
compute nova-runtime-build fingerprint from runtime inputs
    ↓
replace Tailwind browser runtime with generated static CSS
    ↓
assert every required layer and PWA marker exists
assert retired layers are absent
    ↓
mv index.html.new index.html
    ↓
commit materialized index.html back to main when changed
    ↓
legacy GitHub Pages serves main:/
```

GitHub Pages is configured as a public legacy Pages site sourced from the repository root on `main` with HTTPS enforced.

### Materializer safety already present

The materializer is more disciplined than a naive patch script and its behavior must be preserved during migration until it is deliberately retired:

- it serializes competing runs using GitHub Actions concurrency;
- build and regression tests run before reconstruction/publication;
- all active update files must exist before injection;
- it fetches `origin/main` again before publishing and refuses to overwrite a newer mainline;
- the generated runtime is fingerprinted from all ordered update scripts plus `pwa-register.js`, `sw.js`, `manifest.webmanifest`, `nova-icon.svg`, and `nova-updates/releases.json`;
- Command Weave and the old v1.7.4 auto-update experiment are explicitly asserted absent from the materialized runtime.

## 4. Active runtime load order

The production materializer injects exactly 44 update scripts, in this order:

```text
01 sniper-v1.2.0.js
02 controller-v1.3.0.js
03 polish-v1.3.1.js
04 stability-v1.4.0.js
05 sniper-lineage-v1.4.1.js
06 showroom-v1.5.0.js
07 showroom-polish-v1.5.1.js
08 drone-discipline-v1.5.1.js
09 drone-targeting-v1.5.1.js
10 spotter-intelligence-v1.5.1.js
11 ui-fixes-v1.5.1.js
12 lobby-music-v1.5.1.js
13 battlefield-v1.6.0.js
14 disciplines-v1.7.0.js
15 apex-disciplines-v1.7.1.js
16 combined-arms-v1.7.2.js
17 blast-cover-hardening-v1.7.2.js
18 showroom-containment-v1.7.2.js
19 showroom-fit-v1.7.3.js
20 blackglass-mirror-v1.10.6.js
21 performance-v1.7.5.js
22 drone-allegiance-glow-v1.7.6.js
23 settings-v1.7.7.js
24 performance-v1.7.8.js
25 lobby-history.js
26 menu-debug-motion-v1.7.8.js
27 menu-slot-compat-v1.7.8.js
28 living-archive-v1.7.9.js
29 living-archive-runtime-cleanup-v1.7.9.js
30 predator-doctrine-v1.8.0.js
31 battle-sense-v1.8.1.js
32 tactical-framing-v1.8.2.js
33 precision-contact-v1.8.3.js
34 visual-overhaul-v1.9.0.js
35 sensory-feedback-v1.9.1.js
36 upgrade-dwell-v1.9.2.js
37 spotter-comms-v1.9.3.js
38 lobby-battlefield-v1.10.1.js
39 terrain-intelligence-v1.10.2.js
40 drone-field-service-v1.10.3.js
41 shared-battlefield-view-v1.10.5.js
42 second-body-live-vector-v1.10.7.js
43 applied-power-parity-v1.10.8.js
44 visual-language-v1.10.9.js
```

`nova-updates/controller-command-weave-v1.10.0.js` remains in the repository but is not materialized; Second Body Live Vector is the active successor. See `legacy-patch-register.md` for per-file status, ownership, classification, and test protection.

## 5. Legacy module/global mechanism

The historical page contains a CommonJS-like in-browser bundle. The base creates an internal module map and cache and exposes the following globals so release patches can wrap or replace factories:

```text
window.__novaModules
window.__novaCache
window.__novaMakeRequire
window.__defineModule
window.__bootModule
```

The currently observed base module IDs are:

```text
App
game/ai
game/audio
game/classes
game/engine
game/input
game/render
game/types
main
utils/storage
```

Patch files typically do some variation of:

```js
var mods = window.__novaModules;
var old = mods['game/engine'];
mods['game/engine'] = function (module, exports, require) {
  old(module, exports, require);
  // mutate/wrap exported behavior
};
```

This means effective production behavior is the **historical module implementation plus every later wrapper in load order**, not any one source file in isolation.

Many release layers also expose diagnostics/release sentinels such as `window.__NOVA_*`. These are useful current observations but are not a stable architecture contract. Mission 04 will later make direct legacy access legal only behind `src/legacy/`.

## 6. Runtime responsibility map

This is an ownership map of the current effective runtime, not a proposed design.

| Responsibility | Current base owner | Important active overlays | Migration implication |
|---|---|---|---|
| App/lifecycle/menu/HUD | `App`, DOM/React UMD in `index.html` | polish, UI fixes, menu/debug, living archive, settings | Application and UI behavior are mixed into materialized HTML and wrappers. |
| Tank/class definitions | `game/classes`, `game/types` | Sniper, Controller, Disciplines, Apex, later balance/fairness layers | Effective tank definitions must be resolved across base + patches before canonical extraction. |
| Weapons/projectiles/combat | primarily `game/engine`, `game/classes`, `game/types` | Sniper, Disciplines, Apex, Combined Arms, Blast hardening, sensory/visual layers | Simulation and presentation changes are currently interleaved through wrappers. |
| Progression/evolution/upgrades | `game/engine`, `game/classes`, `game/types` | stability, lineage/discipline releases, Applied Power Parity, Upgrade Dwell (UI timing) | Raw level, assigned upgrades and effective power must be distinguished during extraction. |
| Battlefield/terrain/LoS | base arena/types + `game/engine` | Battlefield, Combined Arms, Performance, Terrain Intelligence | Canonical geometry does not yet exist as a source-owned subsystem. |
| AI | `game/ai` + AI logic embedded in `game/engine` | Combined Arms, Predator Doctrine, Battle Sense, Terrain Intelligence, Shared Battlefield View, Applied Power Parity | Effective AI behavior is strongly patch-layered and must be migrated from current intent, not an old base snapshot. |
| Input | `game/input`, App touch layer | Settings, Upgrade Dwell, Second Body Live Vector, menu/touch bridges | Human controls are not yet represented as canonical commands. |
| Drones | Controller/base engine behavior | Drone Discipline, Drone Targeting, Spotter Intelligence, IFF, Terrain Intelligence, Field Service, Shared Battlefield View, Live Vector | Drone state, navigation, combat and presentation are spread across many releases. |
| Rendering | `game/render` | showroom/Blackglass layers, IFF, visual overhaul, sensory feedback, precision contact, visual language | Renderer currently gets monkey-patched; Blackglass has accumulated parity repairs. |
| Blackglass/showroom | early showroom patches | Showroom Polish, Containment, Fit, Blackglass Mirror | Current Blackglass correctness depends on a chain, not a single canonical renderer. |
| Lobby | App/menu base | Lobby Music, Lobby History, Living Archive, menu compatibility, Lobby Battlefield | Lobby is presentation + simulated battlefield behavior layered after base. |
| Audio | `game/audio` | Lobby Music, Precision Contact, Sensory Feedback | Procedural/game audio and presentation cues are patched directly into legacy modules. |
| Diagnostics | ad hoc globals + menu debug | Menu Debug Motion, many `__NOVA_*` telemetry sentinels, Live Vector diagnostics | No single structured subsystem snapshot exists yet. |
| Persistence | `utils/storage`, direct localStorage in update/PWA layers | Pilot Console settings; PWA readiness keys | No versioned NOVA save schema exists. Current persistence is key/value based. |
| PWA/offline/update | manifest + `pwa-register.js` + `sw.js` + materializer runtime stamp | tests in `pwa-updater.test.js` and materializer fingerprint tests | PWA behavior is intentional and must survive shell/cutover work. |

## 7. Persistence baseline

Static inspection finds these intentional localStorage keys in the shipped NOVA runtime:

| Key | Shape | Meaning |
|---|---|---|
| `novatanks_best` | decimal string | high score |
| `novatanks_bestlevel` | decimal string | highest run level reached; currently consumed by progression/pity-era behavior |
| `novatanks_quality` | `high` / `low` | graphics quality preference |
| `novatanks_muted` | `0` / `1` | sound-effects mute preference |
| `novatanks_musicoff` | `0` / `1` | music mute preference |
| `novatanks_pilot_settings_v1` | JSON object | `{aimSensitivity, moveSensitivity, stickSize, stickOpacity, screenShake}` |
| `nova:lastUpdateReadyAt` | timestamp string | page-side PWA update readiness observation |
| `nova:lastUpdateFingerprint` | string | last worker-reported staged build fingerprint |

The base `utils/storage` module intentionally catches localStorage access failures. Pilot settings also catch malformed JSON and clamp values to safe ranges.

There is **no single versioned NOVA save file** in the current production game. Current player progression persistence is limited to the observed score/level/preferences keys above; per-run tank state is not persisted as a durable save. Mission 23 must preserve these keys when introducing a versioned schema.

The unrelated historical TypeScript/aquascape application has its own persistence code under `src/core/persistence.ts`; it must not be confused with current NOVA production persistence. Mission 02 owns deciding what historical application code remains necessary.

## 8. PWA/service-worker baseline

### Manifest

`manifest.webmanifest` declares:

```text
id/start_url/scope: ./
name/short_name: NOVA TANKS
display: fullscreen
orientation: any
background/theme: #04060d
icons: nova-icon.svg at 192/512, including maskable
```

### Registration/update policy

`pwa-register.js`:

- registers `./sw.js` with scope `./` and `updateViaCache: 'none'`;
- calls `registration.update()` before asking the active worker to sync content;
- uses a 15 s MessageChannel reply timeout;
- checks content immediately after registration;
- checks again when the worker controller changes, when the browser returns online, when the document becomes visible, and every 10 minutes while online;
- opportunistically registers Periodic Background Sync tag `nova-update` with a six-hour minimum interval when browser permission/support exists;
- records worker update-ready metadata in localStorage.

### Service worker v3

`sw.js` implements a transactional immutable-build cache model:

1. fetch a cache-busted page shell;
2. discover critical scripts/styles from that shell;
3. stage critical resources into a fresh candidate cache;
4. stage optional presentation/install resources without allowing them to invalidate a playable build;
5. validate that the candidate contains the shell and every critical dependency;
6. atomically promote the candidate by writing a small active-build metadata record;
7. retain the previous complete cache as rollback reserve;
8. delete incomplete candidates on failure;
9. after activation, clean old v3 candidates and older legacy cache generations;
10. serve navigation from the active complete build, with legacy-cache and first-install network fallbacks.

Notable service-worker constants at freeze:

```text
UPDATER_VERSION = 3
META_CACHE = nova-tanks-meta-v3
RUNTIME_CACHE = nova-tanks-runtime-v3
BUILD_PREFIX = nova-tanks-build-v3-
NETWORK_TIMEOUT_MS = 10000
LAUNCH_UPDATE_BUDGET_MS = 3500
STAGE_CONCURRENCY = 6
```

The worker fingerprints fetched HTML independently with SHA-256 (first 16 digest bytes rendered as hex) to name/identify staged client builds. That is distinct from the 24-character materializer input stamp embedded in the HTML.

## 9. Test/validation architecture at freeze

The active repository-level CI runs:

```text
npm install --no-audit --no-fund --no-package-lock
npm run build
npm run test
Tailwind production compilation validation
```

`npm run build` is currently `tsc -b && vite build` and still reports the package as `aquascape-lab@0.1.0`. Because the materialized NOVA patch tags are classic scripts, Vite warns that they cannot be bundled without `type="module"`; this is a known baseline condition, not a failing build.

`npm run test` is:

```text
node --test tests/node/*.test.js
```

At the freeze commit the suite contains 239 tests and is fully green. Most newer NOVA release layers have direct behavior tests. Several early active release layers have no dedicated same-version test file; their current protection is transitive through later scenario/regression tests plus pipeline validation. `legacy-patch-register.md` calls those gaps out rather than pretending every patch has equal direct coverage.

## 10. Known baseline quirks — not migration regressions

These conditions existed before NOVASTAR and must not be misreported as regressions introduced by Mission 01:

1. `package.json` still identifies the Vite project as `aquascape-lab`.
2. Conventional `src/` and `runtime/` trees contain unrelated aquascape/terrain application code and are not the current NOVA source of truth.
3. `index.html` is a 265,431-byte materialized application, not a small entry shell.
4. Vite emits non-module-script warnings for the PWA register and active runtime update scripts.
5. Production behavior depends on legacy globals and ordered runtime wrapper injection.
6. `nova-updates/releases.json` is historical/menu metadata and is not an authoritative semantic version of the actual latest active runtime layer; the active chain currently extends through v1.10.9.
7. A subset of early legacy patches have only transitive behavior coverage rather than dedicated patch-level tests.
8. GitHub Pages deploys directly from `main:/`; therefore NOVASTAR work must remain isolated from `main` until separately authorized.

## 11. Mission-02 inheritance

Mission 02 inherits a deliberately untouched runtime plus a clear repository identity problem:

- `main@52009c4...` is the frozen shipped intent at Mission 01 start;
- `NOVASTAR-INITIATIVE` is the canonical migration integration branch;
- the materialized game is still authoritative for gameplay parity;
- the old TypeScript Vite app must be audited rather than assumed to be NOVA;
- active legacy reduction remains **zero** in Mission 01 by design;
- the exact patch chain, persistence contract, PWA contract, test baseline and known quirks are now recorded so structural cleanup can proceed without deleting unknown behavior.
