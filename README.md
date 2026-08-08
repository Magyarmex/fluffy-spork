# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.3.0 · Second Body** — Controllers become true twin-stick swarm commanders with analog formation placement, target designation, readable attack runs, recall/commitment decisions, distinct lineage formations, AI parity and new procedural swarm SFX.

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

### Second Body: Controller skill duel

v1.3.0 rebuilds the Controller lineage around the existing NOVA twin-stick controls. The left stick still moves the hull. The right stick now also commands the swarm: **direction chooses the command bearing, analog stick depth chooses deployment distance, and release recalls the formation.**

Controller drones retain convenient autonomous shape farming, but PvP is no longer primarily nearest-target autopilot. Serious pressure is created by player decisions: position the Command Node, establish formation geometry, land the Controller gun to DESIGNATE a target, sequence readable attack runs, decide how deeply to commit the swarm, and recall before the hull becomes exposed.

Drone attacks use **form → wind up → commit trajectory → dive → overshoot → recover**. Opponents can read a wind-up, manipulate the pre-lock prediction, dodge after commitment, shoot down or interrupt drones, break through a weak formation, or punish the Controller while its swarm is overextended.

**Autonomy handles chores. The player handles violence.**

### Silent Horizon: sniper skill duel

v1.2.0 turns Railgun combat into a more interactive long-range duel while preserving the sniper fantasy. Full-power Rail shots require focus and progressively commit aim; early release produces a weaker quick-shot. Off-screen snipers communicate restrained bearing/timing information through directional glint and spatial audio rather than revealing exact coordinates. Correctly placed defensive fire can intercept Rail rounds through swept collision, and accurate suppression can break deep focus.

The intended anti-sniper rhythm is:

**Detect bearing → manipulate aim → survive/intercept → exploit recovery → take territory → repeat.**

Read the full doctrine: **[`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md)**  
See active development priorities: **[`ROADMAP.md`](./ROADMAP.md)**  
Browse release history: **[`RELEASES.md`](./RELEASES.md)**

## Current systems

- Branching tank lineages and evolutions
- Late-game Apex evolutions
- Cross-lineage gene splicing / hybridization
- Distinct weapon and combat archetypes
- Twin-stick Controller **Swarm Vectoring** and analog Command Nodes
- Controller target designation and formation-driven attack sequencing
- Distinct Wedge, Crescent, Phalanx, Ring, Claw, Fortress Wall and Cavalry Wing drone identities
- Telegraph → commitment → dodge/punish drone attack runs
- Focus / quick-shot Railgun skill system
- Off-screen directional sniper threat cues
- Projectile interception with swept collision for hypervelocity rounds
- Skill-based sniper suppression and advance windows
- Procedural stereo combat and swarm SFX
- AI-controlled enemy tanks that progress alongside the player and obey the same major combat-language constraints
- Desktop and mobile browser play
- GitHub Pages deployment
- In-lobby version history and ongoing versioned development

## Live game

**Play:** https://magyarmex.github.io/fluffy-spork/

The `main` branch is the canonical development branch. GitHub Pages serves the current playable release.

## Development direction

NOVA TANKS is intended to improve across the entire game rather than only accumulate mechanics. Development may target:

- Gameplay and game feel
- Tank classes, evolutions and hybrids
- Enemy AI and encounter design
- Maps and environmental systems
- Graphics, animation and visual feedback
- UI, lobby and quality of life
- Mobile controls and accessibility
- Performance and rendering efficiency
- Balance and progression
- Bug fixes and deployment reliability
- Larger multi-release projects

## Releases

NOVA TANKS uses semantic-style version numbers (`MAJOR.MINOR.PATCH`) and maintains a durable release ledger in [`RELEASES.md`](./RELEASES.md). The lobby contains a browsable version history sourced from `nova-updates/releases.json`.

### Latest — v1.3.0 · Second Body
- right-stick Swarm Vectoring with analog deployment depth and release-to-recall
- autonomous shape farming, actively commanded PvP
- short-lived gun-hit DESIGNATE system
- formation establishment before attack instead of nearest-target chasing
- readable wind-up, late trajectory lock, committed dive, overshoot and recovery
- interruptible wind-ups and destructible drones
- swept high-speed dive collision
- unique Controller lineage formation geometries
- same Controller combat rules for AI, with skill expressed through decision quality
- command/recall/designation/wind-up/launch procedural SFX and visual language

### v1.2.0 · Silent Horizon
- full-power Rail focus and weaker charge-scaled quick-shots
- progressive aim commitment during deep focus
- off-screen directional glint and incoming audio
- explicit Rail interception integrity
- swept projectile-vs-projectile collision
- accurate suppression that can break focus
- post-shot bearing/recovery windows for skilled advancement
- synthesized charge, rail-crack, flyby, and quick-shot SFX

---

### **[▶ PLAY NOVA TANKS](https://magyarmex.github.io/fluffy-spork/)**
