# NOVA TANKS — Enemy Intelligence Doctrine

## Purpose

Enemy AI exists to create opponents that feel dangerous because they understand the same battlefield the player understands. A strong rival should win through positioning, prediction, timing, class knowledge, and adaptation — not hidden information or invisible stat inflation.

The target experience is **scary competence with readable counterplay**: the player should sometimes think “that bot knew exactly what I was trying to do,” while still being able to explain afterward which clue the bot used and what alternative would have beaten it.

## Non-negotiable fair-play contract

1. **No wall vision.** A tank may act on a target only while it has legitimate sight, a legitimate reconnaissance relay, or a frozen last-seen memory produced by one of those sources.
2. **Frozen memory means frozen coordinates.** Once sight breaks, hidden target position, velocity, aim, class-state changes, and movement are not sampled until reacquisition.
3. **No AI-only combat stats.** Intelligence updates do not add damage, HP, movement speed, reload, projectile speed, penetration, cooldown, or evolution advantages. Explicit elite rules remain a separate balance system and must not be smuggled into AI code.
4. **Reaction time is real.** Tactical plans are sampled at bounded intervals and cached between decisions. No frame-perfect target switches or instant projectile reactions.
5. **Aim is imperfect but coherent.** Rivals may predict movement analytically, but prediction uses sampled observations and keeps a persistent error floor. Noise must not be replaced by zero-error aim at high levels.
6. **Movement obeys physics.** AI uses the same terrain, collision, momentum, heat, fuse, guard, drone, and ability rules as the player.
7. **Strong behavior must have an answer.** Flanks can be counter-flanked, dodges can be baited, guards can be delayed, charges can be sidestepped, artillery commitments can be rushed, and snipers can be denied sight.

## Intelligence stack

### 1. Perception

Perception answers “what can I legitimately know?” before any tactical layer runs.

- Direct line-of-sight is authoritative.
- Existing Forward Observer / reconnaissance systems may authorize information only according to their own rules.
- Last-seen memory records position only when legitimate contact exists.
- Damage received may increase the importance of an attacker **after reacquisition**, but never grants the attacker’s hidden live coordinates.
- Memory expires quickly enough that breaking sight is a real defensive tool.

### 2. Threat selection

Visible targets are scored instead of selected solely by distance. Useful inputs include:

- distance and ability to actually engage;
- target health / punishability;
- target class danger;
- recent legitimate combat interaction;
- current target saturation;
- role suitability.

The player remains an attractive target, but excessive dogpiling is penalized. Difficulty should emerge from different rivals creating crossfire, pressure, denial, and flanks rather than every tank receiving the same invisible “kill player” order.

### 3. Role doctrine

Every lineage should solve combat differently.

- **Sniper:** preserve sight lines, kite bad spacing, relocate when occluded, fire only after aim settles, punish predictable movement.
- **Cannon:** own medium-long lanes, exploit programmed space, pressure cover, punish exits, and breach when a recent legitimate contact makes the structural decision meaningful.
- **Controller:** fight through swarm geometry, orbit at a useful command distance, avoid exposing the hull unnecessarily, and use swarm timing to create two-source pressure.
- **Gunner:** maintain pressure range, control heat/cadence, cut off repeated strafes, and exploit short openings rather than holding fire blindly.
- **Guardian:** accept closer ranges, face danger correctly, force movement, use defensive timing under credible pressure, and convert openings into committed body/Stampede pressure.

A class update is incomplete until its AI doctrine is updated with the same mechanic.

### 4. Predictive aim

Prediction should be strong but bounded.

- Solve linear projectile interception from sampled position and velocity.
- A small acceleration term may be estimated from consecutive legitimate observations.
- Prediction horizon is limited by projectile lifetime / practical weapon range.
- Aim error is persistent across a planning interval so the tank appears to track rather than vibrate.
- High-skill rivals reduce error but never reach mathematical zero.
- Firing still requires physical turret alignment; prediction does not authorize instantaneous snapping.

### 5. Projectile survival

Dodging uses collision risk rather than randomness.

- Calculate time to closest approach for nearby hostile projectiles.
- Ignore bullets moving safely away.
- Weight evasive urgency by impact time and miss distance.
- Choose a stable dodge direction that reduces expected collision risk.
- Keep a reaction floor: the AI cannot respond before its next tactical sample.

This makes advanced players able to bait dodges, create crossfire, or fire where the bot must move next.

