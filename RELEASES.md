# NOVA TANKS — Release History

NOVA TANKS uses semantic-style versions and never reuses a released number. The lobby reads `nova-updates/releases.json`; this file is the fuller durable development ledger.

## v1.7.0 — Three Disciplines
**Released:** 2026-08-08  
**Theme:** Skill-expression rework for Gunner, Cannon and Guardian

### Gunner — Fire Discipline
- Gunner firing now builds explicit weapon heat instead of treating sustained fire as a flat optimum.
- A sustainable mid-heat **cadence window** rewards smooth tracking and controlled bursts.
- Large aim corrections lower stability; releasing and settling restores it.
- Excessive heat creates deterministic dispersion and stronger physical recoil rather than random jams/misses.
- Rotary weapons reward sustained but controlled cadence; shotgun descendants tighten their existing pellet pattern when fired from a stable state.
- AI Gunners accumulate the same heat/recoil and deliberately vent instead of receiving infinite perfect sustained fire.

### Cannon — Fire Control
- Cannon-line right-stick direction continues aiming normally while **right-stick depth programs detonation distance**.
- Desktop mouse distance maps to the same fuse concept.
- A visible orange FUSE reticle previews the programmed detonation point.
- Surviving Cannon projectiles airburst at their programmed distance while preserving native splash and cluster behavior.
- Direct collision still takes precedence over the fuse.
- Very short fuses are less efficient than properly armed space-control shots.
- Cannon blast placement compounds Battlefield's destructible-cover system and turns breach timing into a tactical choice.
- AI Cannon forms derive combat fuse distance from legitimate hunt-target distance and do not receive hidden future-position information.

### Guardian — Facing and Counterplay
- Guardian aim direction now also defines the tank's strongest **frontal armor arc**.
- Different Guardian descendants receive different defensive arc widths/strengths rather than a universal hidden reduction.
- Legacy BULWARK / IRON WILL 360-degree protection is replaced for Guardian forms with directional mitigation.
- The opening fraction of a defensive activation is a **Perfect Guard** timing window.
- A correctly faced/timed Perfect Guard negates the incoming attack and stores a **Countercharge**.
- The next Guardian projectile consumes Countercharge for a stronger/faster countershot, creating a read → defend → punish loop.
- Juggernaut, Meteor and Ravager gain Stampede momentum by preserving a significant straight-line movement commitment.
- Sharp turns drain momentum; Battlefield impacts dump most of it; body damage scales with earned charge.

### Presentation / controls
- No new combat button was added.
- Cyan heat/cadence arcs expose Gunner state.
- Orange fuse markers expose Cannon detonation programming.
- Pink frontal arcs expose actual Guardian facing/guard coverage.
- Countercharge and Stampede momentum are visible around the chassis.
- Added procedural cadence-lock, overheat, fuse-airburst, Perfect Guard, Countershot and charge-break sounds.

### Validation
- Added `tests/node/disciplines-v1.7.test.js`.
- Tests cover release wiring, deterministic Gunner cadence, Guardian directional arcs, Cannon fuse annotation, frontal-vs-rear Guardian mitigation, Perfect Guard counter storage, and Gunner heat/projectile state.
- Full project CI passed after integration on top of Battlefield and all earlier Sniper/Controller runtime layers.

