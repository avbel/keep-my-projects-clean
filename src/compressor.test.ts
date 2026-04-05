import { afterEach, describe, expect, it } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildFileMap, compressProject } from './compressor';

function makeTempDir(dirs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'compressor-test-'));
  dirs.push(dir);
  return dir;
}

function writeFile(filePath: string, content: string | Buffer): void {
  writeFileSync(filePath, content);
}

describe('compressProject', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('creates a .tar.zst file with success=true and archiveSize > 0', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFile(join(projectDir, 'index.ts'), 'console.log("hello");');

    const outputPath = join(root, 'project.tar.zst');
    const result = await compressProject(projectDir, outputPath, 3);

    expect(result.success).toBe(true);
    expect(result.archiveSize).toBeGreaterThan(0);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('produces a decompressible archive', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFile(join(projectDir, 'main.ts'), 'export const x = 1;');

    const outputPath = join(root, 'project.tar.zst');
    await compressProject(projectDir, outputPath, 3);

    const compressed = new Uint8Array(
      await Bun.file(outputPath).arrayBuffer(),
    );
    const decompressed = Bun.zstdDecompressSync(compressed);
    expect(decompressed.byteLength).toBeGreaterThan(0);
  });

  it('includes all nested directory files in the archive', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(join(projectDir, 'src', 'utils'), { recursive: true });
    writeFile(join(projectDir, 'src', 'index.ts'), 'export {};');
    writeFile(join(projectDir, 'src', 'utils', 'helpers.ts'), 'export {};');
    writeFile(join(projectDir, 'README.md'), '# Test');

    const fileMap = await buildFileMap(projectDir);
    const keys = Object.keys(fileMap);

    expect(keys).toContain(join('src', 'index.ts'));
    expect(keys).toContain(join('src', 'utils', 'helpers.ts'));
    expect(keys).toContain('README.md');
  });

  it('deletes the original directory after successful compression', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    mkdirSync(projectDir, { recursive: true });
    writeFile(join(projectDir, 'file.txt'), 'data');

    const outputPath = join(root, 'project.tar.zst');
    const result = await compressProject(projectDir, outputPath, 3);

    expect(result.success).toBe(true);
    expect(existsSync(projectDir)).toBe(false);
  });

  it('overwrites an existing archive without error', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'project');
    const outputPath = join(root, 'project.tar.zst');

    mkdirSync(projectDir, { recursive: true });
    writeFile(join(projectDir, 'v1.txt'), 'a');
    await compressProject(projectDir, outputPath, 3);

    expect(existsSync(outputPath)).toBe(true);

    mkdirSync(projectDir, { recursive: true });
    writeFile(join(projectDir, 'v2.txt'), 'b'.repeat(50_000));
    const result = await compressProject(projectDir, outputPath, 3);

    expect(result.success).toBe(true);
    expect(result.archiveSize).toBeGreaterThan(0);
  });

  it('handles an empty directory without crashing', async () => {
    const root = makeTempDir(tempDirs);
    const projectDir = join(root, 'empty');
    mkdirSync(projectDir, { recursive: true });

    const outputPath = join(root, 'empty.tar.zst');
    const result = await compressProject(projectDir, outputPath, 3);

    expect(result.success).toBe(true);
    expect(existsSync(outputPath)).toBe(true);
  });

  it('produces smaller output at higher compression levels', async () => {
    const root = makeTempDir(tempDirs);

    const repeatedContent = 'abcdefghij'.repeat(10_000);

    const projectLow = join(root, 'project-low');
    mkdirSync(projectLow, { recursive: true });
    writeFile(join(projectLow, 'data.txt'), repeatedContent);
    const outputLow = join(root, 'low.tar.zst');
    const resultLow = await compressProject(projectLow, outputLow, 1);

    const projectHigh = join(root, 'project-high');
    mkdirSync(projectHigh, { recursive: true });
    writeFile(join(projectHigh, 'data.txt'), repeatedContent);
    const outputHigh = join(root, 'high.tar.zst');
    const resultHigh = await compressProject(projectHigh, outputHigh, 22);

    expect(resultLow.success).toBe(true);
    expect(resultHigh.success).toBe(true);
    expect(resultHigh.archiveSize).toBeLessThanOrEqual(resultLow.archiveSize);
  });
});
