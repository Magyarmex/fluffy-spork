# Unified Commands & Input

Mission 13 establishes `src/input/` as the canonical command boundary shared by human devices, deterministic tests, replay, lobby simulation, and future AI controllers.

## Canonical command language

`GameCommand` represents movement, aim, fire, ability activation, ultimate activation, Controller/swarm orders, and target designation. Commands are wrapped in ordered `CommandEnvelope` records carrying a source and monotonic sequence number. `CommandController` exposes a single `poll()` contract so command consumers do not need to know which device or controller produced the intent.

`reduceCommands()` folds those envelopes into `CanonicalControlState`. This state is input intent only: it does not own movement physics, combat resolution, targeting validity, cooldowns, progression, or other gameplay authority.

## Human adapters

Touch, mouse, keyboard, and gamepad adapters translate device-neutral samples into the same canonical commands. Browser event collection remains outside gameplay authority, making the adapters deterministic and testable. Settings are supplied through a live provider; sensitivity and deadzone affect translation only and are not stored as gameplay state.

Touch keeps the intended twin-stick model: movement and aim are independent, and ultimate/ability/fire state is independent from both sticks. This means a dedicated action touch can remain active while either stick is also held; no third virtual thumb channel is introduced.

## Scripted controllers

`ScriptedCommandController` is DOM-free and can label its command stream as `test`, `replay`, `lobby`, or future `ai`. This is the common seam later missions use instead of synthesizing keyboard, mouse, or touch events.

## Migration boundary

The materialized runtime remains the shipping input authority during this stage. Mission 13 creates the canonical source-owned command and adapter layer without prematurely cutting over the live legacy loop. Later AI, lobby, replay, and final cutover missions consume this boundary rather than adding parallel movement/fire implementations.
