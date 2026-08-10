# NOVA TANKS — Development Roadmap

This document tracks what is actually shipped, what still needs physical-device validation, and the next high-value engineering work. It should not keep solved items alive as fake backlog.

## Current shipped foundation

### v1.2.0–v1.4.1 — Sniper doctrine
**Status:** shipped; real-device balance tuning remains.

The Sniper lineage uses direct hull sight plus Forward Observer reconnaissance, finite acquisition, readable commitment, suppression, projectile/flyby cues and punishable recovery. Later Observer intelligence added suspicion-driven search and clearer relay visualization.

### v1.3.0–v1.10.0 — Controller second body → Command Weave
**Status:** shipped.

Controller combat no longer asks one right-stick/thumb to do two jobs. **Command Weave v1.10.0** separates cannon aim from swarm designation through a dedicated command surface while preserving mobile multi-pointer ownership. Human Controllers gain readable defensive drone behavior and damaged-drone recycling; AI Controllers use the same sensed information constraints, defensive doctrine and commitment rules rather than hidden knowledge.

Controller repair remains intentionally faster than generic drone repair.

### v1.5.0–v1.7.9 — Blackglass showroom, menu systems and Living Archive
**Status:** shipped; portrait-device QA remains.

The lobby contains the complete 36-class animated dossier/showroom, graft tooling, one-screen menu layout, mechanic-aware Tips and a Living Archive that automatically discovers runtime release posts. Portrait containment was hardened after real overflow failures.

### v1.6.0–v1.10.2 — Battlefield / Combined Arms / Terrain Intelligence
**Status:** shipped; balance and device stress testing remain.

Crossfire, Split Horizon and Four Gates provide permanent and destructible tactical geometry, swept projectile collision, real line-of-sight, blast occlusion, terrain-aware spawning, fuse/impact readability and class-specific interaction with cover.

**Terrain Intelligence v1.10.2** replaces the old “one-corner is enough” assumption with bounded local multi-step visibility routing, cache reuse, string-pulling, anti-stuck recovery and tactical wall use. Tanks, Controller formations and Forward Observers inherit the stronger routing while committed windups/dashes remain commitment states. It does not add global navmesh cost or hidden-coordinate tracking.

See [`BATTLEFIELD.md`](./BATTLEFIELD.md) and [`COMBINED_ARMS.md`](./COMBINED_ARMS.md).

### v1.7.0–v1.7.2 — Three Disciplines / Apex Doctrine
**Status:** shipped; physical-device balance tuning remains.

- **Gunner — Fire Discipline:** heat, sustainable cadence, recoil/stability, branch-specific redline/brace/precision mastery.
- **Cannon — Fire Control:** direction + fuse grammar, airburst/impact distinction, structural specialization and branch-specific programmed-shot mastery.
- **Guardian — Facing and Counterplay:** frontal armor, Perfect Guard, Countercharge and movement/anchor branch identities.

See [`THREE_DISCIPLINES.md`](./THREE_DISCIPLINES.md).

### v1.7.5–v1.7.8 — Performance and mid-match settings
**Status:** shipped.

The runtime has targeted performance budgets/culling plus a gameplay-safe settings surface for controls and presentation options that a player may reasonably adjust mid-match.

### v1.7.6 — Reinforced IFF Halo
**Status:** shipped with this completion pass.

Drone allegiance now uses a broad low-alpha friendly-blue/hostile-red halo plus a tighter core light, both drawn in the existing culled drone loop. Class/lineage color remains visible; no ownership, targeting or AI logic changes.

### v1.8.0–v1.8.1 — Predator Doctrine / Battle Sense
**Status:** shipped.

AI combat uses stronger sensed-information reasoning, threat selection and lineage doctrine without granting hidden positions or exemption from player-facing combat rules.

### v1.8.2 — Long Glass
**Status:** shipped and lifecycle-hardened with this completion pass.

Controller Command Nodes and Sniper Forward Observers can pull the camera into a projection-correct tactical frame. The hardened implementation now survives pre-spawn/restart/player replacement and verifies Observer ownership/role before framing stale stored ids.

### v1.8.3–v1.9.1 — Contact Spark / Impact Language
**Status:** shipped with v1.9.1 restored in this completion pass.

Combat feedback uses restrained visual/audio language rather than text spam: shot impulse, confirmed hit vs kill punctuation, incoming-damage direction/severity, useful reload-ready cues, powerup/ability/evolution acknowledgement, drone link-break feedback and critical-health signalling. High-frequency events are coalesced and the layer remains presentation-only.

### v1.9.2–v1.9.3 — Interaction reliability
**Status:** shipped.

Upgrade UI requires a short input-free dwell before opening, multitouch ultimate activation works while another pointer remains held, and Spotter communications are deduplicated rather than flooding the feed.

### v1.10.1 — War Room
**Status:** shipped.

