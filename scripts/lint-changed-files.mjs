import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const gitCommand = 'git';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const useShell = process.platform === 'win32';
const workspaceRoot = process.cwd();
const lintableExtensions = new Set([
  '.js',
  '.cjs',
  '.mjs',
  '.ts',
  '.tsx',
  '.jsx',
]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function tryRun(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch {
    return null;
  }
}

function resolveDiffBase() {
  const upstream = tryRun(gitCommand, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);

  if (upstream) {
    return `${upstream}...HEAD`;
  }

  const originMain = tryRun(gitCommand, ['rev-parse', '--verify', 'origin/main']);
  if (originMain) {
    const mergeBase = run(gitCommand, ['merge-base', 'HEAD', 'origin/main']);
    return `${mergeBase}...HEAD`;
  }

  const previousHead = tryRun(gitCommand, ['rev-parse', '--verify', 'HEAD~1']);
  if (previousHead) {
    return 'HEAD~1...HEAD';
  }

  return null;
}

function listChangedFiles() {
  const diffBase = resolveDiffBase();

  if (!diffBase) {
    return run(gitCommand, ['show', '--pretty=', '--name-only', 'HEAD'])
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  return run(gitCommand, [
    'diff',
    '--name-only',
    '--diff-filter=ACMR',
    diffBase,
  ])
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isLintableFile(relativePath) {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  const extension = path.extname(normalizedPath).toLowerCase();

  if (normalizedPath === 'eslint.config.mjs') {
    return true;
  }

  if (!lintableExtensions.has(extension)) {
    return false;
  }

  return existsSync(path.join(workspaceRoot, relativePath));
}

const changedFiles = listChangedFiles();
const lintableFiles = changedFiles.filter(isLintableFile);

if (lintableFiles.length === 0) {
  console.log('No changed lintable files detected. Skipping local lint check.');
  process.exit(0);
}

console.log('Running changed-file lint checks for:');
for (const file of lintableFiles) {
  console.log(`- ${file}`);
}

execFileSync(
  npxCommand,
  ['eslint', '--max-warnings=0', ...lintableFiles],
  {
    cwd: workspaceRoot,
    shell: useShell,
    stdio: 'inherit',
  },
);
