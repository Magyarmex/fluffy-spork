# NOVA TANKS — Development Roadmap

This roadmap is intentionally lightweight. It records high-value weaknesses and larger projects so autonomous development can continue them across multiple scheduled runs instead of forgetting discoveries between releases.

## Active priorities

### P0 — Sniper counterplay and skill duel
**Status:** planned / highest-priority combat-design issue

**Problem:** Sniper/Railgun combat currently has insufficient counterplay. Hypervelocity, high-damage, high-penetration shots can become effectively unavoidable, and the existing projectile-interception system is not robust enough to support deliberate defense against them.

**Design objective:** Preserve sniper lethality while turning sniper encounters into high-skill duels for both sides.

**Preferred workstream:**
1. Implement robust swept/continuous projectile-vs-projectile collision for fast rounds.
2. Decouple tank penetration from projectile interception durability (`interceptHP` or equivalent).
3. Prototype readable sniper focus/charge with aim commitment rather than a simplistic damage nerf.
4. Add meaningful post-shot vulnerability / origin reveal.
5. Make close-range pressure and line-of-sight control matter.
6. Make sniper AI obey the same focus, tracking, and reaction constraints as players.
7. Validate that both the sniper and target gain meaningful skill expression.
8. Tune only after the interaction model works reliably.

**Acceptance criteria:**
- expert defensive fire can intentionally intercept or weaken sniper rounds;
- interception does not depend on frame-alignment luck;
- expert movement can bait committed sniper aim;
- expert snipers can counter-bait and outperform weak snipers;
- missing creates a real punish window;
- closing distance changes the matchup;
- the sniper remains dangerous and satisfying;
- deaths generally feel attributable to a readable mistake rather than unavoidable damage.

See [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md) for the full skill-expression doctrine and sniper case study.

## Standing design requirement

Every future system should be evaluated for skill ceiling, skill floor, readability, counterplay, punishability, and opportunities for mastery. NOVA TANKS should prefer interactive depth over stat-check balance.
