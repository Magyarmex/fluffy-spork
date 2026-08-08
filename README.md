# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.5.0 · Blackglass Showroom** — the lobby Evolution Tree now expands into a full animated Tank Intelligence archive for all 36 classes, with real runtime telemetry, evolution context, tactical dossiers, and a per-build foreign-gene graft simulator.

---

## About

NOVA TANKS is a fast browser arena game built around progression, specialization, hybridization, and increasingly powerful tank builds.

The game is also a **living project**: it is designed to continue evolving over time with new releases spanning gameplay, AI, maps, graphics, performance, quality of life, balance, controls, progression, and larger multi-update systems.

## Core design philosophy: skill expression

NOVA TANKS should be a game **riddled with skill expression**. Powerful mechanics should create opportunities to read, respond, outplay, and punish rather than producing unavoidable stat-check outcomes.

Every major system is expected to be evaluated for:

- skill ceiling and opportunities for mastery
- readability and understandable feedback
- meaningful counterplay for both sides
- positioning, prediction, timing and execution
- punish windows for mistakes
- soft interactive counters rather than binary hard-counter matchups

### Blackglass Showroom: know what you are building

v1.5.0 turns the old compact lobby Evolution Tree into an expandable **Tank Intelligence & Showroom** section. The section stays embedded in the lobby, but can widen into a full intelligence bay with lineage filters and a complete 36-class dossier library.

Selecting a tank opens a live animated chassis simulation generated from the actual class definition: hull scale, barrel geometry, weapon type, projectile behavior and drone presence all come from the same runtime data used by the arena. The display turret tracks pointer movement, fires its weapon profile, and animates drones around the selected chassis.

Every dossier includes the tank name, lineage/evolution breadcrumb, a unique catchphrase, its canonical short description, combat-role tags, ability information and normalized telemetry for damage, projectile speed, effective range, cadence, penetration, hull HP, mobility, body damage and drone presence.

The **Foreign Trait Graft Lab** lets you choose any legal foreign lineage gene and inspect what it does to that specific build. Instead of merely repeating the generic gene description, the lobby computes build-specific before → after changes such as:

- primary damage, projectile speed, penetration, range and reload
- splash radius, splash fraction and knockback
- echo-round damage per trigger cycle
- added hunter drones
- HP, body damage, mobility and passive damage reduction

The simulator uses base class values; in-match level, stat and perk scaling stacks separately. Scout is available as a pre-lineage sandbox preview while evolved tanks preserve normal foreign-lineage restrictions.

### Violet Doctrine: purple means sniper doctrine

v1.4.1 closes the remaining asymmetry in the Sniper lineage. **Marksman, Railgun, Ghost, Singularity, Prism Rail, Specter, and Assassin** all live inside the same information-war rules: ordinary direct hull sight, Forward Observer reconnaissance for distant targets, finite acquisition, readable long-range commitment, suppressible firing preparation, projectile/flyby readability, and a punish window after committed attacks.

The non-beam forms keep distinct mastery profiles instead of becoming Railgun copies. Marksman has a deliberate sight dwell, Ghost prepares ambush shots faster and reveals itself for less time, Specter has the fastest precision cycle for aggressive phase-driven angle creation, and Assassin makes the largest non-beam commitment for its heavy alpha strike. Inside ordinary direct sight, their dwell is shorter so closing distance genuinely changes the duel.

Destroying a Forward Observer now matters more: its owner loses **remote observer relay for about 3.4 seconds**. The sniper can still fight enemies it can directly see, but cannot consume remote contacts until the relay comes back online. Killing the scout therefore buys real territory and repositioning time.

Railgun, Singularity, and Prism Rail retain their unique beam mechanics: deeper focus-to-fire, charge-scaled quick shots, explicit Rail integrity, swept projectile interception, and Rail-specific denial/flyby feedback.

### Forward Observer: information is part of sniper skill

v1.4.0 fixed the original Silent Horizon AI reacquisition failure. Sniper AI now uses sampled target motion, finite turret tracking and qualified continuous firing preparation rather than banking a hidden firing solution while not actively tracking a target.

Sniper hulls use ordinary direct sight. **Targets beyond that range must first be found by a Forward Observer drone.**

The intended long-range kill chain is:

**Spotter searches → contact acquired → sniper tracks → commitment warnings → shot → recovery/reposition.**

### Second Body: Controller skill duel

v1.3.0 rebuilds the Controller lineage around the existing NOVA twin-stick controls. The left stick moves the hull. The right stick commands the swarm: **direction chooses the command bearing, analog stick depth chooses deployment distance, and release recalls the formation.**

