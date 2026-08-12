# Mission 12 — Targeting, Contacts & Perception Core

**Status: COMPLETE**

- Depends on: Missions 07, 08, 10 and 11.
- Focused branch: `novastar/mission-12-perception`.
- Initiative base: `5851cffd6b704f30572fba4b61f0d7ebf97cf02f` (Mission 11 integration).
- Production specimen checked before implementation: `main@52009c406b948a7b9a9402bb56495f20b3918ba6`; production had not advanced since Mission 11, so no mainline reconciliation was required.
- Implementation validation head: `f3c47f417d5dfd8cabfd1983d0c6cba838273f75`.
- Implementation CI: run `31480712407` — build, full Node regression suite, and production Tailwind validation all successful.

## Scope completed

- Established `src/game/targeting/` as the canonical targeting/contact/perception boundary.
- Added `PerceptionCore`, which converts authoritative entity state into copied controller-facing `PerceivedWorld` contacts instead of exposing raw hostile `EntityState`.
- Added explicit contact relations, information sources, visibility flags, live-vs-last-known freshness, targetability, and deterministic memory expiry.
- Integrated physical visibility through a `LineOfSightProvider` compatible with Mission 07 `Battlefield.hasLineOfSight`.
- Added `DesignationRegistry` with explicit team, observer, target, creation tick and expiry tick semantics.
- Added explicit observer/spotter relay through `relayObserverIds`; ordinary friendlies do not silently become reconnaissance relays.
- Added `TargetingService` so target validation and nearest-target acquisition operate on `PerceivedWorld`, not unrestricted game state.
- Documented the information contract in `docs/nova-foundation/TARGETING_PERCEPTION.md`.

## Legacy components retired or bypassed

- No shipping legacy patch is removed yet; the materialized runtime remains the live gameplay authority during migration.
- Canonical consumers now have a non-legacy information boundary ready for Missions 14–16, avoiding the need for future AI controllers to read raw hostile dynamic state directly.

## Validation performed

- `npm run build` passed through repository CI.
- Full `npm run test` passed through repository CI.
- Production Tailwind validation passed through repository CI.
- Mission 12 regression coverage proves:
  - the v1.10.5 shared battlefield map keeps covered living tanks as public positional contacts;
  - public-map contacts do not automatically expose precise hostile health or rotation;
  - hidden/unavailable hostile movement and health cannot leak into last-known contacts;
  - last-known information freezes at the last legitimate observation and expires deterministically;
  - only explicitly declared relay observers contribute team sight;
  - bounded designations create legitimate contacts and expire back to stale memory;
  - canonical target acquisition consumes `PerceivedWorld` rather than raw hostile entity arrays;
  - targeting source contains no DOM, renderer, audio, input, or AI-tactics authority.

## Behavior/parity notes

- Preserves the current v1.10.5 **Shared Battlefield View** contract: every living tank exposed globally by the normal player minimap remains a live positional contact through cover and long range.
- Preserves the rule that information is not mechanical permission: terrain still blocks ordinary direct fire even when a target position is public.
- Forward Observer/Spotter authorization is represented as explicit relay/designation state without moving Sniper class tactics into this mission.
- The default public-information policy is deliberately centralized so a future stealth mechanic can remove a target from player and AI knowledge through the same boundary.

## Mainline changes reconciled

- None. `main` remained at `52009c406b948a7b9a9402bb56495f20b3918ba6`, the same shipped specimen checked by Mission 11.

## Known limitations

- AI memory policy and threat interpretation remain Mission 14.
- Navigation remains Mission 15.
- Tactical target scoring and class controllers remain Mission 16.
- Human/test/replay command sources remain Mission 13.
- The legacy materialized runtime remains active until later cutover missions.

## Next mission

Mission 13 is unblocked only after this marker is present on the remote `NOVASTAR-INITIATIVE` branch and required post-merge CI is green.
