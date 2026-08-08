# NOVA TANKS v1.7 — Three Disciplines

v1.7 brings the three remaining legacy combat lineages up to NOVA's skill-expression standard without adding new combat buttons.

The shared requirement is still **Read → Respond → Punish**. Each lineage should ask a different mechanical question while preserving the same twin-stick grammar.

---

## Gunner — Fire Discipline

### Mastery problem

**cadence + recoil control + burst discipline + sustained lane control + projectile interception**

Gunner should not be strongest because the player simply holds fire longer. Sustained fire now creates a dynamic weapon state.

### Heat

Every Gunner firing cycle adds heat. Heat falls when the player releases fire.

The middle of the heat range is a **cadence window**: the weapon is spun up and dangerous, but still controllable. Stable aim in this window gives a small deterministic ballistic advantage.

Excess heat does not randomly jam the weapon. Instead it increases **predictable recoil/dispersion** and physically pushes the hull backward. The player can therefore learn the weapon rather than lose to dice.

### Stability

Large aim-direction changes during a firing sequence lower stability. Releasing, settling the turret and controlling movement restores it.

- rotary weapons reward smooth tracking;
- Twin Gun rewards controlled trigger rhythm;
- shotguns tighten their existing pellet distribution when fired from a stable state;
- panic-spam at high heat throws the cone and hull farther off-line.

### AI parity

AI Gunners accumulate the same heat and recoil. When they exceed a sustainable state they are forced to vent instead of receiving infinite perfectly controlled fire.

Elite AI should eventually improve through better burst timing and lane choice, not heat immunity.

### Counterplay

- bait a Gunner into excessive heat before peeking;
- exploit physical recoil around walls/chokes;
- change direction sharply enough to force a tracking correction;
- use cover during the spun-up cadence window;
- counterfire into the projectile stream and exploit NOVA's projectile interception.

---

## Cannon — Fire Control

### Mastery problem

**prediction + blast placement + fuse programming + area denial + breach decisions**

A Cannon should attack *space*, not merely place a large projectile on a tank.

### Analog programmable fuse

No new control is added.

- **Right-stick direction:** aim the barrel.
- **Right-stick depth:** program detonation distance.
- **Mouse distance:** desktop equivalent.

The game draws a projected **FUSE** point along the firing direction. A surviving Cannon projectile detonates when it reaches that programmed distance.

Direct collision still takes precedence: if the projectile hits something before the fuse point, normal direct-hit behavior occurs.

### Airburst

A programmed airburst preserves the projectile's normal splash or cluster behavior.

This creates several skill tests:

- place the burst behind a moving target rather than aiming at its current position;
- detonate beside the edge of cover;
- program a short defensive burst against a rush;
- place Bomber/Cluster King submunitions into the route an opponent is about to occupy;
- use destructible Battlefield cover as part of the blast geometry.

Very short fuses are intentionally less efficient than properly armed space-control shots, preventing the system from becoming a universal point-blank damage button.

### AI parity

AI Cannon forms only program combat fuses when they have an actual hunt target. Fuse distance is derived from legitimate target distance rather than perfect hidden future knowledge.

### Counterplay

- change speed after seeing the projected firing relationship;
- cross the Cannon's chosen range before the shell arrives;
- use hard cover to force an early collision;
- pressure during the long reload after a committed heavy shell;
- manipulate destructible cover so the Cannon must choose between damaging you and opening the lane.

---

## Guardian — Facing and Counterplay

### Mastery problem

**orientation + interception timing + body positioning + counter timing + committed movement**

Guardian defense is no longer meant to be a 360-degree stat check.

### Directional frontal armor

A Guardian's turret/aim facing also defines its strong defensive arc.

The player can therefore move in one direction with the left stick while deliberately facing incoming pressure with the right stick.

Different evolutions have different guard geometry:

- **Guard:** broad general-purpose frontal defense.
- **Fortress:** stronger, somewhat narrower bunker facing.
- **Bastion:** strongest and narrowest frontal bunker.
- **Aegis:** widest active defensive arc and longest Perfect Guard timing window.
- **Juggernaut / Meteor / Ravager:** lighter frontal defense because more of their mastery budget belongs to momentum and impact.

Rear attacks remain dangerous.

### Directional defensive abilities

Legacy BULWARK and IRON WILL no longer function as unconditional 360-degree immunity/reduction for Guardian forms.

During the active state, the front arc receives strong mitigation. Side angles receive much less protection. Rear attacks can bypass the active guard.

### Perfect Guard

The first fraction of a second after activating a defensive state is the **Perfect Guard window**.

If a real incoming attack arrives through the defended arc during that window:

1. the attack is negated;
2. the guard produces explicit audiovisual confirmation;
3. the Guardian stores a **Countercharge**;
4. the next projectile consumes the charge for a stronger/faster countershot.

This creates the intended loop:

**read commitment → face correctly → time guard → absorb → punish**

rather than **press invulnerability whenever threatened**.

### Stampede momentum

Juggernaut descendants build a separate momentum resource while Stampede is active.

Charge grows when the tank maintains significant speed along a clean, consistent movement line. Sharp direction changes drain it. Hitting Battlefield terrain dumps most stored momentum.

Body damage during Stampede scales with this earned charge.

The result should make ramming about **route choice and commitment**, not merely touching the speed ability and steering freely at full power.

### AI parity

AI Guardians receive the same facing rules, directional defenses, Perfect Guard timing windows and Stampede momentum constraints.

Future elite improvement should come from better prediction of when to face/guard or when to choose a charge lane, never a hidden omnidirectional reduction.

### Counterplay

- attack from split angles;
- force the Guardian to choose which threat to face;
- bait the Perfect Guard and delay the real shot;
- flank during an active directional defense;
- use Battlefield corners to interrupt Stampede charge;
- sidestep a committed ram and punish the lost momentum.

---

## Presentation language

The mechanics must remain visible without creating HUD clutter.

- **Cyan Gunner arc:** heat state, with cadence and overheat accents.
- **Orange fuse reticle:** current programmed Cannon detonation distance and blast point.
- **Pink Guardian arc:** actual defended facing; stronger while a defensive ability is active.
- **Perfect Guard / Countershot:** explicit high-value confirmation.
- **Stampede trail:** current earned momentum.

Procedural SFX reinforce cadence lock, overheat, airburst, Perfect Guard, Countershot and charge loss.

---

## v1.7 validation priorities

The initial implementation is functional, but real mobile playtesting should drive tuning of:

1. joystick-depth-to-Cannon-fuse mapping;
2. Gunner heat gain/cooling and whether the cadence window is intuitive without a tutorial;
3. physical recoil strength on small/large Gunner forms;
4. shotgun tightening versus existing pellet spread;
5. Guardian frontal arc widths by evolution;
6. Perfect Guard timing on normal versus high-latency mobile play;
7. Countershot reward strength;
8. Stampede charge gain and terrain-loss severity;
9. AI's ability to use the systems intelligently without privileged information;
10. interaction with Battlefield chokepoints, Sniper approach windows and Controller formations.

The acceptance criterion is not merely that the new systems function. **An expert using the same build should have visibly more options and control than a novice, while an expert opponent should also have more ways to manipulate and punish them.**
