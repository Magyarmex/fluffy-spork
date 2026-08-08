# NOVA TANKS — Development Roadmap

This roadmap records high-value weaknesses and larger projects so autonomous development can continue them across multiple runs without losing context.

## Shipped foundation

### v1.2.0–v1.4.1 — Purple sniper doctrine
**Status:** shipped; continue real-device tuning

The Sniper lineage now operates through ordinary direct hull sight, Forward Observer reconnaissance, finite acquisition, readable commitment, suppression, projectile/flyby readability and punishable recovery. Rail forms preserve deeper focus/quick-shot/interception mechanics. Observer intelligence was upgraded in v1.5.1 with wider suspicion-driven search and clearer relay visualization.

### v1.3.0–v1.5.1 — Controller second body
**Status:** shipped; continue real-device tuning

Controllers use the right stick as a second-body command vector: bearing controls direction, analog depth controls deployment distance, release recalls. PvP uses designation, formation geometry, readable wind-up, trajectory commitment, dive, overshoot and recovery. Idle farming remains autonomous. v1.5.1 added stable idle navigation, distributed farming and defensive drone-vs-drone interception.

### v1.5.0–v1.7.2 — Blackglass intelligence showroom
**Status:** shipped; portrait containment repaired in v1.7.2

The lobby Evolution Tree expands into a complete 36-class animated dossier library with canonical telemetry, catchphrases, abilities, evolution context and a build-specific foreign Trait Graft Lab.

A real-device portrait failure revealed that the historical mobile polish stylesheet could be overtaken by the late-injected base showroom stylesheet. v1.7.2 adds a dedicated containment layer that explicitly recognizes portrait/coarse-pointer devices, forces a bounded one-column layout and reasserts itself after the base style appears. Future UI work must preserve the rule that no Blackglass child may exceed the containing phone viewport.

### v1.6.0–v1.7.2 — Battlefield / Combined Arms
**Status:** core geometry and first intelligence integration shipped; live balance validation ongoing

The arena has real tactical geometry instead of a featureless open field: Crossfire, Split Horizon and Four Gates; permanent walls/pillars; destructible cover; terrain-aware spawning and movement; swept projectile collision; real line-of-sight; Observer occlusion; Controller terrain constraints; and explicit battlefield presentation/SFX.

v1.7.2 extends Battlefield from collision into tactical intelligence:
- AI predicts short-range terrain collisions and chooses local corner waypoints before contact;
- AI keeps only short frozen last-seen memory from legitimate sight and never updates hidden coordinates;
- Controller formation/farm/defense/recall travel uses local corner routing while committed dives remain locked;
- explosions respect hard cover and can apply partial damage to partially exposed hulls;
- wall-surface blast origins are hardened against near-zero LoS ambiguity;
- Cannon fuse UI distinguishes programmed FUSE from earlier physical IMPACT;
- Cannon AI can deliberately breach destructible cover only when doing so follows from recent legitimate information.

See [`BATTLEFIELD.md`](./BATTLEFIELD.md) and [`COMBINED_ARMS.md`](./COMBINED_ARMS.md).

### v1.7.0–v1.7.2 — Three Disciplines / Apex Doctrine / Combined Arms
**Status:** lineage mechanics, Apex specialization and first Battlefield integration shipped; real-device balance validation remains

Gunner, Cannon and Guardian now have distinct mastery languages instead of remaining primarily aim/stat/cooldown classes, and their Tier-3 Apex forms push those languages into different mastery problems rather than simply amplifying parent stats.

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
- visible FUSE programming, terrain-aware IMPACT preview and real airburst behavior;
- **Cluster King:** fuse depth also controls child-bomb sector width;
- **Siege Bomber:** true structural specialization against destructible cover;
- **Annihilator:** deep-fuse blast authority traded for a larger reload opening;
- **Quake Cannon:** deep programs increase displacement/shock geometry rather than raw damage;
- AI can intentionally breach destructible cover when acting on a recent legitimate last-seen contact;
- structural specialization continues to use Battlefield's single authoritative cover-break path.

