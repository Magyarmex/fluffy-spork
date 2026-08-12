# AI-domain agent rules

`src/ai/` owns tactical decision-making, memory and navigation policy, not hidden world authority.

- Dynamic hostile knowledge must enter through `PerceivedWorld` / canonical AI-knowledge and memory interfaces.
- Never read `GameWorld` or `EntityStore` directly to discover hidden hostile state.
- Use canonical battlefield/navigation services for movement planning and terrain reasoning.
- Express executable intent through canonical `GameCommand`-level controls where provided.
- AI receives no private physics, damage, cooldown, targeting or movement advantages.
- Keep reaction cadence, memory decay, aim error and stochastic choices deterministic from canonical state/seed.
