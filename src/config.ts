import { lstat } from 'node:fs/promises';
import process from 'node:process';
import { parseArgs } from 'node:util';
import type { Config } from './types';

const USAGE = [
  'Usage: keep-my-projects-clean <root-dir> [options]',
  '',
  'Options:',
  '  --active-days <n>        Skip projects active within N days (default: 30)',
  '  --archive-days <n>       Compress projects inactive for N days (default: 180)',
  '  --compression-level <n>  7z compression level 0-9 (default: 7)',
  '  --confirm                Actually delete/compress (default: dry-run)',
  '  --help                   Show this help message',
  '',
  'Environment:',
  '  PROJECTS_DIR             Root directory (overridden by positional arg)',
].join('\n');

function printUsage(): void {
  process.stdout.write(`${USAGE}\n`);
}

function exitWithUsage(code: number): never {
  printUsage();
  return process.exit(code);
}

function exitWithCode(code: number): never {
  return process.exit(code);
}

function parseInteger(value: string, name: string): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer`);
  }

  return parsed;
}

function resolveRootDir(positionals: string[]): string | undefined {
  return positionals[0] ?? process.env.PROJECTS_DIR;
}

export async function parseConfig(argv: string[] = process.argv.slice(2)): Promise<Config> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      'active-days': { type: 'string', default: '30' },
      'archive-days': { type: 'string', default: '180' },
      'compression-level': { type: 'string', default: '7' },
      confirm: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    exitWithUsage(0);
  }

  const rootDir = resolveRootDir(positionals);

  if (!rootDir) {
    exitWithUsage(2);
  }

  try {
    const stats = await lstat(rootDir);

    if (!stats.isDirectory()) {
      exitWithCode(1);
    }
  } catch {
    exitWithCode(1);
  }

  const activeDays = parseInteger(values['active-days'] as string, 'active-days');
  const archiveDays = parseInteger(values['archive-days'] as string, 'archive-days');
  const compressionLevel = parseInteger(values['compression-level'] as string, 'compression-level');

  if (archiveDays <= activeDays) {
    throw new Error('archive-days must be greater than active-days');
  }

  if (compressionLevel < 0 || compressionLevel > 9) {
    throw new Error('compression-level must be between 0 and 9');
  }

  return {
    rootDir,
    activeDays,
    archiveDays,
    confirm: Boolean(values.confirm),
    compressionLevel,
  };
}
