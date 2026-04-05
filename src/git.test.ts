import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { accessSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getLastActivity, getLastCommitDate, isGitRepository } from './git';

const repoRoot = process.cwd();
const tempDirs: string[] = [];

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function initGitRepo(dir: string): void {
  const result = Bun.spawnSync(['git', 'init'], { cwd: dir, stderr: 'pipe' });
  expect(result.exitCode).toBe(0);
}

beforeAll(() => {
  accessSync(join(repoRoot, '.git'));
});

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('git activity detection', () => {
  test('returns a valid Date for the project git repo', () => {
    const date = getLastCommitDate(repoRoot);

    expect(date).toBeInstanceOf(Date);
    expect(date?.getTime()).toBeGreaterThan(0);
  });

  test('returns null for a directory without .git', () => {
    const dir = createTempDir('git-nonrepo-');

    expect(getLastCommitDate(dir)).toBeNull();
  });

  test('isGitRepository returns true for the project git repo', async () => {
    expect(await isGitRepository(repoRoot)).toBe(true);
  });

  test('isGitRepository returns false for a non-git directory', async () => {
    const dir = createTempDir('git-nonrepo-check-');

    expect(await isGitRepository(dir)).toBe(false);
  });

  test('getLastActivity returns a Date for a git repo', async () => {
    expect(await getLastActivity(repoRoot)).toBeInstanceOf(Date);
  });

  test('getLastActivity returns mtime for a non-git directory', async () => {
    const dir = createTempDir('git-activity-');

    const result = await getLastActivity(dir);

    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).toBeGreaterThan(0);
  });

  test('getLastCommitDate returns null for a directory without .git', () => {
    const dir = createTempDir('git-no-git-');

    expect(getLastCommitDate(dir)).toBeNull();
  });

  test('getLastCommitDate returns null for an empty git repo', () => {
    const dir = createTempDir('git-empty-');
    initGitRepo(dir);

    expect(getLastCommitDate(dir)).toBeNull();
  });
});
