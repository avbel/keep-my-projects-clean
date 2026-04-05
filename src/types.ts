/**
 * Classifies the supported project families that the CLI can detect and clean.
 */
export type ProjectType = 'js' | 'rust' | 'move'

/**
 * Describes a scanned project directory and the metadata needed to decide whether it should be cleaned.
 */
export interface ProjectInfo {
  /** Directory name. */
  name: string
  /** Absolute path to the project directory. */
  path: string
  /** Detected project types; a project can belong to more than one family. */
  types: ProjectType[]
  /** Most recent activity date from git or the filesystem fallback. */
  lastActivity: Date | null
  /** Indicates whether the directory is a git repository. */
  isGitRepo: boolean
}

/**
 * Represents one deletable artifact directory together with its measured size before deletion.
 */
export interface CleanableArtifact {
  /** Absolute path to the artifact directory. */
  path: string
  /** Project family that produced the artifact. */
  type: ProjectType
  /** Size in bytes measured before deletion. */
  sizeBytes: number
}

/**
 * Summarizes the result of cleaning a single project.
 */
export interface CleanResult {
  /** Name of the project that was processed. */
  projectName: string
  /** Artifact directories that were removed. */
  artifactsRemoved: CleanableArtifact[]
  /** Total bytes freed, matching the sum of removed artifact sizes. */
  bytesFreed: number
  /** Indicates whether the project was archived instead of deleted. */
  compressed: boolean
  /** Indicates whether the project was skipped because it was still active. */
  skipped: boolean
  /** Explanation for skipping, or an empty string when not skipped. */
  skipReason: string
}

/**
 * Captures CLI configuration after parsing arguments and environment variables.
 */
export interface Config {
  /** Root directory to scan. */
  rootDir: string
  /** Number of days of inactivity before a project becomes eligible for cleaning. */
  activeDays: number
  /** Number of days of inactivity before a project becomes eligible for compression. */
  archiveDays: number
  /** Indicates whether the CLI should actually delete files instead of doing a dry run. */
  confirm: boolean
  /** 7z compression level (0-9), validated at parse time. */
  compressionLevel: number
}

/**
 * Aggregated totals produced by a full cleaning run.
 */
export interface Summary {
  /** Number of projects processed. */
  totalProcessed: number
  /** Number of projects that were cleaned. */
  totalCleaned: number
  /** Number of projects that were compressed. */
  totalCompressed: number
  /** Total number of bytes freed across all processed projects. */
  totalBytesFreed: number
}