### 6. Cover and flanking

Cover is tactical terrain, not merely collision geometry.

- Wounded ranged units may search nearby reachable samples for a position that occludes the current threat.
- Occluded opponents trigger finite last-seen investigation and local corner routing, not omniscient chase.
- Repeated peeking or circular movement can influence flank side.
- Edge-hugging targets should be pressured from an inward angle instead of chased single-file against the boundary.
- Local pathfinding remains preferred over global perfect navigation; bots should be competent navigators, not omniscient route planners.

### 7. Ability intent

Random ability use is a fallback, not the desired behavior. Every ability should have an explicit tactical reason.

Examples:

- **Bulwark / Iron Will:** credible incoming pressure or a close fight where mitigation has immediate value.
- **Stampede:** a clear, aligned commitment lane at an appropriate range.
- **Overheat:** a sustained pressure window while heat is still controllable.
- **Point Blank:** an actual close-range punish opportunity.
- **Ragnarok / Supercharge:** a legitimate, settled shot window.
- **Swarm:** a target is close enough for the extra bodies to create meaningful pressure.
- **Phase:** escape a dangerous collapse or finish a vulnerable target from a readable angle.

Ability decisions must obey the same cooldown and execution mechanics as player abilities.

### 8. Anti-cheese adaptation

Adaptation is short-term combat reading, not hidden long-term profiling.

Allowed examples:

- detecting a consistent circle-strafe direction from observed velocity;
- changing flank direction after repeated occluded approaches;
- recognizing an opponent pinned near the arena edge;
- stopping wasteful Gunner fire above sustainable heat;
- refusing low-value shotgun shots outside meaningful range;
- choosing another visible target when too many rivals are already committed to one victim.

Not allowed:

- remembering a player’s tactics across runs unless a future feature explicitly exposes that system;
- reading inputs directly;
- reading hidden cooldowns or hidden target state through terrain;
- spawning counters solely because of a player’s current build without an explicit director system and clear design justification.

## Difficulty scaling

Prefer scaling **decision quality**, never secret physical capability.

Good levers:

- reaction interval within the documented floor;
- aim error within the documented floor;
- how well a role holds its preferred range;
- how much evidence is required before changing flank direction;
- ability timing threshold;
- how aggressively a rival converts an opening.

Bad levers for an AI update:

- flat damage multipliers;
- hidden HP;
- shorter cooldowns than the same class receives as a player;
- impossible projectile speed;
- instant turns;
- longer memory that tracks hidden movement.

Elite stat rules, if intentionally part of balance, remain visibly separate from the intelligence layer.

## Performance budget

NOVA can field many tanks, drones, bullets, shapes, and battlefield solids simultaneously. Intelligence must remain bounded.

- Expensive tactical planning runs at a staggered low-frequency cadence.
- Cached movement/aim intent executes each simulation update for smooth motion.
- Terrain queries use the existing exact broad-phase and local waypoint systems.
- Avoid new arrays/objects in frame-frequency paths; reuse per-AI scratch state.
- Target scans are acceptable over the small tank population, but not over every world entity.
- Projectile-risk scans should use an early distance/time rejection path and may migrate to spatial broad-phase if bullet counts rise enough to matter.

A smarter bot that damages frame pacing is not smarter in practice.

## Required regression coverage for future AI work

Any meaningful AI change should test the relevant subset of:

- no hidden live-coordinate tracking;
- line-of-sight firing authorization;
- last-seen memory expiry;
- reaction floor;
- aim error floor / no instant snap;
- target saturation behavior;
- projectile closest-approach threat math;
- role-specific preferred ranges;
- cover candidate legality;
- ability-condition intent;
- no AI-only stat writes;
- compatibility with Battlefield routing, Three Disciplines, Apex Doctrine, Combined Arms, Controller/Observer systems, and Frame Budget.

## v1.8.0 — Predator Doctrine baseline

Predator Doctrine establishes the first general-purpose tactical brain layered above the historical NOVA AI and existing specialist systems. It owns target scoring, role spacing, predictive aim intent, projectile-risk dodging, cover choice, anti-pattern flanking, deliberate ability intent, and fairness telemetry while preserving Combined Arms memory/routing and Frame Budget geometry cadence.

Future updates should deepen this stack rather than create parallel AI systems. The goal is one coherent opponent mind whose competence grows whenever NOVA’s mechanics grow.
