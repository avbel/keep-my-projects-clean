import { rm } from 'node:fs/promises';

export function assert7zAvailable(): void {
  const result = Bun.spawnSync(['7z', '--help'], { stderr: 'pipe', stdout: 'pipe' });
  if (result.exitCode !== 0) {
    throw new Error('7z is not installed. Install p7zip (brew install p7zip / apt install p7zip-full) and try again.');
  }
}

export async function compressProject(
  projectDir: string,
  outputPath: string,
  level: number,
): Promise<{ success: boolean; archiveSize: number }> {
  try {
    const result = Bun.spawnSync(
      ['7z', 'a', `-mx=${level}`, outputPath, '.'],
      { cwd: projectDir, stderr: 'pipe', stdout: 'pipe' },
    );

    if (result.exitCode !== 0) {
      return { success: false, archiveSize: 0 };
    }

    const archiveFile = Bun.file(outputPath);
    const archiveSize = archiveFile.size;

    if (archiveSize === 0) {
      return { success: false, archiveSize: 0 };
    }

    await rm(projectDir, { recursive: true, force: true });

    return { success: true, archiveSize };
  } catch {
    return { success: false, archiveSize: 0 };
  }
}
