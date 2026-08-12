# Mission 11 — Progression, Upgrades & Effective Builds

**Status: COMPLETE**

- Depends on: Missions 05 and 10.
- Focused branch: `novastar/mission-11-progression`.
- Initiative base: `3b5922772be17c3811bc383093ef790a435fbfea` (Mission 10 integration).
- Production specimen checked before sealing: `main@52009c406b948a7b9a9402bb56495f20b3918ba6`; production had not advanced, so no mainline reconciliation was required.
- Implementation validation head: `2f2f1678a7b2dc102db5d6cb80f066987cfcf89b`.
- Implementation CI: run `31476924927` — build, full Node regression suite, and production Tailwind validation all successful.

## Canonical ownership established

`src/game/progression/` now owns persistent XP/level rules, upgrade spending and validation, mastery/evolution/gene milestone rules, the v1.10.8 spent-point applied-power calculation, and an inspectable `TankBuild` projection of effective persistent stats.

The resolver consumes Mission 05 canonical content and preserves the effective materialized formulas for health, speed, projectile damage/speed/penetration, reload, body damage, regen, passive damage reduction, reflection, weapon range, and drone stat projection. No balance values were retuned.

## Safety and parity decisions

- Normal stat ranks are enforced at the canonical Mission 05 cap of 8.
- Banked stat points do not increase applied power; only spent points do.
- Evolution must follow explicit registry edges and level gates.
- Mastery and gene selections reject premature, duplicate, or native-lineage states.
- Delayed milestones remain legal, preserving the existing `DECIDE LATER` behavior.
- The first regression fixture intentionally attempted a level-29 mastery state and was rejected by the new validator; the fixture was corrected rather than weakening the invariant.

## Deliberately not migrated

The materialized runtime remains the shipping gameplay authority. Mission 11 does not take ownership of UI/input offers, AI policy, transient combat modifiers, ability state, drone navigation, persistence, rendering, audio, or live cutover. Those remain assigned to later missions.
