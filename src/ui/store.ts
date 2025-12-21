import { create } from 'zustand';
import { ProjectModel, createProject, ensureTerrainVolumetric } from '@core/project';
import { HistoryStack } from '@core/history';
import { ToolId } from '@tools/types';
import { loadProject, saveProject, listProjects, deleteProject, getLastProjectId } from '@core/persistence';
import { generateId } from '@core/id';

export type AutosaveState = 'idle' | 'saving' | 'error';

interface StoreState {
  project: ProjectModel;
  projects: ProjectModel[];
  tool: ToolId;
  history: HistoryStack;
  autosave: AutosaveState;
  lastSavedAt?: number;
  helpOpen: boolean;
  loadInitial: () => Promise<void>;
  setTool: (tool: ToolId) => void;
  setProject: (project: ProjectModel) => void;
  updateProject: (updater: (p: ProjectModel) => void) => void;
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  saveNow: () => Promise<void>;
  newProject: () => void;
  duplicateProject: () => void;
  deleteCurrentProject: () => Promise<void>;
  renameProject: (name: string) => void;
  toggleHelp: (open?: boolean) => void;
}

export const useStore = create<StoreState>((set, get) => ({
  project: createProject('Aquascape Lab'),
  projects: [],
  tool: 'raise',
  history: new HistoryStack(),
  autosave: 'idle',
  helpOpen: false,
  async loadInitial() {
    const lastId = await getLastProjectId();
    const projects = (await listProjects()).map((p) => ({
      ...p,
      terrain: ensureTerrainVolumetric(p.terrain)
    }));
    let project = projects.find((p) => p.id === lastId);
    if (!project) {
      project = createProject('Aquascape Lab');
      await saveProject(project);
    }
    set({ project, projects, history: new HistoryStack() });
  },
  setTool(tool) {
    set({ tool });
  },
  setProject(project) {
    set((state) => {
      const exists = state.projects.find((p) => p.id === project.id);
      const normalized = { ...project, terrain: ensureTerrainVolumetric(project.terrain) };
      return { project: normalized, projects: exists ? state.projects : [...state.projects, normalized] };
    });
  },
  updateProject(updater) {
    set((state) => {
      const draft = { ...state.project, terrain: ensureTerrainVolumetric({ ...state.project.terrain }) } as ProjectModel;
      updater(draft);
      draft.updatedAt = Date.now();
      const projects = state.projects.map((p) => (p.id === draft.id ? draft : p));
      return { project: draft, projects };
    });
  },
  pushHistory() {
    const { history, project } = get();
    history.push(project);
  },
  undo() {
    const { history, project } = get();
    if (history.undo(project)) {
      set({ project: { ...project, terrain: { ...project.terrain } } });
    }
  },
  redo() {
    const { history, project } = get();
    if (history.redo(project)) {
      set({ project: { ...project, terrain: { ...project.terrain } } });
    }
  },
  async saveNow() {
    set({ autosave: 'saving' });
    try {
      await saveProject(get().project);
      set({ autosave: 'idle', lastSavedAt: Date.now() });
    } catch (err) {
      console.error('Save failed', err);
      set({ autosave: 'error' });
    }
  },
  async newProject() {
    const project = createProject('New Project');
    const history = new HistoryStack();
    set((state) => ({ project, projects: [...state.projects, project], history }));
    await saveProject(project);
  },
  async duplicateProject() {
    const { project, projects } = get();
    const copy: ProjectModel = {
      ...project,
      id: generateId(),
      name: `${project.name} Copy`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      terrain: {
        ...project.terrain,
        heightGrid: new Float32Array(project.terrain.heightGrid),
        materialGrid: new Uint8Array(project.terrain.materialGrid),
        lateralOffsetX: new Float32Array(project.terrain.lateralOffsetX),
        lateralOffsetZ: new Float32Array(project.terrain.lateralOffsetZ)
      }
    };
    set((state) => ({ project: copy, projects: [...projects, copy], history: new HistoryStack() }));
    await saveProject(copy);
  },
  async deleteCurrentProject() {
    const { project, projects } = get();
    await deleteProject(project.id);
    const remaining = projects.filter((p) => p.id !== project.id);
    const next = remaining[0] ?? createProject('Aquascape Lab');
    set({ project: next, projects: remaining });
  },
  renameProject(name) {
    set((state) => ({ project: { ...state.project, name } }));
  },
  toggleHelp(open) {
    set((state) => ({ helpOpen: open ?? !state.helpOpen }));
  }
}));
