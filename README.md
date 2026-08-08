# NOVA TANKS

**An evolving browser-based tank arena game.** Build your tank, choose a lineage, evolve into increasingly specialized forms, splice traits across lineages, and survive an arena that keeps getting more dangerous.

## ▶️ PLAY NOW

### **[Launch NOVA TANKS →](https://magyarmex.github.io/fluffy-spork/)**

No install required — play directly in a modern browser on desktop or mobile.

**Current release: v1.7.2 · Combined Arms** — Battlefield and Three Disciplines now interact as one system: explosions respect cover, AI routes around terrain and remembers only legitimately seen positions, Cannons preview real wall impacts and can intentionally breach, Controller drones route around corners, and Blackglass is hard-contained on portrait phones.

---

## About

NOVA TANKS is a fast browser arena game built around progression, specialization, hybridization, and increasingly powerful tank builds. It is also a living project that continues evolving across gameplay, AI, maps, graphics, audio, performance, mobile usability, quality of life, balance, controls, progression, and larger multi-release systems.

## Core design philosophy: skill expression

NOVA TANKS should be a game **riddled with skill expression**. Powerful mechanics should create opportunities to read, respond, outplay, and punish rather than producing unavoidable stat-check outcomes.

Every major system is expected to be evaluated for skill ceiling, readability, counterplay, positioning, prediction, timing, execution, punish windows, and two-sided mastery.

### v1.7.2 · Combined Arms

This patch continues both the v1.6 Battlefield and v1.7 Three Disciplines tracks by making the systems interact instead of behaving as separate overlays.

**Battlefield intelligence**
- AI tanks predict short-range terrain collisions and choose local corner waypoints before grinding into walls.
- AI remembers the last position where it actually had line-of-sight to an opponent, investigates that location briefly, and does **not** update hidden coordinates until legitimate reacquisition.
- Controller drones use the same short-horizon corner routing during formation, farming, defense and recall. Locked attack dives remain committed and still crash into cover.
- Cannons can deliberately fire at a destructible barricade blocking a recent legitimate contact instead of pretending they can target through it.

**Cover physics**
- Hard cover now occludes splash damage as well as direct projectiles and sight.
- Hull exposure is sampled across the target so a tank peeking around a wall can receive partial blast damage without taking full explosion damage through solid cover.
- Guardian Countershots gain modest structural pressure, allowing a successful defensive read to convert into limited map-opening pressure without replacing Cannon breach identity.

**Cannon × Battlefield**
- The orange fuse display now distinguishes the desired **FUSE** point from the actual earlier **IMPACT** point when terrain blocks the programmed distance.
- Destructible-cover impact previews include current cover integrity.
- Apex Cannon structural specialization continues through Battlefield's canonical cover break, rubble, XP and audiovisual feedback systems.

**Blackglass containment**
- Fixed the portrait regression shown on real Android hardware where the old three-column desktop dossier could reappear and overflow beyond the phone screen.
- The root cause was stylesheet order: the historical mobile polish loaded before the base showroom stylesheet was injected at DOMContentLoaded, allowing the base rules to win later.
- Portrait/coarse-pointer devices now force a true bounded single-column layout: dossier rail → animated chassis → identity → telemetry → trait graft lab.
- Hard width/min-width/overflow constraints keep cards, stats, descriptions and graft rows inside the viewport, and the containment stylesheet automatically reasserts itself after the base showroom stylesheet appears.

### v1.7.1 · Apex Doctrine

The Tier-3 descendants of the Three Disciplines no longer behave mainly like larger versions of their parents.

**Gunner Apexes**
- **Tempest:** broad high-output redline; overshooting it causes harsh recoil/recovery.
- **Needle Storm:** narrow heat + stability precision gate for harder, faster ranged needles.
- **Breachlord:** settled brace volley followed by a short punishable movement-recovery window.
- **Flakmaster:** stability converts into tighter, faster, longer-lived ranged flak.

**Cannon Apexes**
- **Cluster King:** fuse depth controls child-bomb sector width as well as burst distance.
- **Siege Bomber:** true structural pressure against destructible Battlefield cover.
- **Annihilator:** deep fuse commitment buys stronger blast authority but increases the reload opening.
- **Quake Cannon:** deeper programming increases displacement and shock geometry rather than simply inflating damage.

**Guardian Apexes**
- **Bastion:** nearly stationary frontal anchoring; moving or flanking breaks the posture.
- **Aegis:** a successful Perfect Guard creates a brief mobility-flow window for repositioning.
- **Meteor:** highest straight-line Stampede peak and harsh steering loss.
- **Ravager:** lower peak impact but greater momentum retention through moderate steering.

The patch also repairs a v1.7.0 integration gap: Cannon projectiles already carried structural specialization metadata, but Battlefield had not been consuming it. Siege pressure now reaches destructible cover while the normal Battlefield breach/rubble/feedback path remains authoritative.

### v1.7.0 · Three Disciplines

The three legacy combat lineages received the same skill-expression treatment already applied to Sniper and Controller.

**Gunner — Fire Discipline**
- Gunner weapons build heat while firing and cool when released.
- The middle of the heat range is a sustainable **cadence window**; stable aim there produces the best ballistic control.
- Excessive heat creates deterministic dispersion and physical recoil instead of random weapon failure.
- Shotgun descendants tighten their existing pellet distribution when fired from a stable state, while panic-spam pushes the hull and cone farther off line.
- AI Gunners obey the same heat/recoil model and must vent after exceeding a sustainable state.

