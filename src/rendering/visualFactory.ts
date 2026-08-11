import { DroneRegistry, TankRegistry, WeaponRegistry } from '../content';
import type { BarrelDefinition, FireMode } from '../content';
import type { DroneState, ProjectileState, TankState, Vector2State } from '../game/entities/types';
export const FRIENDLY_IFF_COLOR='#4da8ff', HOSTILE_IFF_COLOR='#ff4d62', IFF_OUTER_ALPHA=.18, IFF_CORE_ALPHA=.30;
export type PresentationRelation='friendly'|'hostile'|'neutral';
export interface BarrelVisual{readonly start:Vector2State;readonly muzzle:Vector2State;readonly width:number}
export interface TankVisual{readonly definitionId:string;readonly color:string;readonly icon:string;readonly size:number;readonly barrels:readonly BarrelVisual[]}
export interface DroneVisual{readonly definitionId:string;readonly color:string;readonly role:'escort'|'hunter';readonly bodyRadius:number;readonly relation:PresentationRelation;readonly iffColor?:string;readonly outerHaloRadius?:number;readonly coreHaloRadius?:number}
export interface ProjectileVisual{readonly definitionId:string;readonly color:string;readonly fireMode:FireMode;readonly radius:number;readonly trailLength:number;readonly trailWidth:number}
function relation(a?:string):PresentationRelation{const v=a?.toLowerCase();if(v==='allied'||v==='friendly'||v==='owned')return'friendly';if(v==='hostile'||v==='enemy')return'hostile';return'neutral'}
function rotateLocal(x:number,y:number,a:number):Vector2State{const c=Math.cos(a),s=Math.sin(a);return{x:c*y-s*x,y:s*y+c*x}}
export function barrelVisual(position:Vector2State,turretRotation:number,barrel:BarrelDefinition):BarrelVisual{const base=rotateLocal(barrel.x,barrel.y,turretRotation),start={x:position.x+base.x,y:position.y+base.y},a=turretRotation+barrel.off;return Object.freeze({start:Object.freeze(start),muzzle:Object.freeze({x:start.x+Math.cos(a)*barrel.len,y:start.y+Math.sin(a)*barrel.len}),width:barrel.w})}
function projectileScale(m:FireMode){switch(m){case'beam':return .72;case'minigun':return .82;case'shotgun':return .90;case'shell':return 1.12;case'twin':return .94;default:return 1}}
export class CanonicalVisualFactory{
 tank(state:TankState):TankVisual{const d=TankRegistry.get(state.tankDefinitionId);return Object.freeze({definitionId:d.id,color:d.color,icon:d.icon,size:d.size,barrels:Object.freeze(d.weapon.barrels.map(b=>barrelVisual(state.position,state.turretRotation,b)))})}
 drone(state:DroneState):DroneVisual{const d=DroneRegistry.find(state.droneDefinitionId),role=d?.role??(state.droneDefinitionId.toLowerCase().includes('hunter')?'hunter':'escort'),owner=d?TankRegistry.find(d.ownerTankId):undefined,rel=relation(state.team.allegiance),iffColor=rel==='friendly'?FRIENDLY_IFF_COLOR:rel==='hostile'?HOSTILE_IFF_COLOR:undefined;return Object.freeze({definitionId:state.droneDefinitionId,color:owner?.color??'#9fb8c8',role,bodyRadius:role==='hunter'?8:7,relation:rel,iffColor,outerHaloRadius:iffColor?(role==='hunter'?31:24):undefined,coreHaloRadius:iffColor?(role==='hunter'?18:14):undefined})}
 projectile(state:ProjectileState):ProjectileVisual{const w=WeaponRegistry.get(state.projectileDefinitionId),owner=TankRegistry.get(w.ownerTankId),scale=projectileScale(w.fireMode);return Object.freeze({definitionId:w.id,color:owner.color,fireMode:w.fireMode,radius:Math.max(1.5,w.projectile.radius*scale),trailLength:w.fireMode==='beam'?34:w.fireMode==='shell'?18:12,trailWidth:w.fireMode==='beam'?2.4:Math.max(1,w.projectile.radius*.3)})}
}
