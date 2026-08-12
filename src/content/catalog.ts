import { ContentRegistry } from './registry';
import type { AbilityDefinition, BalanceDefinition, BattlefieldDefinition, CombatLineageId, DroneDefinition, EvolutionDefinition, GeneDefinition, LineageDefinition, MasteryPerkDefinition, TankDefinition, TerrainPrimitiveDefinition, WeaponDefinition } from './schema';
import { TANK_DEFINITIONS } from './tanks/catalog';

// Apex Doctrine v1.7.1 writes its Quake description to the nonexistent
// `quakecannon` key. Preserve the actually effective legacy metadata instead of
// silently repairing that historical patch while canonicalizing definitions.
const EFFECTIVE_TANK_DEFINITIONS: readonly TankDefinition[] = Object.freeze(TANK_DEFINITIONS.map((tank) => tank.id === 'quake'
  ? Object.freeze({ ...tank, description: 'Trades some peak blast for much faster heavy-shell cadence.' })
  : tank));

const classes = (lineage: TankDefinition['lineage']) => EFFECTIVE_TANK_DEFINITIONS.filter((tank) => tank.lineage === lineage).map((tank) => tank.id);

export const LINEAGE_DEFINITIONS: readonly LineageDefinition[] = Object.freeze([
  { id: 'origin', name: 'ORIGIN', color: '#dce9ff', icon: '◇', classIds: classes('origin') },
  { id: 'gunner', name: 'GUNNER', color: '#4de3ff', icon: '≣', classIds: classes('gunner') },
  { id: 'cannon', name: 'CANNON', color: '#ffb45e', icon: '☢', classIds: classes('cannon') },
  { id: 'sniper', name: 'SNIPER', color: '#b06bff', icon: '⌖', classIds: classes('sniper') },
  { id: 'controller', name: 'CONTROLLER', color: '#54e38a', icon: '❖', classIds: classes('controller') },
  { id: 'guardian', name: 'GUARDIAN', color: '#ff6ea9', icon: '⬢', classIds: classes('guardian') },
]);

export const GENE_DEFINITIONS: readonly GeneDefinition[] = Object.freeze([
  { id:'gunner', name:'Echo Chamber', icon:'≣', color:'#4de3ff', description:'Every trigger cycle spits a 45% damage echo round at a slight offset.', tradeoff:'+8% reload time.' },
  { id:'cannon', name:'Volatile Payload', icon:'☢', color:'#ffb45e', description:'All projectiles gain explosive splash and knockback; existing blasts grow.', tradeoff:'+10% reload time.' },
  { id:'sniper', name:'Hyperdense Slugs', icon:'⌖', color:'#b06bff', description:'+35% projectile speed, +1 penetration, +10% bullet damage.', tradeoff:'+8% reload time.' },
  { id:'controller', name:'Parasite Brood', icon:'❖', color:'#54e38a', description:'Adds two roaming hunter drones to any non-controller build.', tradeoff:'Bonus hunters are lighter than true carrier drones.' },
  { id:'guardian', name:'Reactive Plating', icon:'⬢', color:'#ff6ea9', description:'+22% max HP, +35% body damage and 10% passive damage reduction.', tradeoff:'-7% movement speed.' },
]);

export const ABILITY_DEFINITIONS: readonly AbilityDefinition[] = Object.freeze([
  {id:'ragnarok',name:'RAGNAROK SHELL',icon:'☢',cooldownSeconds:9,durationSeconds:0,description:'Fire a colossal shell. 3× damage, huge blast.'},
  {id:'overheat',name:'OVERHEAT',icon:'🔥',cooldownSeconds:14,durationSeconds:5,description:'Fire rate ×1.9 for 5 seconds.'},
  {id:'pointblank',name:'POINT BLANK',icon:'≋',cooldownSeconds:10,durationSeconds:0,description:'9-pellet hyper burst in a wide arc.'},
  {id:'supercharge',name:'SUPERCHARGE',icon:'⚡',cooldownSeconds:10,durationSeconds:0,description:'Next beam deals 2.5× damage, pierces all.'},
  {id:'phase',name:'PHASE SHIFT',icon:'☁',cooldownSeconds:8,durationSeconds:0,description:'Blink up to 420 units toward your aim.'},
  {id:'swarm',name:'SWARM',icon:'❖',cooldownSeconds:16,durationSeconds:8,description:'+2 frenzied drones for 8 seconds.'},
  {id:'bulwark',name:'BULWARK',icon:'🛡',cooldownSeconds:14,durationSeconds:4,description:'Absorb all damage for 4 seconds.'},
  {id:'taunt',name:'IRON WILL',icon:'⬣',cooldownSeconds:12,durationSeconds:3,description:'Take 65% less damage, reflect 30% back.'},
  {id:'stampede',name:'STAMPEDE',icon:'▲',cooldownSeconds:12,durationSeconds:4,description:'×1.9 speed, ×2 body damage for 4s.'},
]);

