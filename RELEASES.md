# NOVA TANKS — Release History

This file is the durable source-controlled release ledger for the living NOVA TANKS game. Public versions use `MAJOR.MINOR.PATCH` numbering and are never reused.

## v1.3.0 — Second Body
**Released:** 2026-08-07  
**Theme:** Controller skill expression, twin-stick swarm command, formation tactics, readable drone combat

### Player-facing highlights
- The Controller lineage now treats its drone swarm as a **second body** rather than a collection of autonomous pets.
- **Right-stick direction commands swarm bearing; right-stick depth sets deployment distance; releasing the stick recalls the squadron.** The hull remains on the left stick.
- Desktop follows the same grammar: hold fire to command toward the cursor, cursor distance controls deployment depth, release recalls.
- A visible **Command Node**, tether and engagement zone communicate where the swarm is being asked to operate.
- Autonomous behavior remains for farming map shapes, while serious PvP pressure requires player command.
- Controller gun hits briefly **DESIGNATE** a target, rewarding aim with stronger swarm coordination without creating permanent lock-on.

### Drone combat / counterplay
- Controller hunters no longer simply select the nearest player, fly directly into them and repeat contact damage.
- PvP attack runs now use a readable sequence: **form → wind up → commit trajectory → dive → overshoot → recover**.
- Before trajectory commitment, defenders can manipulate the dive with movement feints.
- After commitment, the attacker stops perfectly tracking, creating an execution-based dodge window.
- Shooting a drone during wind-up cancels the attack and forces recovery.
- Once a drone launches, recall cannot erase the commitment; the attack must resolve before the drone returns.
- Drone dash collision uses swept path checks so high-speed hits are determined by geometry rather than frame alignment.
- Drones retain real hull HP, can be shot down, and take time to respawn, so careless deployment has persistent cost.
- Extending the swarm leaves the Controller hull less protected, creating a natural punish window for opponents who break through the formation.

### Lineage mastery
- **Drone Carrier — Wedge:** three responsive hunters teach command depth, spacing, timing, recall and designation.
- **Overlord — Crescent:** six hunters establish far-side pressure around a target; attack scheduling alternates sides to create encirclement and escape-lane decisions.
- **Warden — Phalanx:** four armored hunters form a movable line that can physically screen firing lanes; correct orientation matters more than passive HP.
- **Hivemind — Ring:** nine hunters arrange into a rotating surround, creating a high ceiling around spacing, cascading attacks and avoiding overextension.
- **Broodmother — Claws:** twin attack arcs and sacrificial logic preferentially commit temporary or damaged brood, making attrition itself a tactical resource.
- **Citadel — Fortress Wall:** six heavy drones produce a slower, denser defensive screen with strong lane control and deliberate repositioning.
- **Valkyrie — Cavalry Wing:** five very fast hunters have the shortest wind-up and recovery and the fastest committed dives, rewarding rapid command changes while making bad commits punishable.

### Existing abilities integrated
- **Swarm** still creates temporary hunters, while also extending command reach, improving repositioning and tightening attack cadence.
- Temporary Swarm drones are preferentially used for dangerous attack commitments where appropriate.
- **Bulwark** improves Warden/Citadel phalanx response and tightness rather than existing as an unrelated defensive button.

### AI parity
- AI Controllers use the same Command Node, formation placement, wind-up, late trajectory lock, committed dive, recovery, drone HP and recall language as players.
- Normal Controller AI uses less prediction and slower command tracking.
- Elite Controller AI gains strength through better prediction and positioning rather than impossible instant execution.
- Fleeing Controller AI can place its swarm as a defensive screen instead of merely running with six autonomous attackers attached.

### Audio / presentation
- New procedural command chirp, recall tone, designation ping, drone wind-up and launch/whip SFX.
- Command Node and engagement zone are visible without adding another control surface.
- Off-screen Command Nodes receive a screen-edge marker.
- Winding-up drones show a charge ring; late commitment shows the fixed dive vector; launched drones leave a readable dash trail.
- Designated targets receive a temporary reticle, and a player designated by an AI Controller receives readable warning feedback.
- Warden/Citadel drone walls receive subtle formation links to make their orientation legible.
- Evolving into the Controller lineage briefly teaches the full input grammar in-game.

### Validation
- Runtime JavaScript syntax validation passed.
- Mocked-engine tests verified analog command depth, recall behavior, autonomous shape farming without autonomous PvP, gun-hit designation, wind-up interruption and Controller-gene compatibility.
- A simulated duel produced roughly **207 damage against a stationary defender versus 44 damage against a defender that reacted only after the visible trajectory commitment**, confirming that the attack-run model creates meaningful post-read counterplay in the test harness.
- Full browser/mobile playfeel still requires live playtesting and tuning; the numbers above are behavior tests, not a balance guarantee.

