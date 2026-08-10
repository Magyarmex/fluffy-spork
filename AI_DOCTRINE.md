# NOVA TANKS — Enemy Intelligence Doctrine

## Purpose

Enemy AI exists to create opponents that feel dangerous because they understand the same battlefield the player understands. A strong rival should win through positioning, prediction, timing, class knowledge, adaptation, and execution — not invisible stat inflation or access to information the player does not have.

The target experience is **scary competence with readable counterplay**: the player should sometimes think “that bot knew exactly what I was trying to do,” while still being able to explain which public battlefield information made the read possible and what physical or tactical answer would have beaten it.

## Non-negotiable fair-play contract

1. **Player-information parity is authoritative.** If the normal player presentation exposes a fact, AI may use that fact. Today the minimap plots every living tank globally, so living tank position is public battlefield information even through cover and beyond the local camera.
2. **Knowledge is not execution permission.** Knowing a tank’s live position does not let AI shoot, move, dash, explode, or apply an ability through terrain when the corresponding player mechanic cannot. Physical line-of-fire, collision, projectile, range, fuse, guard, drone, Observer, and cooldown rules stay authoritative.
3. **Cover blocks weapons, not awareness.** Terrain occlusion must not delete a tank from AI target selection, freeze its coordinates, or start a fake memory-expiry timer while that tank remains publicly tracked by the player UI.
4. **Future stealth must be symmetric.** If a future mechanic genuinely removes an entity from the player’s view/map or intentionally obscures its state, the shared-awareness predicate must hide the same information from AI. Do not special-case AI around that system.
5. **No AI-only combat stats.** Intelligence updates do not add damage, HP, movement speed, reload, projectile speed, penetration, cooldown, or evolution advantages. Explicit elite rules remain a separate balance system and must not be smuggled into AI code.
6. **Reaction time is real.** Public information can be sampled continuously, but tactical decisions are made at bounded intervals and cached between plans. Global awareness must not become frame-perfect target switching or impossible projectile reactions.
7. **Aim is imperfect but coherent.** Rivals may predict movement analytically from public observations, but prediction keeps a persistent error floor and physical turret alignment. High-level AI gets better judgment, not mathematical aimbotting.
8. **Movement obeys physics.** AI uses the same terrain, collision, momentum, heat, fuse, guard, drone, and ability rules as the player.
9. **Strong behavior must have an answer.** Flanks can be counter-flanked, pre-aim can be baited, dodges can be baited, guards can be delayed, charges can be sidestepped, artillery commitments can be rushed, drones can be screened, and cover remains physically meaningful even though it is not an invisibility cloak.

## Intelligence stack

### 1. Shared battlefield awareness

Perception answers “what information does the player already have?” before any tactical layer runs.

For tanks, the current canonical answer is simple: the player minimap renders every living tank, so every living tank’s current world position is legal AI knowledge. This applies through permanent walls, destructible cover, and distances larger than a tank’s weapon range.

That does **not** mean every tank should chase every other tank. Awareness and attention are separate:

- all public tanks may be considered;
- distance, vulnerability, danger, current commitment, role suitability, and target saturation decide relevance;
- public knowledge may be refreshed while a plan remains reaction-limited;
- target motion can support pre-aim, interception, flanking, and route planning;
- no “last seen” expiry should be used for information that never became hidden to the player.

Other information remains system-specific. A rival may reason about projectiles it can legitimately observe, public powerups, visible structural state, and class behavior exposed by gameplay. It may not read player input, private UI intent, or state deliberately hidden from the player.

### 2. Physical engagement legality

Every tactical action asks a second question: “can this mechanic physically execute from here?”

Examples:

- ordinary bullets require a valid trajectory and collide with terrain;
- permanent walls cannot be ignored because a target is globally tracked;
- destructible cover may be intentionally attacked by classes/mechanics that can damage it;
- splash obeys Battlefield cover exposure;
- Controller drones obey leash, pathing, collision, commitment, recovery, and attack range;
- Sniper remote engagement still obeys the Forward Observer / sniper authorization model where that class mechanic requires it;
- Cannon fuse programming, Gunner heat, Guardian facing, and all cooldowns remain exactly the normal gameplay systems.

