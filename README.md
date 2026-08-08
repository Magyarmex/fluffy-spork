# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.5.1 · Swarm Discipline** — a full finish-and-stability pass for Blackglass, drones, Forward Observers, lobby music, and combat presentation.

---

## About

NOVA TANKS is a fast browser arena game built around progression, specialization, hybridization, and increasingly powerful tank builds. It is also a living project that continues evolving across gameplay, AI, maps, graphics, audio, performance, mobile usability, quality of life, balance, controls, progression, and larger multi-release systems.

## Core design philosophy: skill expression

NOVA TANKS should be a game **riddled with skill expression**. Powerful mechanics should create opportunities to read, respond, outplay, and punish rather than producing unavoidable stat-check outcomes.

Every major system is expected to be evaluated for skill ceiling, readability, counterplay, positioning, prediction, timing, execution, punish windows, and two-sided mastery.

### v1.5.1 · Swarm Discipline

This patch finishes the systems introduced by Blackglass while hardening the arena underneath them.

**Blackglass mobile polish**
- Portrait layouts were visually QA'd at narrow phone widths and rebuilt around a horizontal dossier rail, compact animated stage, clearer hierarchy, safe text wrapping, aligned telemetry and readable graft deltas.
- Long class-role labels intentionally truncate inside the library cards instead of overlapping neighboring dossiers; the selected dossier still exposes the complete information.
- Desktop retains the three-column library / stage / intelligence layout while phones use a vertical inspection flow.

**Drone discipline**
- Idle Controller drones no longer bounce between farm and return decisions around a hard distance threshold. Persistent steering, dead zones and separate return/resume distances remove the visible vibration/dithering behavior.
- Friendly drones reserve different harvest shapes when alternatives exist, spreading the swarm across useful targets instead of dog-piling one object.
- Defensive drones automatically intercept nearby hostile combat drones.
- Forward Observer spotters are exempt from automatic defensive aggro, but a manually directed Controller swarm can still attack them like any other enemy drone.

**Forward Observer intelligence**
- Observer search uses a much broader sensor: roughly a **700-unit range and ~149° search cone**, plus short point-blank awareness.
- The cone is no longer an arbitrary spinner. Recent contacts and visible/heard hostile projectile trajectories create decaying **suspicion bearings**, causing the Observer to deliberately rotate and patrol toward likely activity.
- Observers continue searching around lost contacts and move through purposeful search sectors while harvesting shapes encountered along the route.
- Player snipers receive clearer cyan contact relays, including on-screen target reticles or off-screen CONTACT markers with distance.
- Hostile relays expose OBSERVER / SPOTTED information clearly enough for defenders to understand the reconnaissance chain without revealing the sniper's exact position for free.

**Lobby score and presentation**
- NOVA now has its own procedural lobby theme: a recognizable syncopated motif, neon bass pulse and restrained synth groove.
- Opening Blackglass smoothly morphs the same musical identity into a crystalline intelligence-room variation rather than abruptly changing tracks.
- The lobby score obeys SOUND OFF, MUSIC OFF and browser/mobile autoplay restrictions.
- The rotated sniper edge indicator can still rotate, but its **SHOT** text remains screen-upright.

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

- Branching tank lineages and late-game Apex evolutions
- Cross-lineage gene splicing / hybridization
- Expandable 36-class **Tank Intelligence & Showroom**
- Animated class previews generated from canonical hull/barrel/weapon/drone data
- Per-class catchphrases, evolution paths, tactical descriptions and telemetry
- Foreign Trait Graft Lab with build-specific before → after effects
- Responsive desktop/mobile Blackglass inspection layout
- Distinct weapon and combat archetypes
- Full purple-lineage Forward Observer reconnaissance doctrine
- Suspicion-driven intelligent Observer search and long-range relay visualization
- Ordinary 720-unit direct sniper hull sight; distant targets require observer contact
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
- Procedural stereo combat, sniper, observer, swarm and lobby/showroom audio
- Selective mobile haptics for high-value combat events
- AI-controlled enemy tanks that progress alongside the player while obeying major combat-language constraints
- Desktop and mobile browser play
- GitHub Pages deployment
- In-lobby version history and ongoing versioned development
- Runtime JavaScript and release-data validation in deployment CI

## Live game

**Play:** https://magyarmex.github.io/fluffy-spork/

The `main` branch is the canonical development branch. GitHub Pages serves the current playable release.

## Releases

NOVA TANKS uses semantic-style version numbers (`MAJOR.MINOR.PATCH`).

### Latest — v1.5.1 · Swarm Discipline
- portrait-mobile Blackglass polish and overlap fixes
- coordinated distributed drone harvesting
- stable idle navigation without farm/home vibration
- automatic defensive drone interception, excluding spotters
- manually commanded swarms can target enemy drones including spotters
- wider, suspicion-driven Forward Observer search
- clear long-range player/AI contact relay visuals
- distinct lobby music with Blackglass variation
- screen-upright SHOT callout

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
