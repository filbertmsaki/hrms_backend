import { execFileSync } from 'node:child_process';

const gitCommand = 'git';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

const branchName = run(gitCommand, ['branch', '--show-current']);
const isMainBranch = branchName === 'main';
const targetScript = isMainBranch
  ? 'validate:push:full'
  : 'validate:push:changed';

console.log(
  isMainBranch
    ? 'Running full local validation for main before push.'
    : `Running changed-file local validation for branch "${branchName || 'detached-head'}".`,
);

execFileSync(npmCommand, ['run', targetScript], {
  cwd: process.cwd(),
  shell: useShell,
  stdio: 'inherit',
});
