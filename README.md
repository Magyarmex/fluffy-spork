# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.4.1 · Violet Doctrine** — the full reconnaissance, readable commitment, suppression, recovery, and off-screen counterplay doctrine now applies across every purple Sniper-lineage tank, not only Rail weapons.

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

### Violet Doctrine: purple means sniper doctrine

v1.4.1 closes the remaining asymmetry in the Sniper lineage. **Marksman, Railgun, Ghost, Singularity, Prism Rail, Specter, and Assassin** now all live inside the same information-war rules: ordinary direct hull sight, Forward Observer reconnaissance for distant targets, finite acquisition, readable long-range commitment, suppressible firing preparation, projectile/flyby readability, and a punish window after committed attacks.

The non-beam forms keep distinct mastery profiles instead of becoming Railgun copies. Marksman has a deliberate sight dwell, Ghost prepares ambush shots faster and reveals itself for less time, Specter has the fastest precision cycle for aggressive phase-driven angle creation, and Assassin makes the largest non-beam commitment for its heavy alpha strike. Inside ordinary direct sight, their dwell is shorter so closing distance genuinely changes the duel.

Destroying a Forward Observer now matters more: its owner loses **remote observer relay for about 3.4 seconds**. The sniper can still fight enemies it can directly see, but cannot consume remote contacts until the relay comes back online. Killing the scout therefore buys real territory and repositioning time.

Railgun, Singularity, and Prism Rail retain their unique beam mechanics: deeper focus-to-fire, charge-scaled quick shots, explicit Rail integrity, swept projectile interception, and Rail-specific denial/flyby feedback.

### Forward Observer: information is part of sniper skill

v1.4.0 fixed the original Silent Horizon AI reacquisition failure. Sniper AI now uses sampled target motion, finite turret tracking and qualified continuous firing preparation rather than banking a hidden firing solution while not actively tracking a target.

Sniper hulls no longer receive exceptional long-range vision simply because they are snipers or elite AI. They use ordinary direct sight. **Targets beyond that range must first be found by a Forward Observer drone.**

The spotter is a real, destructible drone with an extended patrol leash and its own rotating field-of-view cone. It ranges away from its sniper, opportunistically farms map shapes, and searches for tanks independently.

The intended long-range kill chain is:

**Spotter searches → contact acquired → sniper tracks → commitment warnings → shot → recovery/reposition.**

### Second Body: Controller skill duel

v1.3.0 rebuilds the Controller lineage around the existing NOVA twin-stick controls. The left stick still moves the hull. The right stick also commands the swarm: **direction chooses the command bearing, analog stick depth chooses deployment distance, and release recalls the formation.**

Controller drones retain convenient autonomous shape farming, but serious PvP pressure requires player decisions: position the Command Node, establish formation geometry, DESIGNATE targets with the hull gun, sequence readable attack runs, decide how deeply to commit the swarm, and recall before the hull becomes exposed.

Drone attacks use **form → wind up → commit trajectory → dive → overshoot → recover**. Opponents can manipulate the pre-lock prediction, dodge after commitment, interrupt drones, break through a weak formation, or punish an overextended Controller.

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
- Evolution-transition sniper reset, short safety grace, and automatic stat-tray collapse
- Twin-stick Controller **Swarm Vectoring** and analog Command Nodes
- Formation previews and live swarm-state visualization
- Controller target designation and formation-driven attack sequencing
- Distinct Wedge, Crescent, Phalanx, Ring, Claw, Fortress Wall and Cavalry Wing drone identities
- Telegraph → commitment → dodge/punish drone attack runs
- Readable drone interruption, impact and evasion feedback
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

NOVA TANKS uses semantic-style version numbers (`MAJOR.MINOR.PATCH`) and maintains a durable release ledger in [`RELEASES.md`](./RELEASES.md). The lobby contains a browsable version history sourced from `nova-updates/releases.json`.

### Latest — v1.4.1 · Violet Doctrine
- Forward Observer doctrine applies to all seven purple classes
- all purple AI uses ordinary direct sight; remote targets require observer contact
- Marksman/Ghost/Specter/Assassin gain class-specific continuous precision dwell before distant shots
- two-stage directional precision warnings and SIGHT / AMBUSH / HUNT / EXEC lock language
- accurate suppression can break non-beam precision preparation
- non-beam precision projectile trails and actual flyby SFX
- committed non-beam shots briefly expose their firing bearing
- killing the active Observer causes ~3.4 seconds of remote-relay denial
- Railgun/Singularity/Prism retain unique focus, quick-shot and interception mechanics

### v1.4.0 · Forward Observer
- dedicated sniper AI instead of generic instant-reacquisition behavior
- continuous AI Rail focus and finite tracking
- destructible Forward Observer drones with independent FOV search and shape farming
- SPOTTED → staged Rail-warning → shot information chain
- evolution safety and Controller/drone stability fixes

### v1.3.1 · Signal Bloom
- sniper/controller readability, graphics, SFX and mastery feedback polish

### v1.3.0 · Second Body
- twin-stick Swarm Vectoring, designation, formations and skill-based drone attack runs

### v1.2.0 · Silent Horizon
- focus / quick-shot Railgun system, suppression and swept Rail interception

---

### **[▶ PLAY NOVA TANKS](https://magyarmex.github.io/fluffy-spork/)**
