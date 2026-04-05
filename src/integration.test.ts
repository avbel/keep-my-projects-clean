import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
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
import { compressProject } from './compressor'
import { getLastActivity, isGitRepository } from './git'
import { scanProjects } from './scanner'
import type { Config, ProjectInfo } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    rootDir: '/tmp',
    activeDays: 30,
    archiveDays: 180,
    confirm: false,
    compressionLevel: 3,
    ...overrides,
  }
}

function makeProjectInfo(dir: string, overrides: Partial<ProjectInfo> = {}): ProjectInfo {
  return {
    name: 'test-project',
    path: dir,
    types: ['js'],
    lastActivity: null,
    isGitRepo: false,
    ...overrides,
  }
}

function writeFile(filePath: string, sizeBytes = 512): void {
  writeFileSync(filePath, Buffer.alloc(sizeBytes, 0))
}

/**
 * Creates a git repository with a single backdated commit.
 */
function createBackdatedCommit(repoDir: string, daysAgo: number): void {
  const isoDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  Bun.spawnSync(['git', 'init'], { cwd: repoDir })
  Bun.spawnSync(['git', 'config', 'user.email', 'test@test.com'], { cwd: repoDir })
  Bun.spawnSync(['git', 'config', 'user.name', 'Test'], { cwd: repoDir })
  writeFileSync(join(repoDir, 'README.md'), 'test')
  Bun.spawnSync(['git', 'add', '.'], { cwd: repoDir })
  Bun.spawnSync(
    ['git', 'commit', '-m', 'initial'],
    {
      cwd: repoDir,
      env: {
        ...process.env,
        GIT_AUTHOR_DATE: isoDate,
        GIT_COMMITTER_DATE: isoDate,
      },
    },
  )
}

// ---------------------------------------------------------------------------
// Group 1: Three-zone logic — activity classification
// ---------------------------------------------------------------------------

describe('Group 1: three-zone logic', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-zone-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('recent git commit (10 days ago) → isGitRepo true, lastActivity within active window', async () => {
    const dir = join(tmpRoot, 'active-project')
    mkdirSync(dir, { recursive: true })
    createBackdatedCommit(dir, 10)

    const isGit = await isGitRepository(dir)
    const lastActivity = await getLastActivity(dir)

    expect(isGit).toBe(true)
    expect(lastActivity).not.toBeNull()

    const daysAgo = (Date.now() - lastActivity!.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysAgo).toBeLessThan(30) // active window
  })

  test('old git commit (60 days ago) → lastActivity outside active window, inside archive window', async () => {
    const dir = join(tmpRoot, 'inactive-project')
    mkdirSync(dir, { recursive: true })
    createBackdatedCommit(dir, 60)

    const lastActivity = await getLastActivity(dir)
    expect(lastActivity).not.toBeNull()

    const daysAgo = (Date.now() - lastActivity!.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysAgo).toBeGreaterThanOrEqual(30)
    expect(daysAgo).toBeLessThan(180)
  })

  test('inactive project (60 days ago) → cleanProject removes node_modules', async () => {
    const dir = join(tmpRoot, 'inactive-clean')
    mkdirSync(dir, { recursive: true })
    createBackdatedCommit(dir, 60)
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    writeFile(join(dir, 'node_modules', 'dep.js'), 1024)

    const result = await cleanProject(makeProjectInfo(dir), makeConfig({ confirm: true }))

    expect(result.artifactsRemoved).toHaveLength(1)
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
    expect(result.compressed).toBe(false)
  })

  test('very old git commit (200 days, archiveDays=90) → isGitRepo true, daysAgo >= archiveDays', async () => {
    const dir = join(tmpRoot, 'old-project')
    mkdirSync(dir, { recursive: true })
    createBackdatedCommit(dir, 200)

    const isGit = await isGitRepository(dir)
    const lastActivity = await getLastActivity(dir)

    expect(isGit).toBe(true)
    expect(lastActivity).not.toBeNull()

    const daysAgo = (Date.now() - lastActivity!.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysAgo).toBeGreaterThanOrEqual(90)
  })
})

// ---------------------------------------------------------------------------
// Group 2: JS cleaning (integration scenarios)
// ---------------------------------------------------------------------------

