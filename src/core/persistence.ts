import { openDB, DBSchema } from 'idb';
import { ProjectModel } from './project';

interface ProjectDB extends DBSchema {
  projects: {
    key: string;
    value: ProjectModel;
  };
  meta: {
    key: 'lastProjectId';
    value: string;
  };
}

const DB_NAME = 'aquascape-lab';
const DB_VERSION = 1;

async function getDb() {
  return openDB<ProjectDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('projects')) {
        db.createObjectStore('projects');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta');
      }
    }
  });
}

export async function saveProject(project: ProjectModel) {
  const db = await getDb();
  await db.put('projects', project, project.id);
  await db.put('meta', project.id, 'lastProjectId');
}

export async function loadProject(id: string): Promise<ProjectModel | undefined> {
  const db = await getDb();
  return db.get('projects', id);
}

export async function deleteProject(id: string) {
  const db = await getDb();
  await db.delete('projects', id);
}

export async function listProjects(): Promise<ProjectModel[]> {
  const db = await getDb();
  return db.getAll('projects');
}

export async function getLastProjectId(): Promise<string | undefined> {
  const db = await getDb();
  return db.get('meta', 'lastProjectId');
}

export async function clearAll() {
  const db = await getDb();
  await db.clear('projects');
}
