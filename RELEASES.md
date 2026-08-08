# NOVA TANKS — Release History

This file is the durable source-controlled release ledger for the living NOVA TANKS game. Public versions use `MAJOR.MINOR.PATCH` numbering and are never reused.

## v1.4.1 — Violet Doctrine
**Released:** 2026-08-07  
**Theme:** Full purple-lineage sniper doctrine, non-beam precision commitment, observer-denial counterplay

### Lineage-wide reconnaissance
- **Marksman, Railgun, Ghost, Singularity, Prism Rail, Specter, and Assassin** now explicitly share the same Forward Observer doctrine.
- Every purple AI tank is limited to ordinary **720-unit direct hull vision**. Targets outside that distance require a valid observer contact.
- Forward Observer information remains approximate combat authorization rather than automatic aim for the player.
- The shared sniper identity is now reconnaissance, information control, finite acquisition, readable commitment, and punishability — not simply “has a Rail beam.”

### Non-beam precision commitment
The non-beam purple tanks no longer fire instantly when generic aim alignment happens to pass. They build a short continuous precision solution before long-range shots:

- **Marksman:** 0.42 s remote sight dwell; deliberate baseline precision rifle.
- **Ghost:** 0.34 s remote ambush dwell; faster commitment and shorter reveal to preserve cloak/phase identity.
- **Specter:** 0.24 s remote hunt dwell; fastest precision cycle and shortest recovery for repeated angle creation.
- **Assassin:** 0.54 s remote execution dwell; longest commitment and strongest reveal/recovery cost to support its heavy alpha strike.

Within direct sight these dwell times shorten, so successfully closing distance changes the matchup instead of simply disabling the purple tank.

- Switching targets resets preparation.
- A meaningful gap in firing intent resets preparation.
- Losing remote observer authorization resets preparation.
- Accurate hits or close threatening suppression can break preparation.
- Each successful shot has a class-specific minimum recovery and brief firing-bearing reveal.

### Warning and projectile language
- Marksman, Ghost, Specter, and Assassin receive two-stage directional pre-shot warning SFX when preparing dangerous distant attacks against the player.
- Late commitment uses class-flavored **SIGHT LOCK**, **AMBUSH LOCK**, **HUNT LOCK**, and **EXEC LOCK** cues.
- Off-screen preparation gets restrained purple edge indicators without revealing exact coordinates.
- Non-beam sniper projectiles receive readable violet motion trails.
- A precision round passing close to the player produces a true trajectory-based flyby sound.
- Committed non-beam shots briefly expose their firing bearing, preserving the **read → survive → take initiative** loop established by Silent Horizon.

### Forward Observer denial
- Destroying the active Forward Observer now causes approximately **3.4 seconds of observer-relay downtime**.
- A spare escort may physically continue operating, but the sniper cannot consume remote contacts during relay reboot.
- The sniper remains fully capable inside ordinary direct sight, so destroying the observer removes remote information rather than switching the weapon off.
- Player purple tanks receive **OBSERVER DOWN · LOCAL SIGHT ONLY**, a relay countdown, and **OBSERVER LINK RESTORED** feedback.
- Shooting the observer therefore creates a genuine approach/repositioning window instead of merely causing another escort to inherit the SPOT label immediately.

### Rail identity preserved
- **Railgun, Singularity, and Prism Rail** keep the deeper beam-specific mechanics from Silent Horizon and Forward Observer: focus-to-fire, charge-scaled quick shots, beam aim commitment, explicit Rail projectile integrity, swept interception, Rail-denial feedback, and Rail-specific warning/flyby behavior.
- Violet Doctrine deliberately does **not** make every purple class a Railgun. It spreads the information/counterplay doctrine while keeping weapon cadence and class mastery distinct.

---

## v1.4.0 — Forward Observer
**Released:** 2026-08-07  
**Theme:** Sniper AI correction, reconnaissance, evolution safety, drone stability

