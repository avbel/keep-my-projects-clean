import { access, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    await access(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

export function getLastCommitDate(dir: string): Date | null {
  const result = Bun.spawnSync(
    [
      'git',
      'for-each-ref',
      '--sort=-committerdate',
      '--count=1',
      '--format=%(committerdate:iso)',
      'refs/heads/',
      'refs/remotes/',
    ],
    { cwd: dir, stderr: 'pipe' },
  );

  if (result.exitCode !== 0) return null;

  const output = result.stdout.toString().trim();
  if (!output) return null;

  const date = new Date(output);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function getLastActivity(dir: string): Promise<Date | null> {
  const isGit = await isGitRepository(dir);

  if (isGit) {
    return getLastCommitDate(dir);
  }

  const newest = await getNewestFileMtime(dir);
  if (newest) return newest;

  try {
    return (await stat(dir)).mtime;
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', '.output', '.svelte-kit', '.parcel-cache']);

async function getNewestFileMtime(dir: string, depth = 0): Promise<Date | null> {
  if (depth > 3) return null;

  let newest: Date | null = null;

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') && depth > 0) continue;
      if (SKIP_DIRS.has(entry.name)) continue;

      const fullPath = join(dir, entry.name);

      try {
        const s = await stat(fullPath);

        if (entry.isDirectory()) {
          const sub = await getNewestFileMtime(fullPath, depth + 1);
          if (sub && (!newest || sub > newest)) newest = sub;
        } else if (!newest || s.mtime > newest) {
          newest = s.mtime;
        }
      } catch {
        continue;
      }
    }
  } catch {
    return null;
  }

  return newest;
}
