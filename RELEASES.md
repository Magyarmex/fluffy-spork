# NOVA TANKS — Release Milestone Ledger

NOVA TANKS uses semantic-style versions and never reuses a released number.

This file is the **human-facing milestone ledger**, not a promise to reproduce every patch note verbatim. The live game’s Living Archive also discovers versioned runtime release records from the loaded `__NOVA_*_RELEASE__` objects, while `nova-updates/releases.json` provides durable structured release metadata and the current-version pointer used by shipping/fingerprint workflows.

## v1.12.0 — Living Front
**Released:** 2026-08-31  
**Theme:** Dynamic neutral battlefield ecology

Living Front realizes the historic Living Arena direction without turning NOVA into a quest, capture-zone, or resource-management game. The central rule is simple: **fighting changes the farm, and farming changes where fights happen.**

### Dynamic resource geography
- The arena now runs a **4×4 grid of sixteen invisible ecological sectors** tracking maturity, pressure, real neutral XP value, recent harvest/combat disturbance, and physical migration flow.
- Quiet territory can mature into richer farming geography; heavily exploited or fought-over territory becomes temporarily poorer and recovers over time.
- A shared match-age maturity ceiling prevents maximum-value concentrations from appearing immediately and lets the world itself support richer late-run farming.
- The canonical **62 / 30 / 16 / 8 / 4** Circle/Triangle/Square/Pentagon/Hexagon population contract remains unchanged. Living Front redistributes value rather than simply spawning more entities.
- Valuable regions contain physically valuable shapes. There are no hidden XP-zone multipliers, player-relative catch-up bonuses, or pity logic.

### Neutral shape instincts
- **Circles** remain easy baseline fodder but now loosely school and gently drift away from visible local danger.
- **Triangles** can make one readable, cooldown-bounded lateral evade against a credible visible projectile. They cannot chain perfect dodges, so baiting and leading remain reliable counterplay.
- **Squares** intentionally remain simple and resist disturbance much more strongly than Circles or Triangles.
- **Pentagon and Hexagon cascades** now inherit useful directional momentum from the kill geometry, rewarding pre-kill positioning and cleanup planning.
- **Hexagons** become bounded ecological keystones, weakly gathering nearby lower-value shapes into loose terrain-visible pockets instead of acting as global magnets.
- Shape instincts obey Battlefield line-of-sight and collision rules rather than sensing or influencing entities magically through solid cover.

### Crashers and Rogue Stars
- Crashers were rebuilt around **Track → Telegraph → Charge → Overshoot → Recover**.
- Committed charges mostly lock their bearing, collide with real terrain, continue through a miss into an explicit overshoot, and expose a recovery window before another attack.
- Crashers can prey on neutral shapes and convert part of that lost value into **capped reward bounty**. Brighter cores mean more XP when destroyed, never extra HP, damage, or speed.
- Rogue Stars are fast roaming prizes, not mini-bosses. Their cruise speed outruns ordinary unbuffed tanks so route prediction and interception beat simple tail-chasing.
- Stars remain vulnerable to ordinary combat, respect terrain, and do not gain boss phases or hidden stat inflation.

### Disturbance, herding, and migration
- Gunfire, explosions, tank presence, damage, deaths, and rapid harvesting all contribute to local ecological pressure.
- Nearby visible fire and blasts can physically herd susceptible Circles and Triangles.
- Squares resist strongly, Pentagons resist almost entirely, and Hexagons/Stars/Crashers do not become player-controlled herding units.
- Per-shape disturbance memory creates diminishing response so repeated empty firing does not become optimal farming.
- Neutral populations can bias movement away from sustained hot ground toward calmer neighboring territory.
- Migration is physical and terrain-constrained: entities cross the actual battlefield instead of teleporting between sectors.

### Front Director
- **BLOOM** reports a naturally matured high-value pocket that already exists; it does not spawn value or activate an XP multiplier.
- **MIGRATION** is announced only after enough real neutral entities have physically crossed sector boundaries in a coherent direction.
- **ROGUE STAR** is the sole deliberately created Director opportunity and appears only after strategic quiet under bounded cooldown/state rules.
- Director signals stay restrained to short world/minimap/audio communication rather than capture bars, objective trackers, or permanent ecology HUD.
- The ecology remains active with the Director disabled. The Director communicates a living world; it does not manufacture the entire loop.

### Strategic AI and class interaction
- AI may reason about Blooms, Migrations, Rogue Stars, and locally visible neutral concentrations, but ecology remains only one strategic utility among combat, survival, route cost, and role behavior.
- AI receives public Director information plus **Fair Engagement-legal visible ecology only**. Hidden maturity and unseen neutral positions are not exposed as privileged data.
- Health/fight gates, route cost, deterministic damping, and opportunity saturation keep ecological hotspots from turning into universal AI dogpiles.
- Controller drones remain strong **local** autonomous farmers but do not independently abandon the player to chase distant ecological objectives.
- No class gains a bespoke ecology stat bonus. Existing weapons, mobility, range, splash, terrain interaction, and drone tools determine how each class exploits Living Front.

