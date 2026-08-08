# NOVA TANKS — Development Roadmap

This roadmap is intentionally lightweight. It records high-value weaknesses and larger projects so autonomous development can continue them across multiple scheduled runs instead of forgetting discoveries between releases.

## Active priorities

### P0 — Controller second-body playtesting and refinement
**Status:** first full implementation shipped in **v1.3.0 · Second Body**

**Problem addressed:** Controller combat previously delegated too much of PvP to autonomous nearest-target drones. The player largely supplied proximity while the swarm made targeting, pursuit and attack decisions, producing low-expression “walk into an enemy and hope the swarm wins” encounters.

**Design objective:** Keep Controller farming convenient while making PvP about multitasking, geometry, formation control, target manipulation, sequencing, commitment and recall — all through NOVA's existing twin-stick controls.

**Core principle:** **Autonomy handles chores. The player handles violence.**

**Core interaction loop:**

**Place command → establish geometry → designate/read → wind up → commit attack → recover/recall → reposition.**

### Shipped in v1.3.0
- Right-stick Swarm Vectoring for the true Controller lineage.
- Analog command depth: stick displacement determines deployment distance rather than acting as a binary attack toggle.
- Release-to-recall with real travel time and commitment.
- Autonomous neutral-shape farming retained while idle.
- Serious PvP pursuit removed from idle Controller autopilot.
- Short-lived gun-hit DESIGNATE system.
- Formation-first Controller PvP instead of nearest-target contact chasing.
- Telegraph → late trajectory lock → committed dive → overshoot → recovery attack sequence.
- Movement-feint and post-lock dodge counterplay.
- Wind-up interruption by shooting the attacking drone.
- Swept collision for high-speed drone dives.
- Real drone HP, destruction and normal respawn consequences retained.
- Distinct formation identities:
  - Carrier wedge;
  - Overlord far-side crescent;
  - Warden phalanx;
  - Hivemind rotating ring;
  - Broodmother twin claws / calculated sacrifice;
  - Citadel fortress wall;
  - Valkyrie cavalry wing.
- Existing Swarm and Bulwark abilities integrated into command behavior.
- AI Controllers routed through the same command/formation/commitment/recovery rules.
- Command Node, engagement zone, off-screen command marker, designation reticle, wind-up ring, locked dive vector, dash trail and phalanx-link presentation.
- Procedural command, recall, designation, wind-up and launch SFX.
- Brief in-game Controller control tutorial after evolution.

### Next Controller work
1. Playtest on actual mobile hardware and tune command-depth mapping, Command Node legibility and how much thumb travel is comfortable during simultaneous hull movement.
2. Tune wind-up/lock timing per lineage so attacks are readable without becoming trivial to dodge.
3. Measure drone survival/respawn economics: losing a unit should matter but should not leave a Controller nonfunctional for excessive periods.
4. Test whether designation duration and engagement-zone expansion reward hull aim without turning into disguised hard lock-on.
5. Validate formation weaknesses in real combat:
   - Overlord should be punishable if the crescent is pulled too far around a target;
   - Warden/Citadel should be strong only when their wall is oriented correctly;
   - Hivemind should lose meaningful coverage when it cascades too many attacks;
   - Valkyrie should gain tempo at the cost of high-speed overcommitment;
   - Broodmother sacrifice should create meaningful attrition decisions rather than free disposable damage.
6. Improve enemy-controller readable information if a player cannot tell which drone is about to attack on a small phone screen.
7. Explore terrain/obstacles that let skilled Controllers bend formations around cover while defenders break line geometry.
8. Test Controller-vs-Sniper interaction: scouting pressure should force relocation or information, not grant free exact-position tracking.
9. Profile Hivemind and large multi-Controller fights for mobile CPU/render cost.
10. Keep the foreign Controller gene as a simpler autonomous support package unless testing suggests a lightweight command interaction can be added without hijacking another lineage's primary controls.

**Acceptance criteria:**
- an expert Controller can make the same drone count dramatically more effective than a novice;
- a skilled defender can survive attacks that kill a stationary/predictable defender;
- right-stick depth matters continuously and intuitively;
- hull and swarm can be controlled in different directions at the same time;
- Controller gun aim has strategic value through designation;
- attack runs are readable and dodgeable after commitment;
- movement feints before lock can alter attack prediction;
- shooting a winding-up drone can reliably interrupt it;
- overextending the swarm creates a punishable hull vulnerability;
- formation rotation/redeployment takes enough time to make positioning matter;
- each Controller evolution creates a visibly different geometric mastery problem;
- idle shape farming remains low-friction;
- AI Controllers obey the same interaction language;
- real mobile play remains understandable without extra buttons or RTS-style UI.

See [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md) for the Controller case study and governing second-body doctrine.

See [`RELEASES.md`](./RELEASES.md) for the v1.3.0 implementation record.

---

### P1 — Sniper counterplay and skill duel
**Status:** first implementation shipped in **v1.2.0 · Silent Horizon**; ongoing playtest/map refinement

**Problem:** Sniper/Railgun combat previously had insufficient counterplay. Hypervelocity, high-damage, high-penetration shots could become effectively unavoidable, and the old projectile-interception system was not robust enough to support deliberate defense against them.

On mobile, the sniper can be completely outside the player's field of view. The target may see only the incoming projectile, so counterplay cannot depend on visually tracking the sniper tank itself.

**Design objective:** Preserve sniper lethality and the fantasy of a silent killer beyond visual range while turning sniper encounters into high-skill duels for both sides. Approaching classes should have mechanics that let good defensive reads translate into territory gained.

**Core interaction loop:**

**Detect bearing → manipulate aim → survive/intercept the shot → exploit recovery → take territory → repeat.**

### Shipped in v1.2.0
- Swept / continuous projectile-vs-projectile collision for hypervelocity rounds.
- Explicit Rail projectile integrity decoupled from tank penetration.
- Full-power Rail focus with approximately 520 ms commitment.
- Progressive turret-aim commitment during deep focus.
- Charge-scaled quick-shots when the player releases before full focus.
- Directional off-screen glint for deeply focused enemy Rail snipers threatening the player lane.
- Directional charge, incoming/flyby, full-discharge, and quick-shot procedural SFX.
- Brief post-shot bearing reveal / visual cue for committed shots.
- Accurate direct/near-miss suppression that can break deep focus.
- AI Rail snipers routed through the same focus/commitment interaction rather than instant full-power fire.

### Next sniper work
1. Playtest/tune focus duration, aim-turn limits, suppression radius, quick-shot curves, and interception integrity on actual mobile combat.
2. Measure whether successful defenses create enough practical territory gain without an artificial movement buff.
3. Improve future map geometry around alternating exposed/protected spaces, flank routes, firing lanes, and non-permanent sniper positions.
4. Add stronger firing-line/tracer persistence only if current bearing cues remain too ambiguous in practice.
5. Continue improving sniper AI prediction, counter-baiting, relocation, and decision quality while preserving human-like execution constraints.
6. Validate with actual gameplay that expert snipers and expert defenders both gain substantial mastery paths.

## Standing design requirement

Every future system should be evaluated for skill ceiling, skill floor, readability, counterplay, punishability, and opportunities for mastery. NOVA TANKS should prefer interactive depth over stat-check balance.

When an autonomous helper exists, preserve this distinction: **automation may remove chores, but it should not remove the player's interesting combat decisions.**
