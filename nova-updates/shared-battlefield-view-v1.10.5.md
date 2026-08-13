# NOVA TANKS v1.10.5 — Shared Battlefield View

AI battlefield awareness now follows the same information model exposed to the player by the normal minimap.

- Every living tank shown globally on the player minimap remains a live AI contact through cover and at long range.
- Terrain no longer freezes or expires target coordinates simply because direct line-of-sight breaks.
- Covered contacts remain usable for target selection, route planning, pre-aim, flanking, lane holding, and legal structural breach decisions.
- Ordinary direct fire still requires a physically valid line through terrain; permanent walls remain hard blockers.
- Cannon breach behavior can deliberately attack destructible cover when a publicly tracked target makes that tactically useful.
- Controller owners use the same public target information while their drones retain normal leash, pathing, collision, commitment, recovery, and attack rules.
- Sniper/Observer authorization, Cannon fuse behavior, Gunner heat, Guardian facing, cooldowns, projectile physics, and movement physics remain authoritative.
- Tactical replanning remains reaction-limited and predictive aim retains an error floor; this is information parity, not frame-perfect execution.
- No AI-only damage, HP, speed, reload, projectile-speed, or cooldown bonuses are introduced.

The durable doctrine is: **AI gets the player's information model and the player's mechanical rules.**
