# NOVA TANKS — Release Milestone Ledger

NOVA TANKS uses semantic-style versions and never reuses a released number.

This file is the **human-facing milestone ledger**, not a promise to reproduce every patch note verbatim. The live game’s Living Archive also discovers versioned runtime release records from the loaded `__NOVA_*_RELEASE__` objects, while `nova-updates/releases.json` provides durable structured release metadata and the current-version pointer used by shipping/fingerprint workflows.

## v1.12.0 — Living Front
**Released:** 2026-08-31  
**Theme:** Dynamic neutral battlefield ecology

Living Front realizes the historic Living Arena direction without turning NOVA into a quest/capture-zone/resource-management game.

### Ecology Core
- The arena is divided into sixteen invisible ecological sectors tracking maturity, pressure, neutral value, harvest/combat disturbance, and physical migration.
- The canonical **62 / 30 / 16 / 8 / 4** Circle/Triangle/Square/Pentagon/Hexagon population contract remains unchanged.
- Quiet territory can mature into better late-match farming geography; harvesting and combat disturb it.
- High-value concentration is gated by match age rather than player-relative pity or hidden XP boosts.

### Wild Instincts
- Circles school gently and remain basic fodder.
- Triangles make readable cooldown-bounded evasions against legitimate nearby fire.
- Squares remain intentionally simple.
- Pentagon/Hexagon deaths can create directional cascades that reward positioning.
- Hexagons act as bounded terrain-visible keystones rather than global magnets.
- Rogue Stars are tuned as interception prey instead of slow chase bosses.
- Crashers use **Track → Telegraph → Charge → Overshoot → Recover**, obey terrain, target vulnerability, and carry only capped reward bounty rather than hidden combat growth.
- Near fire, explosions, and combat presence can physically herd appropriate neutral prey with bounded diminishing response.

### Front Director and Strategic AI
- **BLOOM** reports real mature value already present in the world.
- **MIGRATION** requires actual physical sector crossings.
- **ROGUE STAR** is the one event allowed to deliberately create a rare opportunity, and only after strategic quiet.
- AI may reason about ecology through public signals and Fair Engagement-legal visible information; no hidden maturity map is exposed.
- Route cost, health/fight state, and saturation gates prevent ecology from becoming a dogpile magnet.
- Seven tactical Living Front tips register through canonical Fieldcraft rather than writing directly to the rendered tip line.
- World/minimap signals obey Signal Discipline.

### Completion audit
Living Front was repeatedly re-audited against gameplay intent, optimized-runtime behavior, AI information fairness, system ownership, visual governance, Fieldcraft ownership, and external PR review. Twelve concrete misses were corrected before release, including optimized projectile-awareness parity and the stale Battlefield terrain-bump marker that could otherwise poison future Crasher charges.

See [`LIVING_FRONT.md`](./LIVING_FRONT.md) and [`LIVING_FRONT_AUDIT.md`](./LIVING_FRONT_AUDIT.md).

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