### Progression and mastery
- Farming mastery now includes reading mature ground, rotating early, positioning before cascades, intercepting Stars, judging whether rich ground is worth contesting, and exploiting terrain funnels.
- Ordinary nearby farming remains viable; skill is intended to improve efficiency rather than make the previous farming loop nonfunctional.
- Later-match world maturity supports richer opportunities as progression costs increase without checking whether any specific player is behind.
- Living Front deliberately adds no crafting currency, territory ownership, event questing, ecology tree, combo meter, or hidden catch-up multiplier.

### Readability, Fieldcraft, and observability
- Crasher charge telegraphs, overshoot residue, fed-core brightness, Rogue Star motion, and restrained Director signals communicate actionable state without permanent clutter.
- Seven tactical Living Front tips register through canonical Fieldcraft: quiet-ground maturity, Hexagon pockets, Triangle baiting, Crasher bounty, Bloom choices, Star interception, and bounded herding.
- Living Front visuals obey Signal Discipline rather than bypassing the established visual-governance contract.
- Debug exposes copyable ecological telemetry for all sixteen sectors plus neutral value, migration, shape counts, Triangle evasions, Crasher outcomes, bounty flow, Stars, Blooms, AI rotations, planning cost, and player neutral XP/min.
- Neutral farming telemetry distinguishes shape/bounty XP from PvP tank-drop orbs.

### Performance, fairness, and reliability
- Ecology uses bounded decimated planning: sectors roughly **4–5 Hz**, shape instincts **8–10 Hz**, the Front Director **1–2 Hz**, and strategic ecology AI at a similarly bounded cadence while movement/collision/combat remain frame-exact.
- Living Front reuses the canonical spatial hash and adds one reusable local projectile index per instinct tick so projectile-aware neutral behavior remains efficient.
- Entity counts stay bounded: smarter arrangement is preferred over simply adding more neutral objects.
- A cross-system Crasher fix expires Battlefield terrain-bump state correctly so one wall impact cancels the current commitment without poisoning every later charge.

### Completion audit
Living Front was repeatedly re-audited against gameplay intent, optimized-runtime behavior, AI information fairness, system ownership, visual governance, Fieldcraft ownership, telemetry accounting, and external PR review. **Twelve concrete misses were corrected before release**, including projectile-awareness parity on the optimized hash path and the stale Battlefield terrain-bump marker that could otherwise break future Crasher charges.

