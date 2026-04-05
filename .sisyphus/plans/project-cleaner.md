# Project Directory Cleaner

## TL;DR

> **Quick Summary**: Bun TypeScript CLI that scans child subdirectories of a projects root, identifies project types (JS/Rust/Move), removes build artifacts, and compresses inactive old projects to tar.zst archives.
>
> **Deliverables**:
> - CLI tool: `bun run src/index.ts <dir>`
> - Modules: config, scanner, git, cleaner, compressor, display
> - Tests: `bun test` with real directory fixtures
>
> **Estimated Effort**: Medium
> **Parallel Execution**: NO - sequential modules (each depends on types)
> **Critical Path**: types → config → scanner → git → cleaner → compressor → display → index

---

## Context

### Original Request
A cleaner of my projects directory (root dir via arg or env). Goes through each child subdirectory (1 level), detects project type (JS/Rust/Move), removes build artifacts, and compresses old projects (>180 days) to tar.zst with configurable compression level. Shows progress with icons. Bun TypeScript, no Node.js layer, single quotes for strings.

### Interview Summary
**Key Discussions**:
- Input: CLI arg priority, ENV var fallback (`PROJECTS_DIR`)
- Dry-run first by default, `--confirm` to actually delete
- Thresholds: `--active-days 30` (skip), `--archive-days 180` (compress)
- Compression: `Bun.Archive` (raw tar) + `Bun.zstdCompressSync` (level 22) — pure Bun native, zero deps
- Build output: check known dirs on disk (allow-list), NOT parse build scripts
- Multi-type projects: clean ALL types detected (both JS and Rust artifacts)

