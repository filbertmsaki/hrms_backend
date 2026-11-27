const { test } = require('node:test');
const assert = require('node:assert/strict');
const { distribute } = require('./e2e-balanced-sequencer.cjs');

const item = (file) => ({
  path: `/repo/${file}`,
  context: { config: { rootDir: '/repo' } },
});
test('assigns every test once and independently of input order', () => {
  const files = [
    item('test/analytics-operational-reports.e2e-spec.ts'),
    item('test/company-modules.e2e-spec.ts'),
    item('test/health.e2e-spec.ts'),
    item('test/unknown.e2e-spec.ts'),
  ];
  const first = distribute(files, 2);
  const second = distribute([...files].reverse(), 2);
  assert.deepEqual(
    first.map((x) => x.tests.map((t) => t.path)),
    second.map((x) => x.tests.map((t) => t.path)),
  );
  assert.deepEqual(
    first.flatMap((x) => x.tests.map((t) => t.path)).sort(),
    files.map((t) => t.path).sort(),
  );
  assert.ok(first.every((shard) => shard.tests.length > 0));
});
