# NOVA TANKS

**A browser-based twin-stick tank arena built around skill expression, readable counterplay, evolving classes, and a battlefield that increasingly behaves like a coherent system rather than a collection of disconnected mechanics.**

## ▶ Play

**[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install is required. NOVA runs in a modern desktop or mobile browser and is also packaged as an installable PWA.

## Current release

### **v1.12.0 · Living Front**

**Fighting changes the farm. Farming changes where fights happen.**

Living Front turns neutral shape farming into a dynamic battlefield ecology without adding another control layer, currency, quest system, capture-zone minigame, pity mechanic, or hidden player-relative XP multiplier.

- The arena is divided into sixteen invisible ecological sectors that track maturity, pressure, harvesting, combat disturbance, value, and physical migration.
- The canonical neutral population contract remains **62 Circles / 30 Triangles / 16 Squares / 8 Pentagons / 4 Hexagons**.
- Quiet ground can mature into richer farming territory later in a match; fighting and harvesting disturb that geography.
- Circles school gently, Triangles make readable committed evasions, Squares remain deliberately simple, Pentagons/Hexagons create directional cascades, Hexagons act as bounded keystones, and Rogue Stars become interception prey.
- Crashers now use **Track → Telegraph → Charge → Overshoot → Recover**, obey terrain, and prey on vulnerable targets without gaining hidden combat stats.
- The Front Director mostly reports real state through **BLOOM** and **MIGRATION**. **ROGUE STAR** is the one rare event allowed to create a new opportunity deliberately.
- AI may reason about ecology only through public Director signals and Fair Engagement-legal information; it receives no hidden maturity map or privileged live target coordinates.
- Controller autonomy remains local: drones may handle nearby farming chores, but distant ecological decisions remain the player's.

See **[`CURRENT_RELEASE.md`](./CURRENT_RELEASE.md)** for the current release contract and **[`LIVING_FRONT.md`](./LIVING_FRONT.md)** / **[`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md)** for the design and adversarial completion audit.

## v1.11 is already canonical

The v1.11 line is fully present on `main` and in the shipping paths used by the game:

- **v1.11.1 · Owner Operations** is loaded by `pwa-register.js` and remains fail-closed behind the authorized phone bridge.
- **v1.11.2 · Fair Engagement** is part of the materialized gameplay runtime before Living Front and constrains AI sensing/targeting to the intended information model.

Living Front deliberately builds on Fair Engagement rather than replacing it.

## Design doctrine

NOVA should be **riddled with skill expression**. Strong mechanics are expected to create a loop of **Read → Respond → Punish** through execution, prediction, positioning, timing, commitment, and counterplay rather than arbitrary stat checks.

Important standing constraints include:

- simple twin-stick control grammar instead of proliferating combat buttons;
- no player-relative pity systems disguised as progression;
- AI should use the same combat language and legitimate information available to the player where practical;
- autonomy handles chores, while consequential violence remains player-driven;
- visuals and audio must communicate a decision-relevant gameplay question rather than decorate the screen without purpose;
- terrain, line-of-sight, movement, projectiles, drones, neutral shapes, spawning, and AI should compose through shared owners instead of parallel special-case systems;
- performance work must preserve gameplay semantics rather than buying frame time by silently reducing simulation quality.

Read **[`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md)** for the canonical doctrine.

## Current systems

- Three tactical Battlefield layouts with permanent terrain, destructible cover, rubble, spawn safety, and swept projectile collision.
- Real terrain line-of-sight and route-aware combat interactions.
- Gunner heat/cadence discipline, Cannon analog fuse programming, Guardian facing/Perfect Guard/Stampede mechanics, and specialized Apex descendants.
- Full purple Sniper / Forward Observer reconnaissance doctrine.
- Twin-stick Controller second-body command with formation geometry, designation, committed attack runs, local autonomous farming, recovery, terrain routing, and drone repair.
- Applied-power AI parity so banked upgrade points do not create fake enemy stat escalation.
- Shared Battlefield View / Fair Engagement information contracts and bounded AI reaction cadence.
- Terrain Intelligence, Zero Churn spatial broad-phase reuse, and production regression protection.
- Signal Discipline visual-governance rules and Impact/Contact feedback language.
- Blackglass Tank Intelligence & Showroom with canonical tank visuals and trait-graft inspection.
- Live War Room lobby battlefield, Living Archive release history, Fieldcraft tactical tip registry, Debug diagnostics, PWA updates, and the authorized NOVA Owner Android companion.
- **Living Front** ecological sectors, neutral instincts, physical migration, Crasher grammar, Rogue Stars, Front Director signals, and ecology-aware strategic AI.

## Validation and release discipline

The repository uses automated Node regressions, production build validation, static Tailwind compilation checks, Android Owner compilation, runtime-file syntax checks, service-worker/PWA safety checks, and a guarded production materializer.

A source merge is not considered the shipping finish line. `main` triggers the materializer, which reconstructs the canonical game shell, validates the runtime chain, stamps a runtime fingerprint from local shipping inputs, and commits the resulting `index.html`. GitHub Pages then deploys that materialized commit.

Release metadata is also regression-tested so `README.md`, `CURRENT_RELEASE.md`, `RELEASES.md`, and `nova-updates/releases.json` cannot silently remain several versions behind the actual runtime again.

## Project references

- **Current release:** [`CURRENT_RELEASE.md`](./CURRENT_RELEASE.md)
- **Design doctrine:** [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md)
- **Living Front:** [`LIVING_FRONT.md`](./LIVING_FRONT.md)
- **Living Front completion audit:** [`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md)
- **Battlefield:** [`BATTLEFIELD.md`](./BATTLEFIELD.md)
- **Three Disciplines:** [`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md)
- **Release milestone ledger:** [`RELEASES.md`](./RELEASES.md)
- **Development priorities:** [`ROADMAP.md`](./ROADMAP.md)

## Canonical branch and live game

`main` is the canonical branch. GitHub Pages serves the materialized runtime from that branch.

**Play:** https://magyarmex.github.io/fluffy-spork/
