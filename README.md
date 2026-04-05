# keep-my-projects-clean

CLI tool to clean build artifacts from inactive projects. Supports JS/TS, Rust, and Move project types.

## Installation

```bash
bun install
bun run build
```

Produces a native binary at `dist/clean-projects`.

## Usage

```bash
# Dry run (default) - shows what would be cleaned
./dist/clean-projects /path/to/projects

# Actually delete/compress
./dist/clean-projects /path/to/projects --confirm
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--active-days <n>` | 30 | Skip projects active within N days |
| `--archive-days <n>` | 180 | Compress projects inactive for N days |
| `--compression-level <n>` | 7 | 7z compression level (0-9) |
| `--confirm` | false | Actually delete/compress (default: dry-run) |
| `--help` | - | Show help message |

## What Gets Cleaned

**JS/TS projects:** `node_modules/`, `dist/`, `build/`, `.next/`, `.nuxt/`, `.output/`, `.svelte-kit/`, `.parcel-cache/`

**Rust projects:** `target/`

**Move projects:** `build/`

## Environment

`PROJECTS_DIR` — root directory (overridden by positional argument)

## Development

```bash
bun test        # Run tests
bun run lint    # Lint with oxlint
```
