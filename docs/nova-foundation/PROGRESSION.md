# Canonical Progression, Upgrades & Effective Builds

Mission 11 makes `src/game/progression/` the canonical, headless owner of persistent progression math. The materialized runtime remains the shipping authority until later cutover missions.

## Ownership

- `ProgressionSystem.ts` owns XP thresholds, XP gain, level advancement, level-awarded stat points, validation, and the existing pity-start rule.
- `UpgradeSystem.ts` owns upgrade spending, rank validation, the canonical rank cap from Mission 05 content, spent-point accounting, and v1.10.8 applied-power parity.
- `EvolutionSystem.ts` owns legal class edges and the level 10 / 20 / 30 / 35 / 40 milestone sequence, including mastery selection and foreign-gene validation.
- `BuildResolver.ts` converts persistent progression choices plus Mission 05 content into an inspectable `TankBuild`.

## Preserved formulas

The resolver preserves the current materialized runtime formulas rather than retuning them:

- XP threshold: `floor((22 * level^1.42) / 10) * 10`, maximum level 45.
- Wealth mastery: `1.30x` awarded XP.
- Max HP: `(100 + 14 * maxhpRank) * classHpMultiplier * (1 + level * 0.02)`, then Vitality `1.30x` and Guardian gene `1.22x`.
- Move speed: `124 * classMoveMultiplier * (1 + 0.045 * speedRank)`, then Turbo Core `1.14x` and Guardian gene `0.93x`.
- Projectile damage: base damage `* (1 + 0.13 * damageRank) * (1 + min(level,30) * 0.012)`, then Heavy Rounds `1.18x` and Sniper gene `1.10x`.
- Projectile speed: base speed `* (1 + 0.085 * bulletSpeedRank)`, then Sniper gene `1.35x`.
- Reload: base reload `/ (1 + 0.095 * reloadRank)`, then Auto-Loader `0.82x`; Gunner/Sniper gene `1.08x`; Cannon gene `1.10x`.
- Penetration: base penetration `+ floor(penetrationRank * 0.6)`, plus one for Sniper gene.
- Body damage: `26 * classBodyMultiplier * (1 + 0.1 * bodyRank)`, Spiked Hull `1.15x`, Guardian gene `1.35x`.
- Regen: `(0.9 + 0.55 * regenRank) * classHpMultiplier`, Vitality `1.30x`. The post-hit recovery multiplier remains transient combat state.

## Applied power parity

`appliedPowerLevel = min(rawLevel, 1 + spentStatPoints, MAX_LEVEL)` (with a floor of 1). This is the v1.10.8 rule that prevents banked points from strengthening rivals before the player actually commits those points.

## Validity rules

Upgrade ranks must be integers from zero through the Mission 05 `maxRank` (currently 8). Spending requires an available point and an uncapped stat. Evolution is permitted only across an explicit `EvolutionRegistry` edge at or beyond its threshold. Mastery requires level 30 and can be chosen once. Gene splicing requires level 35, tier 2+, can be chosen once, and must be foreign to the current lineage. Tier 3 tanks cannot exist below level 40.

Delaying a milestone remains legal. A level-20 Scout or level-40 tier-1 tank is valid until the player chooses to evolve, matching the existing `DECIDE LATER` behavior.

## Deliberate exclusions

Mission 11 does not own input/UI offers, AI archetype policy, damage application, active abilities, temporary buffs/debuffs, minigun spool, elite/time scaling, drone navigation, persistence, rendering, or live runtime cutover. Those remain with their assigned missions.
