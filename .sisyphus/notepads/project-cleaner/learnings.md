## Learnings

- Shared project-cleaner types belong in a single exported file so config, scan results, and summaries stay aligned.
- `ProjectInfo.types` must stay an array because a project can match multiple ecosystems.
- `bun build src/types.ts` is a fast validation check for type-only modules.
- `parseArgs` from `node:util` handles Bun CLI flags cleanly without third-party parsers.
- Treat missing `rootDir` as a usage error with exit code 2, then validate filesystem existence separately with exit code 1.
- Tests should clean up temp dirs and stub `process.exit` so both exit paths stay observable.
- For project scanning, `readdir(..., { withFileTypes: true })` plus `lstat()` on each direct child is enough to skip symlinks without descending past one level.
