# NOVA TANKS — Development Roadmap

This roadmap is intentionally lightweight. It records high-value weaknesses and larger projects so autonomous development can continue them across multiple scheduled runs instead of forgetting discoveries between releases.

## Active priorities

### P0 — Sniper counterplay and skill duel
**Status:** planned / highest-priority combat-design issue

**Problem:** Sniper/Railgun combat currently has insufficient counterplay. Hypervelocity, high-damage, high-penetration shots can become effectively unavoidable, and the existing projectile-interception system is not robust enough to support deliberate defense against them.

On mobile, the sniper can be completely outside the player's field of view. The target often sees only the incoming projectile, so counterplay cannot depend on visually tracking the sniper tank itself.

**Design objective:** Preserve sniper lethality and the fantasy of a silent killer beyond visual range while turning sniper encounters into high-skill duels for both sides. Approaching classes should have mechanics that let good defensive reads translate into territory gained.

**Core interaction loop:**

**Detect bearing → manipulate aim → survive/intercept the shot → exploit recovery → take territory → repeat.**

**Preferred workstream:**
1. Implement robust swept/continuous projectile-vs-projectile collision for fast rounds.
2. Decouple tank penetration from projectile interception durability (`interceptHP` or equivalent).
3. Add an off-screen threat language for mobile and desktop:
   - restrained directional scope glint at the screen edge when a deeply focused sniper is aiming near the player's lane;
   - subtle directional charge sound before a highly committed shot;
   - short in-flight sonic crack / whip for nearby Railgun rounds;
   - brief persistent tracer/rail trail after firing so attentive players can infer bearing;
   - stronger temporary origin information after a missed full-power shot, without permanently revealing exact position.
4. Prototype readable sniper focus/charge with aim commitment rather than a simplistic damage nerf.
5. Preserve weaker quick-shots so rushed snipers still have execution options.
6. Create meaningful post-shot recovery so a successful dodge/interception produces an **earned advance window**.
7. Make movement deception a real approach skill: cadence changes, feints, diagonal advancement, retreat-to-bait, timed lane crossing, and cover transitions.
8. Prototype skill-based suppression: accurate near-miss fire and direct hits can interfere with deep focus, while random distant spam has little effect.
9. Make close-range pressure and range compression matter mechanically rather than through arbitrary damage penalties.
10. Build future map geometry around alternating exposed/protected spaces, flank routes, firing lanes, and non-permanent sniper positions.
11. Make sniper AI obey the same focus, tracking, reaction, cue, relocation, and recovery constraints as players.
12. Validate that both the sniper and target gain meaningful skill expression.
13. Tune damage/reload numbers only after the interaction model and collision model work reliably.

**Acceptance criteria:**
- expert defensive fire can intentionally intercept or weaken sniper rounds;
- interception does not depend on frame-alignment luck;
- an off-screen player can infer useful bearing/timing information without receiving exact sniper coordinates for free;
- expert movement can bait committed sniper aim;
- expert snipers can counter-bait and outperform weak snipers;
- missing creates a real punish/advance window;
- surviving a shot can be converted into measurable ground gained;
- accurate suppression can contest deep focus without making random spam a hard counter;
- closing distance changes the matchup;
- map route choice can matter during an approach;
- the sniper can still outplay a rush through prediction, quick-shots, relocation, and terrain use;
- the sniper remains dangerous and satisfying;
- deaths generally feel attributable to a readable mistake rather than unavoidable damage.

See [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md) for the full skill-expression doctrine and expanded sniper case study.

## Standing design requirement

Every future system should be evaluated for skill ceiling, skill floor, readability, counterplay, punishability, and opportunities for mastery. NOVA TANKS should prefer interactive depth over stat-check balance.
