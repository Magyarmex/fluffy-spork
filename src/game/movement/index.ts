export { approachAngle, movementIntent, normalizeAngle, stepTankMovement, tankMaxSpeed } from './TankMovement';
export { stepDroneVelocity } from './DroneMovement';
export {
  LEGACY_TANK_BASE_SPEED,
  LEGACY_TANK_BOUNDARY_PADDING,
  LEGACY_TANK_RESPONSE,
  LEGACY_TURRET_RESPONSE,
} from './types';
export type {
  DroneKinematicState,
  DroneMovementConfig,
  TankKinematicState,
  TankMovementConfig,
  TankMovementIntent,
} from './types';
