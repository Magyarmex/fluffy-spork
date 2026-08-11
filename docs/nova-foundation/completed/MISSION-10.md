# Mission 10 — Combat, Weapons & Abilities

**Status: COMPLETE**

## Sequence gate

Mission 09 was verified complete on canonical `NOVASTAR-INITIATIVE` commit `97ed590746576140c252d190b224121654801773`. Exact post-merge CI run `31467852850` completed successfully before Mission 10 began. Production `main` remained `52009c406b948a7b9a9402bb56495f20b3918ba6`, so no newer mainline behavior required reconciliation.

## Completed scope

- Added the headless canonical combat boundary under `src/game/combat/`.
- Canonical weapon firing consumes Mission 05 `WeaponDefinition` data and preserves live single/shell, alternating twin, spooled minigun, shotgun and multi-barrel beam rules.
- Preserved logical muzzle placement, projectile velocity inheritance, damage-linked projectile radius growth, cooldown authority and deterministic spread injection.
- Added direct-hit authority for team rejection, damage, explicit armor/reduction inputs, finite/infinite penetration, destruction and semantic events.
- Added splash resolution with explicit hull exposure, preserving the existing blast-cover hardening boundary.
- Added canonical destructible-cover damage through a typed port compatible with `Battlefield.damageCover`.
- Added deterministic cluster-child emission.
- Migrated ultimate gameplay semantics for Ragnarok, Overheat, Point Blank, Supercharge, Phase Shift, Swarm, Bulwark, Iron Will and Stampede without presentation side effects.
- Cross-subsystem ultimate outcomes are typed actions: Phase requests a bounded blink, Swarm exposes temporary drone capacity, and movement/body multipliers remain consumable by their owning systems.
- Migrated active v1.7.0 Three Disciplines combat mechanics: Gunner heat/stability/cadence/recoil, Cannon programmable fuses and structural specialization, Guardian directional defense, Perfect Guard/countershots, and charge/body-damage rules.
- Migrated v1.7.1 Apex Doctrine combat outcomes for Tempest, Needle Storm, Breachlord, Flakmaster, Cluster King, Siege Bomber, Annihilator, Quake Cannon, Bastion, Aegis, Meteor and Ravager.
- Kept AI decision timing, device-derived fuse input, movement execution and drone behavior in their assigned later missions while exposing the exact combat-side state transitions and multipliers they consume.
- Added `COMBAT_SYSTEM.md` documenting authority, exact preserved mechanics and remaining migration seams.

## Preserved invariants

- No visual effects, camera shake, audio, HUD, DOM, React or device-input behavior moved into combat.
- No weapon/class rebalance was introduced; class-specific rules were lifted from active v1.7.0/v1.7.1 runtime behavior.
- Progression-derived effective stat calculation remains reserved for Mission 11; combat accepts applied multipliers rather than owning progression state.
- Target/perception authority remains reserved for Mission 12; device-to-command translation remains reserved for Mission 13.
- AI firing/venting/ability decisions remain reserved for Mission 16; the underlying combat discipline mechanics are canonical here.
- Drone doctrine/repair/interception remains reserved for Mission 17; Swarm only exposes its authoritative temporary capacity/frenzy action.
- The materialized legacy engine remains the shipping gameplay loop until the assigned integration/cutover missions.
- Production `main` was not modified.

## Validation

Deterministic Node scenarios cover the starter plus all five lineages, major weapon families/fire modes, cooldown/spool behavior, muzzle/barrel rules, inherited velocity, damage/armor/penetration, friendly-fire rejection, splash exposure, cover damage, cluster emission, and every ultimate family.

Additional parity scenarios compare the active Three Disciplines/Apex Doctrine mechanics: Gunner sweet spot and heat, Tempest redline, Needle Storm precision penetration, Breachlord recovery, Flakmaster discipline, Cannon fuse geometry and structural pressure, Cluster King sector geometry, Annihilator/Quake depth tradeoffs, Guardian directional defense, Perfect Guard/countershots, Bastion anchoring, Aegis flow, and Meteor/Ravager charge behavior. A source guard rejects browser/presentation/audio authority inside `src/game/combat/`.

The corrected discipline parity head `78024a044b177d379ffe48ffdff3b9d0618c2a91` passed exact CI run `31472848577`. The final implementation/documentation head `ab0bb94049acab42e82bdbe33d00231e2bce2f35` passed exact CI run `31472924509`: production build/typecheck, the full 282-test Node regression suite, and Tailwind validation all succeeded.

## Next gate

Mission 11 may begin only after this sealed mission branch is merged into `NOVASTAR-INITIATIVE` and CI succeeds on the exact integrated merge commit.