export const MASTERY_PERK_DEFINITIONS: readonly MasteryPerkDefinition[] = Object.freeze([
  {id:'dmg',name:'HEAVY ROUNDS',icon:'💥',description:'+18% bullet damage'},
  {id:'speed',name:'TURBO CORE',icon:'👟',description:'+14% movement speed'},
  {id:'vitality',name:'TITAN PLATING',icon:'❤️',description:'+30% max HP & regen'},
  {id:'alacrity',name:'AUTO-LOADER',icon:'⏱️',description:'-18% reload time'},
  {id:'thorns',name:'SPIKED HULL',icon:'🌵',description:'Reflect 25% of body damage taken'},
  {id:'wealth',name:'XP SYPHON',icon:'💎',description:'+30% XP gain'},
]);

export const EVOLUTION_DEFINITIONS: readonly EvolutionDefinition[] = Object.freeze([
  {fromTankId:'scout',toTankIds:['cannon','twin','marksman','carrier','guard'],level:10},
  {fromTankId:'twin',toTankIds:['minigun','shotgun'],level:20},
  {fromTankId:'cannon',toTankIds:['bomber','demolisher'],level:20},
  {fromTankId:'marksman',toTankIds:['railgun','ghost'],level:20},
  {fromTankId:'carrier',toTankIds:['overlord','warden'],level:20},
  {fromTankId:'guard',toTankIds:['fortress','juggernaut'],level:20},
  {fromTankId:'minigun',toTankIds:['tempest','needlestorm'],level:40},
  {fromTankId:'shotgun',toTankIds:['breachlord','flakmaster'],level:40},
  {fromTankId:'bomber',toTankIds:['clusterking','siegebomber'],level:40},
  {fromTankId:'demolisher',toTankIds:['annihilator','quake'],level:40},
  {fromTankId:'railgun',toTankIds:['singularity','prism'],level:40},
  {fromTankId:'ghost',toTankIds:['specter','assassin'],level:40},
  {fromTankId:'overlord',toTankIds:['hivemind','broodmother'],level:40},
  {fromTankId:'warden',toTankIds:['citadel','valkyrie'],level:40},
  {fromTankId:'fortress',toTankIds:['bastion','aegis'],level:40},
  {fromTankId:'juggernaut',toTankIds:['meteor','ravager'],level:40},
]);

const rect = (x:number,y:number,width:number,height:number,type:'wall'|'cover',hp?:number): TerrainPrimitiveDefinition => ({shape:'rect',x,y,width,height,type,hp});
const circle = (x:number,y:number,radius:number): TerrainPrimitiveDefinition => ({shape:'circle',x,y,radius,type:'pillar'});
const battlefield = (id:string,name:string,description:string,terrain:readonly TerrainPrimitiveDefinition[]): BattlefieldDefinition => ({id,name,description,mapLimit:2250,terrainCell:360,terrain});

