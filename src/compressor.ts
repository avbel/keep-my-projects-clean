import { lstat, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export function assert7zAvailable(): void {
  const result = Bun.spawnSync(['7z', '--help'], { stderr: 'pipe', stdout: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error('7z is not installed. Install p7zip (brew install p7zip / apt install p7zip-full) and try again.');
  }
}

async function dirSize(dirPath: string): Promise<number> {
  let total = 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name);
    const s = await lstat(entryPath);
    if (s.isSymbolicLink()) continue;
    if (s.isDirectory()) {
      total += await dirSize(entryPath);
    } else {
      total += s.size;
    }
  }
  return total;
}

export async function compressProject(
  projectDir: string,
  outputPath: string,
  level: number,
): Promise<{ success: boolean; bytesFreed: number }> {
  try {
    const originalSize = await dirSize(projectDir);

    const result = Bun.spawnSync(
      ['7z', 'a', `-mx=${level}`, outputPath, '.'],
      { cwd: projectDir, stderr: 'pipe', stdout: 'pipe' },
    );

    if (result.exitCode !== 0) {
      return { success: false, bytesFreed: 0 };
    }

    const archiveSize = Bun.file(outputPath).size;

    if (archiveSize === 0) {
      return { success: false, bytesFreed: 0 };
    }

    await rm(projectDir, { recursive: true, force: true });

    const freed = Math.max(0, originalSize - archiveSize);
    return { success: true, bytesFreed: freed };
  } catch {
    return { success: false, bytesFreed: 0 };
  }
}
