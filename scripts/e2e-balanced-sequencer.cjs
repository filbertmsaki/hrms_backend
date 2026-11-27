const path = require('node:path');
const BaseSequencer = require('@jest/test-sequencer').default;
const durations = require('./e2e-test-durations.json');

function distribute(tests, shardCount) {
  const shards = Array.from({ length: shardCount }, () => ({ total: 0, tests: [] }));
  const sorted = tests.map((test) => {
    const relative = path.relative(test.context.config.rootDir, test.path).replace(/\\/g, '/');
    return { test, relative, duration: durations[relative] ?? 4 };
  }).sort((a, b) => b.duration - a.duration || a.relative.localeCompare(b.relative, 'en'));
  for (const item of sorted) {
    const target = shards.reduce((best, shard) => shard.total < best.total ? shard : best);
    target.tests.push(item.test);
    target.total += item.duration;
  }
  return shards;
}

class BalancedSequencer extends BaseSequencer {
  shard(tests, { shardIndex, shardCount }) {
    return distribute(tests, shardCount)[shardIndex - 1].tests;
  }
}

module.exports = BalancedSequencer;
module.exports.distribute = distribute;
