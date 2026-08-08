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

On mobile, the problem is worse: the sniper can be well outside the player's camera and therefore cannot be visually tracked at all. The target may only see the incoming projectile. That means fair counterplay cannot depend on seeing the sniper tank model; the game needs a deliberate **off-screen threat language**.

## Design goal

**Do not make snipers weak. Make sniping a high-stakes skill duel.**

A great sniper should remain terrifying. Their advantage should come from prediction, aim discipline, firing-lane selection, timing, baiting movement, relocation, and exploiting mistakes — not from the target lacking meaningful inputs after the sniper acquires line-of-sight.

Likewise, surviving a sniper should reward awareness, movement deception, projectile interception, bearing inference, map use, pressure, timing, and disciplined closing distance.

The intended fantasy is a **silent killer beyond visual range** whose presence is inferred through restrained sensory evidence rather than a permanently visible target marker.

## Off-screen sniper information language

The target should receive enough information to play skillfully without having the sniper simply revealed.

Preferred cues:

- **Directional scope glint:** while a sniper is deeply focused and aiming near the player's lane, a small restrained glint may appear at the relevant screen edge. It communicates bearing, not exact distance or exact coordinates. The cue should become more reliable/intense as the sniper commits more deeply to a full-power shot.
- **Subtle charge cue:** a brief directional audio rise, electrical whine, pressure tone, or similar sound can indicate that a highly committed shot is nearing release. This should reward headphones and awareness without becoming a giant alarm.
- **In-flight sonic cue:** a Railgun round may create a short directional crack/whip while crossing the player's vicinity, allowing fast reactions and reinforcing projectile presence. Mobile may supplement this with restrained directional haptics where practical.
- **Shot trail memory:** after firing, the rail/tracer trail should persist briefly enough that an attentive player can infer the firing lane and approximate origin bearing. It should reveal information, not place a permanent icon over the sniper.
- **Missed-shot origin information:** a missed full-power shot should briefly betray the sniper's direction more strongly than a quick-shot, creating a cost to committing and missing.

These cues should be **information, not answers**. Skilled players should interpret them better than inexperienced players.

## Closing-distance tempo loop

Closing on an off-screen sniper should be its own skill-based interaction rather than a passive walk forward.

The intended loop is:

**Detect bearing → manipulate aim → survive/intercept the shot → exploit recovery → take territory → repeat.**

Every well-defended sniper shot should create a temporary **advance window**. The target earns ground by reading the sniper correctly; the sniper preserves distance by landing shots, forcing bad movement, choosing better lanes, or relocating before being collapsed on.

### Earned advance windows

A full-power sniper shot should have enough post-shot recovery that a defender who successfully dodges, intercepts, or causes a miss can safely commit to forward movement for a short period.

This does not necessarily require an artificial movement-speed buff. The advantage can emerge naturally from:

- reload time;
- aim reset / focus loss;
- recoil or turret recovery;
- temporary origin reveal;
- the sniper needing to relocate;
- reduced ability to immediately fire another fully focused shot.

The important outcome is that **successful defense converts into spatial progress**.

### Movement deception

Approaching players should be able to manipulate the sniper's prediction through execution:

- feint left/right movement before commitment;
- vary cadence rather than oscillating predictably;
- briefly retreat to bait a shot, then surge forward during recovery;
- approach diagonally to maximize lateral displacement while still gaining distance;
- use cover transitions and firing-lane changes;
- deliberately cross a lane only after recognizing the charge/reload cycle.

The sniper should be able to counter these habits by reading cadence, delaying release, quick-shotting, pre-aiming exits, or relocating.

### Suppression as aim pressure

Sustained accurate fire should be able to make a sniper's life harder even before the attacker reaches conventional brawling range, provided the system remains skill-based.

Possible implementation:

- bullets passing very near the sniper during deep focus add small aim instability or slow focus gain;
- direct hits more strongly break or reduce focus;
- random distant spam should have little effect unless it actually threatens the sniper's position;
- a sniper who keeps focusing while under precise incoming fire is making a high-risk decision.

This gives spray and mid-range classes a way to **fight for the approach** rather than merely dodge while helplessly crossing open ground.

### Interception as active defense

Projectile interception should remain a major anti-sniper skill axis.

A defender who reads the bearing and timing should be able to deliberately place bullets or heavy projectiles into the incoming lane. Continuous/swept collision is essential so successful interception depends on geometry and timing, not frame luck.

Partial interception may weaken a Railgun round instead of making every interaction all-or-nothing.

### Range compression changes the duel

The sniper's full-power loop should become progressively harder to maintain as opponents close:

