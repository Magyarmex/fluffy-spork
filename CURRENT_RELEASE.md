# NOVA TANKS — Current Release

## v1.12.0 · Living Front

**Released:** 2026-08-31

> **Fighting changes the farm. Farming changes where fights happen.**

Living Front evolves the historic Living Arena idea into a skill-first neutral battlefield ecology. Neutral shapes are no longer just uniformly replenished XP rocks: quiet areas mature, combat and harvesting disturb them, populations move physically through the map, and the changing distribution of value creates new rotations, ambushes, intercepts, and contested farming decisions without adding another control scheme or objective UI.

## What changed for players

### A living resource geography

- The arena now runs a **4×4 grid of sixteen invisible ecological sectors**.
- Each sector tracks maturity, pressure, actual neutral XP value, recent harvesting, combat disturbance, and physical migration.
- Quiet ground can mature into richer farming territory; heavily harvested or fought-over ground becomes temporarily poorer and recovers over time.
- A shared **match-age maturity ceiling** prevents the richest neutral concentrations from appearing immediately and lets the world support better physical farming opportunities later in a run.
- The canonical **62 / 30 / 16 / 8 / 4** Circle/Triangle/Square/Pentagon/Hexagon population contract remains authoritative. Living Front changes **where value develops**, not the total ordinary neutral population.
- There are **no hidden XP-zone multipliers, no player-relative catch-up rewards, and no pity system**. Valuable areas are valuable because valuable neutral shapes actually exist there.

### Neutral shapes now have distinct instincts

- **Circles** remain reliable basic fodder, but loosely school and gently drift away from visible local danger.
- **Triangles** can perform one readable, cooldown-bounded lateral evade against a credible visible projectile. They cannot chain perfect dodges, so leading, baiting, and follow-up placement matter.
- **Squares** deliberately remain simple and stable. They also resist disturbance much more strongly than Circles or Triangles.
- **Pentagons** retain their split identity, with child momentum now influenced by the final impact geometry so positioning before the kill affects cleanup.
- **Hexagons** become ecological keystones: an undisturbed Hexagon weakly gathers nearby lower-value shapes into a loose pocket, bounded by local terrain and line of sight.
- Shape instincts respect Battlefield geometry. Schooling, attraction, threat response, and local disturbance do not magically operate through solid walls.

### Crashers are now readable predators

Crashers were rebuilt around the full combat grammar:

**Track → Telegraph → Charge → Overshoot → Recover**

- A charge now has a visible preparation phase and a mostly locked commitment direction.
- Missing the target carries the Crasher through an explicit overshoot instead of allowing perfect re-homing.
- Terrain is real counterplay: a committed charge can hit walls or barricades and be interrupted physically.
- After the commitment, the Crasher has to recover before it can attack again.
- Crashers can kill neutral shapes and store part of that lost value as **capped bounty**.
- A brighter Crasher core means a larger reward when it dies — **not** extra HP, damage, or speed.

### Rogue Stars are interception prey

- Stars are now rare, fast roaming prizes rather than slow mini-bosses.
- Their cruise speed is high enough to outrun an ordinary unbuffed tank, making route prediction and interception stronger than chasing directly from behind.
- Stars follow readable long-form movement, respect terrain, remain vulnerable to normal weapons, and do not gain boss phases or special combat-stat inflation.

### Combat now changes the farm

- Gunfire, explosions, tank presence, damage, deaths, and rapid harvesting feed local ecological pressure.
- Nearby visible fire and explosions can physically herd susceptible Circles and Triangles.
- Squares resist strongly, Pentagons resist almost entirely, and Hexagons, Stars, and Crashers do not become player-controlled herding units.
- Per-shape disturbance memory creates diminishing response, so repeatedly shooting empty space does not become the optimal farming technique.
- When one area remains hot while nearby ground is calmer, neutral populations can begin moving toward the calmer region.
- Migration is **physical and terrain-constrained**. Shapes do not teleport between sectors.
- A major fight can therefore change where the next valuable farming lane develops.

### Front Director

The old Arena Director concept was narrowed into a restrained **Front Director** that mostly reports interesting world states rather than manufacturing them.

- **BLOOM** announces a naturally matured high-value pocket that already exists. The signal does not spawn value or activate an XP multiplier.
- **MIGRATION** is announced only after enough real neutral entities have physically crossed sector boundaries in a coherent direction.
- **ROGUE STAR** is the one deliberately created Director opportunity. After a sufficiently quiet stretch, one fast Star may enter as a globally readable interception prize.
- Director opportunities use cooldowns and state gates to prevent event spam and duplicate Stars.
- Communication is intentionally restrained: short world/minimap/audio signals, not capture bars, permanent ecology HUDs, quest trackers, or extra buttons.
- Living Front remains interesting with the Director disabled. The ecology, shape instincts, value geography, and physical migration continue to run without scripted events.

### AI understands the same Living Front