**Cannon — Fire Control**
- Right-stick direction still aims normally.
- Right-stick depth programs the shell's detonation distance; mouse distance is the desktop equivalent.
- A visible **FUSE** reticle previews the burst point.
- If a Cannon projectile reaches that point without colliding first, it airbursts while preserving its native splash or cluster behavior.
- Battlefield cover makes blast placement and breach decisions part of Cannon mastery instead of merely an obstacle to shooting.

**Guardian — Facing and Counterplay**
- Guardian aim direction also determines its strongest frontal armor facing.
- BULWARK and IRON WILL are directional defensive states rather than legacy 360-degree immunity/reduction.
- The opening fraction of a defensive activation is a **Perfect Guard** window. A correctly faced/timed block negates the attack and stores a **Countercharge** for the next shot.
- Juggernaut, Meteor and Ravager build Stampede impact by maintaining a clean straight movement line; sharp turns and terrain impacts dump momentum.

The rework uses the existing control budget. There are no extra combat buttons.

See the full system reference in **[`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md)**.

### v1.6.0 · Battlefield

NOVA no longer takes place in a nearly featureless open square. Each run uses one of three mirrored tactical layouts — **Crossfire, Split Horizon, or Four Gates** — built from permanent fortifications, pillars and destructible barricades.

Battlefield geometry is mechanical, not cosmetic:

- solid terrain blocks tanks, drones, neutral shapes and projectiles;
- tank collision resolves into sliding rather than a hard stop, preserving fluid twin-stick movement around corners;
- projectiles use swept terrain tests, so Rail and other fast rounds cannot tunnel through thin walls between frames;
- permanent fortifications stop shots;
- destructible barricades absorb projectile and splash damage, visibly crack, can be breached, and leave persistent non-blocking rubble;
- sufficiently penetrating rounds may punch through only when their own impact actually destroys the cover and enough projectile integrity remains;
- tank, shape and powerup spawn locations avoid solid terrain.

**Line-of-sight is a game system.** Automatic target acquisition and AI firing authorization respect cover. Sniper hull sight and Forward Observer contacts also obey terrain LoS. Controllers can command beyond cover, but their drones must physically occupy the space.

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
- Predictive short-horizon AI and drone corner routing around visible Battlefield geometry
- Legitimate last-seen AI memory without hidden-coordinate tracking
- Swept projectile-vs-terrain collision for hypervelocity rounds
- Blast occlusion and partial hull exposure around hard cover
- Breachable cover, projectile punch-through rules and persistent rubble
- Gunner heat, cadence, deterministic recoil and Apex redline/precision/brace specializations
- Cannon analog programmable fuses, terrain-aware IMPACT previews and Apex sector/siege/commitment specializations
- Guardian directional armor, Perfect Guard, Countershot, anchoring and differentiated ram momentum
- Branching tank lineages and late-game Apex evolutions
- Cross-lineage gene splicing / hybridization
- Expandable 36-class **Tank Intelligence & Showroom**
- Animated class previews generated from canonical hull/barrel/weapon/drone data
- Per-class catchphrases, evolution paths, tactical descriptions and telemetry
- Foreign Trait Graft Lab with build-specific before → after effects
- Hard-contained desktop/mobile Blackglass inspection layout with portrait touch fallback
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
- Procedural stereo combat, sniper, observer, swarm, terrain, discipline and lobby/showroom audio
- Selective mobile haptics for high-value combat events
- AI-controlled enemy tanks that progress alongside the player while obeying major combat-language constraints
- Desktop and mobile browser play
- GitHub Pages deployment
- In-lobby version history and ongoing versioned development
- Runtime JavaScript, release-data, Battlefield, Three Disciplines, Apex Doctrine, Combined Arms and Blackglass containment regression validation in CI

## Live game

**Play:** https://magyarmex.github.io/fluffy-spork/

The `main` branch is the canonical development branch. GitHub Pages serves the current playable release.

## Releases

NOVA TANKS uses semantic-style version numbers (`MAJOR.MINOR.PATCH`).

### Latest — v1.7.2 · Combined Arms
- predictive local terrain routing for AI tanks and Controller drones
- short legitimate last-seen investigation memory without hidden target tracking
- splash damage occluded by hard cover with partial exposure sampling
- terrain-aware Cannon FUSE → IMPACT preview and intentional cover breaching
- Guardian Countershots receive limited structural pressure
- definitive portrait Blackglass containment and stylesheet-order repair
- new Combined Arms and showroom-containment regression tests

### v1.7.1 · Apex Doctrine
- Tempest redline, Needle Storm precision gate, Breachlord brace/recovery and Flakmaster ranged stability
- Cluster King programmable child-bomb sectors, Siege structural pressure, Annihilator commitment/reload trade and Quake displacement programming
- Bastion lane anchoring, Aegis Perfect Guard mobility flow, Meteor peak commitment and Ravager flexible momentum
- repaired Cannon structural specialization against Battlefield cover

### v1.7.0 · Three Disciplines
- Gunner heat/cadence/recoil/stability discipline
- Cannon right-stick-depth fuse programming and visible airburst placement
- Guardian frontal armor and directional BULWARK / IRON WILL
- Perfect Guard → Countershot punish loop
- Juggernaut-line straight-line Stampede momentum
- AI parity for all three combat languages

### v1.6.0 · Battlefield
- Crossfire, Split Horizon and Four Gates tactical layouts
- permanent walls/pillars plus destructible cover and rubble
- real line-of-sight for AI, aim acquisition and Observer relay
- swept projectile-vs-terrain collision
- tank/drone/shape terrain collision and sliding
- AI anti-stuck/path response around fortifications
- Controller attack-run and Sniper reconnaissance integration
- terrain-aware spawns, cover visuals and procedural SFX

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