export const BATTLEFIELD_DEFINITIONS: readonly BattlefieldDefinition[] = Object.freeze([
  battlefield('crossfire','CROSSFIRE','Four fortified approaches surround an exposed central crossing.',[
    rect(0,-690,520,92,'wall'),rect(0,690,520,92,'wall'),rect(-690,0,92,520,'wall'),rect(690,0,92,520,'wall'),rect(-1180,-470,82,520,'wall'),rect(-1180,470,82,520,'wall'),rect(1180,-470,82,520,'wall'),rect(1180,470,82,520,'wall'),
    circle(-470,-470,92),circle(470,-470,92),circle(-470,470,92),circle(470,470,92),
    rect(-250,-250,180,60,'cover',300),rect(250,-250,180,60,'cover',300),rect(-250,250,180,60,'cover',300),rect(250,250,180,60,'cover',300),rect(-920,0,65,210,'cover',300),rect(920,0,65,210,'cover',300),rect(0,-920,210,65,'cover',300),rect(0,920,210,65,'cover',300),
  ]),
  battlefield('split-horizon','SPLIT HORIZON','Two long spines create dangerous sightlines with wide exterior flanks.',[
    rect(-520,-760,90,680,'wall'),rect(-520,0,90,450,'wall'),rect(-520,760,90,680,'wall'),rect(520,-760,90,680,'wall'),rect(520,0,90,450,'wall'),rect(520,760,90,680,'wall'),
    circle(0,-520,105),circle(0,520,105),circle(-1060,-1060,95),circle(1060,1060,95),
    rect(-260,-500,190,65,'cover',330),rect(260,-500,190,65,'cover',330),rect(-260,500,190,65,'cover',330),rect(260,500,190,65,'cover',330),rect(-1160,0,240,70,'cover',330),rect(1160,0,240,70,'cover',330),rect(0,-1180,70,240,'cover',330),rect(0,1180,70,240,'cover',330),
  ]),
  battlefield('four-gates','FOUR GATES','A central bastion creates four gates, side pockets and rotating flank pressure.',[
    rect(0,-430,390,90,'wall'),rect(0,430,390,90,'wall'),rect(-430,0,90,390,'wall'),rect(430,0,90,390,'wall'),rect(-1080,-640,420,80,'wall'),rect(1080,640,420,80,'wall'),rect(-1080,640,420,80,'wall'),rect(1080,-640,420,80,'wall'),
    circle(-250,-250,76),circle(250,-250,76),circle(-250,250,76),circle(250,250,76),
    rect(0,-760,240,62,'cover',290),rect(0,760,240,62,'cover',290),rect(-760,0,62,240,'cover',290),rect(760,0,62,240,'cover',290),rect(-1320,-260,180,64,'cover',290),rect(1320,260,180,64,'cover',290),rect(-1320,260,180,64,'cover',290),rect(1320,-260,180,64,'cover',290),
  ]),
]);

export const BALANCE: BalanceDefinition = Object.freeze({
  arenaHalfExtent: 2250,
  defaultProjectileTtlSeconds: 1.05,
  escortDefaults: Object.freeze({ role:'escort', damage:4.5, hp:30, speed:220, leash:250 }),
  evolutionLevels: Object.freeze({ tier1:10, tier2:20, mastery:30, gene:35, apex:40 }),
});

const weaponDefinitions: readonly WeaponDefinition[] = Object.freeze(EFFECTIVE_TANK_DEFINITIONS.map((tank) => ({id:`${tank.id}:weapon`,ownerTankId:tank.id,...tank.weapon})));
const droneDefinitions: readonly DroneDefinition[] = Object.freeze(EFFECTIVE_TANK_DEFINITIONS.map((tank) => ({id:`${tank.id}:drone`,ownerTankId:tank.id,...tank.drone})));

export const TankRegistry = new ContentRegistry(EFFECTIVE_TANK_DEFINITIONS);
export const WeaponRegistry = new ContentRegistry(weaponDefinitions);
export const DroneRegistry = new ContentRegistry(droneDefinitions);
export const LineageRegistry = new ContentRegistry(LINEAGE_DEFINITIONS);
export const GeneRegistry = new ContentRegistry<GeneDefinition>(GENE_DEFINITIONS);
export const AbilityRegistry = new ContentRegistry(ABILITY_DEFINITIONS);
export const MasteryPerkRegistry = new ContentRegistry(MASTERY_PERK_DEFINITIONS);
export const BattlefieldRegistry = new ContentRegistry(BATTLEFIELD_DEFINITIONS);

export const EvolutionRegistry = Object.freeze({
  all: (): readonly EvolutionDefinition[] => EVOLUTION_DEFINITIONS,
  from: (tankId: string): EvolutionDefinition | undefined => EVOLUTION_DEFINITIONS.find((e) => e.fromTankId === tankId),
  choicesAt: (tankId: string, level: number): readonly string[] => EVOLUTION_DEFINITIONS.find((e) => e.fromTankId === tankId && e.level === level)?.toTankIds ?? [],
});

export const GENE_OPTIONS: readonly CombatLineageId[] = Object.freeze(['gunner','cannon','sniper','controller','guardian']);
