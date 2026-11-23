const { writeFileSync } = require('node:fs');
const { PERMISSION_SEEDS } = require('../dist/database/seeds/001-permissions.seed');

const keys = PERMISSION_SEEDS.map(permission => permission.name).sort();
if (new Set(keys).size !== keys.length) throw new Error('Duplicate catalogue keys');
if (!keys.every(key => /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(key))) {
  throw new Error('Invalid catalogue key');
}
const json = JSON.stringify(keys, null, 2) + '\n';
if (process.argv[2]) writeFileSync(process.argv[2], json);
else process.stdout.write(json);
