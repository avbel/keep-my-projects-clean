import { afterEach, describe, expect, it } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanProjects } from './scanner';

describe('scanProjects', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeTempDir(): string {
    const tempDir = mkdtempSync(join(tmpdir(), 'keep-my-projects-clean-'));
    tempDirs.push(tempDir);
    return tempDir;
  }

  function makeProject(rootDir: string, name: string, manifests: string[] = []): string {
    const projectDir = join(rootDir, name);
    mkdirSync(projectDir, { recursive: true });

    for (const manifest of manifests) {
      writeFileSync(join(projectDir, manifest), '');
    }

    return projectDir;
  }

  it('returns empty array for empty root directory', async () => {
    const rootDir = makeTempDir();

    const projects = await scanProjects(rootDir);

    expect(projects).toEqual([]);
  });

  it('detects a js project from package.json', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, 'js-app', ['package.json']);

    const projects = await scanProjects(rootDir);

    expect(projects).toEqual([
      {
        name: 'js-app',
        path: join(rootDir, 'js-app'),
        types: ['js'],
        lastActivity: null,
        isGitRepo: false,
      },
    ]);
  });

  it('detects a rust project from Cargo.toml', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, 'rust-app', ['Cargo.toml']);

    const projects = await scanProjects(rootDir);

    expect(projects[0]).toMatchObject({
      name: 'rust-app',
      path: join(rootDir, 'rust-app'),
      types: ['rust'],
      lastActivity: null,
      isGitRepo: false,
    });
  });

  it('detects a move project from Move.toml', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, 'move-app', ['Move.toml']);

    const projects = await scanProjects(rootDir);

    expect(projects[0].types).toEqual(['move']);
  });

  it('detects a multi-type project', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, 'tauri-app', ['package.json', 'Cargo.toml']);

    const projects = await scanProjects(rootDir);

    expect(projects[0].types).toEqual(['js', 'rust']);
  });

  it('skips hidden directories', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, '.hidden', ['package.json']);

    const projects = await scanProjects(rootDir);

    expect(projects).toEqual([]);
  });

  it('skips regular files in root', async () => {
    const rootDir = makeTempDir();
    writeFileSync(join(rootDir, 'README.md'), 'hello');

    const projects = await scanProjects(rootDir);

    expect(projects).toEqual([]);
  });

  it('skips symlinks', async () => {
    const rootDir = makeTempDir();
    const realProject = makeProject(rootDir, 'real-project', ['package.json']);
    symlinkSync(realProject, join(rootDir, 'linked-project'));

    const projects = await scanProjects(rootDir);

    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe('real-project');
  });

  it('includes unknown projects with no detected types', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, 'unknown-app');

    const projects = await scanProjects(rootDir);

    expect(projects).toEqual([
      {
        name: 'unknown-app',
        path: join(rootDir, 'unknown-app'),
        types: [],
        lastActivity: null,
        isGitRepo: false,
      },
    ]);
  });

  it('sets lastActivity to null and isGitRepo to false', async () => {
    const rootDir = makeTempDir();
    makeProject(rootDir, 'js-app', ['package.json']);

    const projects = await scanProjects(rootDir);

    expect(projects[0].lastActivity).toBeNull();
    expect(projects[0].isGitRepo).toBe(false);
  });
});