### Root-cause fix
- The original Silent Horizon AI focus implementation used wall-clock time beginning on the first Rail firing attempt. If an AI stopped maintaining firing intent or alignment, that timestamp could survive. Reacquiring the player later could therefore jump straight to a fully charged Rail shot.
- v1.4.0 replaces sniper-lineage combat AI with a dedicated tracking/firing loop whose charge is accumulated only while a valid firing solution is continuously maintained.
- Losing aim, suppression, target authorization, or remote spotter contact resets the stored Rail focus instead of banking it invisibly.

### Sniper AI
- Sniper-lineage AI now uses sampled target motion rather than frame-perfect continuous target knowledge.
- Turret tracking has finite turn rates that become more restrictive during deeper Rail focus.
- Normal AI Railguns require roughly **0.82 s** of continuous qualified focus for a full combat shot; elite AI uses roughly **0.70 s**.
- After firing, normal AI receives at least **1.60 s** of recovery before another full cycle; elite AI receives at least **1.35 s**.
- AI must remain sufficiently aligned throughout the focus sequence. A sustained loss of alignment cancels the attempt.
- Elite snipers gain better sampling/prediction and faster but still finite execution rather than extra information or instantaneous lock-on.

### Forward Observer reconnaissance
- Sniper hulls no longer receive exceptional long-range sight through the generic AI vision bonus. Their direct target acquisition is intentionally bounded to ordinary combat distance.
- One real drone in every sniper squad becomes a **Forward Observer**.
- The observer receives an extended patrol leash and wide roaming orbit, allowing it to search away from the sniper.
- It has its own rotating field-of-view cone and independently detects tanks inside that cone.
- It opportunistically attacks nearby map shapes while scouting, preserving useful autonomous farming behavior.
- A successful sighting produces only a short-lived contact relay. Remote target authorization expires if the observer loses the target and is immediately lost if the observer is destroyed.
- Player snipers can use observer contacts as information, but the spotter does not aim or fire the player's weapon for them.
- Spotters are visually identifiable and destructible, making remote sniper vision itself contestable gameplay.

### Warning / counterplay
- Being acquired by a hostile Forward Observer produces a **SPOTTED** cue before the Rail firing sequence begins.
- Rail focus aimed at the player now produces two distinct directional warning stages instead of relying on a warning that could coincide with the shot.
- The stronger second stage includes a mobile-readable edge indicator and **RAIL FOCUS** cue before release.
- An actual Rail projectile passing near the player produces an in-flight flyby crack based on its trajectory rather than only a sound at firing time.
- Movement feints, suppression, breaking observer contact, destroying the observer, projectile interception, and pressure all participate in the same counterplay chain.

### Evolution / UI safety
- Opening an evolution milestone clears hostile banked Rail focus before the game pauses.
- Applying a class evolution, mastery perk, gene splice, or dismissing the choice clears stale firing input and forces enemy Rail snipers to reacquire.
- Combat resumes with approximately **1.8 s** of temporary player protection so a menu transition cannot become an unavoidable Rail hit.
- The large stat-upgrade tray is automatically minimized after an evolution choice so mobile players are not returned to combat behind an obstructive upgrade panel.

### Controller / drone stability
- Controller drones now receive an invariant repair pass for invalid position/HP values, impossible phases, dead/stale attack targets, invalid dash vectors, and corrupt Command Node coordinates.
- Broken states recover into a safe formation/recovery state rather than remaining stuck or propagating invalid movement.
- The Second Body command/formation/attack-run mechanics are otherwise preserved.

### Deployment validation
- The materialization workflow now runs `node --check` against every `nova-updates/*.js` runtime overlay before rebuilding the playable page.
- `nova-updates/releases.json` is JSON-validated during deployment.
- The v1.4.0 runtime materialized successfully after these gates.

---

## v1.3.1 — Signal Bloom
**Released:** 2026-08-07  
**Theme:** Sniper/Controller polish, graphics, SFX, mobile readability, mastery feedback

