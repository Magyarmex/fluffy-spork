import type { FieldcraftTip } from './FieldcraftTips';

const reviewed='2026-08-12';
const tip=(id:string,text:string,tags:readonly string[]):FieldcraftTip=>Object.freeze({id,text,tags:Object.freeze([...tags]),reviewed,active:true});

/** v1.11.0 knowledge is taught through normal play, not a new tutorial panel. */
export const LIVING_FRONT_TIPS:readonly FieldcraftTip[]=Object.freeze([
 tip('living-front-read-density','Quiet parts of the battlefield can mature into richer farm. Read shape density and composition before committing to a long rotation.',['battlefield','combat','economy']),
 tip('living-front-triangle','Triangles make one short committed dodge when they read a credible incoming shot. Bait the move, then lead the recovery instead of tracking center mass.',['battlefield','combat','economy']),
 tip('living-front-hexagon','A Hexagon slowly gathers ordinary shapes nearby. Its real value is often the pocket around it, and walls can split that pocket into very different harvest angles.',['battlefield','combat','economy']),
 tip('living-front-crasher','Crashers telegraph before a committed charge. Sidestep late enough to make the line miss, then punish the overshoot or bait it into hard terrain.',['battlefield','combat']),
 tip('living-front-star','A Star is prey, not a boss. Intercept its route instead of chasing its tail; the positional cost of pursuit is part of the decision.',['battlefield','combat','economy']),
 tip('living-front-disturbance','Heavy harvesting and gunfire disturb local farm. If a rich pocket empties and shapes start drifting away, look toward calmer neighboring lanes instead of waiting for a refill.',['battlefield','combat','economy']),
]);
