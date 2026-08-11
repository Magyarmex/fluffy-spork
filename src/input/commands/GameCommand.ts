export type CommandSource = 'touch' | 'mouse' | 'keyboard' | 'gamepad' | 'test' | 'replay' | 'ai' | 'lobby';

export interface Vec2Command { readonly x: number; readonly y: number; }

export type GameCommand =
  | { readonly type: 'move'; readonly vector: Vec2Command }
  | { readonly type: 'aim'; readonly vector: Vec2Command }
  | { readonly type: 'fire'; readonly active: boolean }
  | { readonly type: 'ability'; readonly slot: number; readonly active: boolean }
  | { readonly type: 'ultimate'; readonly active: boolean }
  | { readonly type: 'swarm-order'; readonly order: 'follow' | 'attack' | 'defend' | 'recall'; readonly targetId?: string }
  | { readonly type: 'designate-target'; readonly targetId: string | null };

export interface CommandEnvelope {
  readonly source: CommandSource;
  readonly sequence: number;
  readonly command: GameCommand;
}

export interface CommandController {
  poll(): readonly CommandEnvelope[];
}

export function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function normalizeStick(vector: Vec2Command): Vec2Command {
  const x = clampAxis(vector.x);
  const y = clampAxis(vector.y);
  const length = Math.hypot(x, y);
  if (length <= 1 || length === 0) return { x, y };
  return { x: x / length, y: y / length };
}
