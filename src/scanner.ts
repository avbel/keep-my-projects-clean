import { access, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectInfo, ProjectType } from './types';

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function scanProjects(rootDir: string): Promise<ProjectInfo[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const projects: ProjectInfo[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory()) continue;

    const projectPath = join(rootDir, entry.name);
    const stats = await lstat(projectPath);
    if (stats.isSymbolicLink()) continue;

    const types: ProjectType[] = [];

    if (await fileExists(join(projectPath, 'package.json'))) types.push('js');
    if (await fileExists(join(projectPath, 'Cargo.toml'))) types.push('rust');
    if (await fileExists(join(projectPath, 'Move.toml'))) types.push('move');

    projects.push({
      name: entry.name,
      path: projectPath,
      types,
      lastActivity: null,
      isGitRepo: false,
    });
  }

  return projects;
}
