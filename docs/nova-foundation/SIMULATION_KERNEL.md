# NOVA Simulation Kernel

Mission 06 establishes the first canonical gameplay foundation that can run with no browser presentation layer.

## Ownership

`src/game/simulation/` owns deterministic simulation infrastructure only:

- `GameWorld` lifecycle and controlled stepping;
- `GameClock` fixed-step time;
- `GameState`, `GameEvent`, `GameSnapshot`, lifecycle and entity-ID contracts;
- `SeededRandom` deterministic pseudo-randomness;
- renderer-independent `Vec2` math primitives;
- snapshot/restore of clock, RNG, pending semantic events and simulation data.

The public boundary is `src/game/simulation/index.ts`.

## Lifecycle

A world begins `idle`. `start()` makes it runnable, `pause()` freezes stepping without destroying state, `resume()` continues from the exact clock/RNG state, and `stop()` is terminal. `step(n)` advances exactly `n` fixed ticks and is legal only while the world is running.

The clock is controlled by simulation calls rather than wall-clock time. No `requestAnimationFrame`, `Date.now`, DOM timer, renderer or input source owns simulation time.

## Determinism contract

With the same initial data, seed, fixed step, system order and commands, two worlds must produce the same state snapshot and semantic event stream. The seeded RNG exposes explicit state so snapshots can restore the random sequence exactly.

Mission 06 does not yet define command ordering, battlefield geometry, canonical entities, combat, movement or replay files; those belong to later missions. This mission only provides the deterministic primitives those systems will consume.

## Headless boundary

Canonical simulation code must not depend on React, DOM APIs, canvas, CSS, WebAudio or touch input. Regression tests compile the TypeScript kernel to a temporary CommonJS target, instantiate it under Node, step it, inspect it, restore snapshots and stop it with `window` and `document` absent.

## Legacy relationship

The shipping materialized runtime remains the gameplay authority after Mission 06. No legacy simulation behavior is deleted or rerouted yet. The new kernel is an architectural foundation for Missions 07 onward, not a second active gameplay implementation.