- AI can value Blooms, Migrations, Rogue Stars, and locally visible neutral concentrations as strategic opportunities.
- Ecology is only one part of AI utility; combat pressure, current health, travel cost, role behavior, and active fights still matter.
- AI receives **public Director signals and Fair Engagement-legal visible ecology only**. Hidden sector maturity and unseen neutral positions are not exposed as omniscient information.
- Opportunity saturation and deterministic damping prevent every AI tank from rotating toward the same hotspot at once.
- Better AI can make better ecological decisions through judgment and timing without receiving extra information or hidden stats.

### Class interaction stays systemic

Living Front does **not** add arbitrary ecology bonuses to classes.

- **Gunner** naturally sweeps groups well but also creates more disturbance through sustained fire.
- **Cannon** can rearrange groups and cascades with blast geometry and can alter access through destructible cover.
- **Guardian** can physically contest dense pockets and close-range approaches.
- **Sniper** can exploit rotation lanes and intercept roaming opportunities at range.
- **Controller** remains excellent at local autonomous farming, but drones do not independently abandon the player to chase distant Blooms, Stars, or macro objectives.

The player still chooses where to rotate and when to fight.

### Farming and progression now reward battlefield reading

Living Front adds farming mastery through:

- recognizing mature ground;
- rotating efficiently before others arrive;
- positioning before Pentagon/Hexagon cascades;
- predicting Star routes;
- judging when a rich area is too dangerous to contest;
- exploiting terrain funnels and approach lanes;
- selectively herding susceptible prey when it is actually useful.

Ordinary nearby farming remains viable. The intended advantage comes from better decisions and execution, not from a hidden multiplier.

## Readability and quality-of-life

- Crasher charge preparation, overshoot residue, fed-core brightness, Rogue Star movement, and Director signals communicate important state without adding permanent clutter.
- **Seven tactical Living Front tips** were added through the canonical Fieldcraft system:
  - quiet-ground maturity;
  - Hexagon pockets;
  - Triangle baiting;
  - Crasher bounty;
  - Bloom choices;
  - Star interception;
  - bounded herding.
- Living Front visuals obey Signal Discipline, keeping effects tied to navigation, threat reading, or actionable battlefield state.
- Debug exposes copyable ecological telemetry including every sector, neutral value, migration, shape counts, Triangle evasions, Crasher charge outcomes, bounty flow, Stars, Blooms, AI rotations, planning cost, and player neutral XP/min.
- Neutral-farming telemetry distinguishes shape/bounty XP from PvP tank-drop orbs so farming efficiency can be tuned using the correct reward source.

## Performance and fairness safeguards

- Ecology planning is intentionally decimated rather than run at full frame rate:
  - sectors roughly **4–5 Hz**;
  - shape instincts roughly **8–10 Hz**;
  - Front Director roughly **1–2 Hz**;
  - strategic AI ecology at a similarly bounded cadence.
- Movement, collision, projectiles, damage, and normal combat remain frame-exact.
- Living Front reuses NOVA's canonical spatial hash and adds one reusable local projectile index per instinct tick so Triangle threat reading and near-fire herding remain projectile-aware without shape×all-projectile scans.
- Ordinary neutral entity counts stay bounded; smarter arrangement is preferred over simply spawning more objects.
- A cross-system Crasher fix expires Battlefield's terrain-bump marker correctly so hitting terrain cancels the current committed charge without breaking every future charge.

## v1.11 foundation retained

Living Front runs on top of the already-shipped v1.11 line:

- **v1.11.2 · Fair Engagement** keeps enemy perception tied to the real gameplay viewport/camera information model, removes player-identity target priority, uses soft engagement saturation, and preserves the Controller point-blank Command Node fix.
- **v1.11.1 · Owner Operations** remains independently loaded through `pwa-register.js` and fail-closed behind the authorized phone bridge; it does not become public combat authority.

## Verification

Living Front shipped only after an adversarial completion audit found and corrected **twelve** gameplay, optimized-runtime, fairness, telemetry, ownership, and governance defects. The release carries focused integration coverage plus the complete repository suite, Signal Discipline checks, Fieldcraft ownership checks, Crasher terrain-lifecycle coverage, Android Owner packaging, and production materializer validation.

The production materializer remains the authority for the exact shipping build. It reconstructs the canonical page from the compressed source payload, validates runtime files, reruns regressions, injects the ordered runtime chain, compiles static Tailwind CSS, stamps `index.html` with `nova-runtime-build`, and commits the shipping shell before GitHub Pages deployment.

**This document intentionally does not hard-code a materialization commit or runtime fingerprint.** Those values legitimately change whenever fingerprinted shipping inputs change.

See [`LIVING_FRONT.md`](./LIVING_FRONT.md) for the design/runtime contract, [`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md) for the adversarial completion audit, and [`RELEASES.md`](./RELEASES.md) for the milestone ledger.
