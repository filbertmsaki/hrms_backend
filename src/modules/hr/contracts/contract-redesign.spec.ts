import { BadRequestException } from '@nestjs/common';
import {
  describeWorkingTime,
  diffRecords,
  probationFromPolicyDays,
  sha256Json,
  stableStringify,
} from './contract-live-values';
import {
  assertLiveDraftRules,
  carrySectionFlags,
  pruneOverrideReasons,
} from './contract-draft-rules';
import {
  ContractTemplatesService,
  readSnapshot,
  renderSections,
  snapshotFromContext,
} from './contract-templates.service';
import {
  EmploymentContract,
  EmploymentContractStatus,
} from './entities/employment-contract.entity';

describe('D3 probation from policy days', () => {
  it.each([
    [90, 3, false],
    [180, 6, false],
    [0, 0, false],
    [45, null, true],
    [100, null, true],
  ])('%i days → %s months (warning %s)', (days, months, warns) => {
    const result = probationFromPolicyDays(days);
    expect(result.months).toBe(months);
    expect(!!result.warning).toBe(warns);
  });
});

describe('working time description', () => {
  it('groups consecutive days with the same hours', () => {
    const weekday = (dayOfWeek: number) => ({
      dayOfWeek,
      isWorkingDay: true,
      start: '08:00:00',
      end: '17:00:00',
    });
    expect(
      describeWorkingTime([
        weekday(1),
        weekday(2),
        weekday(3),
        weekday(4),
        weekday(5),
        { dayOfWeek: 6, isWorkingDay: true, start: '08:00', end: '13:00' },
        { dayOfWeek: 0, isWorkingDay: false, start: null, end: null },
      ]),
    ).toBe('08:00–17:00, Mon–Fri; 08:00–13:00, Sat');
  });

  it('returns null when no working day has hours', () => {
    expect(describeWorkingTime([])).toBeNull();
  });
});

describe('live draft rules', () => {
  const base = {
    dto: {},
    particulars: {},
    previousSections: [],
    nextSections: [],
  };
  const fieldErrors = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      return (
        (error as BadRequestException).getResponse() as {
          field_errors: Record<string, string>;
        }
      ).field_errors;
    }
    throw new Error('expected rules to fail');
  };

  it('refuses hand-typed copies of HR values', () => {
    expect(
      fieldErrors(() =>
        assertLiveDraftRules({ ...base, dto: { job_title: 'Typed' } }),
      ),
    ).toHaveProperty('job_title');
  });

  it('needs a reason for every override, including chosen references', () => {
    const errors = fieldErrors(() =>
      assertLiveDraftRules({
        ...base,
        particulars: {
          field_overrides: { salary: '1500000' },
          refs: { department_id: 4 },
          override_reasons: { salary: 'Agreed at offer' },
        },
      }),
    );
    expect(errors).toHaveProperty('department');
    expect(errors).not.toHaveProperty('salary');
  });

  it('checks override formats', () => {
    const errors = fieldErrors(() =>
      assertLiveDraftRules({
        ...base,
        particulars: {
          field_overrides: {
            salary: '1.5m',
            currency: 'tzs',
            probation_months: '1.5',
          },
          override_reasons: {
            salary: 'x reason',
            currency: 'x reason',
            probation_months: 'x reason',
          },
        },
      }),
    );
    expect(Object.keys(errors).sort()).toEqual([
      'currency',
      'probation_months',
      'salary',
    ]);
  });

  it('enforces clause flags from the template', () => {
    const previousSections = [
      { id: 'a', heading: 'A', body: 'fixed', editable: false },
      { id: 'b', heading: 'B', body: 'required' },
      { id: 'c', heading: 'C', body: 'optional', optional: true },
    ];
    const errors = fieldErrors(() =>
      assertLiveDraftRules({
        ...base,
        previousSections,
        nextSections: [
          { id: 'a', heading: 'A', body: 'changed' },
          { id: 'b', heading: 'B', body: 'required', enabled: false },
          { id: 'c', heading: 'C', body: 'optional', enabled: false },
        ],
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(['sections.a', 'sections.b']);
  });

  it('keeps template flags even if the editor resends a clause without them', () => {
    const [section] = carrySectionFlags(
      [{ id: 'a', heading: 'A', body: 'x', editable: false, optional: true }],
      [{ id: 'a', heading: 'A', body: 'x', editable: true, enabled: false }],
    );
    expect(section).toEqual({
      id: 'a',
      heading: 'A',
      body: 'x',
      editable: false,
      optional: true,
      enabled: false,
    });
  });

  it('drops reasons for overrides that were removed', () => {
    expect(
      pruneOverrideReasons({
        field_overrides: { salary: '1' },
        override_reasons: { salary: 'kept', currency: 'stale' },
      }),
    ).toEqual({ salary: 'kept' });
  });
});

describe('clauses switched off', () => {
  it('are left out of the rendered and frozen text', () => {
    const { sections } = renderSections(
      [
        { id: 'a', heading: 'A', body: 'one' },
        { id: 'b', heading: 'B', body: 'two', optional: true, enabled: false },
      ],
      {},
    );
    expect(sections.map((section) => section.id)).toEqual(['a']);
  });
});

describe('frozen snapshot', () => {
  const context = {
    values: { employee_name: 'Amina Contract' },
    automatic: { employee_name: 'Amina Contract' },
    overrides: {},
    companyName: 'Alliance Test Ltd',
    legal: {},
    employeeName: 'Amina Contract',
    employeeNo: 'EMP-1',
    signatoryName: 'Juma Director',
    signatoryTitle: 'Managing Director',
    sources: {},
    warnings: {},
    liveRefs: {},
    frozen: false,
  };

  it('is rendered without reading any record once it exists', async () => {
    const snapshot = snapshotFromContext(
      context as never,
      { salary: 'Agreed at offer' },
      new Date('2026-11-11T08:00:00Z'),
    );
    const failing = {
      getRepository: () => {
        throw new Error('records must not be read for a sent contract');
      },
    };
    const service = new ContractTemplatesService(
      failing as never,
      failing as never,
      failing as never,
    );
    const rendered = await service.buildContext(
      {
        companyId: 1,
        employeeId: 1,
        status: EmploymentContractStatus.PENDING_HR_SIGNATURE,
        particulars: { snapshot },
      } as unknown as EmploymentContract,
      failing as never,
    );
    expect(rendered.frozen).toBe(true);
    expect(rendered.employeeName).toBe('Amina Contract');
    expect(rendered.signatoryName).toBe('Juma Director');
    expect(readSnapshot({ snapshot })?.override_reasons).toEqual({
      salary: 'Agreed at offer',
    });
  });

  it('hashes the same data to the same value regardless of key order', () => {
    expect(sha256Json({ b: 1, a: { d: 2, c: 3 } })).toBe(
      sha256Json({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe('draft audit diff', () => {
  it('lists only changed fields with old and new values', () => {
    expect(
      diffRecords(
        { hours: null, title: 'Same', 'clause.a': { body: 'x' } },
        { hours: '08:00', title: 'Same', 'clause.a': { body: 'y' } },
      ),
    ).toEqual({
      changed: ['clause.a', 'hours'],
      oldValues: { hours: null, 'clause.a': { body: 'x' } },
      newValues: { hours: '08:00', 'clause.a': { body: 'y' } },
    });
  });
});
