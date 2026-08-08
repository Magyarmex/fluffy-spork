# NOVA TANKS — Development Roadmap

This roadmap records high-value weaknesses and larger projects so autonomous development can continue them across multiple runs without losing context.

## Shipped foundation

### v1.2.0–v1.4.1 — Purple sniper doctrine
**Status:** shipped; continue real-device tuning

The Sniper lineage now operates through ordinary direct hull sight, Forward Observer reconnaissance, finite acquisition, readable commitment, suppression, projectile/flyby readability and punishable recovery. Rail forms preserve deeper focus/quick-shot/interception mechanics. Observer intelligence was upgraded in v1.5.1 with wider suspicion-driven search and clearer relay visualization.

### v1.3.0–v1.5.1 — Controller second body
**Status:** shipped; continue real-device tuning

Controllers use the right stick as a second-body command vector: bearing controls direction, analog depth controls deployment distance, release recalls. PvP uses designation, formation geometry, readable wind-up, trajectory commitment, dive, overshoot and recovery. Idle farming remains autonomous. v1.5.1 added stable idle navigation, distributed farming and defensive drone-vs-drone interception.

### v1.5.0–v1.5.1 — Blackglass intelligence showroom
**Status:** shipped

The lobby Evolution Tree expands into a complete 36-class animated dossier library with canonical telemetry, catchphrases, abilities, evolution context and a build-specific foreign Trait Graft Lab. Portrait-mobile layout received a rendered QA/polish pass in v1.5.1.

### v1.6.0 — Battlefield
**Status:** shipped; live balance validation next

The arena now has real tactical geometry instead of a featureless open field.

Shipped:
- three mirrored layouts: **Crossfire, Split Horizon, Four Gates**;
- permanent rectangular fortifications and circular pillars;
- destructible barricades with HP, visible cracks, breach feedback and persistent rubble;
- terrain-aware tank/shape/powerup spawning;
- tank, drone and shape collision with solid geometry;
- sliding movement along cover instead of binary hard stops;
- swept projectile-vs-terrain collision for hypervelocity rounds;
- permanent-wall projectile blocking;
- destructible-cover absorption, splash damage and shell structural bonus;
- conditional high-penetration punch-through only when the impact itself breaches the barricade;
- automatic target acquisition and AI firing constrained by real line-of-sight;
- AI cover-bump recovery/strafe rethink;
- Forward Observer contact invalidation through terrain occlusion;
- Controller drone collision during farming, defense, formation, command and committed dives;
- wall-hit drone dives abort into recovery;
- Battlefield visual language, cover damage state, rubble, procedural terrain SFX and layout HUD strip;
- Node regression tests for release wiring, LoS, swept thin-wall collision and spawn safety.

### Battlefield acceptance criteria
- no projectile can hit a target through surviving solid cover;
- fast Rail/precision rounds cannot tunnel through thin terrain between frames;
- ordinary AI cannot acquire/fire through terrain;
- Forward Observer relay requires actual unobstructed sight;
- Controller drones cannot attack through a wall or remain permanently stuck against one;
- player movement slides naturally around cover on mobile twin-stick input;
- layouts preserve enough open space for high-speed combat while creating meaningful routes/lanes;
- destructible cover changes tactical geometry without becoming disposable visual clutter.

---

## Active priorities

### P0 — Real-device Battlefield validation
1. Play Crossfire, Split Horizon and Four Gates on portrait mobile and verify obstacle density never overwhelms the touch camera.
2. Tune barricade HP against Cannon shells, Rail shots, Minigun pressure and drone attacks.
3. Validate whether the cover HUD strip is informative without occupying scarce vertical space.
4. Test AI route recovery around long walls and exact-perpendicular approaches for repeated wall-push edge cases.
5. Test Controller formations around corners, especially Hivemind/Citadel and deep Command Nodes behind long walls.
6. Test Observer patrol positions so scouts do not spend excessive time pinned against exterior fortifications.
7. Tune the number/placement of destructible barricades based on actual lane flow.
8. Add explicit terrain-performance profiling for large Hivemind + projectile-heavy encounters.

### P0 — Skill-expression pass for the remaining three lineages
**Target:** v1.7

Purple and Controller now have distinct mastery languages. Gunner, Cannon and Guardian should receive the same treatment rather than remaining primarily aim/stat/cooldown classes.

Design direction:
- **Gunner:** recoil control, sustained-fire discipline, suppression, cadence and projectile geometry.
- **Cannon:** prediction, blast placement, structural breaching, lane denial and projectile manipulation.
- **Guardian:** directional protection, interception, body positioning, perfect-block timing and route control.

The Battlefield system should be used as a multiplier rather than ignored: Cannons should breach/deny cover, Gunners should suppress exits and lanes, Guardians should protect crossings and hold choke points.

### P1 — Living Arena
**Target:** after v1.7

Upgrade neutral shapes from passive XP rocks into a low-stakes mechanical ecosystem and add an Arena Director that creates announced contested events instead of relying mainly on random powerups and periodic elites.

### P1 — Apex identity pass
Ensure every Tier-3 Apex evolution changes mastery rather than only amplifying parent stats/geometry.

### P1 — Runtime consolidation
The canonical enhanced game is currently materialized from the stable compressed payload plus versioned runtime overlays. This has enabled safe incremental evolution, but the stack is now deep. Consolidate the shipped v1.2–v1.6 systems into a new canonical source baseline with regression coverage before hook ordering becomes a development hazard.

---

## Standing design requirements

Every future system should be evaluated for:
- skill ceiling and skill floor;
- readability;
- active counterplay;
- punishability;
- two-sided mastery;
- interaction with terrain/information rather than isolated stat changes.

Prefer **Read → Respond → Punish**.

When an autonomous helper exists, preserve the distinction: **automation may remove chores, but it should not remove the player's interesting combat decisions.**
