# NOVA TANKS v1.12.0 — Living Front

**Release:** v1.12.0  
**Codename:** Living Front  
**Design lineage:** Living Arena → Living Front  
**Canonical runtime owners:**
- `nova-updates/living-front-core-v1.12.0.js`
- `nova-updates/living-front-instincts-v1.12.0.js`
- `nova-updates/living-front-director-v1.12.0.js`

> **Fighting changes the farm. Farming changes where fights happen.**

Living Front turns neutral shape farming from a spatially uniform XP chore into a low-stakes battlefield ecosystem. It deliberately does **not** add a second game on top of NOVA: no capture zones, ecology currency, quests, crafting, new controls, permanent event panel, or hidden XP multipliers.

The update is successful only if normal NOVA play becomes more interesting because the same shapes, terrain, combat, AI, and progression systems interact more deeply.

---

## 1. Ecology Core

The arena is divided internally into a **4×4 grid of sixteen invisible ecological sectors**. These are simulation cells only; they have no borders, capture state, or direct HUD representation.

Each sector tracks:

- **maturity** — rises in relatively quiet ground;
- **pressure** — recent disruptive activity and combat;
- **population/value** — actual neutral entities and actual available XP;
- **recent harvest/combat** — short decaying disturbance memory;
- **migration flow** — real sector-to-sector neutral crossings.

Quiet sectors mature. Heavy harvesting, gunfire, explosions, damage, deaths, and crowding suppress maturity and raise pressure. All pressure memories decay naturally.

### Population contract

The original baseline remains authoritative:

| Shape | Target population |
| --- | ---: |
| Circle | 62 |
| Triangle | 30 |
| Square | 16 |
| Pentagon | 8 |
| Hexagon | 4 |

Living Front **never rewrites a requested replenishment type**. It changes where a requested shape safely appears.

High-value shapes increasingly prefer calm, mature sectors. Basic fodder remains broadly distributed so ordinary progression never depends on mastering ecology.

There is no hidden `+XP%` region. Rich ground is rich because valuable entities physically exist there.

### Match-age ceiling

Sector maturity is capped by a shared match-age ceiling. Early matches cannot instantly become dense Hexagon economies; richer pockets become possible gradually as the match develops.

This ceiling is global and identical for every participant. It is **not** player-relative catch-up or pity logic.

---

## 2. Wild Instincts

Every shape receives at most one useful identity. Complexity is intentionally sparse.

### Circle — fodder / schooling

Circles remain easy baseline farm. Nearby Circles loosely align and gently drift away from credible nearby danger. This creates readable sweep patterns without making Circles annoying to hit.

### Triangle — evasive prey

Triangles can perform **one short lateral evade** when a nearby projectile is actually on a plausible future intersection course.

The evade has a reaction boundary, committed displacement, and recovery cooldown. A Triangle cannot frame-perfectly chain dodges.

This teaches projectile leading, movement baiting, and follow-up placement using a low-stakes target.

### Square — stable baseline

Squares intentionally remain simple. They do not receive the historical rotating-armor proposal in v1.12.0.

Not every neutral target should demand special attention.

### Pentagon — cascade harvest

Pentagons retain their existing child split. The split now inherits the final impact direction, making pre-kill positioning and cleanup geometry meaningful without adding a combo meter or farming minigame.

### Hexagon — keystone

Hexagons apply a **weak, bounded local attraction** to ordinary nearby shapes. This tends to create loose, terrain-shaped population pockets around undisturbed Hexagons.

The effect:

- is local rather than global;
- has a strict neighbor cap;
- does not form a perfect orbit;
- does not pull through terrain magically;
- preserves the existing Hexagon → Pentagon cascade.

A Hexagon therefore signals potential territory value, not just 200 XP.

### Star — roaming prize

The existing Star becomes rare interception prey.

A Rogue Star follows a long, readable, terrain-valid route across the arena. It is fast enough that cutting its route is better than chasing from directly behind, but it is not a boss: no phases, attacks, immunity, or giant health inflation are added.

A Star has a bounded lifetime and exits if not intercepted.

### Crasher — predator

Base continuous homing is replaced by a committed predator grammar:

**Track → Telegraph → Commit → Charge → Overshoot → Recover**

Crashers prefer vulnerable neutral prey and wounded legitimate tanks. Once committed, the charge direction is substantially locked. A miss therefore creates real overshoot/recovery instead of perfect turning.

Committed Crashers obey Battlefield collision. Baiting a charge into terrain is a valid counterplay action.

