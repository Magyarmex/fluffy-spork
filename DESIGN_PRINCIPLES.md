# NOVA TANKS — Design Principles

NOVA TANKS should be a game **riddled with skill expression**.

Depth should not come primarily from larger numbers, hidden advantages, or unavoidable damage. The game should repeatedly give players opportunities to win through execution, prediction, positioning, timing, adaptation, resource management, matchup knowledge, and creative use of interacting systems.

## Core doctrine: power requires counterplay

Every powerful mechanic should create a readable **Read → Respond → Punish** loop.

- **Read:** The opponent can perceive or infer what is about to happen from meaningful information: animation, sound, positioning, cooldown state, projectile behavior, map geometry, prior behavior, or a deliberate telegraph.
- **Respond:** There is at least one viable response that depends on player execution or decision-making rather than simply owning the correct class/stat.
- **Punish:** If the powerful action is missed, baited, blocked, intercepted, badly positioned, or poorly timed, the opponent should gain a real opportunity.

Counterplay should generally be **soft and skill-based**, not a binary hard-counter chart. A matchup may favor one build without making the other player's decisions irrelevant.

## Skill-expression requirements

When adding or changing a system, ask:

1. **What can the user get better at?**
   - aim
   - movement
   - dodging
   - interception
   - prediction
   - timing
   - spacing
   - map control
   - target selection
   - buildcraft
   - ability sequencing
   - risk management
   - reading an opponent

2. **What can both sides do differently?** Strong mechanics should ideally create skill expression for the user *and* their opponent.

3. **Is success deterministic from stats alone?** If two competent players can see the outcome before they interact because one mechanic has no meaningful response, redesign it.

4. **Is the failure understandable?** Players should usually be able to tell why they were hit, outplayed, cornered, or punished.

5. **Does mastery increase options rather than merely numbers?** Prefer mechanics whose ceiling comes from better use, not just upgrades.

6. **Does the AI obey the same combat language?** AI should not bypass reaction windows, aim commitment, visibility rules, cooldown vulnerability, or other counterplay available in PvP-like combat.

7. **Do maps and presentation support the mechanic?** Line-of-sight, cover, effects, audio, camera, UI, and arena geometry are part of balance.

## Avoid

- effectively unavoidable burst damage with no pre-shot information
- instant perfect tracking by AI
- projectile speeds that erase interaction without another compensating skill test
- hidden rules that determine fights before players can react
- hard counters as the primary balancing tool
- excessive randomness replacing execution
- mechanics whose only answer is “have more HP”
- reducing an overpowered mechanic into blandness when richer counterplay could preserve its fantasy

---

# Case study: sniper counterplay

## Current problem

The sniper lineage — especially Railgun-style weapons — can become a low-interaction threat.

The current Railgun configuration has extremely high projectile velocity, high damage, and very high penetration. NOVA already supports projectile-vs-projectile interception, but fast sniper rounds undermine that counterplay in two ways:

1. Projectile durability is derived partly from damage, radius, and penetration. A powerful sniper round therefore becomes disproportionately difficult to shoot down even though penetration through tanks and durability against bullets are different design concepts.
2. Projectile-vs-projectile collision is evaluated from discrete positions. Very fast rounds can cross a defending bullet stream between simulation steps without ever occupying the same collision space, producing tunneling.

The result is that spray weapons can “bullet tank” ordinary fire, while the Railgun often behaves like damage with no equivalent interactive defense.

AI compounds this when it can continuously lead targets with near-perfect tracking and immediately capitalize on hypervelocity shots.

## Design goal

**Do not make snipers weak. Make sniping a high-stakes skill duel.**

A great sniper should remain terrifying. Their advantage should come from prediction, aim discipline, firing-lane selection, timing, baiting movement, and exploiting mistakes — not from the target lacking meaningful inputs after the sniper acquires line-of-sight.

Likewise, surviving a sniper should reward awareness, movement deception, projectile interception, map use, pressure, and timing.

## Preferred counterplay package

### 1. Fix projectile interception technically

Use swept / continuous projectile collision for fast projectiles, or an equivalent robust sub-step solution. If two hostile projectile paths cross during a frame, the collision should be capable of registering even when their end positions do not overlap.

This is foundational: a counterplay mechanic is not skill-based if the simulation randomly fails to recognize correct execution.

### 2. Separate penetration from intercept durability

Give projectiles an explicit concept such as `interceptHP` / projectile integrity rather than deriving it mainly from damage and penetration.