This separation is the core invariant: **AI may know what the player knows, but may only do what the player-controlled version of that mechanic can do.**

### 3. Threat selection

Known targets are scored instead of selected solely by distance. Useful inputs include:

- distance and practical time-to-engage;
- target health / punishability;
- target class danger;
- recent combat interaction;
- current target saturation;
- current target commitment;
- role suitability;
- whether cover suggests a flank, hold, breach, or disengage instead of a direct approach.

The player remains an attractive target, but excessive dogpiling is penalized. Difficulty should emerge from different rivals creating crossfire, pressure, denial, interception, and flanks rather than every bot receiving the same “kill player” order.

### 4. Role doctrine

Every lineage should solve combat differently.

- **Sniper:** preserve useful firing geometry, pre-aim likely exits, kite bad spacing, relocate around blocked lanes, respect Observer/remote-fire rules, and punish predictable movement.
- **Cannon:** own medium-long lanes, exploit programmed space, pressure cover, predict exits, and intentionally breach destructible terrain when the public target position makes that structural decision useful.
- **Controller:** fight through swarm geometry, keep the hull at a useful command distance, track threats with the same public map information as the player, and make drones physically reach their pressure angles.
- **Gunner:** maintain pressure range, control heat/cadence, cut off repeated strafes, pre-position for exits, and exploit short openings rather than holding fire blindly.
- **Guardian:** accept closer ranges, face danger correctly, force movement, use defensive timing under credible pressure, and convert openings into committed body/Stampede pressure.

A class update is incomplete until its AI doctrine is updated with the same mechanic.

### 5. Predictive aim

Prediction should be strong but bounded.

- Solve linear projectile interception from the latest public target sample.
- A small acceleration term may be estimated from consecutive public observations.
- Prediction horizon is limited by projectile lifetime / practical weapon range.
- AI may maintain aim on a covered target or expected exit, because a player can do the same from the overhead view.
- Firing remains separately authorized by physical line-of-fire and class mechanics.
- Aim error is persistent across a planning interval so the tank appears to track rather than vibrate.
- High-skill rivals reduce error but never reach mathematical zero.
- Prediction never authorizes instantaneous turret snapping.

### 6. Projectile survival

Dodging uses collision risk rather than randomness.

- Calculate time to closest approach for nearby hostile projectiles.
- Ignore bullets moving safely away.
- Weight evasive urgency by impact time and miss distance.
- Choose a stable dodge direction that reduces expected collision risk.
- Keep a reaction floor: the AI cannot respond before its next tactical sample.

This makes advanced players able to bait dodges, create crossfire, or fire where the bot must move next.

### 7. Cover, route planning, and flanking

Cover is tactical terrain, not an invisibility switch.

- Wounded ranged units may search reachable positions that physically occlude incoming fire.
- A covered target remains live knowledge; AI may route around the wall, take another lane, pre-aim an exit, hold a choke, or decide to disengage.
- Route goals may use the target’s current public position instead of a frozen historical coordinate.
- Repeated peeking or circular movement can influence flank side.
- Edge-hugging targets should be pressured from an inward angle instead of chased single-file against the boundary.
- Cannons may attack destructible cover when structural pressure is tactically useful.
- Local and bounded pathfinding remains preferred over heavyweight perfect global navigation; awareness can be global while route computation stays efficient and physical.

### 8. Ability intent

Random ability use is a fallback, not the desired behavior. Every ability should have an explicit tactical reason.

Examples:

- **Bulwark / Iron Will:** credible incoming pressure or a close fight where mitigation has immediate value.
- **Stampede:** a physically valid aligned commitment lane at an appropriate range.
- **Overheat:** a sustained pressure window while heat is still controllable.
- **Point Blank:** an actual close-range punish opportunity.
- **Ragnarok / Supercharge:** a legitimate, settled shot window.
- **Swarm:** a known target is close enough for extra bodies to create meaningful pressure even if the drones must route around cover.
- **Phase:** escape a dangerous collapse or finish a vulnerable target from a mechanically valid angle.

Ability decisions must obey the same cooldown and execution mechanics as player abilities.

