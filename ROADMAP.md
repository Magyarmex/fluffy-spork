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
**Status:** shipped; live balance validation ongoing

The arena has real tactical geometry instead of a featureless open field: Crossfire, Split Horizon and Four Gates; permanent walls/pillars; destructible cover; terrain-aware spawning and movement; swept projectile collision; real line-of-sight; AI cover response; Observer occlusion; Controller terrain constraints; and explicit battlefield presentation/SFX.

### v1.7.0–v1.7.1 — Three Disciplines / Apex Doctrine
**Status:** lineage mechanics and Apex specialization shipped; real-device balance validation remains

Gunner, Cannon and Guardian now have distinct mastery languages instead of remaining primarily aim/stat/cooldown classes, and their Tier-3 Apex forms now push those languages into different mastery problems rather than simply amplifying parent stats.

#### Gunner — Fire Discipline
- explicit heat accumulation/cooling;
- sustainable cadence windows and deterministic recoil;
- physical hull recoil and aim-turn stability;
- shotgun bracing and controlled re-engagement;
- **Tempest:** broad high-output redline with severe overshoot punishment;
- **Needle Storm:** narrow heat/stability precision gate;
- **Breachlord:** settled brace volley followed by a punishable recovery window;
- **Flakmaster:** stability-driven ranged shotgun discipline;
- AI obeys the same heat/recoil rules and must vent excessive heat.

#### Cannon — Fire Control
- right-stick direction aims while right-stick depth programs detonation distance;
- desktop mouse distance uses the same fuse grammar;
- visible FUSE/impact reticle and real airburst behavior;
- **Cluster King:** fuse depth also controls child-bomb sector width;
- **Siege Bomber:** true structural specialization against destructible cover;
- **Annihilator:** deep-fuse blast authority traded for a larger reload opening;
- **Quake Cannon:** deep programs increase displacement/shock geometry rather than raw damage;
- repaired the previously unused structural-damage metadata so Cannon siege specialization now reaches Battlefield cover correctly.

#### Guardian — Facing and Counterplay
- directional frontal armor and directional BULWARK / IRON WILL;
- Perfect Guard timing stores Countercharge;
- Stampede impact depends on earned straight-line momentum;
- **Bastion:** stationary frontal lane anchoring, still vulnerable to movement/flanks;
- **Aegis:** successful Perfect Guard creates a brief repositioning-flow window;
- **Meteor:** highest straight-line peak with harsh steering loss;
- **Ravager:** more flexible route control with a lower peak impact ceiling.

See [`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md) for the mechanic doctrine.

---

## Active priorities

### P0 — v1.7 real-device combat validation
1. Tune Gunner heat gain/cooling so cadence bands are discoverable but not trivial to hold indefinitely.
2. Verify Tempest redline punishment remains readable rather than merely frustrating on touch aim.
3. Tune Breachlord physical recoil and its short recovery so the volley feels violent without making mobile control unusable.
4. Validate Needle Storm and Flakmaster precision rewards do not erase their intended range weaknesses.
5. Tune Cannon right-stick-depth mapping on actual phone hardware; minimum/mid/max fuse placement should all feel intentional.
6. Validate Cluster King sector-width control, especially around narrow Battlefield exits and Controller formations.
7. Validate Siege Bomber structural pressure versus barricade HP so it opens routes without deleting cover as a system.
8. Tune Annihilator deep-commit reward/reload risk and Quake displacement against fast/mobile builds.
9. Tune Guardian passive frontal reduction and active guard factors by branch.
10. Tune Perfect Guard windows for touch latency while preserving bait/punish counterplay.
11. Validate Bastion anchor strength in choke points; flank pressure must remain meaningful.
12. Validate Aegis flow duration so a good guard earns repositioning rather than a free escape.
13. Tune Meteor/Ravager charge build and steering loss around real Battlefield corners.
14. Validate all three lineages and their Apex forms against Sniper/Controller on every Battlefield layout.
15. Improve elite AI discipline: better burst timing, fuse prediction, guard activation and route commitment without hidden knowledge.

### P0 — Real-device Battlefield validation
1. Play Crossfire, Split Horizon and Four Gates on portrait mobile and verify obstacle density never overwhelms the touch camera.
2. Tune barricade HP against Cannon shells, Rail shots, Gunner pressure and drone attacks.
3. Validate whether the cover HUD strip is informative without occupying scarce vertical space.
4. Test AI route recovery around long walls and exact-perpendicular approaches for repeated wall-push edge cases.
5. Test Controller formations around corners, especially Hivemind/Citadel and deep Command Nodes behind long walls.
6. Test Observer patrol positions so scouts do not spend excessive time pinned against exterior fortifications.
7. Tune the number/placement of destructible barricades based on actual lane flow.
8. Add explicit terrain-performance profiling for large Hivemind + projectile-heavy encounters.

### P1 — Living Arena
**Target:** after v1.7 validation

Upgrade neutral shapes from passive XP rocks into a low-stakes mechanical ecosystem and add an Arena Director that creates announced contested events instead of relying mainly on random powerups and periodic elites.

### P1 — Apex identity pass beyond the Three Disciplines
Ensure Tier-3 evolutions across the purple Sniper and green Controller lineages reach the same standard: mastery should change through geometry, information, timing, commitment or sequencing rather than only through larger stats.

### P1 — Runtime consolidation
The canonical enhanced game is currently materialized from the stable compressed payload plus versioned runtime overlays. This enabled safe incremental evolution, but the stack is now deep. Consolidate the shipped v1.2–v1.7 systems into a new canonical source baseline with regression coverage before hook ordering becomes a development hazard.

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