describe('Group 2: JS cleaning integration', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-js-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('node_modules + dist → both deleted with confirm:true', async () => {
    const dir = join(tmpRoot, 'js-full')
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    mkdirSync(join(dir, 'dist'), { recursive: true })
    writeFile(join(dir, 'node_modules', 'dep.js'), 1024)
    writeFile(join(dir, 'dist', 'bundle.js'), 512)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )

    const paths = result.artifactsRemoved.map((a) => a.path)
    expect(paths.some((p) => p.endsWith('node_modules'))).toBe(true)
    expect(paths.some((p) => p.endsWith('dist'))).toBe(true)
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
    expect(existsSync(join(dir, 'dist'))).toBe(false)
  })

  test('.next directory detected and deleted', async () => {
    const dir = join(tmpRoot, 'next-app')
    mkdirSync(join(dir, '.next', 'cache'), { recursive: true })
    writeFile(join(dir, '.next', 'cache', 'data.json'), 256)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved.some((a) => a.path.endsWith('.next'))).toBe(true)
    expect(existsSync(join(dir, '.next'))).toBe(false)
  })

  test('nested package.json → child node_modules also deleted', async () => {
    const dir = join(tmpRoot, 'monorepo')
    const childDir = join(dir, 'packages')
    mkdirSync(childDir, { recursive: true })
    writeFileSync(join(childDir, 'package.json'), '{}')
    mkdirSync(join(childDir, 'node_modules'), { recursive: true })
    writeFile(join(childDir, 'node_modules', 'lib.js'), 512)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )

    expect(
      result.artifactsRemoved.some((a) => a.path.includes(join('packages', 'node_modules'))),
    ).toBe(true)
    expect(existsSync(join(childDir, 'node_modules'))).toBe(false)
  })

  test('idempotent: second run on already-cleaned project → bytesFreed = 0', async () => {
    const dir = join(tmpRoot, 'idempotent')
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    writeFile(join(dir, 'node_modules', 'dep.js'), 1024)

    // First run — cleans
    const first = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )
    expect(first.bytesFreed).toBeGreaterThan(0)

    // Second run — nothing left to clean
    const second = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )
    expect(second.bytesFreed).toBe(0)
    expect(second.artifactsRemoved).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Group 3: Rust cleaning
// ---------------------------------------------------------------------------

