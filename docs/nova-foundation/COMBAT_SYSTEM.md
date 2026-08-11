# Canonical Combat System

Mission 10 establishes `src/game/combat/` as the renderer-independent combat authority for NOVA TANKS.

## Ownership

`CombatSystem` owns deterministic weapon cadence, barrel selection, muzzle/projectile spawn semantics, direct-hit resolution, damage mitigation, penetration consumption, splash exposure, cover damage, cluster emission, defensive status effects, and tier-2/apex ultimate gameplay actions. It consumes the canonical Mission 05 `WeaponDefinition` and `AbilityDefinition` registries rather than duplicating class balance tables.

The subsystem emits `CombatSemanticEvent` values and typed `CombatAbilityAction` values. It does not call rendering, particles, camera shake, sound, input, DOM, or HUD code.

## Preserved weapon behavior

The canonical firing rules preserve the effective materialized runtime behavior at `main@52009c406b948a7b9a9402bb56495f20b3918ba6`:

- single/shell weapons fire their primary barrel;
- twin weapons alternate barrels;
- miniguns cycle barrels, use spool-dependent cadence, and accept deterministic spread samples from the simulation RNG;
- shotguns emit the configured pellet count over the configured cone, retain the small legacy spread jitter hook, use 1.05 projectile-speed and 0.95 radius multipliers;
- multi-barrel beams emit every beam with the existing 0.72 per-beam damage multiplier;
- projectile muzzle placement preserves the legacy `(barrel length + 8)` forward offset and lateral barrel offset;
- projectiles inherit 22% of shooter velocity;
- heavier rounds retain the legacy damage-linked radius growth, with the smaller beam growth curve;
- default projectile TTL remains 1.05 seconds where content does not override it.

Reload, damage, projectile-speed, armor/reduction, and similar applied-build multipliers are explicit inputs. Mission 11 will own progression-derived effective builds rather than forcing progression state into combat.

## Ultimate abilities

The live game calls the tier-2/apex class abilities “ultimate” abilities. Mission 10 preserves their authoritative semantics:

- **Ragnarok:** bespoke 3x-damage shell, 0.9x projectile speed, penetration 2, 1.4s TTL, 160 splash, 0.8 splash scale, 540 knockback.
- **Overheat:** reload time is multiplied by 0.52 for 5 seconds (equivalent to about 1.923x fire rate).
- **Point Blank:** nine projectiles over a 0.52-radian cone, 0.95x damage, 1.25x speed, radius 5, penetration 1, 0.45s TTL, and at least 0.45s weapon lock.
- **Supercharge:** the next beam deals 2.5x damage and has effectively unlimited penetration; the charge is consumed only by a beam shot.
- **Phase Shift:** requests a 420-unit blink toward aim, clamped to 30 units inside the battlefield boundary, with the preserved 0.7s cloak result.
- **Swarm:** exposes a temporary +2-drone capacity/frenzy action for 8 seconds; drone spawning/doctrine remains owned by its later subsystem.
- **Bulwark:** full damage immunity for 4 seconds.
- **Iron Will:** 65% damage reduction for 3 seconds and reflection equal to 30% of pre-reduction incoming damage.
- **Stampede:** 1.9x movement and 2x body damage for 4 seconds; movement consumes the multiplier rather than combat moving the tank directly.

Ability actions intentionally cross subsystem boundaries as typed actions. For example, Phase does not mutate movement state directly and Swarm does not implement drone AI.

## Damage and terrain boundaries

`resolveDirectHit` rejects same-team hits, applies explicit armor/base-reduction/status mitigation, consumes one finite penetration unit per accepted target hit, and emits damage/destruction/reflection events. Armor defaults to zero because the current canonical content does not introduce a separate armor stat; the contract exists for authoritative defensive mechanics without silently rebalancing current classes.

`resolveSplash` takes a 0..1 exposure value per target. That preserves the v1.7.2 blast-cover hardening boundary: fully blocked hulls can receive zero blast damage and partially exposed hulls receive proportional damage. The battlefield remains the terrain owner; combat accesses destructible cover only through `CoverDamagePort`, which is directly compatible with `Battlefield.damageCover`.

## Deliberate migration boundary

The materialized legacy engine remains the shipping game loop until the assigned integration/cutover missions. Mission 10 establishes canonical combat authority that later world integration can invoke; it does not add another live loop, rewrite `nova-updates`, or remove the compatibility bridge prematurely.

Progression-derived stat calculation is reserved for Mission 11. Perception/target selection is reserved for Mission 12 and later AI missions. Human/replay commands are reserved for Mission 13. Rendering, particles, camera effects, HUD and audio consume semantic events in their later missions.
