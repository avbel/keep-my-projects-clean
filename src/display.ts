import { basename } from 'node:path'

import type { CleanResult, ProjectType, Summary } from './types.ts'

type SpinnerHandle = {
  stop: (finalLine: string) => void
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const projectIcons: Record<ProjectType, string> = {
  js: '📦',
  rust: '🦀',
  move: '🔗'
}

let activeSpinner: SpinnerHandle | null = null

function clearLine(): void {
  process.stdout.write('\r\x1b[K')
}

function writeLine(line: string): void {
  clearLine()
  process.stdout.write(`${line}\n`)
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)]
}

function formatArtifactList(artifacts: CleanResult['artifactsRemoved']): string {
  const names = uniqueValues(artifacts.map((artifact) => basename(artifact.path)))

  if (names.length === 0) {
    return 'no artifacts'
  }

  return names.join(', ')
}

function stopActiveSpinner(finalLine = ''): void {
  if (!activeSpinner) {
    if (finalLine) {
      writeLine(finalLine)
    }

    return
  }

  const spinner = activeSpinner
  activeSpinner = null
  spinner.stop(finalLine)
}

export function projectIcon(types: ProjectType[]): string {
  const icons = uniqueValues(types.map((type) => projectIcons[type]))

  if (icons.length === 0) {
    return '📁'
  }

  return icons.join('')
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`
  }

  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function startSpinner(label: string): SpinnerHandle {
  let frameIndex = 0
  let stopped = false

  const render = (): void => {
    const frame = spinnerFrames[frameIndex % spinnerFrames.length]
    process.stdout.write(`\r\x1b[K${frame} ${label}`)
    frameIndex += 1
  }

  render()
  const timer = setInterval(render, 80)

  return {
    stop(finalLine: string): void {
      if (stopped) {
        return
      }

      stopped = true
      clearInterval(timer)
      clearLine()

      if (finalLine) {
        process.stdout.write(`${finalLine}\n`)
      }
    }
  }
}

export function displayDryRunBanner(): void {
  writeLine('╔══════════════════════════════════╗')
  writeLine('║  DRY RUN — no files will change  ║')
  writeLine('║  Run with --confirm to apply     ║')
  writeLine('╚══════════════════════════════════╝')
}

export function displayProjectStart(name: string, types: ProjectType[]): void {
  if (activeSpinner) {
    stopActiveSpinner()
  }

  activeSpinner = startSpinner(`${projectIcon(types)} ${name}`)
}

export function displayProjectResult(result: CleanResult): void {
  const icon = projectIcon(result.artifactsRemoved.map((artifact) => artifact.type))

  if (result.skipped) {
    stopActiveSpinner(`⏭️ ${icon} ${result.projectName} — skipped (${result.skipReason})`)
    return
  }

  if (result.compressed) {
    const summary = `🗜️ ${icon} ${result.projectName} — compressed → ${result.projectName}.tar.zst (${formatBytes(result.bytesFreed)} freed)`
    stopActiveSpinner(summary)
    return
  }

  const status = result.bytesFreed > 0 || result.artifactsRemoved.length > 0 ? '✅' : '⚠️'
  const artifactList = formatArtifactList(result.artifactsRemoved)
  const line = `${status} ${icon} ${result.projectName} — cleaned ${formatBytes(result.bytesFreed)} (${artifactList})`

  stopActiveSpinner(line)
}

export function displaySummary(summary: Summary): void {
  stopActiveSpinner()

  const lines = [
    '────────────────────────────────────',
    ' Summary',
    '────────────────────────────────────',
    ` Projects processed:   ${summary.totalProcessed}`,
    ` Projects cleaned:     ${summary.totalCleaned}`,
    ` Projects compressed:  ${summary.totalCompressed}`,
    ` Space freed:          ${formatBytes(summary.totalBytesFreed)}`,
    '────────────────────────────────────'
  ]

  for (const line of lines) {
    process.stdout.write(`${line}\n`)
  }
}