### Fed Crasher bounty

When a Crasher personally kills neutral prey, part of that prey's XP becomes **stored bounty** on the Crasher.

Bounty:

- is capped;
- increases only the eventual XP reward;
- does **not** increase HP;
- does **not** increase damage;
- does **not** increase movement speed.

A brighter core communicates stored bounty in world space.

---

## 3. Disturbance, Migration, and Herding

Combat changes the farm physically.

Pressure from firing, explosions, deaths, damage, and harvesting influences mobile neutral behavior. When a sector is meaningfully more pressured than a calmer neighbor, eligible shapes gain a gentle movement bias toward calmer ground.

Migration is:

- physical;
- visible;
- terrain-constrained;
- recorded only when an entity actually crosses a sector boundary;
- never teleportation.

Hexagons resist this movement by design.

### Herding

Ordinary movement, near fire, and explosions can influence skittish shapes enough for situational herding. The effect is deliberately bounded:

- pressure responses saturate;
- only appropriate shapes are readily displaced;
- arena-edge avoidance remains active;
- disturbance reduces local maturity;
- high-value anchors are resistant;
- shapes never become player-controlled units.

The best answer should often remain simply shooting the target.

---

## 4. Front Director

The Front Director mostly **reports interesting states the simulation already produced**.

### BLOOM

A Bloom is announced only after a sector already contains unusually high real ecological value and sufficient maturity.

The announcement does not spawn shapes or grant a multiplier.

### MIGRATION

A Migration signal requires accumulated evidence of actual physical sector crossings. It reports where a population is already moving.

### ROGUE STAR

Rogue Star is the sole deliberately created opportunity in v1.12.0. It is eligible only after strategic quiet, when no meaningful Bloom or migration already provides movement pressure and no Star is active.

Director signals are brief minimap/world information. There are no capture bars, objective meters, permanent ecology panels, or mandatory contests.

The Director can be disabled while the ecology remains fully functional. This is a core acceptance test.

---

## 5. Organic PvP

Living Front creates encounters because multiple players can independently recognize valuable territory.

The game does not tell everyone to capture a zone. A player may instead:

- harvest a mature pocket;
- intercept a likely approach;
- leave and exploit newly quiet ground elsewhere;
- breach cover to change access;
- pressure an opponent while they commit to a cascade;
- ignore an announced opportunity entirely.

Ecology supplies strategic information, not orders.

---

## 6. Class Interaction

Living Front adds **no bespoke ecology stat bonuses**.

Existing mechanics create natural differences:

- Gunners sweep groups efficiently but generate sustained disturbance.
- Cannons can displace populations, exploit cascades, and alter access through cover.
- Guardians can force entry into dense contested pockets.
- Snipers can exploit rotations and intercept moving prizes.
- Controllers retain strong local autonomous farming.

Controller autonomy remains deliberately local. Drones do not independently abandon the player to pursue a distant Bloom or Star. Strategic opportunity choice remains a player decision.

---

## 7. AI Fairness

AI treats ecology as one optional strategic input rather than a global command.

Legal information sources are:

- public Director signals;
- neutral shapes within the same Fair Engagement gameplay-view information model available to that rival.

AI ecological planning does **not** read hidden sector maturity.

Ecological interest is reduced by:

- low health;
- an immediate close fight;
- travel cost;
- target/opportunity saturation;
- deterministic per-rival damping that prevents synchronized migration.

Difficulty may improve judgment, not information access or physical statistics.

Living Front must not recreate dogpiling by sending the whole arena to one Bloom.

---

## 8. Information and Presentation

Most Living Front information belongs in the world:

- shape density and composition;
- migration direction;
- Hexagon-centered pockets;
- Triangle evade motion;
- Crasher telegraph and stored-bounty core;
- Star movement trail.

Global Director communication is brief and exceptional.

Allowed additions:

- short minimap Bloom pulse;
- short migration direction marker;
- Rogue Star marker while active;
- restrained world telegraphs;
- sparse procedural audio;
- one first-run ecology toast;
- read-only Debug telemetry.

No permanent ecology HUD is introduced.

---

## 9. Performance Contract

Living Front does not materially increase the ordinary neutral population. The one explicit exception is at most one temporary Rogue Star opportunity.

Planning is decimated and cached:

| System | Target cadence |
| --- | ---: |
| Sector ecology | ~4.55 Hz |
| Shape intent | ~8.33 Hz |
| Front Director | ~1.39 Hz |
| AI ecology strategy | ~3.57 Hz |
| Movement / collision / damage | normal simulation cadence |

