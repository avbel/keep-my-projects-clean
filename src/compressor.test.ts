import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert7zAvailable, compressProject } from './compressor';

function makeTempDir(dirs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'compressor-test-'));
  dirs.push(dir);
  return dir;
}

function extract7z(archivePath: string, outputDir: string): boolean {
  const result = Bun.spawnSync(
    ['7z', 'x', archivePath, `-o${outputDir}`, '-y'],
    { stderr: 'pipe', stdout: 'pipe' },
  );
  return result.exitCode === 0;
}

function collectFiles(dir: string, base = dir): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(full, base));
    } else {
      results.push(full.slice(base.length + 1));
    }
  }
  return results.sort();
}

describe('assert7zAvailable', () => {
  it('does not throw when 7z is installed', () => {
    expect(() => assert7zAvailable()).not.toThrow();
  });
});

describe('compressProject', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('creates a .7z archive that can be extracted with original files intact', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'index.ts'), 'console.log("hello");');
    writeFileSync(join(projectDir, 'README.md'), '# My Project');

    const outputPath = join(root, 'project.7z');
    const result = await compressProject(projectDir, outputPath, 5);

    expect(result.success).toBe(true);
    expect(result.archiveSize).toBeGreaterThan(25);
    expect(existsSync(outputPath)).toBe(true);

    const extractDir = join(root, 'extracted');
    mkdirSync(extractDir);
    expect(extract7z(outputPath, extractDir)).toBe(true);

    const extracted = collectFiles(extractDir);
    expect(extracted).toContain('index.ts');
    expect(extracted).toContain('README.md');
    expect(readFileSync(join(extractDir, 'index.ts'), 'utf-8')).toBe('console.log("hello");');
    expect(readFileSync(join(extractDir, 'README.md'), 'utf-8')).toBe('# My Project');
  });

  it('preserves nested directory structure after extraction', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(join(projectDir, 'src', 'utils'), { recursive: true });
    writeFileSync(join(projectDir, 'src', 'index.ts'), 'export {};');
    writeFileSync(join(projectDir, 'src', 'utils', 'helpers.ts'), 'export const x = 1;');
    writeFileSync(join(projectDir, 'README.md'), '# Test');

    const outputPath = join(root, 'project.7z');
    await compressProject(projectDir, outputPath, 5);

    const extractDir = join(root, 'extracted');
    mkdirSync(extractDir);
    extract7z(outputPath, extractDir);

    const extracted = collectFiles(extractDir);
    expect(extracted).toContain(join('src', 'index.ts'));
    expect(extracted).toContain(join('src', 'utils', 'helpers.ts'));
    expect(extracted).toContain('README.md');
    expect(readFileSync(join(extractDir, 'src', 'utils', 'helpers.ts'), 'utf-8')).toBe('export const x = 1;');
  });

  it('deletes the original directory after successful compression', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'file.txt'), 'data');

    const outputPath = join(root, 'project.7z');
    const result = await compressProject(projectDir, outputPath, 5);

    expect(result.success).toBe(true);
    expect(existsSync(projectDir)).toBe(false);
  });

  it('overwrites an existing archive without error', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    const outputPath = join(root, 'project.7z');

    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'v1.txt'), 'a');
    await compressProject(projectDir, outputPath, 5);

    expect(existsSync(outputPath)).toBe(true);

    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, 'v2.txt'), 'b'.repeat(50_000));
    const result = await compressProject(projectDir, outputPath, 5);

    expect(result.success).toBe(true);
    expect(result.archiveSize).toBeGreaterThan(0);

    const extractDir = join(root, 'extracted');
    mkdirSync(extractDir);
    extract7z(outputPath, extractDir);
    expect(collectFiles(extractDir)).toContain('v2.txt');
  });

  it('handles an empty directory without crashing', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'empty');
    mkdirSync(projectDir, { recursive: true });

    const outputPath = join(root, 'empty.7z');
    const result = await compressProject(projectDir, outputPath, 5);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('produces smaller output at higher compression levels', async () => {
    const root = makeTempDir(tempDirs);
    const repeatedContent = 'abcdefghij'.repeat(10_000);

    const projectLow = join(root, 'project-low');
    mkdirSync(projectLow, { recursive: true });
    writeFileSync(join(projectLow, 'data.txt'), repeatedContent);
    const outputLow = join(root, 'low.7z');
    const resultLow = await compressProject(projectLow, outputLow, 1);

    const projectHigh = join(root, 'project-high');
    mkdirSync(projectHigh, { recursive: true });
    writeFileSync(join(projectHigh, 'data.txt'), repeatedContent);
    const outputHigh = join(root, 'high.7z');
    const resultHigh = await compressProject(projectHigh, outputHigh, 9);

    expect(resultLow.success).toBe(true);
    expect(resultHigh.success).toBe(true);
    expect(resultHigh.archiveSize).toBeLessThanOrEqual(resultLow.archiveSize);
  });

  it('preserves binary file content through compress/extract cycle', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });
    const binaryContent = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    writeFileSync(join(projectDir, 'data.bin'), binaryContent);

    const outputPath = join(root, 'project.7z');
    await compressProject(projectDir, outputPath, 5);

    const extractDir = join(root, 'extracted');
    mkdirSync(extractDir);
    extract7z(outputPath, extractDir);

    const extracted = readFileSync(join(extractDir, 'data.bin'));
    expect(Buffer.compare(extracted, binaryContent)).toBe(0);
  });
});
