# NOVA TANKS — Development Roadmap

This roadmap records high-value weaknesses and larger projects so autonomous development can continue them across multiple runs without losing context.

## Active priorities

### P0 — Sniper reconnaissance, AI and counterplay validation
**Status:** major AI/reconnaissance correction shipped in **v1.4.0 · Forward Observer**; live mobile playtesting remains required

**Problem addressed:** Silent Horizon established the intended focus/counterplay rules, but the original AI implementation could retain a wall-clock focus timestamp after losing firing intent. An AI sniper could therefore reacquire a target with effectively banked charge and release almost immediately. Generic AI vision also let ranged/elite AI acquire targets at distances that did not respect the intended sniper information game.

**Design objective:** A sniper may have extraordinary weapon reach, but not supernatural awareness. Long-range lethality should require a vulnerable reconnaissance chain and continuous execution.

**Long-range interaction:**

**Observer searches → contact acquired → sniper tracks → focus warnings → committed shot → recovery/reposition.**

**Defender counterplay:**

**Avoid/destroy observer → break contact → manipulate aim → suppress/intercept → exploit recovery → advance.**

### Shipped in v1.4.0
- Dedicated sniper-lineage AI rather than the generic brawler/ranged firing loop.
- Ordinary bounded direct hull vision for sniper AI; no special elite long-range sight entitlement.
- Remote targets require a live Forward Observer contact.
- One real sniper drone becomes a destructible Forward Observer with extended patrol leash and independent field-of-view scanning.
- Observer patrol behavior retains autonomous shape farming while searching.
- Short-lived contact memory instead of permanent remote lock-on.
- Sampled target motion and finite turret tracking rather than frame-perfect aim knowledge.
- AI Rail charge accumulates only while a qualified firing solution is continuously maintained.
- Lost alignment, lost target authorization, suppression, or lost spotter contact clears stored Rail focus.
- Approximate full-focus requirements of 0.82 s normal / 0.70 s elite, followed by 1.60 s / 1.35 s post-shot recovery floors.
- SPOTTED observer-contact cue.
- Two-stage directional enemy Rail focus warning before release.
- Actual in-flight Rail flyby audio based on projectile trajectory near the player.
- Evolution menus clear hostile Rail focus before pause.
- Evolution/perk/gene completion and dismissal clear stale fire input, grant short safety grace, force hostile Rail reacquisition, and collapse the large stat-upgrade tray.
- Deployment CI now syntax-checks all runtime overlays and validates the release ledger JSON.

### Next sniper work
1. Playtest v1.4.0 specifically on mobile and measure whether SPOTTED → focus warning → shot is consistently perceptible in noisy fights.
2. Tune observer patrol radius, FOV range/angle, contact memory and survivability so killing/evading reconnaissance is valuable without making the sniper helpless.
3. Tune normal/elite focus and recovery timing from actual encounters rather than theoretical lethality.
4. Verify that ordinary direct sight feels consistent with other tanks and that no other path grants remote target authorization.
5. Improve observer sweep motion to be fully frame-rate-independent and tune its movement/search personality.
6. Add terrain/line-of-sight systems that make observer positioning and sniper relocation more strategically interesting.
7. Validate sniper-vs-Controller interactions: Controllers should be able to pressure/recon the firing area without receiving free exact-position information.
8. Continue testing suppression and projectile interception under real frame pacing and mobile touch input.

**Acceptance criteria:**
- no AI Rail shot can be fired from banked focus after target/alignment loss;
- remote sniper acquisition requires a living observer contact;
- destroying or escaping the observer reliably breaks remote authorization after a short memory window;
- a player has perceptible warning before an off-screen committed Rail attack;
- elite AI is stronger through decisions/prediction, not extra omniscience or instant execution;
- a successful defensive read creates usable time/space to advance;
- evolution UI transitions cannot hand the player directly into an already-charged sniper shot.

---

### P0 — Controller second-body playtesting and refinement
**Status:** full implementation shipped in **v1.3.0 · Second Body**, polish in **v1.3.1**, defensive state repair added in **v1.4.0**

**Problem addressed:** Controller combat previously delegated too much PvP to autonomous nearest-target drones. The player supplied proximity while the swarm made most combat decisions.

**Design objective:** Keep Controller farming convenient while making PvP about multitasking, geometry, formation control, target manipulation, sequencing, commitment and recall through NOVA's existing twin-stick controls.

**Core principle:** **Autonomy handles chores. The player handles violence.**

**Core interaction loop:**

**Place command → establish geometry → designate/read → wind up → commit attack → recover/recall → reposition.**

### Shipped
- Right-stick Swarm Vectoring and analog command depth.
- Release-to-recall with real travel/commitment.
- Autonomous neutral-shape farming while idle; active command for serious PvP.
- Gun-hit DESIGNATE system.
- Formation-first PvP and readable attack runs.
- Movement-feint / post-lock dodge counterplay.
- Interruptible wind-ups, destructible drones, swept dive collision.
- Distinct Wedge, Crescent, Phalanx, Ring, Claw, Fortress Wall and Cavalry Wing identities.
- Swarm/Bulwark integration.
- AI Controller command/formation/commitment parity.
- Command/formation/status visual language plus procedural SFX.
- v1.4.0 invariant repair for invalid positions, stale targets, broken dash vectors, impossible phases and corrupt Command Nodes.

### Next Controller work
1. Playtest command-depth mapping and simultaneous two-thumb control on actual mobile hardware.
2. Tune wind-up/lock timing per lineage.
3. Measure drone survival/respawn economics.
4. Validate DESIGNATE duration and engagement-zone behavior.
5. Validate real formation weaknesses and overextension punishability.
6. Test large Hivemind/multi-Controller encounters for CPU/render cost and visual readability.
7. Add terrain interactions that reward bending formations around obstacles and breaking enemy geometry.
8. Continue adversarial testing of drone lifecycle/state transitions after evolutions, owner death, ability expiry and target destruction.

**Acceptance criteria:**
- expert Controllers substantially outperform novices with the same drone count;
- skilled defenders can read, manipulate and evade attack runs;
- right-stick depth remains intuitive;
- hull and swarm can operate in different directions simultaneously;
- overextension is punishable;
- no invalid drone state can permanently strand or corrupt a squadron;
- idle farming remains low-friction.

---

## Standing design requirement

Every future system should be evaluated for skill ceiling, skill floor, readability, counterplay, punishability, and opportunities for mastery. NOVA TANKS should prefer interactive depth over stat-check balance.

When an autonomous helper exists, preserve this distinction: **automation may remove chores, but it should not remove the player's interesting combat decisions.**