See [`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md) for the full design doctrine and tuning priorities.

---

## v1.6.0 — Battlefield
**Released:** 2026-08-08  
**Theme:** Tactical terrain, line-of-sight, destructible cover, physical lanes, terrain-aware AI

### Battlefield geometry
- The previously open arena now instantiates one of three mirrored tactical layouts: **Crossfire**, **Split Horizon**, or **Four Gates**.
- Permanent rectangular fortifications and circular pillars create long sightlines, protected crossings, flank routes, side pockets, choke points and contested approaches without turning the arena into a corridor maze.
- Each layout also contains destructible barricades whose presence changes lane geometry during the run.
- Tank, shape and powerup spawning is terrain-aware and retries positions that would overlap solids.

### Real line-of-sight
- Automatic nearest-target selection ignores tanks hidden behind solid terrain.
- AI firing is denied when its current target is occluded by a wall or surviving barricade.
- Generic AI drops sustained occluded targets and rethinks instead of maintaining impossible through-wall pressure.
- Forward Observer relays are invalidated when terrain breaks the physical sightline between the active Observer and its reported target.
- Observer suspicion/search behavior is preserved: terrain hides an actual target without erasing the scout's reason to investigate that sector.

### Projectile / cover physics
- Projectiles test their full frame-to-frame segment against terrain before ordinary entity collision, preventing fast Rail and precision rounds from tunneling through narrow cover.
- Permanent terrain stops projectiles.
- Destructible barricades have explicit HP and absorb projectile and splash damage.
- Shells deal increased structural damage.
- A high-penetration shot can punch through only if **that same impact destroys the barricade**, costs additional penetration, and leaves projectile integrity remaining.
- Destroyed barricades become persistent non-blocking rubble rather than disappearing without feedback.
- Breaching cover awards a small XP reward to the responsible tank.

### Movement and pathing
- Player tanks, AI tanks, drones and moving neutral shapes resolve collisions against battlefield solids.
- Tank collision keeps tangential velocity so movement naturally **slides along cover** instead of feeling like an invisible hard stop.
- AI detects repeated terrain contact, flips/changes strafe intent and forces a rethink rather than endlessly driving into geometry.
- Controller drones remain terrain-bound during farming, defense, formation and manual Swarm Vectoring.
- A committed drone dash that contacts solid terrain is cancelled into recovery, preventing through-wall attack-run damage.
- Drones receive a small deterministic tangent deflection after terrain impact to help them route around corners instead of entering a new jitter loop.

### Sniper / Controller interaction
- Sniper hull sight, Observer sight and actual projectile path are now three distinct physical constraints.
- Cover can break a remote sniper information chain without requiring the Observer to die, creating real approach and relocation windows.
- Controller Command Nodes may still be placed beyond terrain, preserving the simple right-stick grammar, but the swarm must physically reach that space.
- Terrain therefore turns Controller formation placement and Sniper reconnaissance into map-geometry skills rather than purely radial-distance skills.

### Battlefield presentation
- Permanent structures and barricades use layered dark construction materials, shadows and neon rim lighting.
- Barricades develop visible crack patterns as HP falls, flash on impact, burst into particles/rings when breached and leave rubble footprints.
- Heavy terrain impacts can apply restrained camera feedback.
- Added procedural cover-hit, cover-breach and terrain-scrape SFX.
- A compact HUD strip names the current battlefield layout and reports remaining destructible cover.

### Validation
- Added `tests/node/battlefield-v1.6.test.js`.
- Tests verify v1.6 runtime wiring, rectangle line-of-sight blocking, swept thin-wall projectile collision, and terrain-aware safe-position queries.
- Deployment continues to syntax-check every runtime overlay and validate the release JSON before materialization.

---

## v1.5.1 — Swarm Discipline
**Released:** 2026-08-08  
**Theme:** Blackglass finish, coordinated drone autonomy, intelligent Forward Observers, lobby music, presentation fixes

### Blackglass mobile finish
- Portrait-mobile Blackglass was visually QA'd at narrow **390 px and 360 px** layouts and rebuilt around a horizontal dossier rail, shorter animated stage, clearer hierarchy, safe wrapping, aligned telemetry, and non-overlapping graft rows.
- Long class-role labels now truncate intentionally inside library cards rather than colliding with adjacent dossiers.
- Desktop retains the three-column library / animated stage / intelligence composition.

### Drone discipline
- Fixed the visible Controller drone dithering caused by the old hard farm/home boundary.
- Idle drones now keep persistent steering state and use different **return** and **resume-farming** thresholds, preventing frame-to-frame decision reversals.
- Friendly drones reserve different harvest shapes whenever alternatives exist instead of dog-piling the same object.
- Idle defensive drones automatically intercept nearby hostile combat drones.
- Forward Observer spotters are exempt from **automatic** drone defense so reconnaissance is not deleted by free aggro.
- A manually directed Controller swarm can still target and attack **any hostile drone, including spotters**.

### Forward Observer intelligence
- Observer search expands to roughly **700 units** with an approximately **149° cone** and a short all-around point-blank awareness bubble.
- The cone no longer spins aimlessly. Recent contacts and nearby hostile projectile trajectories create decaying **suspicion bearings** that rotate the sensor toward probable activity.
- Suspicion from gunfire is inferred from projectile direction rather than reading unseen enemy coordinates, preserving counterplay and information fairness.
- Without evidence, Observers perform deliberate sector sweeps and wide patrol passes instead of staring in arbitrary directions.
- While suspicious, the drone shifts its patrol position toward the suspected sector and keeps searching after a contact disappears.
- Shape harvesting remains opportunistic while the Observer searches.
- Player snipers receive a clearer cyan relay: on-screen target reticles, dashed relay lines where useful, or an off-screen **CONTACT** marker with distance.
- Hostile AI relays provide readable **SPOTTED / OBSERVER** information so defenders can understand the reconnaissance chain and decide whether to hunt the scout.

### Lobby / showroom score
- Added a distinct procedural NOVA lobby theme with a repeatable syncopated hook, neon bass pulse, restrained drums and synth layers.
- Opening Blackglass smoothly morphs the same musical identity into a more crystalline, analytical intelligence-room variation rather than abruptly changing tracks.
- The score respects existing SOUND OFF / MUSIC OFF settings and browser/mobile autoplay restrictions.

### Presentation
- The rotated purple sniper threat indicator keeps rotating normally, but its **SHOT** label is now rendered screen-upright.

---

## v1.5.0 — Blackglass Showroom
**Released:** 2026-08-08  
**Theme:** Animated class library, combat telemetry, build inspection, trait-graft simulation

- The compact Evolution Tree became an expandable **Tank Intelligence & Showroom** embedded directly in the lobby.
- All 36 tanks gained dossiers with lineage/evolution context, unique catchphrases, tactical descriptions, abilities, and real class telemetry.
- The selected tank is rendered as a live animated chassis from canonical hull, barrel, weapon and drone data.
- The **Foreign Trait Graft Lab** computes build-specific before → after changes for legal foreign lineage genes.

---

## v1.4.1 — Violet Doctrine
**Released:** 2026-08-07

- Forward Observer reconnaissance/counterplay doctrine expanded to every purple tank: Marksman, Railgun, Ghost, Singularity, Prism Rail, Specter and Assassin.
- Non-beam purple forms gained their own precision dwell, staged warnings, suppression, flyby readability, reveal and recovery profiles.
- Rail forms retained beam-specific focus, quick-shots, integrity and projectile interception.
- Destroying the active Observer causes meaningful temporary remote-relay downtime.

---

## v1.4.0 — Forward Observer
**Released:** 2026-08-07

- Fixed banked AI Rail focus and instant reacquisition.
- Sniper AI now uses sampled motion, finite turret tracking, continuous focus and recovery.
- Long-range sniper acquisition requires a destructible Forward Observer instead of privileged sight range.
- Evolution transitions clear hostile focus, minimize the upgrade tray and give brief re-entry protection.
- Added Controller/drone invariant repair and deployment syntax/JSON validation.

---

## v1.3.1 — Signal Bloom
**Released:** 2026-08-07

- Added segmented Rail focus feedback, enhanced Rail trails and **RAIL DENIED**.
- Added Controller formation previews, swarm-state visualization, **DIVE BROKEN / EVADED**, richer procedural SFX and selective haptics.

---

## v1.3.0 — Second Body
**Released:** 2026-08-07

- Controller right-stick direction commands swarm bearing; analog depth sets deployment distance; release recalls.
- Added Command Nodes, designation, distinct formations, attack wind-up, trajectory commitment, dive, overshoot and recovery.
- Established the Controller doctrine: **Autonomy handles chores. The player handles violence.**

---

## v1.2.0 — Silent Horizon
**Released:** 2026-08-07

- Added Rail focus-to-fire, weaker quick-shots, aim commitment, directional off-screen warnings, suppression and post-shot reveal.
- Added explicit Rail interception integrity and swept projectile-vs-projectile collision.

---

## v1.1.0 — Drone Age

- Drones entered NOVA TANKS as persistent arena entities with health, targeting, respawning and combat behavior.
- Controller builds gained hunter swarms as their defining identity.

---

## v1.0.0 — First Deployment

- Initial playable NOVA TANKS release.
