# NOVA TANKS — Current Release

## v1.12.0 · Living Front

**Released:** 2026-08-31  
**Runtime build:** `04e65dd7838044d97f56b5b6`  
**Shipping materialization:** `0651623dae6e4339e727b0c297933cd0b5f2a3e5`

> **Fighting changes the farm. Farming changes where fights happen.**

Living Front evolves the historic Living Arena idea into a skill-first neutral battlefield ecology. Quiet ground matures into richer farming territory, harvesting and combat disturb it, neutral populations migrate physically, and the same world geometry that governs PvP now governs resource flow.

### Core gameplay

- sixteen invisible ecological sectors track maturity, pressure, real neutral value, recent harvesting/combat, and migration flow;
- the canonical 62 / 30 / 16 / 8 / 4 Circle/Triangle/Square/Pentagon/Hexagon population contract remains authoritative;
- later-match maturity permits richer concentrations without player-relative pity or hidden XP multipliers;
- Circles school gently, Triangles make one readable committed evade, Squares remain simple, Pentagon/Hexagon cascades reward positioning, Hexagons act as bounded keystones, and Stars become interception prey;
- Crashers use **Track → Telegraph → Charge → Overshoot → Recover**, obey terrain, prey on vulnerable targets, and can store capped reward-only bounty without combat-stat growth;
- combat, near fire, explosions, and presence can physically disturb appropriate prey with bounded diminishing response;
- the Front Director mostly reports real world state through **BLOOM** and **MIGRATION**; **ROGUE STAR** is the sole rare deliberately created opportunity;
- AI consumes only public Director signals and Fair Engagement-legal visible ecology, with route cost, health, fight, and saturation gates;
- Controller autonomy remains local: drones may farm nearby shapes but do not choose distant ecological objectives for the player.

### NOVA integration

- Living Front runs after v1.11.2 Fair Engagement through three ordered runtime owners: Ecology Core, Wild Instincts, and Front Director/Strategic AI;
- world/minimap visuals obey Signal Discipline and declare their gameplay intent;
- seven Living Front tactical tips register through canonical Fieldcraft shuffle bags;
- Living Archive discovers the normal `__NOVA_LIVING_FRONT_RELEASE__` runtime record;
- Debug exposes copyable ecological telemetry including per-sector state and player neutral XP/min;
- Zero Churn spatial reuse is preserved, with one decimated reusable projectile index augmenting the canonical shape/tank hash for projectile-aware neutral instincts.

### Verification

Living Front shipped only after an adversarial completion audit found and corrected twelve implementation/integration defects. The final candidate passed **357 / 357 repository tests** plus Android Owner packaging. The focused Living Front evidence contains **26 tests** across gameplay/runtime, Signal Discipline, Fieldcraft ownership, and Crasher terrain-collision lifecycle.

The production materializer rebuilt the canonical page, injected all three v1.12.0 runtime stages exactly once after Fair Engagement, stamped runtime build `04e65dd7838044d97f56b5b6`, and GitHub Pages successfully deployed the resulting artifact.

See [`LIVING_FRONT.md`](./LIVING_FRONT.md) for the design/runtime contract and [`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md) for the adversarial completion audit.
