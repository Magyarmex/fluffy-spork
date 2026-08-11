# NOVA Foundation — Baseline Validation

**Mission:** 01 — Initiative Control & Baseline Freeze  
**Initiative:** NOVASTAR INITIATIVE  
**Baseline commit:** `52009c406b948a7b9a9402bb56495f20b3918ba6`  
**Mission branch:** `novastar/mission-01-baseline-freeze`  
**Canonical integration branch:** `NOVASTAR-INITIATIVE`

## 1. Validation purpose

Mission 01 establishes the known-good specimen against which the migration will be judged. It does not claim that the legacy architecture is clean; it records what succeeds, what warnings already exist, and what is intentionally deferred.

The baseline branch was created directly from the current `main` tip. Creating the initiative and mission branches triggered the existing repository CI against the same frozen commit.

## 2. Repository CI result

GitHub Actions run for `novastar/mission-01-baseline-freeze`:

```text
run id: 31449526399
job id: 93650798719
result: SUCCESS
runner: ubuntu-24.04
Node: v24.18.0
npm: 11.16.0
```

All required CI steps completed successfully:

```text
checkout                                  PASS
setup Node 24                             PASS
npm install --no-audit --no-fund ...      PASS
npm run build                             PASS
npm run test                              PASS
production Tailwind compilation check     PASS
```

A separate CI run on the newly created `NOVASTAR-INITIATIVE` branch also completed successfully at the same baseline SHA.

## 3. Build baseline

Command:

```text
npm run build
```

Resolved script:

```text
tsc -b && vite build
```

Observed package identity:

```text
aquascape-lab@0.1.0
```

Observed toolchain:

```text
Vite 5.4.2
TypeScript 5.5.4 (package declaration)
```

Result:

```text
PASS
3 modules transformed
dist/index.html: 265.15 kB
gzip: 60.93 kB
Vite build phase: 146 ms on the recorded CI runner
```

### Expected baseline warnings

Vite warns that `pwa-register.js` and the classic `<script src="./nova-updates/...">` runtime patch tags in `index.html` cannot be bundled without `type="module"`.

These warnings existed in the frozen production architecture and are therefore **known baseline conditions**, not Mission 01 regressions. They are direct evidence that the current Vite build is wrapping a materialized legacy application rather than owning the game as canonical source.

## 4. Regression suite baseline

Command:

```text
npm run test
```

Resolved script:

```text
node --test tests/node/*.test.js
```

Result:

```text
tests:      239
passed:     239
failed:     0
cancelled:  0
skipped:    0
todo:       0
duration:   ~909.5 ms on the recorded CI runner
```

Representative passing behavior includes:

- Gunner/Cannon/Guardian disciplines and Apex doctrine;
- applied-power AI parity (assigned upgrade power versus banked raw level);
- Battlefield line of sight, spawn safety and swept terrain hits;
- Blackglass real muzzle/barrel/projectile parity;
- Combined Arms blast/cover and last-seen behavior;
- Controller multitouch, Command Weave historical contract and Live Vector successor behavior;
- drone performance, allegiance, repair and terrain integration;
- Fieldcraft tips, Living Archive and menu containment;
- lobby War Room simulation budgets;
- materializer runtime fingerprint and release-pipeline safety;
- AI Predator Doctrine, Battle Sense and Shared Battlefield View fairness contracts;
- Precision Contact, Sensory Feedback and Signal Discipline visual-language behavior;
- PWA updater staging/promotion/rollback behavior;
- Tactical Framing, Terrain Intelligence and anti-stuck/path-planning behavior;
- Upgrade Dwell and Spotter communications deduplication.

## 5. Production materializer baseline

The deployment workflow validates syntax and tests before rebuilding NOVA from `nova-gz/`. It then:

1. reconstructs the historical page to `index.html.new`;
2. injects/maintains PWA head hooks;
3. exposes `__novaModules`, `__novaCache`, and `__novaMakeRequire`;
4. injects 44 active runtime update scripts in a fixed order;
5. computes the runtime-input fingerprint;
6. compiles/replaces Tailwind browser CSS with static CSS;
7. verifies all active runtime scripts are in the new page;
8. verifies superseded/experimental layers are absent;
9. replaces `index.html` only after validation;
10. refuses to push if a newer `main` has won the publication race.