A Railgun slug may penetrate multiple tanks while still being possible to neutralize with a deliberately aimed defensive burst.

Desired behavior:

- random stray bullets should not trivially erase a Railgun shot;
- a player who intentionally places several rounds into its path should have a reliable chance to weaken or destroy it;
- a heavy projectile should be able to contest it efficiently;
- partial interception may reduce the sniper round's damage rather than always being all-or-nothing.

This makes “bullet tanking” an execution skill instead of a class-specific accident.

### 3. Add aim commitment / focus

Powerful sniper shots should require a brief readable commitment before receiving their full lethality.

Candidate design:

- holding/focusing the shot builds accuracy, velocity, damage, or penetration;
- during late focus, turret rotation becomes less agile or the aim direction becomes partially committed;
- the sniper receives clear local feedback while the opponent receives a restrained but readable cue such as charge glow, barrel energy, audio rise, or muzzle glint;
- firing early remains possible as a weaker quick-shot.

This creates a mind game:

**Sniper:** predict the dodge, hold nerve, release at the correct instant, or quick-shot a player expecting the full charge.

**Target:** juke before commitment, fake a direction change, cross the firing lane at the right moment, intercept, or pressure the sniper into releasing early.

The warning should not become a giant “dodge now” laser that removes sniper skill. It should provide information that expert players can exploit.

### 4. Create a post-shot punish window

A high-value sniper shot should expose the shooter if used badly.

Possible components:

- meaningful reload recovery;
- visible tracer / rail trail showing the firing origin;
- recoil or brief mobility/aim penalty;
- temporary decloak/reveal for stealth sniper variants;
- loud directional audio.

Missing should cost something. Hitting should feel earned.

### 5. Make pressure and range control matter

The long-range sniper should not be equally comfortable at every distance.

Prefer mechanical constraints over arbitrary close-range damage penalties:

- focus is difficult while moving aggressively;
- high-power aiming reduces turret agility;
- being rushed forces quick-shots rather than perfectly focused shots;
- cover and arena geometry can break firing lanes;
- a sniper that allows a brawler or spray build to close distance should have to outplay the situation rather than continue operating at maximum efficiency.

### 6. Improve map-based counterplay

As NOVA's map system develops, include meaningful line-of-sight decisions:

- sparse cover rather than a completely open shooting gallery;
- multiple approaches to strong firing positions;
- objects/terrain that create rotations and temporary safety;
- sniper nests that offer power but can be flanked or predicted;
- avoid permanent safe positions with one dominant firing lane.

Map knowledge should become another axis of sniper skill and anti-sniper skill.

### 7. Give sniper AI human-like commitment

AI snipers must use the same readable rules as players.

They should have:

- aim turn-rate limits;
- target tracking latency / aim history rather than perfect instantaneous knowledge;
- focus/charge commitment;
- occasional prediction errors that can be intentionally induced by good movement;
- rational firing decisions instead of frame-perfect release whenever a mathematical intercept exists.

Elite AI may predict better and commit more intelligently, but it should not bypass the interaction model.

## What not to do

Avoid solving the problem only by:

- cutting sniper damage until the class is uninteresting;
- adding universal invulnerability/dodge buttons solely to counter Railguns;
- making sniper accuracy random;
- creating a hard “anti-sniper” class that invalidates the lineage;
- making every Railgun shot trivially destructible by one bullet;
- adding an enormous laser sight that makes competent sniping impossible.

The target is **high lethality + high readability + high commitment + high outplay potential**.

## Validation questions for a sniper rework

A successful implementation should make all of these answers “yes”:

- Can an expert sniper outperform an average sniper by a large margin?
- Can an expert target survive situations an average target would not?
- Can the sniper deliberately outplay common anti-sniper responses?
- Can the target deliberately bait or punish a bad sniper shot?
- Can projectile interception be executed reliably when geometrically correct?
- Can closing distance meaningfully change the duel?
- Does the sniper remain frightening when played well?
- When a player dies to a sniper, can they usually identify something they could have done differently?

## Global rule

Whenever NOVA gains a new class, evolution, hybrid gene, weapon, AI behavior, map feature, boss mechanic, movement option, or defensive system, evaluate it for **skill ceiling, skill floor, readability, counterplay, and punishability** — not balance numbers alone.

NOVA TANKS should continuously move toward fights where better decisions and better execution matter more than unavoidable matchup math.