The lobby looks onto a live but decorative level-30 battlefield containing all 36 canonical forms. The background sim has autonomous combat, deaths/respawns, lineage silhouettes, slow upward camera travel and restrained effects while remaining separate from real match state. It runs at bounded simulation/render rates, reduced resolution, capped effects, sleeps when hidden and respects reduced-motion settings.

### v1.10.3 — Field Service
**Status:** shipped with this completion pass.

Surviving non-Controller drones slowly repair after **4.6 seconds** without fresh damage and only after nearby visible hostility has cleared. Healing stops during committed attacks or weapon recovery. Healthy drones do no threat scan; damaged candidates refresh danger on a staggered interval. Terrain Intelligence remains the sole routing owner. Controller drones keep Command Weave's faster repair advantage.

### Production materializer reliability
**Status:** hardened with this completion pass.

Production materialization is serialized, runs build + full regression tests before publishing, verifies every named runtime script exists, and refuses to push an `index.html` generated from a stale main commit over a newer source revision. Existing PR CI continues to run build, tests and production Tailwind compilation.

---

## Active priorities

### P0 — Real-device combat validation
These items require actual phone/tablet/desktop play and must not be marked complete from unit/CI evidence alone.

1. Tune Gunner heat/cooling, Tempest redline punishment, Breachlord recoil/recovery, Needle Storm precision and Flakmaster range identity on touch controls.
2. Tune Cannon fuse-depth mapping on real phones; verify FUSE → IMPACT readability, Cluster King sector control, Siege Bomber structural pressure, Annihilator commitment and Quake displacement.
3. Tune Guardian Perfect Guard timing for touch latency, Bastion choke strength, Aegis flow duration and Meteor/Ravager steering loss.
4. Validate Sniper and Controller matchups against the three Disciplines across every Battlefield layout.
5. Validate Command Weave under real multi-touch: aim and CMD ownership must never steal each other's pointer during frantic movement/ultimate use.
6. Validate generic Field Service timing/readability and Controller's faster repair advantage in actual fights; repair should reward disengagement, not create mid-duel sustain.
7. Validate reinforced drone IFF at phone size in dense Controller-vs-Controller fights without overpowering class-color identity.
8. Validate Impact Language audio/visual density with automatic weapons, large drone fights and low health; it should clarify events rather than become another notification layer.

### P0 — Battlefield and navigation stress testing
1. Play Crossfire, Split Horizon and Four Gates on portrait mobile and verify obstacle density remains readable through the touch camera.
2. Stress Terrain Intelligence on long walls, serial walls, U-shapes, narrow gates and exact-perpendicular approaches; look specifically for route churn, oscillation and no-progress loops.
3. Verify committed drone dives/windups are never magically steered by routing recovery.
4. Test Controller formations, Hivemind/Citadel traffic and Forward Observer patrols around dense cover.
5. Validate last-seen investigation never feels like hidden-coordinate tracking.
6. Test splash occlusion and partial blast exposure at wall faces/corners/pillars/barricades.
7. Profile Hivemind + projectile-heavy encounters and keep advanced routing within the existing frame budget.

### P0 — Blackglass and War Room device QA
1. Re-test the Android portrait configuration that exposed three-column overflow; 320–430 CSS-pixel widths must never horizontally scroll or clip dossier content.
2. Test long descriptions/ability names/graft deltas for wrapping.
3. Confirm landscape/tablet restores richer multi-column layout only when space permits.
4. Measure lobby War Room cost on lower-end Android hardware. It should remain background ambience, not become the dominant frame-time consumer.
5. Verify reduced-motion, hidden-tab sleep and menu mount/unmount behavior on real browsers.

### P1 — Runtime consolidation
The enhanced game still materializes a stable compressed payload plus a deep stack of runtime overlays. That architecture made safe incremental releases possible, but hook ordering is now a larger maintenance risk than it was in v1.7.

Create a new canonical source baseline containing the shipped v1.2–v1.10 systems, preserve the existing regression suite, and reduce runtime overlays to genuinely incremental releases. Consolidation must be behavior-preserving before any cleanup/refactor ambition is allowed into the same change.

### P1 — Living Arena
Upgrade neutral shapes from passive XP rocks into a low-stakes mechanical ecosystem and introduce announced contested events through an Arena Director. Do this only after current device/balance validation has evidence; it is new scope, not unfinished v1.x cleanup.

### P1 — Apex identity parity
Bring remaining Sniper and Controller Tier-3 branches to the same mastery standard as the Three Disciplines: geometry, information, timing, commitment or sequencing should change—not merely stats.

---

## Standing design requirements

Every future system should be evaluated for:
- skill ceiling and skill floor;
- readability;
- active counterplay;
- punishability;
- two-sided mastery;
- terrain/information interaction rather than isolated stat inflation;
- mobile input ownership and real screen-space cost;
- bounded CPU/render cost in swarm-heavy fights.

Prefer **Read → Respond → Punish**.

When an autonomous helper exists, preserve the distinction: **automation may remove chores, but it should not remove the player's interesting combat decisions.**