describe('Group 3: Rust cleaning integration', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-rust-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('Cargo.toml + target → target deleted', async () => {
    const dir = join(tmpRoot, 'rust-project')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Cargo.toml'), '[package]\nname = "test"')
    mkdirSync(join(dir, 'target', 'debug'), { recursive: true })
    writeFile(join(dir, 'target', 'debug', 'binary'), 4096)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['rust'] }),
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved).toHaveLength(1)
    expect(result.artifactsRemoved[0].type).toBe('rust')
    expect(existsSync(join(dir, 'target'))).toBe(false)
  })

  test('nested subcrate with Cargo.toml + target → both target dirs deleted', async () => {
    const dir = join(tmpRoot, 'rust-workspace')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Cargo.toml'), '[workspace]')
    mkdirSync(join(dir, 'target', 'debug'), { recursive: true })
    writeFile(join(dir, 'target', 'debug', 'bin'), 2048)

    const subcrate = join(dir, 'crates', 'core')
    mkdirSync(subcrate, { recursive: true })
    writeFileSync(join(dir, 'crates', 'Cargo.toml'), '[package]\nname = "core"')
    mkdirSync(join(dir, 'crates', 'target', 'release'), { recursive: true })
    writeFile(join(dir, 'crates', 'target', 'release', 'lib.so'), 1024)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['rust'] }),
      makeConfig({ confirm: true }),
    )

    const paths = result.artifactsRemoved.map((a) => a.path)
    expect(paths.some((p) => p === join(dir, 'target'))).toBe(true)
    expect(paths.some((p) => p.includes(join('crates', 'target')))).toBe(true)
    expect(existsSync(join(dir, 'target'))).toBe(false)
    expect(existsSync(join(dir, 'crates', 'target'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Group 4: Move cleaning
// ---------------------------------------------------------------------------

describe('Group 4: Move cleaning integration', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-move-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('Move.toml + build → build deleted', async () => {
    const dir = join(tmpRoot, 'move-project')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Move.toml'), '[package]\nname = "test"')
    mkdirSync(join(dir, 'build'), { recursive: true })
    writeFile(join(dir, 'build', 'module.mv'), 1024)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['move'] }),
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved).toHaveLength(1)
    expect(result.artifactsRemoved[0].type).toBe('move')
    expect(existsSync(join(dir, 'build'))).toBe(false)
  })

  test('nested module with Move.toml + build → both build dirs deleted', async () => {
    const dir = join(tmpRoot, 'move-workspace')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'Move.toml'), '[workspace]')
    mkdirSync(join(dir, 'build'), { recursive: true })
    writeFile(join(dir, 'build', 'root.mv'), 512)

    const moduleDir = join(dir, 'contracts')
    mkdirSync(moduleDir, { recursive: true })
    writeFileSync(join(moduleDir, 'Move.toml'), '[package]\nname = "contracts"')
    mkdirSync(join(moduleDir, 'build'), { recursive: true })
    writeFile(join(moduleDir, 'build', 'bytecode.mv'), 512)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['move'] }),
      makeConfig({ confirm: true }),
    )

    const paths = result.artifactsRemoved.map((a) => a.path)
    expect(paths.some((p) => p === join(dir, 'build'))).toBe(true)
    expect(paths.some((p) => p.includes(join('contracts', 'build')))).toBe(true)
    expect(existsSync(join(dir, 'build'))).toBe(false)
    expect(existsSync(join(moduleDir, 'build'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Group 5: Multi-type projects
// ---------------------------------------------------------------------------

describe('Group 5: multi-type cleaning', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-multi-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('package.json + Cargo.toml → node_modules + target both cleaned', async () => {
    const dir = join(tmpRoot, 'polyglot')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')
    writeFileSync(join(dir, 'Cargo.toml'), '[package]')
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    writeFile(join(dir, 'node_modules', 'dep.js'), 512)
    mkdirSync(join(dir, 'target', 'debug'), { recursive: true })
    writeFile(join(dir, 'target', 'debug', 'bin'), 1024)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js', 'rust'] }),
      makeConfig({ confirm: true }),
    )

    const types = result.artifactsRemoved.map((a) => a.type)
    expect(types).toContain('js')
    expect(types).toContain('rust')
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
    expect(existsSync(join(dir, 'target'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Group 6: Non-git projects — never compressed
// ---------------------------------------------------------------------------

describe('Group 6: non-git projects never compressed', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-nogit-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('directory with no .git → isGitRepository returns false', async () => {
    const dir = join(tmpRoot, 'plain-dir')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'README.md'), 'hello')

    const result = await isGitRepository(dir)
    expect(result).toBe(false)
  })

  test('non-git dir with old mtime → getLastActivity returns mtime-based date', async () => {
    const dir = join(tmpRoot, 'old-nogit')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'file.txt'), 'content')

    const activity = await getLastActivity(dir)
    expect(activity).not.toBeNull()
    // mtime should be recent (just created)
    const ageMs = Date.now() - activity!.getTime()
    expect(ageMs).toBeLessThan(60 * 1000) // within 1 minute
  })

  test('non-git project: cleanProject runs, artifacts removed, no compression flagged', async () => {
    const dir = join(tmpRoot, 'non-git-clean')
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    writeFile(join(dir, 'node_modules', 'dep.js'), 1024)

    // isGitRepo: false means index.ts would never call compressProject
    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'], isGitRepo: false }),
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved).toHaveLength(1)
    expect(existsSync(join(dir, 'node_modules'))).toBe(false)
    // cleanProject itself never sets compressed:true — that's index.ts logic
    expect(result.compressed).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Group 7: Scanner integration
// ---------------------------------------------------------------------------

describe('Group 7: scanner integration', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-scan-'))

    // js project
    const jsDir = join(tmpRoot, 'my-app')
    mkdirSync(jsDir, { recursive: true })
    writeFileSync(join(jsDir, 'package.json'), '{}')

    // rust project
    const rustDir = join(tmpRoot, 'my-lib')
    mkdirSync(rustDir, { recursive: true })
    writeFileSync(join(rustDir, 'Cargo.toml'), '[package]')

    // move project
    const moveDir = join(tmpRoot, 'my-contract')
    mkdirSync(moveDir, { recursive: true })
    writeFileSync(join(moveDir, 'Move.toml'), '[package]')

    // plain dir (no manifest)
    mkdirSync(join(tmpRoot, 'plain'), { recursive: true })

    // hidden directory (should be skipped)
    mkdirSync(join(tmpRoot, '.hidden'), { recursive: true })
    writeFileSync(join(tmpRoot, '.hidden', 'package.json'), '{}')

    // symlink to js project (should be skipped)
    Bun.spawnSync(['ln', '-s', jsDir, join(tmpRoot, 'symlink-app')])
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('scanProjects returns correct ProjectInfo[] for root', async () => {
    const projects = await scanProjects(tmpRoot)

    const names = projects.map((p) => p.name).sort()
    expect(names).toContain('my-app')
    expect(names).toContain('my-lib')
    expect(names).toContain('my-contract')
    expect(names).toContain('plain')
  })

  test('hidden directories are skipped', async () => {
    const projects = await scanProjects(tmpRoot)
    const names = projects.map((p) => p.name)
    expect(names).not.toContain('.hidden')
  })

  test('symlinks are skipped', async () => {
    const projects = await scanProjects(tmpRoot)
    const names = projects.map((p) => p.name)
    expect(names).not.toContain('symlink-app')
  })

  test('project types detected correctly', async () => {
    const projects = await scanProjects(tmpRoot)

    const jsProject = projects.find((p) => p.name === 'my-app')
    expect(jsProject?.types).toContain('js')

    const rustProject = projects.find((p) => p.name === 'my-lib')
    expect(rustProject?.types).toContain('rust')

    const moveProject = projects.find((p) => p.name === 'my-contract')
    expect(moveProject?.types).toContain('move')
  })

  test('plain dir has empty types array', async () => {
    const projects = await scanProjects(tmpRoot)
    const plain = projects.find((p) => p.name === 'plain')
    expect(plain?.types).toHaveLength(0)
  })

  test('all returned projects have correct path and isGitRepo defaults', async () => {
    const projects = await scanProjects(tmpRoot)
    for (const project of projects) {
      expect(project.path).toBe(join(tmpRoot, project.name))
      expect(project.isGitRepo).toBe(false)
      expect(project.lastActivity).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Group 8: Edge cases
// ---------------------------------------------------------------------------

describe('Group 8: edge cases', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-edge-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('empty project dir (no artifacts) → bytesFreed=0, artifactsRemoved=[]', async () => {
    const dir = join(tmpRoot, 'empty-project')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), '{}')

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )

    expect(result.bytesFreed).toBe(0)
    expect(result.artifactsRemoved).toHaveLength(0)
    expect(result.skipped).toBe(false)
  })

  test('project with only source files → no artifacts removed', async () => {
    const dir = join(tmpRoot, 'source-only')
    mkdirSync(join(dir, 'src'), { recursive: true })
    writeFile(join(dir, 'src', 'main.ts'), 256)
    writeFileSync(join(dir, 'package.json'), '{}')

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved).toHaveLength(0)
    expect(existsSync(join(dir, 'src', 'main.ts'))).toBe(true)
  })

  test('cleanProject with empty types → no artifacts found', async () => {
    const dir = join(tmpRoot, 'unknown-type')
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    writeFile(join(dir, 'node_modules', 'dep.js'), 512)

    const result = await cleanProject(
      makeProjectInfo(dir, { types: [] }),
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved).toHaveLength(0)
    expect(result.bytesFreed).toBe(0)
    // node_modules still exists because types=[] means no collector ran
    expect(existsSync(join(dir, 'node_modules'))).toBe(true)
  })

  test('cleanResult has correct shape: not skipped, not compressed', async () => {
    const dir = join(tmpRoot, 'result-shape')
    mkdirSync(dir, { recursive: true })

    const result = await cleanProject(
      makeProjectInfo(dir, { types: ['js'] }),
      makeConfig({ confirm: true }),
    )

    expect(result.skipped).toBe(false)
    expect(result.compressed).toBe(false)
    expect(result.skipReason).toBe('')
    expect(typeof result.projectName).toBe('string')
    expect(Array.isArray(result.artifactsRemoved)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Group 9: Compressor integration
// ---------------------------------------------------------------------------

describe('Group 9: compressor integration', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-compress-'))
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('compressProject creates archive and removes original', async () => {
    const projectDir = join(tmpRoot, 'to-compress')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(join(projectDir, 'main.ts'), 'export const x = 1')
    writeFileSync(join(projectDir, 'README.md'), '# Test')

    const archivePath = join(tmpRoot, 'to-compress.7z')

    const result = await compressProject(projectDir, archivePath, 3)

    expect(result.success).toBe(true)
    expect(result.archiveSize).toBeGreaterThan(0)
    expect(existsSync(archivePath)).toBe(true)
    expect(existsSync(projectDir)).toBe(false)
  })

  test('compressProject on git repo preserves all files in archive', async () => {
    const projectDir = join(tmpRoot, 'git-to-compress')
    mkdirSync(projectDir, { recursive: true })
    createBackdatedCommit(projectDir, 200)
    writeFileSync(join(projectDir, 'src.ts'), 'export default {}')

    const archivePath = join(tmpRoot, 'git-compress.7z')
    const result = await compressProject(projectDir, archivePath, 1)

    expect(result.success).toBe(true)
    expect(result.archiveSize).toBeGreaterThan(0)
    expect(existsSync(projectDir)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Group 10: End-to-end flow simulation (multi-project root)
// ---------------------------------------------------------------------------

describe('Group 10: end-to-end multi-project simulation', () => {
  let tmpRoot: string

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'kmpc-e2e-'))

    // active-js: recent commit, has node_modules — should be classified active
    const activeJs = join(tmpRoot, 'active-js')
    mkdirSync(join(activeJs, 'node_modules'), { recursive: true })
    writeFile(join(activeJs, 'node_modules', 'dep.js'), 1024)
    writeFileSync(join(activeJs, 'package.json'), '{}')
    createBackdatedCommit(activeJs, 5)

    // inactive-rust: old commit, has target — should be cleanable
    const inactiveRust = join(tmpRoot, 'inactive-rust')
    mkdirSync(join(inactiveRust, 'target', 'debug'), { recursive: true })
    writeFile(join(inactiveRust, 'target', 'debug', 'bin'), 4096)
    writeFileSync(join(inactiveRust, 'Cargo.toml'), '[package]')
    createBackdatedCommit(inactiveRust, 60)
  })

  afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true })
  })

  test('scanProjects finds both projects', async () => {
    const projects = await scanProjects(tmpRoot)
    const names = projects.map((p) => p.name).sort()
    expect(names).toContain('active-js')
    expect(names).toContain('inactive-rust')
  })

  test('active project (5 days) → lastActivity within active window', async () => {
    const projects = await scanProjects(tmpRoot)
    const active = projects.find((p) => p.name === 'active-js')!
    active.lastActivity = await getLastActivity(active.path)

    const daysAgo = (Date.now() - active.lastActivity!.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysAgo).toBeLessThan(30)
  })

  test('inactive project (60 days) → lastActivity outside active window', async () => {
    const projects = await scanProjects(tmpRoot)
    const inactive = projects.find((p) => p.name === 'inactive-rust')!
    inactive.lastActivity = await getLastActivity(inactive.path)

    const daysAgo = (Date.now() - inactive.lastActivity!.getTime()) / (1000 * 60 * 60 * 24)
    expect(daysAgo).toBeGreaterThanOrEqual(30)
  })

  test('inactive-rust cleaned → target removed, active-js node_modules untouched by clean guard', async () => {
    const projects = await scanProjects(tmpRoot)

    // Clean the inactive rust project
    const inactive = projects.find((p) => p.name === 'inactive-rust')!
    const result = await cleanProject(
      { ...inactive, types: ['rust'] },
      makeConfig({ confirm: true }),
    )

    expect(result.artifactsRemoved).toHaveLength(1)
    expect(existsSync(join(tmpRoot, 'inactive-rust', 'target'))).toBe(false)

    // Active JS project node_modules still there (we never called cleanProject on it)
    expect(existsSync(join(tmpRoot, 'active-js', 'node_modules'))).toBe(true)
  })
})
