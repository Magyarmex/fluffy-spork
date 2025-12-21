import { ProjectModel } from './project';

export interface HistoryEntry {
  heightGrid: Float32Array;
  materialGrid: Uint8Array;
}

const HISTORY_LIMIT = 50;

export class HistoryStack {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  push(project: ProjectModel) {
    this.undoStack.push({
      heightGrid: new Float32Array(project.terrain.heightGrid),
      materialGrid: new Uint8Array(project.terrain.materialGrid)
    });
    if (this.undoStack.length > HISTORY_LIMIT) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(project: ProjectModel): boolean {
    if (this.undoStack.length === 0) return false;
    const state = this.undoStack.pop()!;
    this.redoStack.push({
      heightGrid: new Float32Array(project.terrain.heightGrid),
      materialGrid: new Uint8Array(project.terrain.materialGrid)
    });
    project.terrain.heightGrid = state.heightGrid;
    project.terrain.materialGrid = state.materialGrid;
    return true;
  }

  redo(project: ProjectModel): boolean {
    if (this.redoStack.length === 0) return false;
    const state = this.redoStack.pop()!;
    this.undoStack.push({
      heightGrid: new Float32Array(project.terrain.heightGrid),
      materialGrid: new Uint8Array(project.terrain.materialGrid)
    });
    project.terrain.heightGrid = state.heightGrid;
    project.terrain.materialGrid = state.materialGrid;
    return true;
  }
}
