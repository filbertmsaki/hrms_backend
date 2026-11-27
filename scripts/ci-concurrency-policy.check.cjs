const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const yaml = require('js-yaml');
const { spawnSync } = require('node:child_process');

const workflow = yaml.load(
  readFileSync('.github/workflows/hrms-backend-ci.yml', 'utf8'),
);
test('obsolete branch checks cancel without cancelling manual runs or other shards', () => {
  for (const name of ['static-checks', 'validate-and-package', 'e2e-tests']) {
    const concurrency = workflow.jobs[name].concurrency;
    assert.equal(concurrency['cancel-in-progress'], true);
    assert.match(concurrency.group, /github\.event_name/);
    assert.match(concurrency.group, /github\.ref/);
    assert.match(concurrency.group, /workflow_dispatch.*github\.run_id/);
  }
  assert.match(workflow.jobs['e2e-tests'].concurrency.group, /matrix\.shard/);
});

test('deployments queue and artifact retention preserves active workflow releases', () => {
  for (const name of ['deploy', 'uat-metadata']) {
    const concurrency = workflow.jobs[name].concurrency;
    assert.equal(concurrency['cancel-in-progress'], false);
    assert.equal(concurrency.queue, 'max');
  }
  const steps = workflow.jobs['validate-and-package'].steps;
  assert.equal(
    steps.find(
      (step) => step.name === 'Upload compiled backend for isolated E2E jobs',
    ).with['retention-days'],
    1,
  );
  const publish = workflow.jobs['publish-release'].steps;
  assert.equal(
    publish.find((step) => step.name === 'Upload backend artifact').with[
      'retention-days'
    ],
    14,
  );
  const prune = publish.find(
    (step) => step.name === 'Prune old release artifacts',
  ).run;
  assert.match(prune, /keep=10/);
  assert.match(prune, /workflow_run\.id/);
  assert.match(prune, /status.*!= completed/);
});

test('pruning skips active and unknown workflow runs', () => {
  const prune = workflow.jobs['publish-release'].steps
    .find((step) => step.name === 'Prune old release artifacts')
    .run.replaceAll('${{ github.repository }}', 'owner/repo');
  const mock = `
gh() {
  if [[ "$2" == "repos/owner/repo/actions/artifacts" ]]; then
    for n in {10..1}; do printf '2026-12-%02d\\t%d\\t%d\\n' "$n" "$((n+10))" "$((n+10))"; done
    printf '2026-11-03\\t3\\t3\\n2026-11-02\\t2\\t2\\n2026-11-01\\t1\\t1\\n'
  elif [[ "$2" == 'repos/owner/repo/actions/runs/3' ]]; then echo in_progress
  elif [[ "$2" == 'repos/owner/repo/actions/runs/2' ]]; then echo completed
  elif [[ "$2" == 'repos/owner/repo/actions/runs/1' ]]; then return 1
  elif [[ "$2" == '-X' && "$3" == 'DELETE' ]]; then echo "DELETED $4"
  else return 1; fi
}
`;
  const bash =
    process.platform === 'win32'
      ? 'C:\\Program Files\\Git\\bin\\bash.exe'
      : 'bash';
  const result = spawnSync(bash, ['-c', mock + prune], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /DELETED repos\/owner\/repo\/actions\/artifacts\/2/,
  );
  assert.doesNotMatch(result.stdout, /DELETED.*artifacts\/(1|3)/);
  assert.match(result.stdout, /workflow 3 is in_progress/);
  assert.match(
    result.stderr,
    /artifact 1: workflow status could not be confirmed/,
  );
});