Controller drones retain convenient autonomous shape farming, but serious PvP pressure requires player decisions: position the Command Node, establish formation geometry, DESIGNATE targets with the hull gun, sequence readable attack runs, decide how deeply to commit the swarm, and recall before the hull becomes exposed.

**Autonomy handles chores. The player handles violence.**

### Silent Horizon + Signal Bloom

v1.2.0 established the focus/quick-shot Railgun duel, off-screen glint/audio language, suppression, explicit Rail interception integrity, and swept projectile collision. v1.3.1 added the segmented focus reticle, FOCUS READY feedback, enhanced Rail trails, RAIL DENIED confirmation, Controller formation previews, swarm-state visualization, DIVE BROKEN / EVADED feedback, richer procedural SFX, and selective mobile haptics.

Read the full doctrine: **[`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md)**  
See active development priorities: **[`ROADMAP.md`](./ROADMAP.md)**  
Browse release history: **[`RELEASES.md`](./RELEASES.md)**

## Current systems

- Branching tank lineages and evolutions
- Late-game Apex evolutions
- Cross-lineage gene splicing / hybridization
- Expandable 36-class **Tank Intelligence & Showroom** in the lobby
- Live animated class previews generated from canonical hull/barrel/weapon/drone data
- Per-class catchphrases, tactical descriptions, evolution breadcrumbs and combat-role tags
- Runtime-derived combat telemetry and normalized stat comparison bars
- Foreign Trait Graft Lab with build-specific before → after gene effects
- Responsive desktop/mobile intelligence layout embedded in the existing Evolution Tree section
- Distinct weapon and combat archetypes
- Full purple-lineage Forward Observer reconnaissance doctrine
- Ordinary 720-unit direct sniper hull sight; distant targets require observer contact
- Class-specific non-beam precision preparation for Marksman, Ghost, Specter, and Assassin
- Two-stage off-screen precision warnings and class-flavored lock cues
- Suppressible non-beam precision preparation and class-specific recovery/reveal windows
- Destructible Observer relay with meaningful temporary long-range denial
- Focus / quick-shot Railgun skill system
- Segmented Rail focus/readiness reticle and enhanced Rail trails
- Projectile interception with swept collision for hypervelocity Rail rounds
- Dedicated Rail interception / denial feedback
- Twin-stick Controller **Swarm Vectoring** and analog Command Nodes
- Formation previews and live swarm-state visualization
- Controller target designation and formation-driven attack sequencing
- Distinct Wedge, Crescent, Phalanx, Ring, Claw, Fortress Wall and Cavalry Wing drone identities
- Telegraph → commitment → dodge/punish drone attack runs
- Defensive Controller/drone state invariant repair
- Procedural stereo combat, sniper, observer and swarm SFX
- Selective mobile haptics for high-value combat events
- AI-controlled enemy tanks that progress alongside the player while obeying major combat-language constraints
- Desktop and mobile browser play
- GitHub Pages deployment
- In-lobby version history and ongoing versioned development
- Runtime JavaScript and release-data validation in deployment CI

## Live game

**Play:** https://magyarmex.github.io/fluffy-spork/

The `main` branch is the canonical development branch. GitHub Pages serves the current playable release.

## Development direction

NOVA TANKS is intended to improve across the entire game rather than only accumulate mechanics. Development may target gameplay/game feel, tank classes and hybrids, AI and encounters, maps and environments, graphics/animation, UI/QoL, mobile controls, performance, balance/progression, deployment reliability, and larger multi-release projects.

## Releases

NOVA TANKS uses semantic-style version numbers (`MAJOR.MINOR.PATCH`) and maintains a durable release ledger in [`RELEASES.md`](./RELEASES.md). The lobby combines the source-controlled release history with the currently loaded versioned runtime layer.

### Latest — v1.5.0 · Blackglass Showroom
- existing Evolution Tree expands in place into a full intelligence/showroom section
- complete 36-class searchable-by-lineage dossier library
- animated tank canvas driven by actual class geometry, fire mode and drone count
- unique catchphrases, descriptions, evolution paths, role tags and ability inspection
- real telemetry for weapon, mobility, hull, body and drone characteristics
- foreign-gene simulator computes build-specific before → after changes
- responsive three-column desktop layout and stacked/horizontal mobile layout
- future class/stat changes flow automatically from the canonical class registry

### v1.4.1 · Violet Doctrine
- Forward Observer doctrine applies to all seven purple classes
- class-specific precision preparation and staged warning language
- suppression and meaningful Observer relay denial
- Rail-specific focus/interception identity preserved

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
