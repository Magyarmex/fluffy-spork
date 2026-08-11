import { TankRegistry } from '../../content';
import type { ProgressionState, TankBuild } from './types';
import { appliedPowerLevel } from './UpgradeSystem';
import { validateProgressionState } from './ProgressionSystem';

export class BuildResolver {
  resolve(state: ProgressionState): TankBuild {
    validateProgressionState(state);
    const tank = TankRegistry.get(state.tankId);
    const projectile = tank.weapon.projectile;
    const stats = state.stats;

    let maxHealth = (100 + 14 * stats.maxhp) * tank.hpMultiplier * (1 + state.level * 0.02);
    if (state.perkId === 'vitality') maxHealth *= 1.3;
    if (state.geneId === 'guardian') maxHealth *= 1.22;

    let moveSpeed = 124 * tank.moveMultiplier * (1 + 0.045 * stats.speed);
    if (state.perkId === 'speed') moveSpeed *= 1.14;
    if (state.geneId === 'guardian') moveSpeed *= 0.93;

    let projectileSpeed = projectile.speed * (1 + 0.085 * stats.bulletspeed);
    if (state.geneId === 'sniper') projectileSpeed *= 1.35;

    let projectileDamage = projectile.damage * (1 + 0.13 * stats.damage) * (1 + Math.min(state.level, 30) * 0.012);
    if (state.perkId === 'dmg') projectileDamage *= 1.18;
    if (state.geneId === 'sniper') projectileDamage *= 1.10;

    let reloadSeconds = projectile.reloadSeconds / (1 + 0.095 * stats.reload);
    if (state.perkId === 'alacrity') reloadSeconds *= 0.82;
    if (state.geneId === 'gunner' || state.geneId === 'sniper') reloadSeconds *= 1.08;
    if (state.geneId === 'cannon') reloadSeconds *= 1.10;

    const penetration = projectile.penetration + Math.floor(stats.penetration * 0.6) + (state.geneId === 'sniper' ? 1 : 0);

    let bodyDamage = 26 * tank.bodyMultiplier * (1 + 0.1 * stats.body);
    if (state.perkId === 'thorns') bodyDamage *= 1.15;
    if (state.geneId === 'guardian') bodyDamage *= 1.35;

    let regenPerSecond = (0.9 + 0.55 * stats.regen) * tank.hpMultiplier;
    if (state.perkId === 'vitality') regenPerSecond *= 1.3;

    const aura = tank.aura ?? 0;
    const passiveDamageMultiplier = (1 - aura) * (state.geneId === 'guardian' ? 0.90 : 1);

    const foreignHunterCount = state.geneId === 'controller' && tank.drone.role !== 'hunter' ? 2 : 0;
    const hunter = tank.drone.role === 'hunter';
    const droneHealth = tank.drone.hp + stats.maxhp * (hunter ? 3.4 : 1.8) + state.level * (hunter ? 1.1 : 0.5);
    const droneDamage = tank.drone.damage * (1 + 0.1 * stats.damage) * (1 + Math.min(state.level, 30) * 0.01);
    const droneSpeed = tank.drone.speed + stats.speed * 5;

    return Object.freeze({
      tankId: tank.id,
      level: state.level,
      appliedPowerLevel: appliedPowerLevel(state.level, stats),
      stats,
      perkId: state.perkId,
      geneId: state.geneId,
      maxHealth: Math.round(maxHealth),
      moveSpeed,
      projectileDamage,
      reloadSeconds,
      projectileSpeed,
      penetration,
      bodyDamage,
      regenPerSecond,
      weaponRange: projectileSpeed * (projectile.ttlSeconds ?? 1.05) + 40,
      passiveDamageReduction: 1 - passiveDamageMultiplier,
      bodyReflectFraction: state.perkId === 'thorns' ? 0.25 : 0,
      drone: Object.freeze({
        count: tank.drone.count + foreignHunterCount,
        role: tank.drone.role,
        health: droneHealth,
        damage: droneDamage,
        speed: droneSpeed,
        leash: tank.drone.leash,
        foreignHunterCount,
      }),
    });
  }
}
