import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseConfig } from './config';

describe('parseConfig', () => {
  const originalEnv = process.env.PROJECTS_DIR;
  const originalExit = process.exit;
  const tempDirs: string[] = [];
  let writeMock: ReturnType<typeof mock>;

  beforeEach(() => {
    writeMock = mock(() => true);
    Object.defineProperty(process.stdout, 'write', {
      value: writeMock,
      writable: true,
    });
    process.exit = mock((code?: number) => {
      throw new Error(`exit:${code ?? 0}`);
    }) as typeof process.exit;
  });

  afterEach(() => {
    process.env.PROJECTS_DIR = originalEnv;
    process.exit = originalExit;
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

  it('uses default values when no flags are given', async () => {
    const rootDir = makeTempDir();

    const config = await parseConfig([rootDir]);

    expect(config).toEqual({
      rootDir,
      activeDays: 30,
      archiveDays: 180,
      confirm: false,
      compressionLevel: 7,
    });
  });

  it('parses --active-days 7', async () => {
    const rootDir = makeTempDir();

    const config = await parseConfig([rootDir, '--active-days', '7']);

    expect(config.activeDays).toBe(7);
  });

  it('parses --archive-days 90', async () => {
    const rootDir = makeTempDir();

    const config = await parseConfig([rootDir, '--archive-days', '90']);

    expect(config.archiveDays).toBe(90);
  });

  it('parses --compression-level 9', async () => {
    const rootDir = makeTempDir();

    const config = await parseConfig([rootDir, '--compression-level', '9']);

    expect(config.compressionLevel).toBe(9);
  });

  it('parses --confirm', async () => {
    const rootDir = makeTempDir();

    const config = await parseConfig([rootDir, '--confirm']);

    expect(config.confirm).toBe(true);
  });

  it('prefers CLI rootDir over PROJECTS_DIR', async () => {
    const cliRootDir = makeTempDir();
    const envRootDir = makeTempDir();
    process.env.PROJECTS_DIR = envRootDir;

    const config = await parseConfig([cliRootDir]);

    expect(config.rootDir).toBe(cliRootDir);
  });

  it('uses PROJECTS_DIR when no positional arg is given', async () => {
    const envRootDir = makeTempDir();
    process.env.PROJECTS_DIR = envRootDir;

    const config = await parseConfig([]);

    expect(config.rootDir).toBe(envRootDir);
  });

  it('throws when archive-days is less than or equal to active-days', async () => {
    const rootDir = makeTempDir();

    expect(
      parseConfig([rootDir, '--active-days', '10', '--archive-days', '10']),
    ).rejects.toThrow('archive-days must be greater than active-days')
  });

  it('throws when compression-level is 10', async () => {
    const rootDir = makeTempDir();

    expect(parseConfig([rootDir, '--compression-level', '10'])).rejects.toThrow(
      'compression-level must be between 0 and 9',
    )
  });

  it('exits when rootDir is missing entirely', async () => {
    expect(parseConfig([])).rejects.toThrow('exit:2')
    expect(writeMock.mock.calls.length).toBeGreaterThan(0)
  });
});
