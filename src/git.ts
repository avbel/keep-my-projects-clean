import { access, stat } from 'node:fs/promises';
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

  try {
    const s = await stat(dir);
    return s.mtime;
  } catch {
    return null;
  }
}