### 9. Strategic and anti-cheese adaptation

Adaptation is short-term combat reading, not hidden long-term profiling.

Allowed examples:

- detecting a consistent circle-strafe direction from public motion;
- changing flank direction after repeated blocked approaches;
- recognizing an opponent pinned near the arena edge;
- holding a known covered exit instead of forgetting the target;
- stopping wasteful Gunner fire above sustainable heat;
- refusing low-value shotgun shots outside meaningful range;
- choosing another known target when too many rivals are already committed to one victim;
- positioning around a known Controller swarm while drones remain physically constrained.

Not allowed:

- reading movement/aim joystick or keyboard state directly;
- reading deliberately private UI intent;
- remembering a player’s tactics across runs unless a future feature explicitly exposes that system;
- spawning counters solely because of a player’s current build without an explicit director system and clear design justification;
- bypassing terrain, range, reload, cooldown, Observer, heat, fuse, guard, or drone constraints because the target is known.

## Difficulty scaling

Prefer scaling **decision quality**, never secret physical capability.

Good levers:

- reaction interval within the documented floor;
- aim error within the documented floor;
- target-scoring quality;
- how well a role holds its preferred range;
- route/flank quality;
- evidence required before changing pressure plans;
- ability timing threshold;
- how aggressively a rival converts a public opening.

Bad levers for an AI update:

- flat damage multipliers;
- hidden HP;
- shorter cooldowns than the same class receives as a player;
- impossible projectile speed;
- instant turns;
- firing through permanent cover;
- AI-only disappearance/reappearance rules;
- information unavailable to the normal player presentation.

Elite stat rules, if intentionally part of balance, remain visibly separate from the intelligence layer.

## Performance budget

NOVA can field many tanks, drones, bullets, shapes, and battlefield solids simultaneously. Intelligence must remain bounded.

- Global tank awareness is cheap because the tank population is small; an O(n) target scan on planning ticks is acceptable.
- Expensive tactical planning runs at a staggered low-frequency cadence.
- Cached movement/aim intent executes each simulation update for smooth motion.
- Terrain queries use the existing exact broad-phase, Combined Arms waypoint, and Terrain Intelligence route systems.
- Avoid new arrays/objects in frame-frequency paths; reuse per-AI scratch state.
- Projectile-risk scans use early rejection and may migrate to spatial broad-phase if bullet counts rise enough to matter.
- Controller public-awareness planning must not turn drone navigation into global per-drone path searches; owner-level intent and existing local drone routing remain separate.

A smarter bot that damages frame pacing is not smarter in practice.

## Required regression coverage for future AI work

Any meaningful AI change should test the relevant subset of:

- covered targets remain live knowledge when the player map still exposes them;
- awareness has no arbitrary tank-centric radius when the player map is global;
- permanent-cover direct-fire denial;
- destructible-cover structural decisions;
- public live-coordinate route goals;
- future stealth/player-visibility predicate parity;
- reaction floor;
- aim error floor / no instant snap;
- target saturation behavior;
- projectile closest-approach threat math;
- role-specific preferred ranges;
- cover candidate legality;
- ability-condition intent;
- Controller target parity without drone leash/pathing bypass;
- Sniper/Observer authorization compatibility;
- no AI-only stat writes;
- compatibility with Battlefield routing, Three Disciplines, Apex Doctrine, Combined Arms, Controller/Observer systems, Terrain Intelligence, and Frame Budget.

## v1.10.4 — Shared Battlefield View baseline

Shared Battlefield View supersedes the old v1.8.0 “no wall vision / frozen last-seen memory” information model.

Predator Doctrine remains valuable for tactical scoring, role spacing, predictive aim, projectile-risk dodging, cover choice, ability intent, and execution gates, but its historical perception assumption is no longer authoritative. Combined Arms and Terrain Intelligence remain authoritative for physical terrain and routing, while their old frozen-contact compatibility fields may now be refreshed from public player-map knowledge.

The durable rule going forward is:

> **The AI gets the player’s information model and the player’s mechanical rules.**

If a future feature changes what the player can actually know, change the shared information predicate first, then make every AI layer consume that same predicate. Do not create a second private perception game for bots.
