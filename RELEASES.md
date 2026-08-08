# NOVA TANKS — Release History

NOVA TANKS uses semantic-style versions and never reuses a released number. The lobby reads `nova-updates/releases.json`; this file is the fuller durable development ledger.

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