**Research Findings**:
- `Bun.Archive` creates uncompressed tar by default, supports `{ compress: "gzip" }`
- `Bun.zstdCompressSync(data, { level: 22 })` — pure Bun, level 1-22, better than DEFLATE
- Pipeline: `Bun.Archive` (raw tar) → `Bun.zstdCompressSync` (level 22) → `.tar.zst`
- `archiver`: BROKEN with Bun (zero-byte files - Issue #10986)
- `lzma-native`: BROKEN with Bun (hangs - Issue #24484)
- `git for-each-ref` much faster than `git log --all` for last commit date

### Metis Review
**Identified Gaps** (addressed):
- Multi-type projects: both cleaners run, all types cleaned
- Non-git projects: use filesystem mtime as fallback
- Build output: locked to allow-list of known dirs (no script parsing)
- Three-zone logic confirmed: <30 skip, 30-180 clean only, >180 compress+clean
- Boundary: exclusive (> not >=) for day thresholds

---

## Work Objectives

### Core Objective
Create a Bun TypeScript CLI tool that automatically cleans build artifacts from inactive projects and archives very old ones, reclaiming disk space.

### Concrete Deliverables
- `src/types.ts` - Shared type definitions
- `src/config.ts` - CLI arg/env parsing with validation
- `src/scanner.ts` - Project type detection from manifest files
- `src/git.ts` - Last activity date detection (git or mtime fallback)
- `src/cleaner.ts` - Artifact directory deletion with dry-run support
- `src/compressor.ts` - Compression (Bun.Archive tar + Bun.zstdCompressSync)
- `src/display.ts` - Progress output with icons, summary formatting
- `src/index.ts` - Entry point, orchestration pipeline
- `biome.json` - Single-quote formatter config
- Tests for all modules + integration test

### Definition of Done
- [ ] `bun run src/index.ts ~/Projects` shows dry-run preview
- [ ] `bun run src/index.ts ~/Projects --confirm` performs cleanup
- [ ] `bun test` passes all unit and integration tests

### Must Have
- Dry-run by default (requires `--confirm` to delete)
- All three project types: JS, Rust, Move
- Progress display with icons: 📦 JS, 🦀 Rust, 🔗 Move
- Summary: total space cleaned, projects compressed, projects processed
- Compression: pure Bun native (Bun.Archive + Bun.zstdCompressSync), zero external deps

### Must NOT Have (Guardrails)
- NO parsing `package.json` build scripts or config files for output detection
- NO additional project types (Python, Go, Java, Swift)
- NO config file (`.cleanrc`) - CLI args and ENV only
- NO interactive TUI prompts
- NO source file modification (read-only for project metadata)
- NO following symlinks into other directories
- NO processing hidden directories (`.dotfiles`) in root
- NO external compression dependencies (zip-bun, archiver, lzma-native — use only Bun native APIs)
- NO compressing non-git projects (no verifiable history = always clean-only, never archive)

---

## Verification Strategy (MANDATORY)

### Test Decision
- **Infrastructure exists**: NO (greenfield)
- **Automated tests**: YES (TDD)
- **Framework**: bun:test (built-in)
- **If TDD**: Each task follows RED (failing test) → GREEN (minimal impl) → REFACTOR

### QA Policy
Every task includes agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI**: Use Bash (tmux) - Run command, capture output, validate
- **Filesystem**: Use Bash (ls/du/find) - Verify directories exist/deleted
- **Integration**: Use Bash - Full pipeline test with temp fixtures

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (foundation):
├── Task 1: Project scaffold (bun init, tsconfig, biome, .gitignore)
└── Task 2: Type definitions (src/types.ts)

Wave 2 (core modules - depends on types):
├── Task 3: Config module (CLI parsing, validation)
├── Task 4: Scanner module (project type detection)
├── Task 5: Git module (last activity detection)
├── Task 6: Display module (progress + summary)
└── Task 7: Cleaner module (artifact deletion, dry-run)

Wave 3 (depends on multiple):
└── Task 8: Compressor module (Bun.Archive + Bun.zstdCompressSync)

Wave 4 (integration):
├── Task 9: Entry point (wire all modules)
└── Task 10: Integration tests + edge cases

Wave FINAL:
├── F1: Plan compliance audit (oracle)
├── F2: Code quality review (unspecified-high)
├── F3: Real manual QA (unspecified-high)
└── F4: Scope fidelity check (deep)
```

### Dependency Matrix
- T1,T2: None → T3-T7
- T3: T2 → T9
- T4: T2 → T7
- T5: None → T7, T9
- T6: None → T9
- T7: T2, T4, T5 → T9
- T8: T2 → T9
- T9: T3-T8 → T10
- T10: T9 → F1-F4

---

## TODOs

- [x] 1. Project scaffold

  **What to do**:
  - `bun init` in project root
  - Create `tsconfig.json` with strict mode, ESNext target
  - Create `biome.json` with single-quote formatter config
  - Create `.gitignore` (node_modules, dist, .sisyphus/evidence)
  - Create `src/` directory structure

  **Must NOT do**:
  - Install any external dependencies (project uses only Bun native APIs)
  - Create any source files beyond the scaffold

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Simple file scaffolding, no logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 2)
  - **Blocks**: Tasks 3-8 (need project structure)
  - **Blocked By**: None

  **References**:
  - This is a greenfield project - no existing patterns to follow

  **Acceptance Criteria**:
  - [ ] `bun init` completed with package.json
  - [ ] `tsconfig.json` exists with `"strict": true`, `"module": "ESNext"`
  - [ ] `biome.json` exists with `"formatter": { "quoteStyle": "single" }`
  - [ ] `.gitignore` includes node_modules, dist, .sisyphus/evidence
  - [ ] `src/` directory exists

  **QA Scenarios**:

  ```
  Scenario: Project structure exists after scaffold
    Tool: Bash
    Preconditions: Empty project directory
    Steps:
      1. Run the scaffold task
      2. ls -la src/
      3. cat package.json
      4. cat tsconfig.json
      5. cat biome.json
    Expected Result: All files exist with correct content
    Failure Indicators: Missing files or incorrect config
    Evidence: .sisyphus/evidence/task-1-scaffold-structure.txt
  ```

  **Commit**: YES
  - Message: `feat: scaffold project with bun init, tsconfig, biome, .gitignore`
  - Files: `package.json, tsconfig.json, biome.json, .gitignore`

---

- [x] 2. Type definitions

  **What to do**:
  - Create `src/types.ts` with all shared types:
    - `ProjectType`: `'js' | 'rust' | 'move'`
    - `ProjectInfo`: name, path, type(s), lastActivity (Date | null), isGitRepo (boolean)
    - `CleanableArtifact`: path, type, sizeBytes (measured before delete)
    - `CleanResult`: projectName, artifactsRemoved[], bytesFreed, compressed (boolean), skipped (boolean), skipReason (string)
    - `Config`: activeDays (number), archiveDays (number), confirm (boolean), rootDir (string), compressionLevel (number)
    - `Summary`: totalProcessed, totalCleaned, totalCompressed, totalBytesFreed

  **Must NOT do**:
  - Implement any logic - types only

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Type definitions only, no logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Task 1)
  - **Blocks**: Tasks 3-8 (import types)
  - **Blocked By**: None

  **References**:
  - Metis analysis defines the required type shapes (see Context section)

  **Acceptance Criteria**:
  - [ ] `src/types.ts` exists with all types exported
  - [ ] `bun build src/types.ts` compiles without errors
  - [ ] All types have proper type annotations (no `any`)

  **QA Scenarios**:

  ```
  Scenario: Types compile without errors
    Tool: Bash
    Preconditions: tsconfig.json exists with strict mode
    Steps:
      1. bun build src/types.ts
    Expected Result: Exit code 0, no type errors
    Failure Indicators: Type errors in output
    Evidence: .sisyphus/evidence/task-2-types-compile.txt
  ```

  **Commit**: YES
  - Message: `feat(types): add shared type definitions`
  - Files: `src/types.ts`

---

- [x] 3. Config module

  **What to do**:
  - Create `src/config.ts` that:
    - Uses `util.parseArgs()` (Node stdlib, available in Bun) for CLI parsing
    - Supports positional arg (root directory, priority) or `PROJECTS_DIR` env fallback
    - Flags: `--active-days <n>` (default 30), `--archive-days <n>` (default 180), `--confirm` (boolean), `--compression-level <n>` (default 10, range 1-22)
    - Validates: `archive-days > active-days`, root directory exists and is a directory, compression-level in 1-22
    - Returns `Config` object
  - Create `src/config.test.ts` with tests

  **Must NOT do**:
  - Add external CLI framework dependency (commander, citty, etc.)
  - Accept `--format` or any compression format flag

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: CLI parsing is straightforward

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 4, 5, 6, 7)
  - **Blocks**: Task 9 (entry point uses config)
  - **Blocked By**: Task 2 (needs types)

  **References**:
  - `util.parseArgs()` - Node built-in, available in Bun for zero-dep CLI parsing

  **Acceptance Criteria**:
  - [ ] `src/config.ts` exports `parseConfig(): Config` function
  - [ ] CLI arg takes priority over env var
  - [ ] `--active-days` and `--archive-days` parsed as numbers
  - [ ] `--compression-level` parsed as number, default 10, validated 1-22
  - [ ] Validation error if `archive-days <= active-days`
  - [ ] `bun test src/config.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Parse CLI args correctly
    Tool: Bash
    Preconditions: Config module compiled
    Steps:
      1. bun run -e "import {parseConfig} from './src/config'; console.log(parseConfig(['--active-days', '7', '/tmp/projects']))"
    Expected Result: activeDays=7, rootDir='/tmp/projects'
    Failure Indicators: Wrong parsed values
    Evidence: .sisyphus/evidence/task-3-config-parse.txt

  Scenario: Reject invalid archive-days <= active-days
    Tool: Bash
    Preconditions: Config module compiled
    Steps:
      1. bun run -e "import {parseConfig} from './src/config'; parseConfig(['--active-days', '30', '--archive-days', '10', '/tmp'])"
    Expected Result: Non-zero exit, error message about archive-days
    Failure Indicators: No error thrown
    Evidence: .sisyphus/evidence/task-3-config-validation.txt
  ```

  **Commit**: YES
  - Message: `feat(config): CLI arg/env parsing with validation`
  - Files: `src/config.ts, src/config.test.ts`

---

- [x] 4. Scanner module

  **What to do**:
  - Create `src/scanner.ts` that:
    - Scans root directory for child subdirectories (1 level only)
    - Skips symlinks (use `lstat`), skips hidden dirs (start with `.`)
    - Skips non-directories (regular files in root)
    - For each subdir, detects project types by checking for manifest files:
      - JS: `package.json` exists
      - Rust: `Cargo.toml` exists
      - Move: `Move.toml` exists
    - Returns array of `ProjectInfo`
  - Create `src/scanner.test.ts` with tests using temp directories

  **Must NOT do**:
  - Scan more than 1 level deep for project detection
  - Process hidden directories

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Directory scanning with simple file existence checks

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 5, 6, 7)
  - **Blocks**: Task 7 (cleaner uses scanner results)
  - **Blocked By**: Task 2 (needs types)

  **References**:
  - `node:fs/promises` - `readdir`, `lstat` for symlink detection

  **Acceptance Criteria**:
  - [ ] `src/scanner.ts` exports `scanProjects(rootDir: string): Promise<ProjectInfo[]>`
  - [ ] Only 1 level of subdirectories scanned
  - [ ] Symlinks and hidden dirs skipped
  - [ ] Multi-type projects detected (both JS+Rust if both manifests exist)
  - [ ] `bun test src/scanner.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Detect JS project from package.json
    Tool: Bash
    Preconditions: Temp dir with subdirectory containing package.json
    Steps:
      1. mkdir -p /tmp/test-scan/js-project && echo '{}' > /tmp/test-scan/js-project/package.json
      2. bun run -e "const s = await import('./src/scanner'); console.log(JSON.stringify(await s.scanProjects('/tmp/test-scan')))"
    Expected Result: Output contains project with type 'js'
    Failure Indicators: No project detected or wrong type
    Evidence: .sisyphus/evidence/task-4-scanner-js.txt

  Scenario: Skip hidden directories
    Tool: Bash
    Preconditions: Temp dir with .hidden subdirectory
    Steps:
      1. mkdir -p /tmp/test-scan/.hidden-project && echo '{}' > /tmp/test-scan/.hidden-project/package.json
      2. bun run -e "const s = await import('./src/scanner'); const r = await s.scanProjects('/tmp/test-scan'); console.log(r.filter(p => p.name === '.hidden-project').length)"
    Expected Result: Output is "0"
    Failure Indicators: Hidden project was detected
    Evidence: .sisyphus/evidence/task-4-scanner-hidden.txt
  ```

  **Commit**: YES
  - Message: `feat(scanner): project type detection from manifest files`
  - Files: `src/scanner.ts, src/scanner.test.ts`

---

- [x] 5. Git module

  **What to do**:
  - Create `src/git.ts` that:
    - Uses `git for-each-ref --sort=-committerdate --count=1 --format='%(committerdate:iso)' refs/heads/ refs/remotes/` for last commit date
    - Runs via `Bun.spawnSync` with `{ cwd: projectDir }`
    - Handles non-git repos: returns `null` (fallback to mtime via `stat`)
    - Handles repos with no commits: returns `null`
    - Returns `Date | null`
  - Create `src/git.test.ts` with tests

  **Must NOT do**:
  - Use `git log --all` (O(commits) vs O(branches) - much slower)
  - Crash on non-git directories

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single git command wrapper with error handling

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 6, 7)
  - **Blocks**: Tasks 7, 9
  - **Blocked By**: None

  **References**:
  - `git for-each-ref` - faster than `git log --all` for finding latest commit
  - `Bun.spawnSync` - for executing git commands

  **Acceptance Criteria**:
  - [ ] `src/git.ts` exports `getLastActivity(dir: string): Date | null`
  - [ ] Uses `for-each-ref` not `log --all`
  - [ ] Returns null for non-git directories (no crash)
  - [ ] Falls back to filesystem mtime for non-git projects
  - [ ] `bun test src/git.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Get last commit date from git repo
    Tool: Bash
    Preconditions: Temp git repo with recent commit
    Steps:
      1. mkdir -p /tmp/test-git-repo && cd /tmp/test-git-repo && git init && echo 'x' > f && git add . && git commit -m 'test'
      2. bun run -e "const g = await import('./src/git'); console.log(g.getLastActivity('/tmp/test-git-repo'))"
    Expected Result: Output is a valid Date string (today's date)
    Failure Indicators: null or invalid date
    Evidence: .sisyphus/evidence/task-5-git-date.txt

  Scenario: Handle non-git directory gracefully
    Tool: Bash
    Preconditions: Temp directory without .git
    Steps:
      1. mkdir -p /tmp/test-nogit
      2. bun run -e "const g = await import('./src/git'); console.log(g.getLastActivity('/tmp/test-nogit'))"
    Expected Result: Output is a Date (from mtime) or null, no crash
    Failure Indicators: Error thrown or process crashes
    Evidence: .sisyphus/evidence/task-5-git-nogit.txt
  ```

  **Commit**: YES
  - Message: `feat(git): last activity date via for-each-ref across all branches`
  - Files: `src/git.ts, src/git.test.ts`

---

- [x] 6. Display module

  **What to do**:
  - Create `src/display.ts` that:
    - Progress line per project: `[icon] project-name — action (details)`
    - Icons: 📦 for JS, 🦀 for Rust, 🔗 for Move
    - Spinner animation during processing (use `Bun.sleep` + `\r`)
    - Status indicators: ✅ cleaned, ⏭️ skipped (active), 📦 compressed, ⚠️ error
    - Summary table at end:
      - Total projects processed
      - Total bytes freed (human-readable: KB/MB/GB)
      - Total projects compressed
    - Dry-run prefix: `[DRY RUN] ` before all delete messages
  - No test file needed (visual output, tested via integration)

  **Must NOT do**:
  - Use external TUI libraries (blessed, ink, etc.)
  - Create persistent log files

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Console output formatting, no complex logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5, 7)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:
  - `Bun.sleep(ms)` - for spinner animation timing
  - Console ANSI codes - for clearing line (`\r`, `\x1b[K`)

  **Acceptance Criteria**:
  - [ ] `src/display.ts` exports `displayProgress()`, `displaySummary()`, `displayDryRun()`
  - [ ] Icons render correctly for all 3 project types
  - [ ] Spinner animation visible during processing
  - [ ] Summary shows human-readable size (KB/MB/GB)
  - [ ] Dry-run messages clearly prefixed

  **QA Scenarios**:

  ```
  Scenario: Display shows correct icon for JS project
    Tool: Bash
    Preconditions: Display module compiled
    Steps:
      1. bun run -e "const d = await import('./src/display'); d.displayProgress({name:'my-app',type:'js',action:'cleaned',bytesFreed:1048576})"
    Expected Result: Output contains 📦 and project name
    Failure Indicators: Wrong icon or missing output
    Evidence: .sisyphus/evidence/task-6-display-icon.txt

  Scenario: Summary shows human-readable sizes
    Tool: Bash
    Preconditions: Display module compiled
    Steps:
      1. bun run -e "const d = await import('./src/display'); d.displaySummary({totalProcessed:5,totalCleaned:3,totalCompressed:1,totalBytesFreed:2621440000})"
    Expected Result: Output contains "2.43 GB" or similar
    Failure Indicators: Raw byte count shown instead of human-readable
    Evidence: .sisyphus/evidence/task-6-display-summary.txt
  ```

  **Commit**: YES
  - Message: `feat(display): progress output with icons, summary formatting`
  - Files: `src/display.ts`

---

- [x] 7. Cleaner module

  **What to do**:
  - Create `src/cleaner.ts` that:
    - Takes `ProjectInfo`, `Config` → returns `CleanResult`
    - JS cleanup: find ALL `node_modules` and build output dirs in project tree
      - Build output allow-list: `dist/`, `build/`, `.next/`, `.nuxt/`, `.output/`, `.svelte-kit/`, `.parcel-cache/`
      - Scan subdirectories recursively for additional `package.json` → additional `node_modules` and build dirs
    - Rust cleanup: find `target/` dir, scan for child `Cargo.toml` → additional `target/` dirs
    - Move cleanup: find `build/` dir specific to Move projects, scan for child `Move.toml` → additional `build/` dirs
    - Calculate directory sizes BEFORE deletion (`du -sb` equivalent via recursive `stat`)
    - Dry-run mode: return what WOULD be deleted without actually deleting
    - Confirm mode: `rm(path, { recursive: true, force: true })`
  - Create `src/cleaner.test.ts` with tests

  **Must NOT do**:
  - Parse `package.json` scripts or config files
  - Delete anything that's not in the allow-list
  - Delete source files, `.git/`, or project metadata files

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Complex recursive directory scanning + size calculation + deletion with multiple project types

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 3, 4, 5, 6)
  - **Blocks**: Task 9
  - **Blocked By**: Tasks 2, 4, 5 (needs types, scanner, git)

  **References**:
  - `node:fs/promises` - `rm`, `stat`, `readdir` for filesystem operations
  - Metis guardrail: allow-list only for deletion targets

  **Acceptance Criteria**:
  - [ ] `src/cleaner.ts` exports `cleanProject(info: ProjectInfo, config: Config): Promise<CleanResult>`
  - [ ] Dry-run returns artifacts without deleting
  - [ ] Confirm mode deletes artifacts and reports bytes freed
  - [ ] Multi-type projects clean ALL detected types
  - [ ] Size calculated BEFORE deletion
  - [ ] `bun test src/cleaner.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Dry-run shows JS artifacts without deleting
    Tool: Bash
    Preconditions: Temp project with package.json + node_modules + dist dirs
    Steps:
      1. mkdir -p /tmp/test-clean/js-proj/node_modules /tmp/test-clean/js-proj/dist
      2. echo 'test' > /tmp/test-clean/js-proj/node_modules/file.txt
      3. bun run -e "const c = await import('./src/cleaner'); console.log(JSON.stringify(await c.cleanProject({name:'js-proj',path:'/tmp/test-clean/js-proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:false,rootDir:'/tmp/test-clean',compressionLevel:10})))"
      4. test -d /tmp/test-clean/js-proj/node_modules
    Expected Result: Dry-run returns artifacts list with node_modules and dist, node_modules still exists (exit 0 from step 4)
    Failure Indicators: node_modules deleted in dry-run mode
    Evidence: .sisyphus/evidence/task-7-cleaner-dryrun.txt

  Scenario: Confirm mode actually deletes JS artifacts
    Tool: Bash
    Preconditions: Temp project with node_modules + dist dirs
    Steps:
      1. mkdir -p /tmp/test-confirm/js-proj/node_modules /tmp/test-confirm/js-proj/dist
      2. echo 'test' > /tmp/test-confirm/js-proj/node_modules/file.txt
      3. bun run -e "const c = await import('./src/cleaner'); await c.cleanProject({name:'js-proj',path:'/tmp/test-confirm/js-proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-confirm',compressionLevel:10})"
      4. test ! -d /tmp/test-confirm/js-proj/node_modules && test ! -d /tmp/test-confirm/js-proj/dist
    Expected Result: Exit 0 from step 4 (both node_modules and dist deleted)
    Failure Indicators: node_modules or dist still exists after confirm
    Evidence: .sisyphus/evidence/task-7-cleaner-confirm-js.txt

  Scenario: JS with .next build output detected and cleaned
    Tool: Bash
    Preconditions: Temp project with package.json + .next dir
    Steps:
      1. mkdir -p /tmp/test-next/proj/.next/cache
      2. echo 'data' > /tmp/test-next/proj/.next/cache/file
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-next/proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-next',compressionLevel:10}); console.log(r.artifactsRemoved.map(a=>a.path))"
    Expected Result: .next dir listed in artifacts and deleted
    Failure Indicators: .next dir not detected or not deleted
    Evidence: .sisyphus/evidence/task-7-cleaner-nextjs.txt

  Scenario: JS with .svelte-kit build output detected
    Tool: Bash
    Preconditions: Temp project with package.json + .svelte-kit dir
    Steps:
      1. mkdir -p /tmp/test-svelte/proj/.svelte-kit
      2. echo 'generated' > /tmp/test-svelte/proj/.svelte-kit/generated.js
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-svelte/proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-svelte',compressionLevel:10}); console.log(r.artifactsRemoved.map(a=>a.path))"
    Expected Result: .svelte-kit dir listed in artifacts
    Failure Indicators: .svelte-kit not detected
    Evidence: .sisyphus/evidence/task-7-cleaner-svelte.txt

  Scenario: Rust target directory cleaned
    Tool: Bash
    Preconditions: Temp project with Cargo.toml + target dir
    Steps:
      1. mkdir -p /tmp/test-rust/proj/target/debug
      2. echo 'binary' > /tmp/test-rust/proj/target/debug/app
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-rust/proj',types:['rust'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-rust',compressionLevel:10}); console.log(r.artifactsRemoved.map(a=>a.path))"
      4. test ! -d /tmp/test-rust/proj/target
    Expected Result: target dir deleted, exit 0 from step 4
    Failure Indicators: target dir still exists
    Evidence: .sisyphus/evidence/task-7-cleaner-rust.txt

  Scenario: Rust with nested Cargo.toml — child target also cleaned
    Tool: Bash
    Preconditions: Temp project with parent Cargo.toml + child dir containing Cargo.toml + target
    Steps:
      1. mkdir -p /tmp/test-rust-nested/proj/target /tmp/test-rust-nested/proj/subcrate/target
      2. touch /tmp/test-rust-nested/proj/Cargo.toml /tmp/test-rust-nested/proj/subcrate/Cargo.toml
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-rust-nested/proj',types:['rust'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-rust-nested',compressionLevel:10}); console.log(r.artifactsRemoved.length)"
      4. test ! -d /tmp/test-rust-nested/proj/target && test ! -d /tmp/test-rust-nested/proj/subcrate/target
    Expected Result: Both parent and child target dirs deleted
    Failure Indicators: Either target dir still exists
    Evidence: .sisyphus/evidence/task-7-cleaner-rust-nested.txt

  Scenario: Move build directory cleaned
    Tool: Bash
    Preconditions: Temp project with Move.toml + build dir
    Steps:
      1. mkdir -p /tmp/test-move/proj/build
      2. echo 'bytecode' > /tmp/test-move/proj/build/output.mv
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-move/proj',types:['move'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-move',compressionLevel:10}); console.log(r.artifactsRemoved.map(a=>a.path))"
      4. test ! -d /tmp/test-move/proj/build
    Expected Result: build dir deleted
    Failure Indicators: build dir still exists
    Evidence: .sisyphus/evidence/task-7-cleaner-move.txt

  Scenario: Move with nested Move.toml — child build also cleaned
    Tool: Bash
    Preconditions: Temp project with parent Move.toml + child Move.toml + child build
    Steps:
      1. mkdir -p /tmp/test-move-nested/proj/build /tmp/test-move-nested/proj/packages/submod/build
      2. touch /tmp/test-move-nested/proj/Move.toml /tmp/test-move-nested/proj/packages/submod/Move.toml
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-move-nested/proj',types:['move'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-move-nested',compressionLevel:10}); console.log(r.artifactsRemoved.length)"
      4. test ! -d /tmp/test-move-nested/proj/build && test ! -d /tmp/test-move-nested/proj/packages/submod/build
    Expected Result: Both parent and child build dirs deleted
    Failure Indicators: Either build dir still exists
    Evidence: .sisyphus/evidence/task-7-cleaner-move-nested.txt

  Scenario: Multi-type project (JS + Rust) cleans ALL types
    Tool: Bash
    Preconditions: Temp project with package.json + node_modules + Cargo.toml + target
    Steps:
      1. mkdir -p /tmp/test-multi/proj/node_modules /tmp/test-multi/proj/target
      2. touch /tmp/test-multi/proj/package.json /tmp/test-multi/proj/Cargo.toml
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-multi/proj',types:['js','rust'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-multi',compressionLevel:10}); console.log(r.artifactsRemoved.map(a=>a.type))"
      4. test ! -d /tmp/test-multi/proj/node_modules && test ! -d /tmp/test-multi/proj/target
    Expected Result: Both node_modules and target deleted, artifacts include js and rust types
    Failure Indicators: One type's artifacts not cleaned
    Evidence: .sisyphus/evidence/task-7-cleaner-multi-type.txt

  Scenario: Size reported is measured BEFORE deletion (not 0)
    Tool: Bash
    Preconditions: Temp project with node_modules containing known-size file
    Steps:
      1. mkdir -p /tmp/test-size/proj/node_modules
      2. dd if=/dev/zero of=/tmp/test-size/proj/node_modules/bigfile bs=1024 count=100 2>/dev/null
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-size/proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-size',compressionLevel:10}); console.log(r.bytesFreed)"
    Expected Result: bytesFreed >= 102400 (100KB), not 0
    Failure Indicators: bytesFreed is 0 or suspiciously small
    Evidence: .sisyphus/evidence/task-7-cleaner-size-before-delete.txt

  Scenario: Source files and .git are NOT deleted
    Tool: Bash
    Preconditions: Temp project with package.json, source files, .git dir, and node_modules
    Steps:
      1. mkdir -p /tmp/test-safe/proj/.git /tmp/test-safe/proj/node_modules /tmp/test-safe/proj/src
      2. echo '{}' > /tmp/test-safe/proj/package.json
      3. echo 'code' > /tmp/test-safe/proj/src/index.ts
      4. bun run -e "const c = await import('./src/cleaner'); await c.cleanProject({name:'proj',path:'/tmp/test-safe/proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:true,rootDir:'/tmp/test-safe',compressionLevel:10})"
      5. test -d /tmp/test-safe/proj/.git && test -f /tmp/test-safe/proj/src/index.ts && test -f /tmp/test-safe/proj/package.json
    Expected Result: Exit 0 — .git, src/, and package.json all still exist
    Failure Indicators: Any source dir or .git was deleted
    Evidence: .sisyphus/evidence/task-7-cleaner-safety.txt

  Scenario: Dry-run reports correct bytes that WOULD be freed
    Tool: Bash
    Preconditions: Temp project with known-size artifacts
    Steps:
      1. mkdir -p /tmp/test-drysize/proj/dist
      2. dd if=/dev/zero of=/tmp/test-drysize/proj/dist/bundle.js bs=1024 count=50 2>/dev/null
      3. bun run -e "const c = await import('./src/cleaner'); const r = await c.cleanProject({name:'proj',path:'/tmp/test-drysize/proj',types:['js'],lastActivity:new Date('2024-01-01'),isGitRepo:false},{activeDays:30,archiveDays:180,confirm:false,rootDir:'/tmp/test-drysize',compressionLevel:10}); console.log('would free:', r.bytesFreed)"
      4. test -d /tmp/test-drysize/proj/dist
    Expected Result: bytesFreed reported (~51200), dist still exists
    Failure Indicators: dist deleted or bytesFreed is 0
    Evidence: .sisyphus/evidence/task-7-cleaner-dryrun-size.txt
  ```

  **Commit**: YES
  - Message: `feat(cleaner): artifact deletion with dry-run/confirm gate`
  - Files: `src/cleaner.ts, src/cleaner.test.ts`

---

- [x] 8. Compressor module

  **What to do**:
  - Create `src/compressor.ts` that:
    - Recursively collect all files in project directory (skip `.git/` internals but include `.git/` in archive)
    - Use `Bun.Archive(fileMap)` to create raw `.tar` bytes (uncompressed tar by default)
    - Use `Bun.zstdCompressSync(tarBytes, { level: config.compressionLevel })` to compress to zstd
    - Write result as `.tar.zst` via `Bun.write()`
    - `compressProject(projectDir: string, outputPath: string, level: number): Promise<{ success: boolean, archiveSize: number }>`
    - Verify archive after creation: check file size > 0, verify zstd decompression produces valid tar header
    - Delete original directory ONLY after successful archive verification
    - Handle archive already exists: overwrite with warning
    - Include `.git/` directory in archive (needed for restore)
  - Create `src/compressor.test.ts` with tests

  **Must NOT do**:
  - Use `archiver` (broken with Bun)
  - Use `lzma-native` (hangs with Bun)
  - Use `zip-bun` or any external npm compression package
  - Delete original before archive verification

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Bun.Archive file collection, zstd compression pipeline, archive verification logic

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 9
  - **Blocked By**: Task 2 (needs types)

  **References**:
  - `Bun.Archive(data)` - creates uncompressed tar from file map (Record<string, string | Blob>)
  - `Bun.zstdCompressSync(bytes, { level: N })` - zstd compression, level 1-22 (default 3)
  - `Bun.write(path, data)` - write compressed bytes to file
  - Bun docs: https://github.com/oven-sh/bun/blob/main/docs/runtime/archive.mdx
  - Bun docs: https://github.com/oven-sh/bun/blob/main/docs/runtime/utils.mdx

  **Acceptance Criteria**:
  - [ ] `src/compressor.ts` exports `compressProject()` function
  - [ ] Uses only Bun native APIs (Bun.Archive + Bun.zstdCompressSync + Bun.write)
  - [ ] Compression level configurable via parameter (default 10)
  - [ ] Archive verified after creation (size > 0, valid tar.zst header)
  - [ ] Original deleted only after verification
  - [ ] `.git/` included in archive for restore capability
  - [ ] `bun test src/compressor.test.ts` passes

  **QA Scenarios**:

  ```
  Scenario: Compress project to tar.zst with default level
    Tool: Bash
    Preconditions: Temp project directory with files
    Steps:
      1. mkdir -p /tmp/test-compress/proj && echo 'data' > /tmp/test-compress/proj/file.txt
      2. bun run -e "const c = await import('./src/compressor'); const r = await c.compressProject('/tmp/test-compress/proj', '/tmp/test-compress/proj.tar.zst', 10); console.log(JSON.stringify(r))"
    Expected Result: success=true, archiveSize > 0, proj.tar.zst exists
    Failure Indicators: success=false or no archive file
    Evidence: .sisyphus/evidence/task-8-compress-zst.txt

  Scenario: Archive can be decompressed back to original content
    Tool: Bash
    Preconditions: Compressed tar.zst file from previous scenario
    Steps:
      1. bun run -e "const f = await Bun.file('/tmp/test-compress/proj.tar.zst').bytes(); const d = Bun.zstdDecompressSync(f); const a = new Bun.Archive(d); console.log(Object.keys(a))"
    Expected Result: Archive contains 'file.txt' entry
    Failure Indicators: Empty or invalid archive
    Evidence: .sisyphus/evidence/task-8-compress-valid.txt

  Scenario: Compression level affects output size
    Tool: Bash
    Preconditions: Temp project with compressible content (repeated text)
    Steps:
      1. mkdir -p /tmp/test-level/proj && python3 -c "print('hello world ' * 10000)" > /tmp/test-level/proj/big.txt
      2. bun run -e "const c = await import('./src/compressor'); await c.compressProject('/tmp/test-level/proj', '/tmp/test-level/l1.tar.zst', 1)"
      3. bun run -e "const c = await import('./src/compressor'); await c.compressProject('/tmp/test-level/proj', '/tmp/test-level/l22.tar.zst', 22)"
      4. size1=$(stat -f%z /tmp/test-level/l1.tar.zst); size22=$(stat -f%z /tmp/test-level/l22.tar.zst); echo "level1=$size1 level22=$size22"; test $size22 -lt $size1
    Expected Result: Level 22 produces smaller file than level 1 (exit 0 from test)
    Failure Indicators: Level 1 smaller or equal to level 22
    Evidence: .sisyphus/evidence/task-8-compress-levels.txt

  Scenario: Original directory deleted only after successful verification
    Tool: Bash
    Preconditions: Temp project directory
    Steps:
      1. mkdir -p /tmp/test-verify/proj && echo 'important' > /tmp/test-verify/proj/data.txt
      2. bun run -e "const c = await import('./src/compressor'); const r = await c.compressProject('/tmp/test-verify/proj', '/tmp/test-verify/proj.tar.zst', 10); console.log('success:', r.success);"
      3. test ! -d /tmp/test-verify/proj && test -f /tmp/test-verify/proj.tar.zst
    Expected Result: Original dir deleted AND archive exists (exit 0 from step 3)
    Failure Indicators: Original still exists or archive missing
    Evidence: .sisyphus/evidence/task-8-compress-verify-delete.txt

  Scenario: Nested directories compressed correctly
    Tool: Bash
    Preconditions: Temp project with nested subdirectories
    Steps:
      1. mkdir -p /tmp/test-nested/proj/src/deep/nested
      2. echo 'a' > /tmp/test-nested/proj/src/a.ts
      3. echo 'b' > /tmp/test-nested/proj/src/deep/b.ts
      4. echo 'c' > /tmp/test-nested/proj/src/deep/nested/c.ts
      5. bun run -e "const c = await import('./src/compressor'); await c.compressProject('/tmp/test-nested/proj', '/tmp/test-nested/proj.tar.zst', 10); const f = await Bun.file('/tmp/test-nested/proj.tar.zst').bytes(); const d = Bun.zstdDecompressSync(f); const a = new Bun.Archive(d); console.log(Object.keys(a).sort().join(','))"
    Expected Result: Archive contains all nested files (src/a.ts, src/deep/b.ts, src/deep/nested/c.ts)
    Failure Indicators: Missing files in archive
    Evidence: .sisyphus/evidence/task-8-compress-nested.txt

  Scenario: Overwrites existing archive without error
    Tool: Bash
    Preconditions: Existing tar.zst file from previous run
    Steps:
      1. mkdir -p /tmp/test-overwrite/proj && echo 'v2' > /tmp/test-overwrite/proj/file.txt
      2. echo 'old' > /tmp/test-overwrite/proj.tar.zst
      3. bun run -e "const c = await import('./src/compressor'); const r = await c.compressProject('/tmp/test-overwrite/proj', '/tmp/test-overwrite/proj.tar.zst', 10); console.log('success:', r.success)"
    Expected Result: success=true, new archive replaces old without error
    Failure Indicators: success=false or error thrown
    Evidence: .sisyphus/evidence/task-8-compress-overwrite.txt

  Scenario: Empty project compresses without error
    Tool: Bash
    Preconditions: Empty temp project directory
    Steps:
      1. mkdir -p /tmp/test-empty/proj
      2. bun run -e "const c = await import('./src/compressor'); const r = await c.compressProject('/tmp/test-empty/proj', '/tmp/test-empty/proj.tar.zst', 10); console.log(JSON.stringify(r))"
    Expected Result: success=true (empty tar.zst is valid), archiveSize > 0
    Failure Indicators: crash or success=false
    Evidence: .sisyphus/evidence/task-8-compress-empty.txt
  ```

  **Commit**: YES
  - Message: `feat(compressor): Bun.Archive tar + zstd compression, zero external deps`
  - Files: `src/compressor.ts, src/compressor.test.ts`

---

- [x] 9. Entry point

  **What to do**:
  - Create `src/index.ts` that:
    - Calls `parseConfig()` from config module
    - Calls `scanProjects()` from scanner module
    - For each project (sequential):
      1. Calls `getLastActivity()` from git module
      2. Determines zone: skip (< active-days), clean (30-180 days OR non-git), compress+clean (> archive-days AND is git repo only)
      3. For skip: display skip reason, continue
      4. For clean: call `cleanProject()`, display results
      5. For compress: call `cleanProject()` then `compressProject()`, display results
         - Non-git projects are NEVER compressed — always clean-only regardless of age
    - Calls `displaySummary()` with accumulated results
    - Exit code: 0 success, 1 general error, 2 usage error
  - Add `bin` field to `package.json` for `bun run src/index.ts`

  **Must NOT do**:
  - Add any business logic - orchestration only
  - Process projects in parallel (sequential for safety)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Integration of all modules, error handling, sequential orchestration

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 10)
  - **Blocks**: Task 10
  - **Blocked By**: Tasks 3-8

  **References**:
  - All modules (config, scanner, git, cleaner, compressor, display)

  **Acceptance Criteria**:
  - [ ] `bun run src/index.ts --help` shows usage
  - [ ] `bun run src/index.ts /tmp/test-projects` runs dry-run preview
  - [ ] `bun run src/index.ts /tmp/test-projects --confirm` performs cleanup
  - [ ] Exit codes: 0 success, 2 usage error
  - [ ] Projects between thresholds are cleaned but not compressed
  - [ ] Non-git projects are NEVER compressed regardless of age

  **QA Scenarios**:

  ```
  Scenario: Full dry-run pipeline
    Tool: Bash
    Preconditions: Temp root with JS project (>30 days old) with node_modules
    Steps:
      1. mkdir -p /tmp/test-pipe/old-proj/node_modules
      2. bun run src/index.ts /tmp/test-pipe
    Expected Result: Output shows project as 'would clean' with dry-run prefix, node_modules still exists
    Failure Indicators: node_modules deleted or no output
    Evidence: .sisyphus/evidence/task-9-entry-dryrun.txt

  Scenario: Help text shown with --help
    Tool: Bash
    Preconditions: Entry point compiled
    Steps:
      1. bun run src/index.ts --help
    Expected Result: Shows usage with all flags documented
    Failure Indicators: No help text or crash
    Evidence: .sisyphus/evidence/task-9-entry-help.txt

  Scenario: Non-git project never compressed regardless of age
    Tool: Bash
    Preconditions: Temp dir with non-git project containing node_modules, mtime > archive-days
    Steps:
      1. mkdir -p /tmp/test-nogit/old-proj/node_modules
      2. touch -t 202301010000 /tmp/test-nogit/old-proj
      3. bun run src/index.ts /tmp/test-nogit --active-days 7 --archive-days 30 --confirm
      4. ls /tmp/test-nogit/old-proj*.tar.zst 2>&1
    Expected Result: Project cleaned (node_modules deleted), but NO .tar.zst archive created
    Failure Indicators: Archive file exists for non-git project
    Evidence: .sisyphus/evidence/task-9-entry-nogit-nocompress.txt

  Scenario: Three-zone logic: active project skipped, mid-age cleaned, old compressed
    Tool: Bash
    Preconditions: Temp root with 3 git projects at different ages
    Steps:
      1. Create 3 git repos: recent (commit today), mid (200 days ago), old (365 days ago)
      2. Each has node_modules dir
      3. bun run src/index.ts /tmp/test-zones --active-days 30 --archive-days 180 --confirm
    Expected Result: recent=skipped, mid=cleaned (no archive), old=cleaned+compressed
    Failure Indicators: Wrong zone assignment
    Evidence: .sisyphus/evidence/task-9-entry-zones.txt

  Scenario: CONFIRM mode actually deletes (not just dry-run)
    Tool: Bash
    Preconditions: Temp root with old project containing node_modules
    Steps:
      1. mkdir -p /tmp/test-real/old-proj/node_modules
      2. echo 'x' > /tmp/test-real/old-proj/node_modules/f.txt
      3. bun run src/index.ts /tmp/test-real --confirm
      4. test ! -d /tmp/test-real/old-proj/node_modules
    Expected Result: node_modules deleted (exit 0 from step 4)
    Failure Indicators: node_modules still exists
    Evidence: .sisyphus/evidence/task-9-entry-confirm.txt

  Scenario: Summary shows correct totals
    Tool: Bash
    Preconditions: Temp root with 3 projects (1 skipped, 1 cleaned, 1 compressed)
    Steps:
      1. bun run src/index.ts /tmp/test-summary --confirm
    Expected Result: Summary line shows totalProcessed=3, totalCleaned>=1, totalCompressed>=1, totalBytesFreed>0
    Failure Indicators: Summary missing or shows wrong counts
    Evidence: .sisyphus/evidence/task-9-entry-summary.txt
  ```

  **Commit**: YES
  - Message: `feat: wire all modules in index.ts entry point`
  - Files: `src/index.ts, package.json`

---

- [x] 10. Integration tests + edge cases

  **What to do**:
  - Create `src/integration.test.ts` with end-to-end tests:
    - Multi-project fixture: JS + Rust + Move projects in one root
    - Non-git project handling (mtime fallback)
    - Permission denied on one project (continue processing others)
    - Empty root directory
    - `--active-days 0` edge case
    - Archive overwrite on second run
  - Verify idempotency: second run reports nothing to clean

  **Must NOT do**:
  - Test implementation details (test behavior only)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Complex integration test setup with real directory fixtures

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4 (with Task 9)
  - **Blocks**: Final verification wave
  - **Blocked By**: Task 9

  **References**:
  - All modules for integration testing

  **Acceptance Criteria**:
  - [ ] `bun test` passes all integration tests
  - [ ] Multi-type project test cleans both JS and Rust artifacts
  - [ ] Idempotency test passes (second run = 0 bytes freed)
  - [ ] Non-git project test passes (uses mtime, no crash)
  - [ ] Non-git project never compressed even when very old
  - [ ] Three-zone logic verified (skip/clean/compress)
  - [ ] Permission denied on one project doesn't crash others
  - [ ] Empty root directory handled gracefully
  - [ ] Invalid CLI args produce helpful error message

  **QA Scenarios**:

  ```
  Scenario: Idempotent - second run cleans nothing
    Tool: Bash
    Preconditions: First run completed with --confirm
    Steps:
      1. bun run src/index.ts /tmp/test-idem --confirm
      2. bun run src/index.ts /tmp/test-idem --confirm
    Expected Result: Second run shows 0 bytes freed, 0 projects cleaned
    Failure Indicators: Second run reports artifacts to clean
    Evidence: .sisyphus/evidence/task-10-integration-idempotent.txt

  Scenario: Multi-project root with all 3 types processes correctly
    Tool: Bash
    Preconditions: Temp root with JS + Rust + Move projects, all with artifacts
    Steps:
      1. Create js-proj (package.json + node_modules), rust-proj (Cargo.toml + target), move-proj (Move.toml + build)
      2. bun run src/index.ts /tmp/test-all3 --confirm
      3. test ! -d /tmp/test-all3/js-proj/node_modules && test ! -d /tmp/test-all3/rust-proj/target && test ! -d /tmp/test-all3/move-proj/build
    Expected Result: All 3 project types cleaned, exit 0 from step 3
    Failure Indicators: Any artifact directory remains
    Evidence: .sisyphus/evidence/task-10-integration-alltypes.txt

  Scenario: Empty root directory produces clean output
    Tool: Bash
    Preconditions: Empty temp directory
    Steps:
      1. mkdir -p /tmp/test-empty-root
      2. bun run src/index.ts /tmp/test-empty-root
    Expected Result: No crash, "no projects found" or similar message, exit 0
    Failure Indicators: Error thrown or crash
    Evidence: .sisyphus/evidence/task-10-integration-empty.txt

  Scenario: Invalid CLI args show helpful error
    Tool: Bash
    Preconditions: Compiled project
    Steps:
      1. bun run src/index.ts --invalid-flag 2>&1
    Expected Result: Error message with usage hint, exit 2
    Failure Indicators: No error message or exit code 0
    Evidence: .sisyphus/evidence/task-10-integration-invalid-args.txt

  Scenario: Non-existent root path errors clearly
    Tool: Bash
    Preconditions: Compiled project
    Steps:
      1. bun run src/index.ts /this/path/does/not/exist 2>&1
    Expected Result: "directory not found" or similar error, exit non-zero
    Failure Indicators: No error or crash
    Evidence: .sisyphus/evidence/task-10-integration-bad-path.txt

  Scenario: Permission denied on one project — continues processing others
    Tool: Bash
    Preconditions: Temp root with 2 projects, one with restricted permissions
    Steps:
      1. mkdir -p /tmp/test-perm/good-proj/node_modules /tmp/test-perm/bad-proj/node_modules
      2. chmod 000 /tmp/test-perm/bad-proj/node_modules
      3. bun run src/index.ts /tmp/test-perm --confirm 2>&1
      4. test ! -d /tmp/test-perm/good-proj/node_modules
    Expected Result: good-proj cleaned, bad-proj reported as error but processing continues
    Failure Indicators: good-proj not cleaned or tool crashes
    Evidence: .sisyphus/evidence/task-10-integration-perm-denied.txt

  Scenario: Archive overwrite on second run
    Tool: Bash
    Preconditions: Git repo with old project, first archive run completed
    Steps:
      1. Create git project with old commit, archive via --confirm
      2. Manually restore project directory
      3. bun run src/index.ts /tmp/test-ow --confirm
    Expected Result: Second run overwrites .tar.zst without error
    Failure Indicators: Error on overwrite or duplicate archive
    Evidence: .sisyphus/evidence/task-10-integration-archive-overwrite.txt
  ```

  **Commit**: YES
  - Message: `test: integration tests with multi-project fixtures`
  - Files: `src/integration.test.ts`

---

## Final Verification Wave (MANDATORY — after ALL implementation tasks)

- [x] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns. Check evidence files exist. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [x] F2. **Code Quality Review** — `unspecified-high`
  Run `bun test` + `bun build src/index.ts`. Review all files for: `as any`, empty catches, console.log (except display.ts), commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names.
  Output: `Build [PASS/FAIL] | Tests [N pass/N fail] | Files [N clean/N issues] | VERDICT`

- [x] F3. **Real Manual QA** — `unspecified-high`
  Start from clean state. Execute EVERY QA scenario from EVERY task — follow exact steps, capture evidence. Test cross-task integration. Test edge cases: empty state, permission denied, multi-type projects. Save to `.sisyphus/evidence/final-qa/`.
  Output: `Scenarios [N/N pass] | Integration [N/N] | Edge Cases [N tested] | VERDICT`

- [x] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff. Verify 1:1 — everything in spec was built, nothing beyond spec. Check "Must NOT do" compliance. Detect cross-task contamination.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- `feat: scaffold project with bun init, tsconfig, biome, .gitignore`
- `feat(types): add shared type definitions`
- `feat(config): CLI arg/env parsing with validation`
- `feat(scanner): project type detection from manifest files`
- `feat(git): last activity date via for-each-ref across all branches`
- `feat(display): progress output with icons, summary formatting`
- `feat(cleaner): artifact deletion with dry-run/confirm gate`
- `feat(compressor): Bun.Archive tar + zstd compression, zero external deps`
- `feat: wire all modules in index.ts entry point`
- `test: integration tests with multi-project fixtures`

---

## Success Criteria

### Verification Commands
```bash
bun run src/index.ts ~/Projects                    # Dry-run preview
bun run src/index.ts ~/Projects --confirm          # Actually cleans
bun run src/index.ts ~/Projects --active-days 7    # Custom active threshold
bun run src/index.ts ~/Projects --archive-days 90  # Custom archive threshold
bun run src/index.ts ~/Projects --compression-level 22  # Max compression (slowest)
bun test                                           # All tests pass
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All tests pass
- [ ] Single quotes used throughout
- [ ] No Node.js-specific APIs used
- [ ] Zero external dependencies (pure Bun native)
