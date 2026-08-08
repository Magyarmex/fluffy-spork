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

### v1.7.0 — Three Disciplines
**Status:** initial full lineage mechanics shipped; real-device tuning and deeper Apex differentiation next

Gunner, Cannon and Guardian now have distinct mastery languages instead of remaining primarily aim/stat/cooldown classes.

#### Gunner — Fire Discipline
- explicit heat accumulation/cooling;
- sustainable mid-heat cadence window;
- deterministic recoil/dispersion rather than random jams;
- aim-turn stability and recovery;
- physical hull recoil;
- stable shotgun cone tightening;
- AI heat parity and forced venting at excessive heat;
- cyan heat/cadence/overheat presentation and procedural SFX.

#### Cannon — Fire Control
- right-stick direction aims while right-stick depth programs detonation distance;
- desktop mouse distance uses the same fuse grammar;
- visible FUSE/impact reticle;
- direct collision takes precedence over programmed detonation;
- surviving projectiles airburst at the chosen distance;
- splash/cluster behavior survives the airburst;
- very short fuses are less efficient than properly armed placement;
- AI hunt fuses derive from legitimate target distance;
- Battlefield cover/breach interaction makes blast placement a map-control decision.

#### Guardian — Facing and Counterplay
- frontal armor is directional and follows aim orientation;
- defensive arc width/strength differs by evolution;
- BULWARK / IRON WILL are directional rather than legacy omnidirectional protection;
- short Perfect Guard activation window;
- successful Perfect Guard stores Countercharge;
- next projectile consumes Countercharge for a stronger/faster punish shot;
- Juggernaut/Meteor/Ravager Stampede builds impact through straight-line commitment;
- sharp turns and terrain impacts drain/dump charge;
- body damage scales with earned Stampede momentum;
- pink facing/counter/charge presentation and procedural SFX.

See [`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md) for the mechanic doctrine.

---

## Active priorities

### P0 — Three Disciplines real-device validation
1. Tune Gunner heat gain/cooling so the cadence window is discoverable but not trivial to hold indefinitely.
2. Tune physical recoil by chassis; Breachlord should feel violent without making mobile aiming unusable.
3. Verify deterministic recoil feels learnable rather than merely noisy.
4. Validate shotgun tightening against the original random pellet spread and prevent over-accurate long-range Breachlord behavior.
5. Tune Cannon right-stick-depth mapping on actual phone hardware; minimum/mid/max fuse placement should all feel intentional.
6. Validate airburst timing against Battlefield walls and destructible cover, especially large splash Apex forms.
7. Make sure farming with Cannon remains comfortable enough despite manual fuse depth.
8. Tune Guardian passive frontal reduction and active guard factors by branch.
9. Tune Perfect Guard windows for touch latency while preserving bait/punish counterplay.
10. Test Countershot reward strength versus low-reload Guardian forms and foreign Gunner/Sniper grafts.
11. Tune Juggernaut/Meteor/Ravager charge build/drain around corners and terrain impacts.
12. Improve elite AI discipline: better burst timing, fuse prediction and guard activation decisions without hidden knowledge.
13. Validate all three lineages against Sniper/Controller on every Battlefield layout.

### P0 — Real-device Battlefield validation
1. Play Crossfire, Split Horizon and Four Gates on portrait mobile and verify obstacle density never overwhelms the touch camera.
2. Tune barricade HP against Cannon shells, Rail shots, Gunner pressure and drone attacks.
3. Validate whether the cover HUD strip is informative without occupying scarce vertical space.
4. Test AI route recovery around long walls and exact-perpendicular approaches for repeated wall-push edge cases.
5. Test Controller formations around corners, especially Hivemind/Citadel and deep Command Nodes behind long walls.
6. Test Observer patrol positions so scouts do not spend excessive time pinned against exterior fortifications.
7. Tune the number/placement of destructible barricades based on actual lane flow.
8. Add explicit terrain-performance profiling for large Hivemind + projectile-heavy encounters.

### P1 — v1.7 Apex specialization pass
The lineage-wide mechanics are now present, but Tier-3 identity should push them in different directions rather than only sharing the parent discipline.

Candidate targets:
- **Tempest:** widest sustained cadence band but brutal recoil beyond it.
- **Needle Storm:** narrow precision cadence with unusually high stability reward.
- **Breachlord:** maximum recoil/brace cycle and devastating reset timing.
- **Flakmaster:** longer-range stability mastery.
- **Cluster King:** multi-stage sector programming.
- **Siege Bomber:** deliberate breach/siege fuse identity.
- **Annihilator:** maximum commitment and punish window around one programmed blast.
- **Quake Cannon:** cover/lane shock interaction.
- **Bastion:** narrow maximum-strength lane ownership.
- **Aegis:** widest mobile defensive arc / strongest timing specialization.
- **Meteor:** maximum straight-line momentum burst.
- **Ravager:** more flexible aggressive momentum without becoming free steering.

### P1 — Living Arena
**Target:** after v1.7

Upgrade neutral shapes from passive XP rocks into a low-stakes mechanical ecosystem and add an Arena Director that creates announced contested events instead of relying mainly on random powerups and periodic elites.

### P1 — Apex identity pass beyond v1.7
Ensure every Tier-3 Apex evolution across all five lineages changes mastery rather than only amplifying parent stats/geometry.

### P1 — Runtime consolidation
The canonical enhanced game is currently materialized from the stable compressed payload plus versioned runtime overlays. This has enabled safe incremental evolution, but the stack is now deep. Consolidate the shipped v1.2–v1.7 systems into a new canonical source baseline with regression coverage before hook ordering becomes a development hazard.

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
