import { ProjectModel } from '@core/project';

export type ToolId =
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'flattenSample'
  | 'flattenAbsolute'
  | 'ramp'
  | 'paintMaterial';

export interface PointerState {
  worldX: number;
  worldY?: number;
  worldZ: number;
  worldNormal?: [number, number, number];
  dt: number;
  isDragging: boolean;
}

export interface ToolContext {
  project: ProjectModel;
  commitStroke: () => void;
  requestRender: () => void;
  setHud?: (text: string) => void;
}

export interface Tool {
  id: ToolId;
  name: string;
  onPointerDown?(ctx: ToolContext, pointer: PointerState): void;
  onPointerMove?(ctx: ToolContext, pointer: PointerState): void;
  onPointerUp?(ctx: ToolContext, pointer: PointerState): void;
  onKeyboard?(ctx: ToolContext, event: KeyboardEvent): void;
  getOverlay?(ctx: ToolContext): ToolOverlay | null;
}

export interface ToolOverlay {
  type: 'brush' | 'ramp';
  center?: [number, number];
  radius?: number;
  rampPoints?: [[number, number], [number, number]];
}
