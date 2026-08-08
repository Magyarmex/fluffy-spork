# NOVA TANKS — Development Roadmap

This roadmap is intentionally lightweight. It records high-value weaknesses and larger projects so autonomous development can continue them across multiple scheduled runs instead of forgetting discoveries between releases.

## Active priorities

### P0 — Sniper counterplay and skill duel
**Status:** active — first implementation shipped in **v1.2.0 · Silent Horizon**

**Problem:** Sniper/Railgun combat previously had insufficient counterplay. Hypervelocity, high-damage, high-penetration shots could become effectively unavoidable, and the old projectile-interception system was not robust enough to support deliberate defense against them.

On mobile, the sniper can be completely outside the player's field of view. The target may see only the incoming projectile, so counterplay cannot depend on visually tracking the sniper tank itself.

**Design objective:** Preserve sniper lethality and the fantasy of a silent killer beyond visual range while turning sniper encounters into high-skill duels for both sides. Approaching classes should have mechanics that let good defensive reads translate into territory gained.

**Core interaction loop:**

**Detect bearing → manipulate aim → survive/intercept the shot → exploit recovery → take territory → repeat.**

### Shipped in v1.2.0
- Swept / continuous projectile-vs-projectile collision for hypervelocity rounds.
- Explicit Rail projectile integrity decoupled from tank penetration.
- Full-power Rail focus with approximately 520 ms commitment.
- Progressive turret-aim commitment during deep focus.
- Charge-scaled quick-shots when the player releases before full focus.
- Directional off-screen glint for deeply focused enemy Rail snipers threatening the player lane.
- Directional charge, incoming/flyby, full-discharge, and quick-shot procedural SFX.
- Brief post-shot bearing reveal / visual cue for committed shots.
- Accurate direct/near-miss suppression that can break deep focus.
- AI Rail snipers routed through the same focus/commitment interaction rather than instant full-power fire.

### Next sniper work
1. Playtest/tune focus duration, aim-turn limits, suppression radius, quick-shot curves, and interception integrity on actual mobile combat.
2. Measure whether successful defenses create enough practical territory gain without an artificial movement buff.
3. Improve future map geometry around alternating exposed/protected spaces, flank routes, firing lanes, and non-permanent sniper positions.
4. Add stronger firing-line/tracer persistence only if current bearing cues remain too ambiguous in practice.
5. Continue improving sniper AI prediction, counter-baiting, relocation, and decision quality while preserving human-like execution constraints.
6. Explore lineage-specific approach tools where they create soft counterplay:
   - Gunner: accurate suppression and lane pressure;
   - Cannon: deliberate heavy-projectile interception / lane denial;
   - Controller: scouting pressure and forced relocation;
   - Guardian: timed protective advancement without reducing the matchup to raw HP.
7. Validate with actual gameplay that expert snipers and expert defenders both gain substantial mastery paths.

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

See [`RELEASES.md`](./RELEASES.md) for the v1.2.0 implementation record.

## Standing design requirement

Every future system should be evaluated for skill ceiling, skill floor, readability, counterplay, punishability, and opportunities for mastery. NOVA TANKS should prefer interactive depth over stat-check balance.