Local ecology queries reuse the canonical entity spatial hash where available. Scratch arrays and persistent state are reused. No global shape navmesh or shape×shape full simulation layer is introduced.

Living Front exposes planning EMA/peak timing in telemetry.

---

## 10. Debug and Telemetry

`NOVALivingFront.snapshot()` returns the live ecological snapshot. `NOVALivingFront.diagnostics()` returns a copyable diagnostic report.

The existing Debug surface gains a read-only Living Front section with:

- match ecological age;
- maturity ceiling;
- shape counts;
- total neutral XP;
- active/last Director signal;
- planning EMA and peak;
- per-sector maturity, pressure, population, XP/value, harvest/combat memory, inbound/outbound flow;
- Triangle evades;
- Crasher charges, hits and misses;
- bounty absorbed/released;
- Stars spawned/intercepted/expired and lifetime;
- Blooms and Migrations;
- AI ecology rotations;
- Hexagon-local-neighbor sampling.

No debug action mutates gameplay state.

---

## 11. Explicit Scope Rejections

The following are intentionally **not** Living Front v1.12.0:

- convoys;
- reactor defense;
- supply-beacon capture;
- extraction events;
- crafting resources;
- ecology currency;
- faction territory or reputation;
- shape breeding;
- deep food-chain simulation;
- multiple Crasher species;
- random shape stat mutations;
- event quests or daily objectives;
- XP multiplier zones;
- class-specific ecology trees;
- new combat controls.

Future work must justify any one of these from a demonstrated gameplay problem rather than treating them as assumed backlog.

---

## 12. Implementation Stages

The runtime is intentionally split into three ordered owners:

### Stage I — Ecology Core

Owns sector state, maturity/pressure, population geography, match-age ceiling, disturbance telemetry, base hooks, snapshots, and orchestration cadence.

### Stage II — Wild Instincts

Owns Circle/Triangle/Hexagon/Crasher/Star behavior, physical migration, bounded herding, cascade direction, and world/audio communication.

### Stage III — Front Director + Strategic AI

Owns Bloom/Migration/Rogue-Star signaling, public ecological AI bias, release metadata, tips, and Debug integration.

This split makes it possible to disable or diagnose the Director without disabling the actual living economy.

---

## 13. Automated Acceptance Coverage

`tests/node/living-front-v1.12.0.test.js` verifies:

- exact global quota preservation;
- all sixteen sectors and arena coverage;
- match-age maturity ceiling;
- quiet maturation and disturbance decay;
- high-value mature-sector placement without collapsing fodder distribution;
- credible Triangle projectile interception and evade cooldown;
- bounded Hexagon attraction;
- Crasher state transitions, locked charge, terrain commitment, bounty cap and no stat growth;
- directional Pentagon/Hexagon cascades;
- Bloom reporting without spawning;
- migration requiring actual physical crossings;
- Rogue Star strategic-quiet eligibility;
- Director-off ecology operation;
- AI public-information behavior without hidden maturity;
- planning cadence and canonical hash reuse;
- transient presentation / copyable read-only diagnostics;
- canonical `game/engine` overlay lifecycle and requested spawn-type preservation.

The production materializer must load the three runtime stages after Fair Engagement and run the complete repository build/test suite before publishing.

---

## 14. Real-Device Gate

Automated correctness does **not** substitute for physical playtesting.

Post-merge device validation should specifically tune—not redesign unless evidence demands it:

- Triangle evade readability and annoyance rate on touch screens;
- Crasher telegraph timing and terrain baiting;
- Star interception difficulty under portrait/landscape camera geometry;
- Bloom/Migration signal salience without UI clutter;
- Controller farming behavior around moving prey;
- dense Hexagon-pocket readability;
- ecological planning cost during projectile-heavy and Controller-heavy fights;
- XP/min difference between ordinary and ecology-skilled play.

Target skill advantage remains approximately **15–25% effective farming efficiency**, produced by better decisions rather than hidden bonuses.

---

## 15. Final Acceptance Test

Turn off the Front Director.

If quiet ground still matures, farm still shifts, Hexagons still create useful pockets, prey still responds meaningfully, Crashers still create readable environmental interaction, and players still have reasons to rotate, then Living Front is functioning as intended.

If the game becomes interesting only when an event announcement appears, the implementation has failed and should be simplified/reworked rather than expanded with more events.

**Living Front is not successful because NOVA has an ecology system. It is successful when the battlefield feels alive and the player can become better at reading it.**
