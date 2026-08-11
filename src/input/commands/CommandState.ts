import type { CommandEnvelope, Vec2Command } from './GameCommand';

export interface CanonicalControlState {
  readonly move: Vec2Command;
  readonly aim: Vec2Command;
  readonly firing: boolean;
  readonly abilities: Readonly<Record<number, boolean>>;
  readonly ultimate: boolean;
  readonly swarmOrder: { readonly order: 'follow' | 'attack' | 'defend' | 'recall'; readonly targetId?: string } | null;
  readonly designatedTargetId: string | null;
}

export const EMPTY_CONTROL_STATE: CanonicalControlState = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  aim: Object.freeze({ x: 0, y: 0 }),
  firing: false,
  abilities: Object.freeze({}),
  ultimate: false,
  swarmOrder: null,
  designatedTargetId: null,
});

export function reduceCommands(
  previous: CanonicalControlState,
  envelopes: readonly CommandEnvelope[],
): CanonicalControlState {
  let move = previous.move;
  let aim = previous.aim;
  let firing = previous.firing;
  let ultimate = previous.ultimate;
  let swarmOrder = previous.swarmOrder;
  let designatedTargetId = previous.designatedTargetId;
  const abilities: Record<number, boolean> = { ...previous.abilities };

  for (const { command } of envelopes) {
    switch (command.type) {
      case 'move': move = command.vector; break;
      case 'aim': aim = command.vector; break;
      case 'fire': firing = command.active; break;
      case 'ability': abilities[command.slot] = command.active; break;
      case 'ultimate': ultimate = command.active; break;
      case 'swarm-order': swarmOrder = { order: command.order, ...(command.targetId ? { targetId: command.targetId } : {}) }; break;
      case 'designate-target': designatedTargetId = command.targetId; break;
    }
  }

  return { move, aim, firing, abilities, ultimate, swarmOrder, designatedTargetId };
}