See [`CURRENT_RELEASE.md`](./CURRENT_RELEASE.md), [`LIVING_FRONT.md`](./LIVING_FRONT.md), and [`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md).

---

## v1.11.2 — Fair Engagement
**Released:** 2026-08-30  
**Theme:** Player/AI information and engagement fairness

- Enemy hull perception is tied to the actual gameplay viewport rather than an arbitrary hidden vision radius.
- Camera zoom changes AI world-space sight by the same projection factor affecting the player.
- Forward Observer relay remains the deliberate off-viewport exception.
- Target scoring is identity-neutral: `isPlayer` alone is not a priority bonus.
- Soft target saturation spreads equal opportunities without outlawing legitimate gangs.
- Legacy AI receives only the fairly selected perceived rival.
- Controller held-aim repair preserves the two-stick control contract without fabricating a released command.
- The materializer places Fair Engagement after the earlier combat/awareness layers and before Living Front.

---

## v1.11.1 — Owner Operations
**Released:** 2026-08-30  
**Theme:** Authorized private owner task/notification surface

- Adds the NOVA Owner browser runtime and Android companion source path.
- Owner operations fail closed unless the authorized phone bridge is present.
- Task/event data must match the active phone binding.
- The owner queue covers the supported agent/task states without changing public gameplay.
- `pwa-register.js` loads `owner-operations-v1.11.1.js` independently of the normal gameplay patch chain so the private HUD remains a PWA/owner concern rather than a combat system.

---

## v1.10.x — Reliability, parity, and battlefield intelligence campaign
**Released:** August 2026

Important milestones in the v1.10 line include:

- **v1.10.2 · Terrain Intelligence:** bounded multi-step visibility routing, U-pocket/serial-wall escape, no-progress replanning, terrain-aware Sniper/Cannon/Controller positioning, and fair last-seen handling.
- **v1.10.3 · Drone Field Service:** slow out-of-combat drone repair with Controller repair remaining under its own owner and incoming-projectile threat checks preserving combat state.
- **v1.10.5 · Shared Battlefield View:** aligns AI map awareness with the player’s strategic battlefield knowledge while preserving physical LoS for firing and terrain interactions.
- **v1.10.6 · Blackglass Mirror:** canonical tank-model, barrel, muzzle, projectile, and silhouette parity in the showroom.
- **v1.10.7 · Second Body Live Vector:** restores the intended two-stick Controller swarm-vector grammar without a parallel command pad.
- **v1.10.8 · Applied Power Parity:** AI progression follows actually assigned player power rather than banked raw level.
- **v1.10.9 · Signal Discipline:** visual effects must declare a decision-relevant reason/intent/channel and respect one-primary-signal discipline.
- **v1.10.10 · Live War Room:** the lobby battlefield uses canonical gameplay modules under explicit simulation/presentation budgets.

---

## v1.9.x — Feedback and interaction campaign

- **v1.9.0 · Visual Overhaul:** presentation refinement without changing gameplay authority.
- **v1.9.1 · Impact Language:** restrained fire, hit, damage, kill, critical-health, powerup, ability, evolution, drone-loss, and spatial feedback.
- **v1.9.2 · Upgrade Dwell:** prevents accidental upgrade UI expansion during active stick use and preserves multitouch ultimate activation.
- **v1.9.3 · Spotter Comms:** de-duplicates friendly/hostile Observer messaging without suppressing unrelated combat text.

---

## v1.8.x — Strategic AI and combat-reading campaign

- **v1.8.0 · Predator Doctrine:** analytical interception, projectile-risk evasion, target saturation, role-aware engagement distance, cover use, bounded reaction cadence, and fair hidden-target memory.
- **v1.8.1 · Battle Sense:** resource choice, punish windows, third-party geometry, projectile-dense lane risk, and contest timing.
- **v1.8.2 · Long Glass:** tactical framing for remote Controller nodes and legitimate Sniper/Observer contact while preserving reversible aim projection.
- **v1.8.3 · Contact Spark:** replaces intrusive SHOT-style warning language with spatial incoming-fire contact cues.

---

## v1.7.x — Disciplines, performance, menu systems, and Living Archive

- **v1.7.0 · Three Disciplines:** Gunner cadence/heat, Cannon analog fuse programming, Guardian facing/Perfect Guard/Stampede.
- **v1.7.1 · Apex Doctrine:** distinct mastery identities for Tier-3 Gunner/Cannon/Guardian descendants.
- **v1.7.2 · Combined Arms:** terrain routing, hard-cover splash occlusion, Cannon FUSE→IMPACT behavior, and Battlefield/discipline integration.
- **v1.7.3 · Blackglass Fit:** responsive portrait showroom simulator and guidance containment.
- **v1.7.5 · Frame Budget:** bounded planning rates and terrain broad-phase optimization.
- **v1.7.6 · IFF Halo:** stronger friend/foe drone encoding with secondary shape language.
- **v1.7.7 · Settings/containment work:** in-game settings remain limited to legitimate mid-match adjustments.
- **v1.7.8 · Zero Churn / Signal Flow:** persistent spatial hashes, allocation reduction, menu/debug contracts, and runtime performance telemetry.
- **v1.7.9 · Living Archive:** persistent release-history UI and runtime release discovery.

---

## v1.6.0 — Battlefield
**Released:** 2026-08-08

- Crossfire, Split Horizon, and Four Gates tactical layouts.
- Permanent walls/pillars, destructible barricades, persistent rubble, and terrain-safe spawning.
- Real terrain line-of-sight, swept projectile collision, tank/drone/shape terrain collision, and breach logic.
- Battlefield geometry becomes a shared gameplay system rather than decoration.

---

## v1.5.x — Blackglass and Swarm Discipline

- **v1.5.0 · Blackglass Showroom:** complete 36-class Tank Intelligence & Showroom plus trait-graft inspection.
- **v1.5.1 · Swarm Discipline:** mobile showroom polish, coordinated Controller drones, improved Observer search, and lobby/showroom music.

---

## v1.4.x — Forward Observer / Violet Doctrine

- Dedicated sniper/Observer intelligence, destructible reconnaissance, legitimate contact memory, and full purple-lineage doctrine.

---

## v1.3.x — Second Body / Signal Bloom

- Twin-stick Controller swarm command, formation geometry, designation, committed attack runs, and readability/polish pass.

---

## v1.2.0 — Silent Horizon

- Focus/quick-shot Rail skill system, suppression, warning language, explicit interception integrity, and swept Rail projectile interaction.

---

## v1.1.0 — Drone Age

- Persistent drones and Controller swarm identity enter the arena.

---

## v1.0.0 — First Deployment

- Initial playable NOVA TANKS release.
