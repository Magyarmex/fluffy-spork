# NOVA Foundation — Canonical Content & Schemas

**Mission:** 05 — Canonical Content & Schemas  
**Frozen production specimen:** `main@52009c406b948a7b9a9402bb56495f20b3918ba6`  
**Foundation predecessor:** Mission 04 integrated at `8cf5318100383538f35b27a96e6e48435b53b8b0`

## Purpose

Mission 05 creates the source-owned definition graph that later Foundation missions can migrate gameplay onto without inventing a second set of tank, weapon, drone, upgrade, evolution, Battlefield, progression, visual, or balance literals.

The public boundary is `src/content/index.ts` (`@content`). Lobby, Blackglass, AI, UI, simulation, diagnostics and future tools should consume that boundary rather than copy definitions into scene-specific catalogs.

## Canonical ownership

- `src/content/schema.ts` defines the typed contracts for tanks, weapons/projectiles, drones, lineages, stat upgrades, abilities, genes, mastery perks, evolutions, Battlefield terrain, and shared balance values.
- `src/content/tanks/catalog.ts` is the single literal source for the 36 tank chassis definitions. Weapon, projectile, drone, visual barrel, color, icon and class balance data live with the owning tank definition.
- `src/content/catalog.ts` resolves effective tank metadata overlays and owns lineages, genes, abilities, mastery perks, evolution edges, Battlefield templates, and shared balance constants. `WeaponRegistry` and `DroneRegistry` are derived from the effective tank graph, so their values are not duplicated.
- `src/content/upgrades/catalog.ts` owns the eight assignable stat upgrade IDs and their effective normal rank cap.
- `src/content/registry.ts` provides the immutable registry primitive used by the content domains.
- `src/content/index.ts` is the supported import surface.

This is deliberately a definition migration, not a gameplay migration. The active legacy runtime still executes the game and its patch chain until the later system missions replace those owners.

## Resolution method

The class specimen was resolved from the materialized `game/classes` module in production `index.html`, including all 36 class IDs, weapon/projectile literals, chassis multipliers, barrel geometry, drone defaults/overrides, aura values, ability IDs, genes, abilities, perks, and evolution relationships.

The assignable upgrade catalog was resolved from the effective player/AI stat keys: `damage`, `reload`, `bulletspeed`, `penetration`, `maxhp`, `regen`, `speed`, and `body`. The normal effective rank ceiling is 8. Formula application remains simulation behavior and is not duplicated into content definitions.

The three Battlefield templates were resolved from active `nova-updates/battlefield-v1.6.0.js`: `CROSSFIRE`, `SPLIT HORIZON`, and `FOUR GATES`, including their unrotated/unmirrored wall, pillar and destructible-cover geometry and cover HP. Rotation/mirroring and random layout selection remain runtime behavior rather than content literals.

Later active patches were reviewed as overlays. When they alter behavior dynamically (heat gates, cover multipliers, AI cadence, pathing, sensory effects, etc.), those mechanics remain with their current legacy owner until the assigned migration mission. Mission 05 does not convert dynamic behavior into fake static balance fields.

## Effective-value rules and ambiguities

### Escort defaults

The materialized class registry uses an `ESCORT` spread object (`escort`, 4.5 damage, 30 HP, 220 speed, 250 leash) and then overrides fields per class. Canonical tank definitions preserve the resulting values. The derived `DroneRegistry` resolves defaults once; downstream consumers do not need to understand the old spread/composition trick.

### Default projectile lifetime

Legacy calculations use `1.05s` when a projectile definition omits `ttl`. The canonical balance catalog records `defaultProjectileTtlSeconds: 1.05`; an omitted per-weapon TTL still means the legacy default rather than an invented explicit stat.

### Apex Doctrine `quakecannon` mismatch

Active `apex-disciplines-v1.7.1.js` refers to a class key/ID named `quakecannon`, while the actual canonical/materialized class is `quake`. That means class-definition overrides keyed only to `quakecannon` do not apply to `quake` as written. Mission 05 records this as legacy evidence and does **not** rename the class, rebalance it, or silently repair the behavioral patch. The effective `quake` description therefore remains the base text, `Trades some peak blast for much faster heavy-shell cadence.` A later behavior-migration mission can address the defective patch key with explicit parity coverage rather than smuggling a gameplay fix into content extraction.

### Description overlays

Where an active class patch successfully replaces a class description, the canonical registry uses the effective patched wording. Descriptions are presentation metadata; their inclusion here prevents Blackglass/lobby from inventing a parallel class dossier catalog.

### Stat upgrade formulas

`UpgradeRegistry` owns identity, display label, and the normal rank ceiling. Damage, reload, speed, penetration, health, regeneration and body-damage formulas remain with the current simulation/runtime until their assigned migration mission. This prevents Mission 05 from turning dynamic behavior into a second calculation engine.

### Audio metadata

The legacy game generates audio procedurally and later patches add behavior-specific SFX methods. There is no stable per-class or per-weapon audio-definition literal equivalent to the class/weapon registries. The schema therefore reserves optional definition-driven audio metadata without inventing values. Audio ownership and cleanup remain Mission 22 work.

## Parity protection

`tests/node/canonical-content-mission-05.test.js` evaluates the frozen materialized class object and the canonical raw tank catalog as data, resolves the legacy `ESCORT` spread, and compares every class's structural/balance fields. It also evaluates Battlefield's three legacy template builders at zero rotation/mirroring and compares their generated geometry against the canonical Battlefield catalog.

`tests/node/canonical-upgrades-mission-05.test.js` checks all eight assignable stat keys against the materialized runtime, protects the normal rank-8 ceiling, and requires `UpgradeRegistry` on the public `@content` surface.

The parity suite additionally checks doctrine-description overlays, registry coverage, genes, abilities, perks, evolution edges, the public content surface, and the absence of scene-specific Blackglass/lobby registries.

## Deliberate non-changes

Mission 05 does not:

- rebalance any tank, projectile, drone, upgrade, ability, perk, gene or Battlefield value;
- redesign the lineage/evolution tree;
- repair dynamic gameplay defects discovered while extracting definitions;
- replace the active legacy `game/classes` module yet;
- create a second Blackglass/showroom/lobby definition set;
- move AI, combat, rendering, audio, persistence or scene behavior into `src/content`.

The legacy adapter is intentionally not made to overwrite `game/classes` in this mission. Doing so before the simulation migration would make the old runtime depend on a second boot path and would increase parity risk for no user-visible benefit. Later missions can switch consumers one boundary at a time to `@content` once their owning systems move into `src/`.