#### Guardian — Facing and Counterplay
- directional frontal armor and directional BULWARK / IRON WILL;
- Perfect Guard timing stores Countercharge;
- Countershots gain modest structural pressure in v1.7.2 without approaching Cannon breach efficiency;
- Stampede impact depends on earned straight-line momentum;
- **Bastion:** stationary frontal lane anchoring, still vulnerable to movement/flanks;
- **Aegis:** successful Perfect Guard creates a brief repositioning-flow window;
- **Meteor:** highest straight-line peak with harsh steering loss;
- **Ravager:** more flexible route control with a lower peak impact ceiling.

See [`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md) and [`COMBINED_ARMS.md`](./COMBINED_ARMS.md).

---

## Active priorities

### P0 — v1.7 real-device combat validation
1. Tune Gunner heat gain/cooling so cadence bands are discoverable but not trivial to hold indefinitely.
2. Verify Tempest redline punishment remains readable rather than merely frustrating on touch aim.
3. Tune Breachlord physical recoil and its short recovery so the volley feels violent without making mobile control unusable.
4. Validate Needle Storm and Flakmaster precision rewards do not erase their intended range weaknesses.
5. Tune Cannon right-stick-depth mapping on actual phone hardware; minimum/mid/max fuse placement should all feel intentional.
6. Validate the new FUSE → IMPACT distinction is readable at phone scale and does not create duplicate/cluttered orange markers.
7. Validate Cluster King sector-width control, especially around narrow Battlefield exits and Controller formations.
8. Validate Siege Bomber structural pressure versus barricade HP so it opens routes without deleting cover as a system.
9. Tune Annihilator deep-commit reward/reload risk and Quake displacement against fast/mobile builds.
10. Tune Guardian passive frontal reduction and active guard factors by branch.
11. Tune Perfect Guard windows for touch latency while preserving bait/punish counterplay.
12. Validate Bastion anchor strength in choke points; flank pressure must remain meaningful.
13. Validate Aegis flow duration so a good guard earns repositioning rather than a free escape.
14. Tune Meteor/Ravager charge build and steering loss around real Battlefield corners.
15. Validate all three lineages and their Apex forms against Sniper/Controller on every Battlefield layout.
16. Improve elite AI discipline: better burst timing, fuse prediction, guard activation and route commitment without hidden knowledge.

### P0 — Battlefield / Combined Arms real-device validation
1. Play Crossfire, Split Horizon and Four Gates on portrait mobile and verify obstacle density never overwhelms the touch camera.
2. Tune barricade HP against Cannon shells, Rail shots, Gunner pressure and drone attacks.
3. Validate whether the cover HUD strip is informative without occupying scarce vertical space.
4. Stress-test predictive AI corner routing on long walls, narrow gates and exact-perpendicular approaches; avoid waypoint oscillation.
5. Ensure last-seen investigation feels intelligent without making hidden movement seem tracked.
6. Test splash occlusion at wall faces, corners, pillars and destructible barricades; fully protected targets must not receive leak damage.
7. Tune partial blast exposure so small peeks create fair chip pressure rather than arbitrary immunity or near-full damage.
8. Test Controller formations around corners, especially Hivemind/Citadel and deep Command Nodes behind long walls.
9. Validate ordinary drone routing does not interfere with committed Second Body attack runs or recreate idle vibration.
10. Test Observer patrol positions so scouts do not spend excessive time pinned against exterior fortifications.
11. Tune the number/placement of destructible barricades based on actual lane flow.
12. Add explicit terrain-performance profiling for large Hivemind + projectile-heavy encounters.

### P0 — Blackglass device QA
1. Re-test the exact Android portrait configuration that exposed the three-column overflow.
2. Verify 320–430 CSS-pixel portrait widths never create horizontal page scrolling or clipped intelligence content.
3. Test long class descriptions, long ability names and the largest graft-delta values for wrap behavior.
4. Verify landscape/tablet still uses the richer multi-column presentation where space genuinely permits it.
5. Keep runtime style-order regression coverage whenever Blackglass CSS is refactored.

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