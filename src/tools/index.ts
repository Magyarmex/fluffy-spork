import { Tool } from './types';
import { createRaiseLowerTool } from './raiseLower';
import { createSmoothTool } from './smooth';
import { createFlattenSampleTool } from './flattenSample';
import { createFlattenAbsoluteTool } from './flattenAbsolute';
import { createRampTool } from './ramp';
import { createPaintMaterialTool } from './paintMaterial';

export function buildTools(): Record<string, Tool> {
  const tools: Tool[] = [
    createRaiseLowerTool('raise'),
    createRaiseLowerTool('lower'),
    createSmoothTool(),
    createFlattenSampleTool(),
    createFlattenAbsoluteTool(),
    createRampTool(),
    createPaintMaterialTool()
  ];
  return Object.fromEntries(tools.map((t) => [t.id, t]));
}
