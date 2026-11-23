const { writeFileSync } = require('node:fs');
const { PERMISSION_SEEDS } = require('../dist/database/seeds/001-permissions.seed');

const keys = PERMISSION_SEEDS.map(permission => permission.name).sort();
if (new Set(keys).size !== keys.length) throw new Error('Duplicate catalogue keys');
if (!keys.every(key => /^[a-z][a-z0-9_-]*:[a-z][a-z0-9_-]*$/.test(key))) {
  throw new Error('Invalid catalogue key');
}
function defaultRoleReference() {
  const { PLATFORM_ROLE_SEEDS } = require('../dist/database/seeds/002-global-roles.seed');
  const { COMPANY_ROLE_SEEDS } = require('../dist/database/seeds/005-company-roles.seed');
  const lines = [
    '# Default role grants', '',
    'These tables show the grants given to a newly provisioned role. In HRMS, open Roles, choose a role and open Permissions to inspect the grants stored for your installation. Direct permissions and active company membership also affect an individual user’s access.', '',
  ];
  for (const [scope, roles] of [['Platform', PLATFORM_ROLE_SEEDS], ['Company', COMPANY_ROLE_SEEDS]]) {
    lines.push('## ' + scope + ' roles', '');
    for (const role of roles) {
      const grants = [...new Set(role.permissionNames)].sort();
      const groups = new Map();
      for (const grant of grants) {
        if (!keys.includes(grant)) throw new Error('Unregistered permission ' + grant);
        const module = grant.split(':')[0];
        if (!groups.has(module)) groups.set(module, []);
        groups.get(module).push('`' + grant + '`');
      }
      lines.push('### ' + role.displayName, '', role.description, '', grants.length + ' assigned permissions.', '', '| Module | Assigned permissions |', '| --- | --- |');
      for (const [module, assigned] of groups) lines.push('| ' + module + ' | ' + assigned.join(', ') + ' |');
      lines.push('');
    }
  }
  return lines.join('\n');
}

const roles = process.argv[2] === '--roles';
const output = roles ? defaultRoleReference() : JSON.stringify(keys, null, 2) + '\n';
const destination = process.argv[roles ? 3 : 2];
if (destination) writeFileSync(destination, output);
else process.stdout.write(output);
