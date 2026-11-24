import { ScorecardService } from './scorecard.service';

const actor = { id: 1, companyId: 1, roles: ['COMPANY_ADMIN'] };
const entry = {
  assignmentId: 10,
  definitionVersionId: 20,
  targetRevisionId: 30,
  weight: '100',
  required: true,
};

function liveScorecard(
  approvedTargetRevisionId: number,
  mode: 'weighted' | 'strategic' = 'weighted',
  addAssignment = false,
) {
  const service = Object.create(ScorecardService.prototype) as ScorecardService;
  const version = {
    id: 2,
    scorecardId: 1,
    version: 1,
    mode,
    entries: [entry],
    policyVersionId: null,
    publishedAt: new Date(),
  };
  const lookup = {
    versions: new Map([[1, [version]]]),
    definitions: new Map([
      [
        20,
        {
          id: 20,
          definitionId: 7,
          name: 'Sales',
          measurementType: 'numeric',
          direction: 'higher',
        },
      ],
    ]),
    targets: new Map([[30, { id: 30, target: { value: 100 } }]]),
    assignments: new Map([[10, { id: 10, status: 'active' }]]),
    policies: new Map(),
    periods: new Map([[40, { id: 40, label: 'November' }]]),
    roots: new Map([
      [10, { id: 50, assignmentId: 10, approvedRevisionId: 60 }],
    ]),
    approved: new Map([
      [
        60,
        {
          id: 60,
          status: 'approved',
          definitionVersionId: 20,
          periodId: 40,
          targetRevisionId: approvedTargetRevisionId,
          actual: 80,
        },
      ],
    ]),
    activePersonalAssignments: new Map([
      [
        '5:40',
        [
          { id: 10, subjectId: 5, periodId: 40 },
          ...(addAssignment ? [{ id: 11, subjectId: 5, periodId: 40 }] : []),
        ],
      ],
    ]),
  };
  const card = {
    id: 1,
    companyId: 1,
    subjectType: 'employee',
    subjectId: 5,
    periodId: 40,
    status: 'published',
  };
  return Reflect.get(service, 'decorate').call(
    service,
    actor,
    card,
    false,
    lookup,
  );
}

describe('live scorecard approval matching', () => {
  it('scores an approved result for the pinned target', async () => {
    const result = await liveScorecard(30);
    expect(result.overallScore).toBe('80');
    expect(result.entries[0]).toMatchObject({ actual: 80, status: 'scored' });
  });

  it('does not score an approved result against an older target', async () => {
    const result = await liveScorecard(31);
    expect(result.overallScore).toBeNull();
    expect(result.entries[0]).toMatchObject({
      actual: null,
      status: 'target_changed',
    });
  });

  it('marks a fully approved strategic scorecard complete without inventing a numeric score', async () => {
    const result = await liveScorecard(30, 'strategic');
    expect(result.performanceStatus).toBe('status_only');
    expect(result.overallScore).toBeNull();
    expect(result.entries[0].status).toBe('scored');
  });

  it('invalidates a published score when another KPI is assigned later', async () => {
    const result = await liveScorecard(30, 'weighted', true);
    expect(result.missingAssignmentIds).toEqual([11]);
    expect(result.performanceStatus).toBe('needs_revision');
    expect(result.overallScore).toBeNull();
  });
});