- deep focus should reduce turret agility;
- rushed snipers should rely more on weaker quick-shots;
- close lateral movement should be harder to predict;
- repeated relocation costs firing opportunities;
- a sniper that gives up too much ground should enter a genuinely disadvantaged but still outplayable close-range state.

The approach must not become automatic victory for the attacker. A skilled sniper can create distance again through good movement, terrain use, quick-shot accuracy, baiting overextension, or choosing a better firing lane.

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
- the sniper receives clear local feedback while the opponent receives restrained but readable glint/audio information;
- firing early remains possible as a weaker quick-shot.

This creates a mind game:

**Sniper:** predict the dodge, hold nerve, release at the correct instant, quick-shot a player expecting the full charge, or cancel/reposition when the approach becomes unfavorable.

**Target:** read the off-screen bearing, juke before commitment, fake a direction change, cross the firing lane at the right moment, intercept, suppress, or pressure the sniper into releasing early.

The warning should not become a giant “dodge now” laser that removes sniper skill. It should provide information that expert players can exploit.

### 4. Create a post-shot punish window

A high-value sniper shot should expose the shooter if used badly.

Possible components:

- meaningful reload recovery;
- visible tracer / rail trail showing the firing origin;
- recoil or brief mobility/aim penalty;
- temporary decloak/reveal for stealth sniper variants;
- loud directional audio.

Missing should cost something. Hitting should feel earned. A defender who causes a miss should be able to convert that success into ground gained.

### 5. Make pressure and range control matter

The long-range sniper should not be equally comfortable at every distance.

Prefer mechanical constraints over arbitrary close-range damage penalties:

- focus is difficult while moving aggressively;
- high-power aiming reduces turret agility;
- being rushed forces quick-shots rather than perfectly focused shots;
- accurate suppression can interfere with deep focus;
- cover and arena geometry can break firing lanes;
- a sniper that allows a brawler or spray build to close distance should have to outplay the situation rather than continue operating at maximum efficiency.

### 6. Improve map-based counterplay

As NOVA's map system develops, include meaningful line-of-sight decisions:

- sparse cover rather than a completely open shooting gallery;
- multiple approaches to strong firing positions;
- objects/terrain that create rotations and temporary safety;
- sniper nests that offer power but can be flanked or predicted;
- avoid permanent safe positions with one dominant firing lane;
- create alternating exposed and protected spaces so approaching a sniper is about route choice and timing, not simply crossing one huge open field.

Map knowledge should become another axis of sniper skill and anti-sniper skill.

### 7. Give sniper AI human-like commitment

AI snipers must use the same readable rules as players.

They should have:

- aim turn-rate limits;
- target tracking latency / aim history rather than perfect instantaneous knowledge;
- focus/charge commitment;
- occasional prediction errors that can be intentionally induced by good movement;
- rational firing decisions instead of frame-perfect release whenever a mathematical intercept exists;
- relocation decisions when pressure or approach makes the current firing position unsafe.

Elite AI may predict better and commit more intelligently, but it should not bypass the interaction model.

## What not to do

Avoid solving the problem only by:

- cutting sniper damage until the class is uninteresting;
- adding universal invulnerability/dodge buttons solely to counter Railguns;
- making sniper accuracy random;
- creating a hard “anti-sniper” class that invalidates the lineage;
- making every Railgun shot trivially destructible by one bullet;
- adding an enormous laser sight that makes competent sniping impossible;
- permanently revealing off-screen snipers with exact-position markers;
- making the approach automatic once the first shot misses.

The target is **high lethality + high readability + high commitment + high outplay potential**.

## Validation questions for a sniper rework

A successful implementation should make all of these answers “yes”:

- Can an expert sniper outperform an average sniper by a large margin?
- Can an expert target survive situations an average target would not?
- Can the sniper deliberately outplay common anti-sniper responses?
- Can the target deliberately bait or punish a bad sniper shot?
- Can projectile interception be executed reliably when geometrically correct?
- Can an off-screen target infer useful bearing/timing information without receiving the sniper's exact location for free?
- Does surviving a shot create a meaningful opportunity to gain ground?
- Can suppression, movement deception, route choice, and interception all contribute to an approach?
- Can closing distance meaningfully change the duel without automatically deciding it?
- Does the sniper remain frightening when played well?
- When a player dies to a sniper, can they usually identify something they could have done differently?

## Global rule

Whenever NOVA gains a new class, evolution, hybrid gene, weapon, AI behavior, map feature, boss mechanic, movement option, or defensive system, evaluate it for **skill ceiling, skill floor, readability, counterplay, and punishability** — not balance numbers alone.

NOVA TANKS should continuously move toward fights where better decisions and better execution matter more than unavoidable matchup math.
