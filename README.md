# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.6.0 · Battlefield** — terrain, cover, line-of-sight, destructible barricades, tactical lanes, terrain-aware AI and full Sniper/Controller integration turn the old open field into an actual battlefield.

---

## About

NOVA TANKS is a fast browser arena game built around progression, specialization, hybridization, and increasingly powerful tank builds. It is also a living project that continues evolving across gameplay, AI, maps, graphics, audio, performance, mobile usability, quality of life, balance, controls, progression, and larger multi-release systems.

## Core design philosophy: skill expression

NOVA TANKS should be a game **riddled with skill expression**. Powerful mechanics should create opportunities to read, respond, outplay, and punish rather than producing unavoidable stat-check outcomes.

Every major system is expected to be evaluated for skill ceiling, readability, counterplay, positioning, prediction, timing, execution, punish windows, and two-sided mastery.

### v1.6.0 · Battlefield

NOVA no longer takes place in a nearly featureless open square. Each run now uses one of three mirrored tactical layouts — **Crossfire, Split Horizon, or Four Gates** — built from permanent fortifications, pillars and destructible barricades.

Battlefield geometry is mechanical, not cosmetic:

- solid terrain blocks tanks, drones, neutral shapes and projectiles;
- tank collision resolves into sliding rather than a hard stop, preserving fluid twin-stick movement around corners;
- projectiles use swept terrain tests, so Rail and other fast rounds cannot tunnel through thin walls between frames;
- permanent fortifications stop shots;
- destructible barricades absorb projectile and splash damage, visibly crack, can be breached, and leave persistent non-blocking rubble;
- sufficiently penetrating rounds may punch through only when their own impact actually destroys the cover and enough projectile integrity remains;
- tank, shape and powerup spawn locations avoid solid terrain.

**Line-of-sight is now a game system.** Automatic target acquisition and AI firing authorization respect cover. A tank hidden behind a wall is not a free aim-assist or AI target. Generic AI changes strafe/path intent after repeated terrain contact instead of simply grinding into a wall.

Snipers inherit the same physical information rules. Ordinary hull sight cannot see through terrain, and a Forward Observer contact is invalidated when the Observer does not have an unobstructed view. Suspicion still tells a scout where to investigate; it does not let the scout report a target through concrete. Cover therefore creates real approach windows and makes Observer placement part of sniper mastery.

Controllers can still place a Command Node beyond cover, but their drones must physically occupy that space. Formation, farming, defense and attack runs are terrain-constrained; a committed dive that hits a wall aborts into recovery instead of applying impossible through-wall pressure.

Fortifications receive explicit shadows, neon rim lighting, damage cracks, impact flashes, breach debris/rubble and procedural terrain SFX. A compact battlefield strip names the current layout and reports remaining destructible cover.

See the full system reference in **[`BATTLEFIELD.md`](./BATTLEFIELD.md)**.

### v1.5.1 · Swarm Discipline

- Portrait Blackglass layouts were rebuilt for narrow phones with a horizontal dossier rail, compact stage, safe wrapping and readable telemetry/graft rows.
- Idle Controller drones gained persistent steering and separate return/resume thresholds, eliminating farm/home dithering.
- Friendly drones distribute themselves across harvest targets.
- Defensive drones automatically intercept hostile combat drones while spotters remain exempt from automatic aggro; manually commanded swarms can attack any hostile drone.
- Forward Observers gained a wider suspicion-driven search cone, purposeful sector patrols, projectile-based activity inference and clearer player/AI relay visuals.
- NOVA gained a distinct procedural lobby theme with a Blackglass variation.

### v1.5.0 · Blackglass Showroom

The old compact Evolution Tree became an expandable **Tank Intelligence & Showroom** section. It contains all 36 class dossiers, lineage navigation, evolution breadcrumbs, unique catchphrases, canonical descriptions, abilities, real class telemetry, animated chassis previews generated from the same runtime class definitions, and a **Foreign Trait Graft Lab** that computes before → after effects for the inspected build.

### Purple sniper doctrine

Every purple form — **Marksman, Railgun, Ghost, Singularity, Prism Rail, Specter, and Assassin** — lives inside the same reconnaissance and counterplay language: ordinary direct hull sight, Forward Observer authorization for distant targets, finite acquisition, readable commitment, suppression, projectile/flyby readability, and punishable recovery.

