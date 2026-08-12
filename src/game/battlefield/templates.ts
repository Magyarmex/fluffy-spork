import type { BattlefieldTemplate, BattlefieldTemplateId, TerrainDefinition, TerrainType } from './types';

interface RawRect { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
interface RawCircle { readonly kind: 'circle'; readonly x: number; readonly y: number; readonly radius: number; }
type RawGeometry = RawRect | RawCircle;

interface RawTemplate {
  readonly id: BattlefieldTemplateId;
  readonly name: string;
  readonly description: string;
  readonly walls: readonly RawGeometry[];
  readonly pillars: readonly RawCircle[];
  readonly covers: readonly RawGeometry[];
  readonly coverHealth: number;
}

const rect = (x: number, y: number, width: number, height: number): RawRect => ({ kind: 'rect', x, y, width, height });
const circle = (x: number, y: number, radius: number): RawCircle => ({ kind: 'circle', x, y, radius });

const RAW_TEMPLATES: readonly RawTemplate[] = [
  {
    id: 'crossfire',
    name: 'CROSSFIRE',
    description: 'Four fortified approaches surround an exposed central crossing.',
    walls: [
      rect(0, -690, 520, 92), rect(0, 690, 520, 92), rect(-690, 0, 92, 520), rect(690, 0, 92, 520),
      rect(-1180, -470, 82, 520), rect(-1180, 470, 82, 520), rect(1180, -470, 82, 520), rect(1180, 470, 82, 520),
    ],
    pillars: [circle(-470, -470, 92), circle(470, -470, 92), circle(-470, 470, 92), circle(470, 470, 92)],
    covers: [
      rect(-250, -250, 180, 60), rect(250, -250, 180, 60), rect(-250, 250, 180, 60), rect(250, 250, 180, 60),
      rect(-920, 0, 65, 210), rect(920, 0, 65, 210), rect(0, -920, 210, 65), rect(0, 920, 210, 65),
    ],
    coverHealth: 300,
  },
  {
    id: 'split-horizon',
    name: 'SPLIT HORIZON',
    description: 'Two long spines create dangerous sightlines with wide exterior flanks.',
    walls: [
      rect(-520, -760, 90, 680), rect(-520, 0, 90, 450), rect(-520, 760, 90, 680),
      rect(520, -760, 90, 680), rect(520, 0, 90, 450), rect(520, 760, 90, 680),
    ],
    pillars: [circle(0, -520, 105), circle(0, 520, 105), circle(-1060, -1060, 95), circle(1060, 1060, 95)],
    covers: [
      rect(-260, -500, 190, 65), rect(260, -500, 190, 65), rect(-260, 500, 190, 65), rect(260, 500, 190, 65),
      rect(-1160, 0, 240, 70), rect(1160, 0, 240, 70), rect(0, -1180, 70, 240), rect(0, 1180, 70, 240),
    ],
    coverHealth: 330,
  },
  {
    id: 'four-gates',
    name: 'FOUR GATES',
    description: 'A central bastion creates four gates, side pockets and rotating flank pressure.',
    walls: [
      rect(0, -430, 390, 90), rect(0, 430, 390, 90), rect(-430, 0, 90, 390), rect(430, 0, 90, 390),
      rect(-1080, -640, 420, 80), rect(1080, 640, 420, 80), rect(-1080, 640, 420, 80), rect(1080, -640, 420, 80),
    ],
    pillars: [circle(-250, -250, 76), circle(250, -250, 76), circle(-250, 250, 76), circle(250, 250, 76)],
    covers: [
      rect(0, -760, 240, 62), rect(0, 760, 240, 62), rect(-760, 0, 62, 240), rect(760, 0, 62, 240),
      rect(-1320, -260, 180, 64), rect(1320, 260, 180, 64), rect(-1320, 260, 180, 64), rect(1320, -260, 180, 64),
    ],
    coverHealth: 290,
  },
];

function transformPoint(x: number, y: number, rotation: number, mirrored: boolean): readonly [number, number] {
  let tx = mirrored ? -x : x;
  let ty = y;
  for (let index = 0; index < rotation; index += 1) {
    const previousX = tx;
    tx = -ty;
    ty = previousX;
  }
  return [tx, ty];
}

function transformGeometry(raw: RawGeometry, rotation: number, mirrored: boolean) {
  const [x, y] = transformPoint(raw.x, raw.y, rotation, mirrored);
  if (raw.kind === 'circle') return { shape: 'circle' as const, x, y, radius: raw.radius };
  return rotation % 2 === 1
    ? { shape: 'rect' as const, x, y, width: raw.height, height: raw.width }
    : { shape: 'rect' as const, x, y, width: raw.width, height: raw.height };
}

function makeTerrain(id: number, type: TerrainType, raw: RawGeometry, health: number, rotation: number, mirrored: boolean): TerrainDefinition {
  return {
    id,
    type,
    geometry: transformGeometry(raw, rotation, mirrored),
    destructible: type === 'cover',
    maxHealth: type === 'cover' ? health : 0,
  };
}

export function createBattlefieldTemplate(id: BattlefieldTemplateId, rotationQuarterTurns: 0 | 1 | 2 | 3 = 0, mirrored = false): BattlefieldTemplate {
  const raw = RAW_TEMPLATES.find((candidate) => candidate.id === id);
  if (!raw) throw new Error(`Unknown battlefield template: ${id}`);
  let nextId = -1000;
  const terrain: TerrainDefinition[] = [];
  for (const wall of raw.walls) terrain.push(makeTerrain(nextId--, 'wall', wall, 0, rotationQuarterTurns, mirrored));
  for (const pillar of raw.pillars) terrain.push(makeTerrain(nextId--, 'pillar', pillar, 0, rotationQuarterTurns, mirrored));
  for (const cover of raw.covers) terrain.push(makeTerrain(nextId--, 'cover', cover, raw.coverHealth, rotationQuarterTurns, mirrored));
  return { id: raw.id, name: raw.name, description: raw.description, terrain };
}

export const BATTLEFIELD_TEMPLATE_IDS: readonly BattlefieldTemplateId[] = ['crossfire', 'split-horizon', 'four-gates'];
