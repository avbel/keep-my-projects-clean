## Decisions

- Keep all shared CLI types in `src/types.ts` with explicit exports.
- Use `Date | null` for `ProjectInfo.lastActivity` to preserve the git-or-mtime fallback contract.
- Leave compression-level bounds to parsing logic, not the type system.
