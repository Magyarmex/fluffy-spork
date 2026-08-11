import type { Vec2 } from '../simulation/math';

export const LEGACY_TANK_BASE_SPEED = 124;
export const LEGACY_TANK_RESPONSE = 9;
export const LEGACY_TURRET_RESPONSE = 13;
export const LEGACY_TANK_BOUNDARY_PADDING = 20;

export interface TankMovementConfig {
  readonly moveMultiplier: number;
  readonly speedUpgradeLevel?: number;
  readonly speedMultiplier?: number;
  readonly radius?: number;
  readonly response?: number;
  readonly turretResponse?: number;
}

export interface TankKinematicState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly hullRotation: number;
  readonly turretRotation: number;
}

export interface TankMovementIntent {
  readonly move: Vec2;
  readonly aimAngle?: number;
}

export interface DroneKinematicState {
  readonly position: Vec2;
  readonly velocity: Vec2;
  readonly rotation: number;
}

export interface DroneMovementConfig {
  readonly maxSpeed: number;
  readonly response?: number;
}