### Design principle
**Autonomy handles chores. The player handles violence.**

The Controller's mastery problem is intentionally different from ordinary aim classes: multitasking, geometry, formation placement, target manipulation, attack sequencing, risk management and controlling two positions at once.

---

## v1.2.0 — Silent Horizon
**Released:** 2026-08-07  
**Theme:** Sniper counterplay, off-screen readability, skill expression, combat audio

### Player-facing highlights
- Railgun, Singularity, and Prism Rail now use a **focus-to-fire** interaction for full-power shots.
- Releasing early produces a weaker **quick-shot**, preserving close-range and counter-bait skill expression.
- Deep focus progressively limits turret agility, so movement feints can beat committed aim and skilled snipers can counter-predict those feints.
- Off-screen enemy rail snipers can produce a restrained **directional screen-edge glint** when deeply focused near the player's firing lane.
- Full rail attacks gain new **directional charge, rail-crack, flyby, and firing SFX**, synthesized in Web Audio with no external sound assets.
- Supported mobile devices receive a very short restrained vibration cue for a dangerous off-screen committed rail shot.
- Full-power shots briefly reveal their firing bearing, creating an earned advance window after a successful dodge or interception.
- Accurate direct or near-miss **suppression** can break deep focus; random distant spam is not intended to be an effective counter.

### Counterplay / physics
- Rail projectiles now use explicit interception integrity rather than inheriting extreme durability from their tank-penetration stat.
- Full normal rail integrity is 20; supercharged full rails use 27; quick-shot integrity scales with charge.
- Projectile-vs-projectile collision now uses swept relative-motion collision, preventing hypervelocity rounds from tunneling through a correctly placed defensive bullet stream between frames.
- Surviving a committed shot is intended to create tempo: **detect → manipulate → survive/intercept → exploit recovery → advance**.

### Sniper skill expression
- Full focus takes approximately 520 ms.
- Early focus retains high aim freedom; deeper focus progressively commits the barrel direction.
- Quick-shots scale damage, velocity, penetration, projectile integrity, and recovery according to charge.
- A rushed sniper retains outplay routes through prediction, quick-shot timing, repositioning, and terrain rather than being disabled by a hard anti-sniper mechanic.

### AI
- AI rail snipers use the same focus pipeline as the player and therefore inherit focus time and aim commitment rather than bypassing the interaction with instant full-power fire.
- Off-screen AI attacks use the same directional warning language intended for human-readable counterplay.

### Audio / presentation
- New procedural stereo charge cue.
- New layered full Railgun discharge: low impulse, metallic rail crack, high-frequency snap, and noise transient.
- New quick-shot report.
- New directional incoming/flyby crack.
- Glint and post-shot bearing cues scale subtly with focus/reveal state instead of showing exact sniper coordinates.

### Validation
- JavaScript syntax validation passed for the runtime update.
- Mocked-engine behavior tests passed for full-focus timing, quick-shot scaling, explicit rail integrity, and swept projectile interception.
- NOVA materialization workflow completed successfully.
- GitHub Pages build completed with no reported deployment error.

### Known follow-up work
- Playtest and tune focus duration, suppression radius, quick-shot curves, and rail integrity against real mobile combat.
- Add richer arena geometry, line-of-sight breaks, and flank routes so approaching a sniper gains more map-level skill expression.
- Expand lineage-specific approach tools only where they create soft counterplay rather than hard class counters.
- Continue improving sniper AI prediction/repositioning so elite difficulty comes from decisions instead of impossible execution.

---

## v1.1.0 — Drone Age
**Theme:** Drones and the expanded evolution arena

### Player-facing highlights
- **Combat drones entered NOVA TANKS**, establishing hunter and escort units as persistent arena entities.
- Controller builds gained drone swarms as their defining combat identity.
- Drones gained their own health, targeting, respawning, movement and combat behavior.
- The enhanced evolution line expanded into branching Tier-2 ultimates and Tier-3 Apex descendants.
- Gene Splicing, mastery and AI evolution parity established the late-game progression architecture used by later releases.

---

## v1.0.0 — First Deployment
**Theme:** Game start

### Player-facing highlights
- Initial playable release of **NOVA TANKS**.

---

The in-game lobby reads the canonical version history from `nova-updates/releases.json`, while this file keeps the fuller durable release ledger for development and future autonomous updates.
