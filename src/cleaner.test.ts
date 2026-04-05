import { afterEach, describe, expect, it } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanProject } from './cleaner'
import type { Config, ProjectInfo } from './types'

function makeTempDir(dirs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'cleaner-test-'))
  dirs.push(dir)
  return dir
}

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    rootDir: '/tmp',
    activeDays: 30,
    archiveDays: 90,
    confirm: false,
    compressionLevel: 3,
    ...overrides,
  }
}

function makeProjectInfo(
  tempDir: string,
  overrides: Partial<ProjectInfo> = {},
): ProjectInfo {
  return {
    name: 'test-project',
    path: tempDir,
    types: ['js'],
    lastActivity: null,
    isGitRepo: false,
    ...overrides,
  }
}

function writeFile(filePath: string, sizeBytes: number): void {
  writeFileSync(filePath, Buffer.alloc(sizeBytes, 0))
}

describe('cleanProject', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    tempDirs.length = 0
  })

  describe('dry-run (confirm: false)', () => {
    it('returns artifacts list without deleting them', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'node_modules', 'some-pkg'), { recursive: true })
      writeFile(join(root, 'node_modules', 'some-pkg', 'index.js'), 1024)

      const result = await cleanProject(
        makeProjectInfo(root),
        makeConfig({ confirm: false }),
      )

      expect(result.artifactsRemoved).toHaveLength(1)
      expect(result.artifactsRemoved[0].path).toBe(
        join(root, 'node_modules'),
      )
      expect(existsSync(join(root, 'node_modules'))).toBe(true)
    })

    it('reports bytesFreed > 0 without deletion', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'node_modules'), { recursive: true })
      writeFile(join(root, 'node_modules', 'pkg.js'), 2048)

      const result = await cleanProject(
        makeProjectInfo(root),
        makeConfig({ confirm: false }),
      )

      expect(result.bytesFreed).toBeGreaterThan(0)
      expect(existsSync(join(root, 'node_modules'))).toBe(true)
    })
  })

  describe('JS artifacts', () => {
    it('deletes node_modules when confirm is true', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'node_modules'), { recursive: true })
      writeFile(join(root, 'node_modules', 'dep.js'), 512)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: true }),
      )

      expect(result.artifactsRemoved).toHaveLength(1)
      expect(existsSync(join(root, 'node_modules'))).toBe(false)
    })

    it('deletes dist when confirm is true', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'dist'), { recursive: true })
      writeFile(join(root, 'dist', 'bundle.js'), 512)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: true }),
      )

      expect(result.artifactsRemoved.some((a) => a.path.endsWith('dist'))).toBe(
        true,
      )
      expect(existsSync(join(root, 'dist'))).toBe(false)
    })

    it('detects .next as build output', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, '.next'), { recursive: true })
      writeFile(join(root, '.next', 'cache.json'), 256)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: false }),
      )

      expect(
        result.artifactsRemoved.some((a) => a.path.endsWith('.next')),
      ).toBe(true)
    })

    it('detects .svelte-kit as build output', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, '.svelte-kit'), { recursive: true })
      writeFile(join(root, '.svelte-kit', 'output.js'), 256)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: false }),
      )

      expect(
        result.artifactsRemoved.some((a) => a.path.endsWith('.svelte-kit')),
      ).toBe(true)
    })

    it('skips dirs not in the allow-list', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFile(join(root, 'src', 'index.ts'), 128)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: true }),
      )

      expect(result.artifactsRemoved).toHaveLength(0)
      expect(existsSync(join(root, 'src'))).toBe(true)
    })

    it('detects child package.json node_modules', async () => {
      const root = makeTempDir(tempDirs)
      const child = join(root, 'packages', 'ui')
      mkdirSync(child, { recursive: true })
      writeFileSync(join(root, 'packages', 'package.json'), '{}')
      mkdirSync(join(root, 'packages', 'node_modules'), { recursive: true })
      writeFile(join(root, 'packages', 'node_modules', 'dep.js'), 512)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: false }),
      )

      expect(
        result.artifactsRemoved.some((a) =>
          a.path.includes(join('packages', 'node_modules')),
        ),
      ).toBe(true)
    })
  })

  describe('Rust artifacts', () => {
    it('deletes target dir', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'target', 'debug'), { recursive: true })
      writeFile(join(root, 'target', 'debug', 'binary'), 4096)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['rust'] }),
        makeConfig({ confirm: true }),
      )

      expect(result.artifactsRemoved).toHaveLength(1)
      expect(result.artifactsRemoved[0].type).toBe('rust')
      expect(existsSync(join(root, 'target'))).toBe(false)
    })

    it('detects nested Cargo.toml and deletes child target', async () => {
      const root = makeTempDir(tempDirs)
      const child = join(root, 'crates', 'core')
      mkdirSync(child, { recursive: true })
      writeFileSync(join(root, 'crates', 'Cargo.toml'), '')
      mkdirSync(join(root, 'crates', 'target', 'release'), { recursive: true })
      writeFile(join(root, 'crates', 'target', 'release', 'lib.so'), 2048)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['rust'] }),
        makeConfig({ confirm: true }),
      )

      expect(
        result.artifactsRemoved.some((a) =>
          a.path.includes(join('crates', 'target')),
        ),
      ).toBe(true)
      expect(existsSync(join(root, 'crates', 'target'))).toBe(false)
    })
  })

  describe('Move artifacts', () => {
    it('deletes build dir', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'build'), { recursive: true })
      writeFile(join(root, 'build', 'module.mv'), 1024)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['move'] }),
        makeConfig({ confirm: true }),
      )

      expect(result.artifactsRemoved).toHaveLength(1)
      expect(result.artifactsRemoved[0].type).toBe('move')
      expect(existsSync(join(root, 'build'))).toBe(false)
    })

    it('detects nested Move.toml and deletes child build', async () => {
      const root = makeTempDir(tempDirs)
      const child = join(root, 'contracts')
      mkdirSync(child, { recursive: true })
      writeFileSync(join(child, 'Move.toml'), '')
      mkdirSync(join(child, 'build'), { recursive: true })
      writeFile(join(child, 'build', 'bytecode.mv'), 512)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['move'] }),
        makeConfig({ confirm: true }),
      )

      expect(
        result.artifactsRemoved.some((a) =>
          a.path.includes(join('contracts', 'build')),
        ),
      ).toBe(true)
      expect(existsSync(join(child, 'build'))).toBe(false)
    })
  })

  describe('multi-type (JS + Rust)', () => {
    it('cleans both node_modules and target', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'node_modules'), { recursive: true })
      writeFile(join(root, 'node_modules', 'dep.js'), 512)
      mkdirSync(join(root, 'target', 'debug'), { recursive: true })
      writeFile(join(root, 'target', 'debug', 'bin'), 1024)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js', 'rust'] }),
        makeConfig({ confirm: true }),
      )

      const types = result.artifactsRemoved.map((a) => a.type)
      expect(types).toContain('js')
      expect(types).toContain('rust')
      expect(existsSync(join(root, 'node_modules'))).toBe(false)
      expect(existsSync(join(root, 'target'))).toBe(false)
    })
  })

  describe('size measurement', () => {
    it('bytesFreed matches known file sizes', async () => {
      const root = makeTempDir(tempDirs)
      const FILE_SIZE = 102400
      mkdirSync(join(root, 'node_modules'), { recursive: true })
      writeFile(join(root, 'node_modules', 'big-dep.js'), FILE_SIZE)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: false }),
      )

      expect(result.bytesFreed).toBeGreaterThanOrEqual(FILE_SIZE)
    })
  })

  describe('safety', () => {
    it('does not delete .git directory', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, '.git', 'objects'), { recursive: true })
      writeFile(join(root, '.git', 'HEAD'), 32)
      mkdirSync(join(root, 'node_modules'), { recursive: true })

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: true }),
      )

      expect(existsSync(join(root, '.git'))).toBe(true)
      expect(
        result.artifactsRemoved.every((a) => !a.path.includes('.git')),
      ).toBe(true)
    })

    it('does not delete source files', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'src'), { recursive: true })
      writeFile(join(root, 'src', 'main.ts'), 256)

      const result = await cleanProject(
        makeProjectInfo(root, { types: ['js'] }),
        makeConfig({ confirm: true }),
      )

      expect(existsSync(join(root, 'src', 'main.ts'))).toBe(true)
      expect(result.artifactsRemoved).toHaveLength(0)
    })
  })

  describe('unknown types', () => {
    it('returns empty artifacts for empty types array', async () => {
      const root = makeTempDir(tempDirs)
      mkdirSync(join(root, 'node_modules'), { recursive: true })
      mkdirSync(join(root, 'target'), { recursive: true })

      const result = await cleanProject(
        makeProjectInfo(root, { types: [] }),
        makeConfig({ confirm: true }),
      )

      expect(result.artifactsRemoved).toHaveLength(0)
      expect(result.bytesFreed).toBe(0)
      expect(existsSync(join(root, 'node_modules'))).toBe(true)
      expect(existsSync(join(root, 'target'))).toBe(true)
    })
  })
})
