# NOVA TANKS v1.7.2 — Combined Arms

Combined Arms is the first release explicitly devoted to making previously shipped systems interact as one combat model.

It continues two lines simultaneously:

- **v1.6 Battlefield:** terrain, line-of-sight, cover, breaching and movement geometry;
- **v1.7 Three Disciplines:** Gunner cadence, Cannon fire control and Guardian facing/counterplay.

The governing rule is that new sophistication must increase **legitimate decisions**, not privileged information or invisible stat advantages.

---

## 1. Battlefield information doctrine

AI may reason from information it actually obtained.

### Current sight
If a target is visible through real Battlefield line-of-sight, the AI may track and act on its current position normally.

### Last-seen memory
When cover breaks contact, AI may remember the **last position at which the target was legitimately visible** for a short time.

The remembered coordinate is frozen. If the hidden tank moves behind the wall, the AI does not receive that movement.

Normal AI memory is intentionally shorter than elite memory.

### Investigation
An AI may move toward or route around terrain toward the remembered position.

This is not reacquisition. The hidden target remains invalid until ordinary sight, a legal Observer contact, or another legitimate targeting path sees it again.

### Expiration
When the short memory expires, the stale contact is discarded.

**Rule:** memory can preserve a question; it cannot manufacture an answer.

---

## 2. Local terrain routing

Battlefield v1.6 originally made AI react after repeated terrain contact. Combined Arms adds predictive short-horizon routing.

The system:

1. projects the tank's present movement a short distance forward;
2. tests whether that movement will encounter a solid;
3. finds the first blocking solid;
4. evaluates a small number of local corner/side waypoints around it;
5. chooses a visible, terrain-safe waypoint with a short route to the intended local destination;
6. blends movement toward that waypoint;
7. expires/replans the waypoint quickly.

This is deliberately **not global omniscient A\***.

The AI does not receive the full optimal route across the arena. It behaves more like a driver that sees an approaching wall and chooses which nearby end to go around.

### Controller drones
Second Body drones reuse this local routing during:

- formation travel;
- farming;
- defensive movement;
- recall / return travel.

They do **not** use it after a dive trajectory has committed. A locked dive remains a commitment and can still crash into cover.

---

## 3. Blast occlusion

Hard cover now blocks explosions in addition to bullets and sight.

A pure radius check is insufficient because it lets a Cannon explode against one face of a fortification and damage a tank standing safely behind the opposite face.

Combined Arms samples three target-hull paths:

- center mass — 56% of exposure;
- first lateral hull edge — 22%;
- opposite lateral hull edge — 22%.

Each path is checked against physical Battlefield geometry.

This creates three useful outcomes:

- **fully covered:** no blast damage;
- **partially exposed:** proportional blast damage;
- **fully exposed:** normal blast damage.

The blast-cover hardening layer offsets the explosion origin slightly away from each target sample before checking the first solid. This prevents an explosion that begins exactly on a wall surface from exploiting Battlefield's ordinary near-zero line-of-sight tolerance.

The system therefore rewards actually using cover without turning tiny edge exposure into perfect immunity.

---

## 4. Cannon × Battlefield

### Programmed FUSE vs physical IMPACT
The player still programs Cannon detonation distance with right-stick depth.

If terrain lies before that point, the UI now distinguishes:

- **FUSE** — where the player asked the shell to detonate;
- **IMPACT** — where surviving terrain will physically stop it first.

For destructible barricades, the IMPACT preview also exposes current cover integrity.

The player can therefore decide whether to:

- keep the fuse and deliberately breach;
- shorten/reposition the program;
- change firing angle;
- move to a different lane.

### Intentional AI breaching
A Cannon AI may fire at destructible cover only when the blocked lane is connected to a **recent legitimate last-seen contact**.

It aims at the physical cover impact, not the hidden tank's updated coordinate.

This turns breaching into a rational tactic without restoring through-wall knowledge.

### Apex structural authority
Apex Doctrine's structural multipliers remain the source of class-specific breaching specialization.

Battlefield remains authoritative for:

- actual HP loss / break resolution;
- rubble creation;
- XP credit;
- particles;
- SFX;
- lane opening.

There should be one cover-destruction truth, not parallel systems.

---

## 5. Guardian × Battlefield

Guardian Countershots now receive modest structural authority.

This is intentionally well below dedicated Cannon pressure.

The purpose is not to turn Guardian into artillery. It lets the full skill loop occasionally affect map state:

**read → face → Perfect Guard → Countercharge → punish weakened cover / opponent**

Meteor and Ravager may benefit from improved local navigation when AI-controlled, but their v1.7 momentum rules remain authoritative:

- straight commitment builds charge;
- hard steering loses charge;
- collision loses charge.

Path intelligence may choose a better lane. It must not erase the cost of commitment.

---

## 6. Blackglass containment

v1.7.2 also fixes a real-device portrait failure in the Blackglass showroom.

### Root cause
The v1.5.1 portrait polish script was executed before `DOMContentLoaded`.

The v1.5.0 showroom base stylesheet was then injected later when the showroom initializer ran, so equal-specificity base rules could overwrite the earlier mobile layout. The result was the desktop three-column dossier reappearing inside a portrait phone and sending the intelligence column outside the screen.

### Permanent rule
Portrait touch layouts are no longer inferred only from a width media query.

The containment layer marks portrait/coarse-pointer devices explicitly and forces:

1. horizontal dossier rail;
2. animated chassis stage;
3. tank identity and description;
4. telemetry;
5. trait graft lab.

All major containers use `min-width: 0`, bounded width, and explicit overflow behavior.

The containment stylesheet also watches for the base showroom stylesheet and re-appends itself afterward, guaranteeing correct cascade order.

---

## 7. Acceptance criteria

Combined Arms is correct only if all of the following remain true:

- explosions cannot apply full damage through surviving hard cover;
- partial peeks can receive partial blast exposure;
- AI begins navigating around nearby cover before repeatedly colliding with it;
- AI never updates a hidden target's remembered coordinates;
- stale memory expires;
- Cannon AI breaches only from legitimate recent information;
- Cannon player fuse previews do not claim an unreachable airburst through a wall;
- Controller drones can route around terrain during ordinary travel but locked dives remain committed;
- Guardian counterplay does not inherit Cannon-level structural dominance;
- the portrait Blackglass showroom never exceeds its containing phone viewport or superimposes the intelligence column over the chassis/identity column;
- late base stylesheet injection cannot undo the mobile containment fix.

Regression coverage lives in:

- `tests/node/combined-arms-v1.7.2.test.js`
- `tests/node/blast-cover-hardening-v1.7.2.test.js`
- `tests/node/showroom-containment-v1.7.2.test.js`
