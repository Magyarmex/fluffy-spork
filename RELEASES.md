# NOVA TANKS — Release History

This file is the durable source-controlled release ledger for the living NOVA TANKS game. Public versions use `MAJOR.MINOR.PATCH` numbering and are never reused.

## v1.2.0 — Silent Horizon
**Released:** 2026-08-07  
**Theme:** Sniper counterplay, off-screen readability, skill expression, combat audio

### Player-facing highlights
- Railgun, Singularity, and Prism Rail now use a **focus-to-fire** interaction for full-power shots.
- Releasing early produces a weaker **quick-shot**, preserving close-range and counter-bait skill expression.
- Deep focus progressively limits turret agility, so movement feints can beat committed aim and skilled snipers can counter-predict those feints.
- Off-screen enemy rail snipers can produce a restrained **directional screen-edge glint** when deeply focused near the player's firing lane.
- Full rail attacks gain new **directional charge, rail-crack, flyby, and firing SFX**, synthesized in Web Audio with no external sound assets.
- Supported mobile devices receive a very short restrained vibration cue for a dangerous off-screen committed rail shot.
- Full-power shots briefly reveal their firing bearing, creating an earned advance window after a successful dodge or interception.
- Accurate direct or near-miss **suppression** can break deep focus; random distant spam is not intended to be an effective counter.

### Counterplay / physics
- Rail projectiles now use explicit interception integrity rather than inheriting extreme durability from their tank-penetration stat.
- Full normal rail integrity is 20; supercharged full rails use 27; quick-shot integrity scales with charge.
- Projectile-vs-projectile collision now uses swept relative-motion collision, preventing hypervelocity rounds from tunneling through a correctly placed defensive bullet stream between frames.
- Surviving a committed shot is intended to create tempo: **detect → manipulate → survive/intercept → exploit recovery → advance**.

### Sniper skill expression
- Full focus takes approximately 520 ms.
- Early focus retains high aim freedom; deeper focus progressively commits the barrel direction.
- Quick-shots scale damage, velocity, penetration, projectile integrity, and recovery according to charge.
- A rushed sniper retains outplay routes through prediction, quick-shot timing, repositioning, and terrain rather than being disabled by a hard anti-sniper mechanic.

### AI
- AI rail snipers use the same focus pipeline as the player and therefore inherit focus time and aim commitment rather than bypassing the interaction with instant full-power fire.
- Off-screen AI attacks use the same directional warning language intended for human-readable counterplay.

### Audio / presentation
- New procedural stereo charge cue.
- New layered full Railgun discharge: low impulse, metallic rail crack, high-frequency snap, and noise transient.
- New quick-shot report.
- New directional incoming/flyby crack.
- Glint and post-shot bearing cues scale subtly with focus/reveal state instead of showing exact sniper coordinates.

### Validation
- JavaScript syntax validation passed for the runtime update.
- Mocked-engine behavior tests passed for full-focus timing, quick-shot scaling, explicit rail integrity, and swept projectile interception.
- NOVA materialization workflow completed successfully.
- GitHub Pages build completed with no reported deployment error.

### Known follow-up work
- Playtest and tune focus duration, suppression radius, quick-shot curves, and rail integrity against real mobile combat.
- Add richer arena geometry, line-of-sight breaks, and flank routes so approaching a sniper gains more map-level skill expression.
- Expand lineage-specific approach tools only where they create soft counterplay rather than hard class counters.
- Continue improving sniper AI prediction/repositioning so elite difficulty comes from decisions instead of impossible execution.

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
