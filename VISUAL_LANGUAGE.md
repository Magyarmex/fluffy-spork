# NOVA TANKS Visual Language

The battlefield should look rich, but gameplay signals must behave like language rather than decoration. The player tank starts from a **clean silhouette**. Anything that flashes, pulses, circles, trails, labels, blooms, or otherwise asks for attention must earn that attention by communicating something the player can use.

## The five questions

A gameplay visual must answer at least one of these questions clearly:

1. **What just happened?** Confirmation: a hit connected, an action activated, a drone link broke.
2. **Where is danger?** Threat: incoming damage direction, a committed hostile attack line, a dangerous world event.
3. **What can I do now?** Readiness: a deliberate weapon or ability has become actionable again.
4. **What state changes my next decision?** State: focus, critical health, guard facing, heat, command depth, or another mechanic the player actively manages.
5. **Where should I act?** Spatial: a command point, fuse point, relay contact, resource, cover breach, or other world location whose position matters.

Quiet static art may also serve **identity/material/geometry**: it can make a lineage, chassis, wall, projectile, or surface easier to recognize. It must stay low-salience and must never masquerade as a temporary gameplay state.

If a proposed effect cannot answer one of those questions, remove it.

## One event -> one primary visual

**One event gets one primary visual.** Audio and haptics may reinforce it, but the same event should not also create a tank ring, particle bloom, reticle flash, world ring, floating label, and screen border.

Choose the channel from the information:

- **World-space**: use only when location or physical extent matters.
- **Reticle**: use for aim, action confirmation, short readiness, and precision state.
- **Screen edge**: use for directional threats or urgent off-screen information.
- **HUD**: use for persistent scalar state that is better read than animated.
- **Chassis**: use for stable identity/material/geometry, or a mechanic whose actual hull boundary is the information.

Do not put a world-space ring on the player merely because the player triggered something. The hull is not a notification tray.

## Attention budget

The reticle has one transient primary-signal slot. Priority is:

1. hit / kill confirmation;
2. immediate state transition;
3. meaningful weapon readiness;
4. continuous precision state such as Sniper focus.

Directional danger is a separate edge channel and may coexist because it answers a different question. World-space tactical markers may coexist when their positions are independently important.

Full-frame borders, additive glow, large shadow bloom, and particle clouds are expensive attention. Reserve them for cases where scale itself carries information; otherwise prefer thin geometry and short duration. Death does not need a second visual saying "death." Firing does not need a second visual saying "shot" when the muzzle, projectile, recoil, and sound already say it.

## Player-tank baseline

The normal player tank should remain visually calm. In particular:

- no persistent decorative aura;
- no generic pickup/ability/evolution rings centered on the hull;
- no celebratory particle clouds attached to routine self-state changes;
- no duplicate Sniper focus meters;
- no near-miss victory ring or floating praise when sound/motion already communicates the event;
- no duplicate hit/kill punctuation at both reticle and target unless target location itself is tactically necessary.

Mechanical radii are different: if a shield, guard cone, blast radius, command position, or other physical boundary changes what can happen in world space, drawing that geometry is communication rather than decoration.

## Required declaration for future runtime visuals

Historical release files are immutable. New runtime layers that directly emit gameplay visuals must include at least one declaration in source using this marker:

`NOVA_VISUAL_INTENT:`

The declaration should sit next to the visual system or call site and identify:

- the **intent** (`confirmation`, `threat`, `readiness`, `state`, `spatial`, or `identity`);
- the **primary channel** (`reticle`, `edge`, `world`, `hud`, or `chassis`);
- the **player question** the visual answers;
- the **reason** that answer changes a decision.

At runtime, `window.NOVAVisuals.register(...)` provides the same contract in machine-readable form. `window.NOVAVisuals.audit()` exposes the registered inventory and suppressed legacy duplicates for diagnostics.

The regression suite scans production runtime files added after Second Body: Live Vector. If a new runtime directly emits visuals but has no `NOVA_VISUAL_INTENT:` declaration, CI fails. This turns the visual language into a maintenance rule rather than a one-time cleanup.

## Review checklist

Before shipping any visual, ask:

- What exact fact does it communicate?
- Does that fact change a player decision?
- Is this the correct location/channel for the fact?
- Is another visual already communicating the same event?
- Can it be smaller, shorter, calmer, or static without losing meaning?
- Does it remain readable when several fights overlap?
- Does it preserve the clean player silhouette when idle?

When two effects compete, prefer the one that carries more actionable information with less screen area.
