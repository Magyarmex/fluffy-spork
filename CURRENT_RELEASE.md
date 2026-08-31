# NOVA TANKS — Current Release

## v1.12.0 · Living Front

**Released:** 2026-08-31

> **Fighting changes the farm. Farming changes where fights happen.**

Living Front evolves the historic Living Arena proposal into a skill-first neutral battlefield ecology. Quiet ground matures into richer farming territory, harvesting and combat disturb it, neutral populations migrate physically, and the same world geometry that governs PvP now governs resource flow.

## Core gameplay

- Sixteen invisible ecological sectors track maturity, pressure, real neutral value, recent harvesting/combat, and migration flow.
- The canonical **62 / 30 / 16 / 8 / 4** Circle/Triangle/Square/Pentagon/Hexagon population contract remains authoritative.
- Later-match maturity permits richer concentrations without player-relative pity or hidden XP multipliers.
- Circles school gently; Triangles make one readable committed evade; Squares remain simple; Pentagon/Hexagon cascades reward positioning; Hexagons act as bounded keystones; Stars become interception prey.
- Crashers use **Track → Telegraph → Charge → Overshoot → Recover**, obey terrain, prey on vulnerable targets, and can store capped reward-only bounty without combat-stat growth.
- Combat, near fire, explosions, and presence can physically disturb appropriate prey with bounded diminishing response.
- The Front Director mostly reports real world state through **BLOOM** and **MIGRATION**; **ROGUE STAR** is the sole rare deliberately created opportunity.
- AI consumes only public Director signals and Fair Engagement-legal visible ecology, with route cost, health, fight, and saturation gates.
- Controller autonomy remains local: drones may farm nearby shapes but do not choose distant ecological objectives for the player.

## NOVA integration

- Living Front runs after **v1.11.2 Fair Engagement** through three ordered runtime owners: Ecology Core, Wild Instincts, and Front Director / Strategic AI.
- **v1.11.1 Owner Operations** remains independently loaded through `pwa-register.js` and fail-closed behind the authorized phone bridge.
- World/minimap visuals obey Signal Discipline and declare their gameplay intent.
- Seven Living Front tactical tips register through canonical Fieldcraft shuffle bags.
- Living Archive discovers the normal `__NOVA_LIVING_FRONT_RELEASE__` runtime record.
- Debug exposes copyable ecological telemetry including per-sector state and player neutral XP/min.
- Zero Churn spatial reuse is preserved, with one decimated reusable projectile index augmenting the canonical shape/tank hash for projectile-aware neutral instincts.

## Verification

Living Front shipped only after an adversarial completion audit found and corrected twelve implementation/integration defects. The final feature candidate passed the complete repository suite, Android Owner packaging, focused gameplay/runtime integration coverage, Signal Discipline coverage, Fieldcraft ownership coverage, and Crasher terrain-collision lifecycle coverage.

The production materializer is the authority for the exact shipping build. It reconstructs the canonical page from the compressed source payload, validates every runtime file, reruns the full regression suite, injects the ordered runtime chain, compiles static Tailwind CSS, stamps `index.html` with `nova-runtime-build`, and commits the resulting shipping shell before GitHub Pages deployment.

**This document intentionally does not hard-code a materialization commit or runtime fingerprint.** Both values legitimately change when fingerprinted shipping inputs such as `nova-updates/releases.json` change. The current deployed fingerprint is always the `nova-runtime-build` meta value in canonical `index.html`.

See [`LIVING_FRONT.md`](./LIVING_FRONT.md) for the design/runtime contract, [`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md) for the adversarial completion audit, and [`RELEASES.md`](./RELEASES.md) for the milestone ledger.