### Sniper polish
- Rail focus now shows a **segmented charge reticle**, live charge percentage, and a distinct **FOCUS READY** state.
- Reaching full focus gives a restrained procedural lock-ready sound and tiny supported-device haptic confirmation.
- Hypervelocity Rail projectiles gain brighter, longer luminous trails and a sharper spear-like core so their motion is easier to read without making the projectile slower.
- Rail interception gains dedicated electromagnetic/metallic collision SFX, brighter impact blooms, and stronger destruction feedback.
- When the player successfully destroys an incoming Rail round through projectile interception, NOVA displays **RAIL DENIED** as explicit skill confirmation.

### Controller polish
- Active **Command Nodes preview the current formation geometry** rather than behaving only as destination markers.
- The node includes a compact live squad-state display showing linked drone count and whether drones are forming, arming, diving, or recovering.
- Committed hostile drone attacks against the player receive a restrained extended trajectory cue to improve readability on mobile after commitment has already occurred; pre-commit prediction remains hidden.
- Hitting an enemy drone during interruptible wind-up produces distinct **DIVE BROKEN** audiovisual confirmation.
- Correctly evading a close committed AI drone pass produces restrained **EVADED** feedback, a near-miss flyby, ring, and tiny haptic confirmation.
- Successful drone impacts gain heavier procedural impact audio, flash response, and context-sensitive camera feedback.

### Audio / feel
- Added procedural stereo-capable SFX for focus readiness, Rail interception, drone impact, drone interruption, and committed-dive near misses.
- High-frequency events are throttled so swarm battles remain readable rather than becoming continuous audio clutter.
- Mobile haptics remain deliberately short and selective.

---

## v1.3.0 — Second Body
**Released:** 2026-08-07  
**Theme:** Controller skill expression, twin-stick swarm command, formation tactics, readable drone combat

### Player-facing highlights
- The Controller lineage treats its drone swarm as a **second body** rather than autonomous pets.
- **Right-stick direction commands swarm bearing; right-stick depth sets deployment distance; releasing the stick recalls the squadron.** The hull remains on the left stick.
- Desktop follows the same grammar: hold fire to command toward the cursor, cursor distance controls deployment depth, release recalls.
- Autonomous behavior remains for farming map shapes, while serious PvP pressure requires player command.
- Controller gun hits briefly **DESIGNATE** a target.

### Drone combat / counterplay
- PvP attack runs use **form → wind up → commit trajectory → dive → overshoot → recover**.
- Before trajectory commitment, defenders can manipulate the dive with movement feints.
- After commitment, the attacker stops perfectly tracking, creating an execution-based dodge window.
- Shooting a drone during wind-up cancels the attack and forces recovery.
- Once a drone launches, recall cannot erase the commitment.
- Drone dash collision uses swept path checks.
- Drones retain real hull HP and respawn delay.

### Lineage mastery
- **Drone Carrier — Wedge**
- **Overlord — Crescent**
- **Warden — Phalanx**
- **Hivemind — Ring**
- **Broodmother — Claws**
- **Citadel — Fortress Wall**
- **Valkyrie — Cavalry Wing**

### Design principle
**Autonomy handles chores. The player handles violence.**

---

## v1.2.0 — Silent Horizon
**Released:** 2026-08-07  
**Theme:** Sniper counterplay, off-screen readability, skill expression, combat audio

### Player-facing highlights
- Railgun, Singularity, and Prism Rail use a **focus-to-fire** interaction for full-power shots.
- Releasing early produces a weaker **quick-shot**.
- Deep focus progressively limits turret agility.
- Off-screen enemy Rail snipers can produce a restrained directional screen-edge glint.
- Full Rail attacks gain directional charge, rail-crack, flyby, and firing SFX.
- Full-power shots briefly reveal their firing bearing.
- Accurate direct or near-miss **suppression** can break deep focus.

### Counterplay / physics
- Rail projectiles use explicit interception integrity rather than inheriting extreme durability from tank penetration.
- Projectile-vs-projectile collision uses swept relative-motion collision.
- Intended tempo: **detect → manipulate → survive/intercept → exploit recovery → advance**.

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
