import { access, readdir, rm, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'
import type {
  CleanResult,
  CleanableArtifact,
  Config,
  ProjectInfo,
  ProjectType,
} from './types'

const JS_BUILD_OUTPUT = [
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.parcel-cache',
]

const SKIP_CHILDREN = new Set([
  'node_modules',
  'target',
  'build',
  'dist',
  '.git',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.parcel-cache',
])

async function dirExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function dirSize(dirPath: string): Promise<number> {
  let total = 0
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      total += await dirSize(entryPath)
    } else {
      const s = await stat(entryPath)
      total += s.size
    }
  }
  return total
}

async function safeDirSize(path: string): Promise<number> {
  try {
    return await dirSize(path)
  } catch {
    return 0
  }
}

async function collectJsArtifacts(projectPath: string): Promise<string[]> {
  const artifacts: string[] = []

  const nodeModules = join(projectPath, 'node_modules')
  if (await dirExists(nodeModules)) artifacts.push(nodeModules)

  for (const dir of JS_BUILD_OUTPUT) {
    const p = join(projectPath, dir)
    if (await dirExists(p)) artifacts.push(p)
  }

  let entries: Dirent[] = []
  try {
    entries = await readdir(projectPath, { withFileTypes: true })
  } catch {
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (SKIP_CHILDREN.has(entry.name)) continue

    const childPath = join(projectPath, entry.name)
    if (await dirExists(join(childPath, 'package.json'))) {
      const childNodeModules = join(childPath, 'node_modules')
      if (await dirExists(childNodeModules)) artifacts.push(childNodeModules)

      for (const dir of JS_BUILD_OUTPUT) {
        const p = join(childPath, dir)
        if (await dirExists(p)) artifacts.push(p)
      }
    }
  }

  return artifacts
}

async function collectRustArtifacts(projectPath: string): Promise<string[]> {
  const artifacts: string[] = []

  const target = join(projectPath, 'target')
  if (await dirExists(target)) artifacts.push(target)

  let entries: Dirent[] = []
  try {
    entries = await readdir(projectPath, { withFileTypes: true })
  } catch {
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (SKIP_CHILDREN.has(entry.name)) continue

    const childPath = join(projectPath, entry.name)
    if (await dirExists(join(childPath, 'Cargo.toml'))) {
      const childTarget = join(childPath, 'target')
      if (await dirExists(childTarget)) artifacts.push(childTarget)
    }
  }

  return artifacts
}

async function collectMoveArtifacts(projectPath: string): Promise<string[]> {
  const artifacts: string[] = []

  const build = join(projectPath, 'build')
  if (await dirExists(build)) artifacts.push(build)

  let entries: Dirent[] = []
  try {
    entries = await readdir(projectPath, { withFileTypes: true })
  } catch {
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (SKIP_CHILDREN.has(entry.name)) continue

    const childPath = join(projectPath, entry.name)
    if (await dirExists(join(childPath, 'Move.toml'))) {
      const childBuild = join(childPath, 'build')
      if (await dirExists(childBuild)) artifacts.push(childBuild)
    }
  }

  return artifacts
}

export async function cleanProject(
  info: ProjectInfo,
  config: Config,
): Promise<CleanResult> {
  const artifactPaths: { path: string; type: ProjectType }[] = []

  if (info.types.includes('js')) {
    for (const p of await collectJsArtifacts(info.path)) {
      artifactPaths.push({ path: p, type: 'js' })
    }
  }

  if (info.types.includes('rust')) {
    for (const p of await collectRustArtifacts(info.path)) {
      artifactPaths.push({ path: p, type: 'rust' })
    }
  }

  if (info.types.includes('move')) {
    for (const p of await collectMoveArtifacts(info.path)) {
      artifactPaths.push({ path: p, type: 'move' })
    }
  }

  const artifacts: CleanableArtifact[] = await Promise.all(
    artifactPaths.map(async ({ path, type }) => ({
      path,
      type,
      sizeBytes: await safeDirSize(path),
    })),
  )

  if (config.confirm) {
    for (const artifact of artifacts) {
      await rm(artifact.path, { recursive: true, force: true })
    }
  }

  const bytesFreed = artifacts.reduce((sum, a) => sum + a.sizeBytes, 0)

  return {
    projectName: info.name,
    artifactsRemoved: artifacts,
    bytesFreed,
    compressed: false,
    skipped: false,
    skipReason: '',
  }
}
