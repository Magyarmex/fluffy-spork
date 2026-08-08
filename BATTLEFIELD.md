# NOVA TANKS — Battlefield System

**Release:** v1.6.0 · Battlefield  
**Doctrine:** terrain should create decisions, not merely collision.

## Purpose

NOVA's tank mechanics became substantially more sophisticated than the original open arena. Battlefield makes map geometry part of the same skill language as weapons, drones and reconnaissance.

The system is designed around four questions:

1. **What can I see?**
2. **What can I hit?**
3. **What route can I safely take?**
4. **Can I change the geometry before the opponent exploits it?**

A good Battlefield interaction should create **Read → Respond → Punish** rather than an unavoidable obstruction or arbitrary maze.

## Layouts

v1.6.0 ships three tactical templates. Each can be mirrored/rotated while preserving its underlying lane logic.

### Crossfire
Four fortified approaches surround an exposed central crossing.

- strong center-to-center firing lanes;
- four interior pillars break perfect long-range dominance;
- destructible inner cover creates temporary crossing windows;
- exterior wall segments provide flank approaches without fully isolating quadrants.

### Split Horizon
Two long structural spines divide the interior while leaving wide outer flanks.

- strong long-lane sniper identity;
- meaningful choice between forcing a narrow interior gap and taking a longer exterior route;
- cover near the spines allows staged advances;
- destroying barricades can convert a safe pocket into a firing lane.

### Four Gates
A compact central bastion creates four approach gates with secondary outer pockets.

- frequent close-to-mid-range transitions;
- clear protected approach spaces;
- strong Controller/Guardian geometry around gate mouths;
- breakable exterior cover changes which gate is safest over the course of a run.

## Terrain classes

### Permanent fortification
- indestructible;
- blocks movement;
- blocks projectiles;
- blocks automatic sight/acquisition;
- blocks Forward Observer relay;
- rendered as dark structural material with restrained violet/cyan rim lighting.

### Pillar
Circular permanent cover with the same blocking rules as a fortification.

Its curved collision surface deliberately creates different movement/aim geometry from rectangular walls.

### Destructible barricade
- explicit HP;
- blocks movement, projectiles and sight while alive;
- accepts direct projectile and splash damage;
- shells deal increased structural damage;
- visible cracks increase as HP falls;
- impact flashes/SFX communicate damage;
- destruction creates persistent non-blocking rubble.

A projectile may continue through a barricade only when **the impact itself destroys the cover**, the projectile had at least two penetration available, and enough projectile integrity survives the structural loss.

This prevents a shot from magically ignoring existing cover while still allowing high-commitment breaching plays.

## Projectile interaction

Terrain collision is evaluated across the projectile's complete previous-to-next trajectory each frame.

This is mandatory for NOVA because Rail and precision rounds can cross a thin obstacle between two rendered frames. Point-only collision would recreate the same tunneling problem previously fixed for projectile-vs-projectile interception.

Order of intent:

**trajectory → first terrain impact → terrain response/breach → entity collision**

Surviving permanent terrain always wins the collision.

## Movement

Tanks use circle-vs-terrain resolution after their normal movement integration.

The component of velocity pushing into the collision normal is removed while tangential velocity is preserved. The practical result is **wall sliding** rather than a binary stop.

This matters on touch controls: a player moving diagonally into the edge of a wall should naturally travel along it rather than needing pixel-perfect thumb correction.

Drones and neutral shapes also collide with terrain.

## AI rules

Terrain may make AI smarter, but never psychic.

- automatic nearest-tank acquisition only returns unobstructed candidates;
- an AI with an already selected target cannot fire through surviving cover;
- sustained occlusion causes generic AI to release the target and rethink;
- repeated terrain contact changes strafe/path intent instead of allowing endless wall pushing;
- elite AI receives no terrain bypass or hidden target knowledge.

## Sniper integration

Battlefield extends, rather than replaces, Silent Horizon / Forward Observer / Violet Doctrine.

### Direct sight
Purple hulls still use ordinary direct sight. Terrain now physically blocks that sight.

### Observer relay
A Forward Observer may suspect activity behind a wall and search toward it, but a reported contact remains valid only while the Observer has actual unobstructed terrain LoS to the target.

This creates a distinction between:

- **suspicion** — "something is probably over there";
- **contact** — "I can currently see it";
- **firing solution** — "my sniper can act on the relay and still has a clear projectile path."

### Counterplay
Cover therefore provides several different answers to a distant sniper:

- break Observer sight;
- force the Observer to reposition;
- cross during firing recovery;
- destroy a barricade deliberately to create a new lane;
- deny the sniper's preferred angle by moving through another gate/flank.

## Controller integration

The right-stick grammar does not change.

A player may place a Command Node beyond a wall because the input describes **intent**, not teleportation. The drones then have to physically occupy that space.

- formation/farm/defense movement is collision-constrained;
- drones slide/deflect around geometry;
- committed dives that strike a wall abort into recovery;
- a swarm cannot deliver through-wall attack damage;
- overextended formations can become split by terrain, creating another Controller mastery problem.

## Spawn safety

Player, AI, shape and powerup placement retries points overlapping terrain.

This is especially important because Battlefield geometry is created before the first tank/shape population is seeded.

## Presentation

The geometry must be obvious enough that players never confuse a gameplay blocker with decoration.

Permanent and destructible terrain therefore use:

- heavy shadow separation;
- crisp material edges;
- neon rim accents;
- visible barricade cracking;
- impact flashes;
- breach particles/rings;
- persistent rubble footprints;
- procedural impact/breach/scrape audio.

A compact HUD strip reports the current template and remaining destructible cover.

## Performance principles

- terrain count is intentionally small and fixed per template;
- broad arena space remains open;
- line-of-sight checks iterate over a small solid list rather than entering the general spatial hash;
- visuals are culled by screen bounds;
- destroyed cover stops participating in blocking tests.

## Validation

`tests/node/battlefield-v1.6.test.js` currently checks:

- v1.6 runtime registration;
- rectangle LoS blocking;
- clear LoS around a blocker;
- swept projectile crossing of a thin wall;
- safe/unsafe terrain placement queries.

Live mobile validation remains necessary for layout density, wall-sliding feel, AI corner behavior, drone routing, Observer patrol quality and cover durability.
