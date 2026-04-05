import { join } from 'node:path'

import { parseConfig } from './config'
import { compressProject } from './compressor'
import { cleanProject } from './cleaner'
import {
  displayDryRunBanner,
  displayProjectResult,
  displayProjectStart,
  displaySummary,
} from './display'
import { getLastActivity, isGitRepository } from './git'
import { scanProjects } from './scanner'
import type { CleanResult, Summary } from './types'

const MS_PER_DAY = 1000 * 60 * 60 * 24

async function main(): Promise<void> {
  const config = parseConfig()

  if (!config.confirm) {
    displayDryRunBanner()
  }

  const projects = await scanProjects(config.rootDir)

  const summary: Summary = {
    totalProcessed: 0,
    totalCleaned: 0,
    totalCompressed: 0,
    totalBytesFreed: 0,
  }

  for (const project of projects) {
    project.isGitRepo = await isGitRepository(project.path)
    project.lastActivity = await getLastActivity(project.path)

    const now = Date.now()
    const lastMs = project.lastActivity ? project.lastActivity.getTime() : 0
    const daysAgo = project.lastActivity
      ? (now - lastMs) / MS_PER_DAY
      : Infinity

    summary.totalProcessed++
    displayProjectStart(project.name, project.types)

    if (daysAgo < config.activeDays) {
      const result: CleanResult = {
        projectName: project.name,
        artifactsRemoved: [],
        bytesFreed: 0,
        compressed: false,
        skipped: true,
        skipReason: `active, last commit ${Math.floor(daysAgo)} days ago`,
      }
      displayProjectResult(result)
      continue
    }

    const cleanResult = await cleanProject(project, config)
    summary.totalBytesFreed += cleanResult.bytesFreed

    if (cleanResult.artifactsRemoved.length > 0) {
      summary.totalCleaned++
    }

    if (daysAgo >= config.archiveDays && project.isGitRepo) {
      if (config.confirm) {
        const archivePath = join(config.rootDir, project.name + '.tar.zst')
        const compressResult = await compressProject(
          project.path,
          archivePath,
          config.compressionLevel,
        )
        if (compressResult.success) {
          summary.totalCompressed++
          cleanResult.compressed = true
          cleanResult.bytesFreed += compressResult.archiveSize
        }
      } else {
        cleanResult.compressed = true
        summary.totalCompressed++
      }
    }

    displayProjectResult(cleanResult)
  }

  displaySummary(summary)
}

try {
  await main()
} catch (err: unknown) {
  process.stderr.write(
    `Error: ${err instanceof Error ? err.message : String(err)}\n`,
  )
  process.exit(1)
}
