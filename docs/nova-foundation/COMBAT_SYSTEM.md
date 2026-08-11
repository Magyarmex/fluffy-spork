# Canonical Combat System

Mission 10 establishes `src/game/combat/` as the renderer-independent combat authority for NOVA TANKS.

## Ownership

`CombatSystem` owns deterministic weapon cadence, barrel selection, muzzle/projectile spawn semantics, direct-hit resolution, damage mitigation, penetration consumption, splash exposure, cover damage, cluster emission, defensive status effects, and tier-2/apex ultimate gameplay actions. It consumes the canonical Mission 05 `WeaponDefinition` and `AbilityDefinition` registries rather than duplicating class balance tables.

`CombatDisciplines` owns the active v1.7.0 **Three Disciplines** and v1.7.1 **Apex Doctrine** combat transformations as pure mechanics. This is required because those runtime layers are part of current effective combat behavior, not presentation or later AI tactics.

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

## Current combat disciplines

The canonical combat boundary also preserves the effective class-specific rules installed by `disciplines-v1.7.0.js` and `apex-disciplines-v1.7.1.js`.

### Gunner

- Heat, stability, deterministic recoil, cooling and the 0.56 sweet-spot curve are pure state transitions.
- Stable shots in the cadence band preserve the live damage/speed reward; overheating increases deterministic spread and recoil.
- **Tempest** keeps the broad redline band, 0.88 cadence reward, overshoot penalty and extra recoil window.
- **Needle Storm** keeps the narrow precision gate that adds 8% projectile speed, 4% damage and one penetration when heat/stability are correctly disciplined.
- **Breachlord** keeps the settled-volley tightening/damage reward and 0.30-second recovery commitment with its 0.86 movement multiplier exposed to movement authority.
- **Flakmaster** keeps the stability-driven tightening, speed and TTL reward.

AI vent timing remains for Mission 16 because deciding *when* an AI fires or vents is tactics; the underlying heat/cadence mechanics are already canonical here.

### Cannon

- Programmable fuse distance preserves `range × (0.20 + 0.78 × depth)`, bounded to the live minimum/maximum, and preserves the armed threshold.
- Structural multipliers preserve the current lineage values, including Siege Bomber's active 2.35 specialization.
- **Cluster King** exposes deterministic forward-sector child angles with width `1.92 - 0.88 × depth`.
- **Annihilator** preserves deep-fuse damage, splash, knockback and reload commitment scaling.
- **Quake Cannon** preserves depth-scaled knockback and splash geometry.
- Structural extra-damage computation is canonical while Battlefield remains the code that owns cover HP, breakage and rubble.

The input adapter that derives fuse depth from stick/mouse belongs to Mission 13; combat receives the canonical depth value rather than reading devices.

### Guardian

- Directional frontal arcs, passive reduction and active defensive reduction preserve the class-specific v1.7 profiles instead of reverting to legacy 360-degree defense.
- Perfect Guard windows produce zero damage and a full countercharge; canonical countershots preserve the 34% damage, 8% speed and high-charge penetration reward.
- **Bastion** anchoring adds its 0.82 frontal factor only while correctly faced and sufficiently anchored.
- **Aegis** exposes the 1.10 post-Perfect-Guard mobility-flow multiplier to movement authority.
- Juggernaut/Meteor/Ravager charge is a deterministic state transition; terrain bumps dump charge and body-damage scaling remains canonical.
- **Meteor** retains the higher straight-line charge/impact ceiling, while **Ravager** retains its more forgiving steering profile and lower peak multiplier.

Facing, movement and terrain collision remain owned by their canonical systems; combat consumes their values rather than duplicating physics.

## Ultimate abilities

The live game calls the tier-2/apex class abilities “ultimate” abilities. Mission 10 preserves their authoritative semantics:

- **Ragnarok:** bespoke 3x-damage shell, 0.9x projectile speed, penetration 2, 1.4s TTL, 160 splash, 0.8 splash scale, 540 knockback.
- **Overheat:** reload time is multiplied by 0.52 for 5 seconds (equivalent to about 1.923x fire rate).
- **Point Blank:** nine projectiles over a 0.52-radian cone, 0.95x damage, 1.25x speed, radius 5, penetration 1, 0.45s TTL, and at least 0.45s weapon lock.
- **Supercharge:** the next beam deals 2.5x damage and has effectively unlimited penetration; the charge is consumed only by a beam shot.
- **Phase Shift:** requests a 420-unit blink toward aim, clamped to 30 units inside the battlefield boundary, with the preserved 0.7s cloak result.
- **Swarm:** exposes a temporary +2-drone capacity/frenzy action for 8 seconds; drone spawning/doctrine remains owned by its later subsystem.
- **Bulwark / Iron Will:** their base status contracts remain available, while current Guardian lineage battles use the directional v1.7 defense resolver above rather than the superseded 360-degree interpretation.
- **Stampede:** exposes its current movement/body multipliers; v1.7 Guardian charge further shapes ram impact through the canonical discipline layer.

Ability actions intentionally cross subsystem boundaries as typed actions. For example, Phase does not mutate movement state directly and Swarm does not implement drone AI.

## Damage and terrain boundaries

`resolveDirectHit` rejects same-team hits, applies explicit armor/base-reduction/status mitigation, consumes one finite penetration unit per accepted target hit, and emits damage/destruction/reflection events. Armor defaults to zero because the current canonical content does not introduce a separate armor stat; the contract exists for authoritative defensive mechanics without silently rebalancing current classes.

`resolveSplash` takes a 0..1 exposure value per target. That preserves the v1.7.2 blast-cover hardening boundary: fully blocked hulls can receive zero blast damage and partially exposed hulls receive proportional damage. The battlefield remains the terrain owner; combat accesses destructible cover only through `CoverDamagePort`, which is directly compatible with `Battlefield.damageCover`.

## Deliberate migration boundary

The materialized legacy engine remains the shipping game loop until the assigned integration/cutover missions. Mission 10 establishes canonical combat authority that later world integration can invoke; it does not add another live loop, rewrite `nova-updates`, or remove the compatibility bridge prematurely.

Progression-derived stat calculation is reserved for Mission 11. Perception/target selection is reserved for Mission 12. Device-to-command translation is reserved for Mission 13. AI firing/vent/ability decisions are reserved for Mission 16. Drone execution, repair and interception are reserved for Mission 17. Rendering, particles, camera effects, HUD and audio consume semantic events in later missions.
