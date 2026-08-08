# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.4.0 · Forward Observer** — sniper AI now requires continuous readable focus, long-range acquisition is earned through destructible spotter-drone reconnaissance, evolution transitions are protected from instant Rail punishment, and Controller drone state receives additional stability safeguards.

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

### Forward Observer: information is part of sniper skill

v1.4.0 fixes a major failure in the original Silent Horizon AI implementation. AI Rail focus could previously remain banked while the sniper stopped actively maintaining a firing solution, allowing a later reacquisition to jump almost immediately to a full shot. Sniper AI now has a dedicated combat loop: sampled target motion, finite turret tracking, continuous qualified focus, focus cancellation when aim/contact is lost, two-stage warning cues, and a real post-shot recovery floor.

Sniper hulls no longer receive exceptional long-range vision simply because they are snipers or elite AI. They use ordinary direct sight at close/medium range. **Targets beyond that range must first be found by a Forward Observer drone.**

The spotter is a real, destructible drone with an extended patrol leash and its own rotating field-of-view cone. It ranges away from its sniper, opportunistically farms map shapes, and searches for tanks independently. A sighting creates only a short-lived contact relay. Destroy the spotter, leave its field of view, or outlast the contact memory and the sniper loses authorization to keep targeting you at remote range.

The intended long-range kill chain is now:

**Spotter searches → contact acquired → sniper turns and tracks → focus warnings → committed shot → recovery/reposition.**

That means information warfare itself becomes counterplay: notice the observer, evade its cone, destroy it, force the sniper to reacquire, suppress the firing position, or manipulate the committed aim.

### Second Body: Controller skill duel

v1.3.0 rebuilds the Controller lineage around the existing NOVA twin-stick controls. The left stick still moves the hull. The right stick also commands the swarm: **direction chooses the command bearing, analog stick depth chooses deployment distance, and release recalls the formation.**

Controller drones retain convenient autonomous shape farming, but PvP is no longer primarily nearest-target autopilot. Serious pressure is created by player decisions: position the Command Node, establish formation geometry, land the Controller gun to DESIGNATE a target, sequence readable attack runs, decide how deeply to commit the swarm, and recall before the hull becomes exposed.

Drone attacks use **form → wind up → commit trajectory → dive → overshoot → recover**. Opponents can read a wind-up, manipulate the pre-lock prediction, dodge after commitment, shoot down or interrupt drones, break through a weak formation, or punish the Controller while its swarm is overextended.

**Autonomy handles chores. The player handles violence.**

### Silent Horizon + Signal Bloom

v1.2.0 established the focus/quick-shot Railgun duel, off-screen glint/audio language, suppression, explicit Rail interception integrity, and swept projectile collision. v1.3.1 then added the segmented focus reticle, FOCUS READY feedback, enhanced Rail trails, RAIL DENIED confirmation, Controller formation previews, swarm-state visualization, DIVE BROKEN / EVADED feedback, richer procedural SFX, and selective mobile haptics.

Read the full doctrine: **[`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md)**  
See active development priorities: **[`ROADMAP.md`](./ROADMAP.md)**  
Browse release history: **[`RELEASES.md`](./RELEASES.md)**

## Current systems

- Branching tank lineages and evolutions
- Late-game Apex evolutions
- Cross-lineage gene splicing / hybridization
- Distinct weapon and combat archetypes
- Dedicated sniper AI with continuous focus and finite tracking
- Forward Observer spotter drones with independent field-of-view reconnaissance
- SPOTTED → focus-warning → Rail-shot information chain
- Focus / quick-shot Railgun skill system
- Segmented focus/readiness reticle and enhanced Rail trails
- Off-screen directional sniper threat cues and actual in-flight flyby SFX
- Projectile interception with swept collision for hypervelocity rounds
- Skill-based sniper suppression and advance windows
- Dedicated Rail interception / denial feedback
- Evolution-transition Rail reset, short safety grace, and automatic stat-tray collapse
- Twin-stick Controller **Swarm Vectoring** and analog Command Nodes
- Formation previews and live swarm-state visualization
- Controller target designation and formation-driven attack sequencing
- Distinct Wedge, Crescent, Phalanx, Ring, Claw, Fortress Wall and Cavalry Wing drone identities
- Telegraph → commitment → dodge/punish drone attack runs
- Readable drone interruption, impact and evasion feedback
- Defensive Controller/drone state invariant repair
- Procedural stereo combat and swarm SFX
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

### Latest — v1.4.0 · Forward Observer
- dedicated sniper AI instead of generic instant-reacquisition behavior
- continuous AI Rail focus: losing aim/contact cancels charge
- normal/elite AI focus times of roughly 0.82s / 0.70s plus post-shot recovery floors
- ordinary sniper hull sight; remote targets require spotter contact
- destructible Forward Observer drones with independent FOV search and shape farming
- short-lived contact relay rather than permanent remote lock-on
- **SPOTTED** cue followed by two-stage directional Rail focus warning
- actual in-flight Rail flyby crack near the player
- evolution menus clear hostile Rail focus before pause
- post-evolution safety grace and automatic stat-tray minimization
- Controller/drone state invariant repair
- deployment now syntax-checks every runtime overlay and validates release JSON

### v1.3.1 · Signal Bloom
- segmented Rail focus/readiness reticle and lock-ready SFX
- brighter Rail trails and RAIL DENIED feedback
- Command Node formation previews and live swarm-state display
- DIVE BROKEN / EVADED feedback and improved drone-impact feel

### v1.3.0 · Second Body
- right-stick Swarm Vectoring with analog deployment depth and release-to-recall
- autonomous shape farming, actively commanded PvP
- target designation and formation-driven attack runs
- unique Controller lineage formations and AI parity

### v1.2.0 · Silent Horizon
- focus / quick-shot Railgun system
- off-screen sniper threat cues
- suppression, explicit Rail integrity, and swept projectile interception

---

### **[▶ PLAY NOVA TANKS](https://magyarmex.github.io/fluffy-spork/)**
