# NOVA TANKS tests

`tests/node/` is the current legacy NOVA regression harness and remains authoritative during the early migration.

Foundation-target categories are reserved alongside it:

- `unit/` — isolated canonical module behavior
- `simulation/` — deterministic headless game scenarios
- `parity/` — legacy-vs-Foundation equivalence
- `regression/` — cross-cutting gameplay regressions
- `integration/` — application/subsystem composition
- `fixtures/` — deterministic maps, commands and snapshots

Mission 02 removed only the three Aquascape-specific Node test files whose dependencies lived exclusively in the deleted Aquascape `runtime/` mirror.
