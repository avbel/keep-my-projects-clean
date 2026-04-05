import { readdir, rm } from 'node:fs/promises';
import { join, relative } from 'node:path';

export async function buildFileMap(
  dir: string,
): Promise<Record<string, Blob>> {
  const fileMap: Record<string, Blob> = {};

  async function recurse(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      const relPath = relative(dir, fullPath);

      if (entry.isSymbolicLink()) continue;

      if (entry.isDirectory()) {
        await recurse(fullPath);
      } else {
        const content = await Bun.file(fullPath).bytes();
        fileMap[relPath] = new Blob([content]);
      }
    }
  }

  await recurse(dir);
  return fileMap;
}

export async function compressProject(
  projectDir: string,
  outputPath: string,
  level: number,
): Promise<{ success: boolean; archiveSize: number }> {
  try {
    const fileMap = await buildFileMap(projectDir);

    const archive = new Bun.Archive(fileMap);
    const tarBytes = new Uint8Array(
      await new Response(archive as unknown as BodyInit).arrayBuffer(),
    );

    const compressed = Bun.zstdCompressSync(tarBytes, { level });
    await Bun.write(outputPath, compressed);

    const archiveFile = Bun.file(outputPath);
    const archiveSize = archiveFile.size;

    if (archiveSize === 0) {
      return { success: false, archiveSize: 0 };
    }

    const bytes = new Uint8Array(await archiveFile.arrayBuffer());
    try {
      Bun.zstdDecompressSync(bytes);
    } catch {
      return { success: false, archiveSize: 0 };
    }

    await rm(projectDir, { recursive: true, force: true });

    return { success: true, archiveSize };
  } catch {
    return { success: false, archiveSize: 0 };
  }
}
