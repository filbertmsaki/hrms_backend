const { spawnSync } = require('node:child_process');

const jest = require.resolve('jest/bin/jest');
function list(shard) {
  const args = [
    jest,
    '--config',
    './test/jest-e2e.json',
    '--listTests',
    '--runInBand',
    '--json',
  ];
  if (shard) args.push(`--shard=${shard}/2`);
  const result = spawnSync(process.execPath, args, {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(
      result.stderr || result.stdout || 'Jest test discovery failed',
    );
  return JSON.parse(result.stdout);
}

const all = list();
const first = list(1);
const second = list(2);
const firstSet = new Set(first);
const secondSet = new Set(second);
if (
  !all.length ||
  !first.length ||
  !second.length ||
  first.some((file) => secondSet.has(file)) ||
  all.some((file) => !firstSet.has(file) && !secondSet.has(file)) ||
  firstSet.size + secondSet.size !== all.length
) {
  throw new Error(
    'E2E shards are empty, overlap, or do not cover the complete suite',
  );
}
console.log(
  `E2E shard coverage verified: ${first.length} + ${second.length} = ${all.length} test files`,
);