Current checked-in production specimen:

```text
index.html bytes: 265431
Git blob: 2f865ff2aad486482ed0042ea73217c5c22d63dd
embedded nova-runtime-build: 7a65cee7182177c7f1ee7763
```

The runtime stamp is reproducible from the materializer inputs. `tests/node/materializer-runtime-fingerprint.test.js` specifically checks that changing a local runtime input changes the materialized fingerprint and that the stamp exists before the service-worker-visible shell is committed.

## 6. PWA baseline

Static PWA validation passes through the existing Node suite and CI asset checks.

The frozen PWA contract is:

- manifest: NOVA TANKS, fullscreen, scope/start `./`, orientation `any`;
- page registration: `sw.js`, `updateViaCache: none`;
- page update triggers: startup, online, visible, controller change, 10-minute online interval, optional 6-hour periodic background sync;
- service worker: updater v3 with complete-build staging, validation, atomic active-pointer promotion and one-generation rollback reserve;
- incomplete candidate caches are removed rather than promoted;
- navigation uses the active complete build with legacy-cache/first-install fallbacks;
- PWA readiness observations are stored in `nova:lastUpdateReadyAt` and `nova:lastUpdateFingerprint`.

## 7. Persistence baseline

The frozen production runtime intentionally persists the following localStorage keys:

```text
novatanks_best
novatanks_bestlevel
novatanks_quality
novatanks_muted
novatanks_musicoff
novatanks_pilot_settings_v1
nova:lastUpdateReadyAt
nova:lastUpdateFingerprint
```

No versioned monolithic NOVA save schema exists yet. See `legacy-runtime-map.md` for shapes and semantics.

## 8. Known pre-NOVASTAR conditions

The following are recorded separately and must not be silently treated as migration regressions:

| Condition | Baseline status | Owning future mission |
|---|---|---|
| Vite package still named `aquascape-lab` | known | Mission 02 |
| conventional `src/` / `runtime/` contain historical non-NOVA application code | known | Mission 02 |
| 265 KB materialized `index.html` owns the shipped app | known | Missions 03–26 |
| classic runtime patch tags generate Vite bundling warnings | known | Missions 03–26 |
| legacy module globals are exposed for patches | known | Missions 04–26 |
| 44 runtime patches are production-active | known | migrated progressively; zero by Mission 26 |
| one JS release (`controller-command-weave-v1.10.0.js`) is retained but superseded/inactive | known | historical/parity only |
| a subset of early active patches has transitive rather than dedicated regression coverage | known | add canonical behavior coverage during extraction |
| release-history metadata is not an authoritative statement of the latest active runtime layer | known | content/persistence/UI migration as appropriate |
| GitHub Pages directly serves `main:/` | known | Mission 25 cutover; do not alter main during NOVASTAR sequence |

## 9. Mission 01 acceptance check

| Requirement | Result |
|---|---|
| Canonical initiative branch exists | PASS — `NOVASTAR-INITIATIVE` |
| Mission branch starts from current integration point | PASS — `52009c4...` |
| Master specification staged under `docs/nova-foundation/` | PASS in Mission 01 change set |
| `docs/nova-foundation/completed/` tracking mechanism established | PASS in Mission 01 change set |
| Production runtime/materializer/deployment documented | PASS |
| Large HTML specimen fingerprinted | PASS |
| Every `nova-updates/*.js` enumerated/classified | PASS — 45 files, 44 active + 1 superseded |
| Active load order recorded | PASS |
| Patch test/behavior protection recorded | PASS; direct coverage gaps explicitly identified |
| Legacy globals/module mechanism inventoried | PASS |
| Persistence formats/keys inventoried | PASS |
| PWA/service-worker behavior inventoried | PASS |
| Major game responsibility ownership inventoried | PASS |
| Build baseline recorded | PASS |
| Test baseline recorded | PASS — 239/239 |
| Known current conditions separated from migration regressions | PASS |
| Gameplay redesign/deletion/materializer replacement performed | PASS — none performed |

## 10. Gate for Mission 02

Mission 02 becomes eligible only after the Mission 01 documentation change set, including `completed/MISSION-01.md`, is merged to the **remote** `NOVASTAR-INITIATIVE` branch and the required CI for that integrated state is green.