Railgun, Singularity, and Prism Rail retain the deeper beam-only mechanics: focus-to-fire, charge-scaled quick-shots, explicit Rail integrity, swept projectile interception, and Rail-specific denial/flyby feedback.

### Second Body: Controller skill duel

The Controller lineage uses the existing NOVA twin-stick controls as a second-body command system. The left stick moves the hull. The right stick commands the swarm: **direction chooses bearing, stick depth chooses deployment distance, and release recalls the formation.**

Autonomy handles shape farming. Serious PvP pressure comes from Command Node placement, formation geometry, designation, readable attack runs, commitment, recall, and drone survival.

**Autonomy handles chores. The player handles violence.**

Read the full doctrine: **[`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md)**  
See active development priorities: **[`ROADMAP.md`](./ROADMAP.md)**  
Browse release history: **[`RELEASES.md`](./RELEASES.md)**

## Current systems

- Three tactical Battlefield layouts with permanent terrain and destructible cover
- Terrain-aware tank/drone/shape movement and spawn safety
- Real line-of-sight for targeting, AI firing and Forward Observer contacts
- Swept projectile-vs-terrain collision for hypervelocity rounds
- Breachable cover, projectile punch-through rules and persistent rubble
- Branching tank lineages and late-game Apex evolutions
- Cross-lineage gene splicing / hybridization
- Expandable 36-class **Tank Intelligence & Showroom**
- Animated class previews generated from canonical hull/barrel/weapon/drone data
- Per-class catchphrases, evolution paths, tactical descriptions and telemetry
- Foreign Trait Graft Lab with build-specific before → after effects
- Responsive desktop/mobile Blackglass inspection layout
- Full purple-lineage Forward Observer reconnaissance doctrine
- Suspicion-driven intelligent Observer search and long-range relay visualization
- Class-specific non-beam precision preparation and staged warning language
- Focus / quick-shot Railgun skill system
- Swept Rail projectile interception and RAIL DENIED feedback
- Twin-stick Controller **Swarm Vectoring** and analog Command Nodes
- Formation previews and swarm-state visualization
- Controller designation and formation-driven attack sequencing
- Wedge, Crescent, Phalanx, Ring, Claw, Fortress Wall and Cavalry Wing formations
- Telegraph → commitment → dodge/punish drone attack runs
- Distributed autonomous shape harvesting
- Automatic defensive drone-vs-drone interception with spotter exemption
- Procedural stereo combat, sniper, observer, swarm, terrain and lobby/showroom audio
- Selective mobile haptics for high-value combat events
- AI-controlled enemy tanks that progress alongside the player while obeying major combat-language constraints
- Desktop and mobile browser play
- GitHub Pages deployment
- In-lobby version history and ongoing versioned development
- Runtime JavaScript, release-data and Battlefield regression validation in CI

## Live game

**Play:** https://magyarmex.github.io/fluffy-spork/

The `main` branch is the canonical development branch. GitHub Pages serves the current playable release.

## Releases

NOVA TANKS uses semantic-style version numbers (`MAJOR.MINOR.PATCH`).

### Latest — v1.6.0 · Battlefield
- Crossfire, Split Horizon and Four Gates tactical layouts
- permanent walls/pillars plus destructible cover and rubble
- real line-of-sight for AI, aim acquisition and Observer relay
- swept projectile-vs-terrain collision
- tank/drone/shape terrain collision and sliding
- AI anti-stuck/path response around fortifications
- Controller attack-run and Sniper reconnaissance integration
- terrain-aware spawns, cover visuals and procedural SFX
- Battlefield geometry regression tests

### v1.5.1 · Swarm Discipline
- Blackglass mobile polish, coordinated drones, intelligent Observer search and lobby/showroom music

### v1.5.0 · Blackglass Showroom
- full animated 36-class intelligence archive and trait-graft simulator

### v1.4.1 · Violet Doctrine
- Forward Observer doctrine across all seven purple classes

### v1.4.0 · Forward Observer
- dedicated sniper AI, destructible reconnaissance and evolution safety

### v1.3.1 · Signal Bloom
- sniper/controller readability, graphics, SFX and mastery feedback polish

### v1.3.0 · Second Body
- twin-stick Swarm Vectoring, designation, formations and skill-based drone attack runs

### v1.2.0 · Silent Horizon
- focus / quick-shot Railgun system, suppression and swept Rail interception

---

### **[▶ PLAY NOVA TANKS](https://magyarmex.github.io/fluffy-spork/)**
