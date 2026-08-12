# Rendering-domain agent rules

`src/rendering/` is presentation-only.

- Consume canonical content metadata, simulation/entity snapshots, battlefield state and semantic events.
- Never apply damage, choose targets, resolve collision, move entities, mutate progression or decide allegiance.
- Do not duplicate tank, weapon, projectile, drone or battlefield gameplay definitions.
- Keep Blackglass, lobby and gameplay scenes on shared rendering factories rather than scene-specific copies.
- Rendering optimizations must preserve authoritative state and semantic-event meaning.
