import { FieldVisitService } from './field-visit.service';
import {
  FieldVisit,
  FieldVisitPlan,
  FieldVisitPlanItem,
} from '../entities/field-visit.entities';
import {
  FieldVisitStatusEnum,
  FieldVisitPlanStatusEnum,
  FieldVisitTypeEnum,
} from '../enums/work-activity.enums';

describe('field plan items', () => {
  it('adds a manager assignment to an in-progress plan without replacing existing visits', async () => {
    const plan = {
      id: 7,
      companyId: 1,
      employeeId: 2,
      visitDate: '2026-11-25',
      status: FieldVisitPlanStatusEnum.IN_PROGRESS,
      employeeSnapshot: {},
      policySnapshot: {},
      clientRequestId: null,
    };
    const plans = { findOne: jest.fn().mockResolvedValue(plan) };
    const items = {
      find: jest
        .fn()
        .mockResolvedValue([
          { id: 10, displayOrder: 0, clientRequestId: null },
        ]),
      create: jest.fn((item) => item),
      save: jest.fn(async (item) => ({ ...item, id: 11 })),
    };
    const visits = {
      create: jest.fn((item) => item),
      save: jest.fn(async (item) => item),
      remove: jest.fn(),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === FieldVisitPlan
          ? plans
          : entity === FieldVisitPlanItem
            ? items
            : entity === FieldVisit
              ? visits
              : null,
      ),
    };
    const source = { transaction: jest.fn(async (run) => run(manager)) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new FieldVisitService(
      source as never,
      {} as never,
      { ensureActorCompanyId: () => 1 } as never,
      {} as never,
      {} as never,
      audit as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const call = service as unknown as {
      appendAssignedVisits: (
        actor: unknown,
        id: number,
        dto: unknown,
      ) => Promise<unknown>;
    };
    await call.appendAssignedVisits({ companyId: 1 }, 7, {
      employee_id: 2,
      visit_date: '2026-11-25',
      client_request_id: '00000000-0000-4000-8000-000000000099',
      items: [
        {
          visit_type: FieldVisitTypeEnum.CUSTOMER_VISIT,
          purpose: 'Additional visit',
        },
      ],
    });
    expect(visits.save).toHaveBeenCalledWith(
      expect.objectContaining({ visitPlanId: 7, purpose: 'Additional visit' }),
    );
    expect(visits.remove).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'FIELD_VISIT_PLAN_ASSIGNMENT_ADDED' }),
      manager,
    );
  });
  it('accepts a GPS exception only when it is allowed and has a reason', () => {
    const service = new FieldVisitService(
      {} as never,
      { get: (_key: string, fallback: number) => fallback } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const validator = service as unknown as {
      assertVisitAccuracy: (
        value: number | null,
        limit: number,
        allowed: boolean,
        reason?: string,
      ) => boolean;
    };
    expect(validator.assertVisitAccuracy(25, 100, false)).toBe(false);
    expect(() =>
      validator.assertVisitAccuracy(150, 100, false, 'Poor signal'),
    ).toThrow();
    expect(() => validator.assertVisitAccuracy(null, 100, true)).toThrow();
    expect(validator.assertVisitAccuracy(150, 100, true, 'Poor signal')).toBe(
      true,
    );
  });

  it('creates distinct visit numbers for multiple visits in one plan', async () => {
    let nextItemId = 1;
    const savedVisits: Array<Record<string, unknown>> = [];
    const items = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((item) => item),
      save: jest.fn(async (item) => ({ ...item, id: nextItemId++ })),
    };
    const visits = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((visit) => visit),
      save: jest.fn(async (visit) => {
        savedVisits.push(visit);
        return visit;
      }),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === FieldVisitPlanItem
          ? items
          : entity === FieldVisit
            ? visits
            : null,
      ),
    };
    const service = new FieldVisitService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const plan = {
      id: 7,
      companyId: 1,
      employeeId: 2,
      visitDate: '2026-11-25',
      employeeSnapshot: {},
      policySnapshot: {},
    };
    const replace = service as unknown as {
      replacePlanItemsAndVisits: (
        manager: unknown,
        plan: unknown,
        items: unknown[],
      ) => Promise<void>;
    };
    await replace.replacePlanItemsAndVisits(manager, plan, [
      {
        visit_type: FieldVisitTypeEnum.CUSTOMER_VISIT,
        visit_name: 'First',
        purpose: 'Meeting',
      },
      {
        visit_type: FieldVisitTypeEnum.CUSTOMER_VISIT,
        visit_name: 'Second',
        purpose: 'Follow up',
      },
    ]);
    expect(savedVisits).toHaveLength(2);
    expect(savedVisits[0].visitNo).not.toBe(savedVisits[1].visitNo);
    expect(savedVisits.map((visit) => visit.visitName)).toEqual([
      'First',
      'Second',
    ]);
    expect(
      savedVisits.every(
        (visit) => visit.status === FieldVisitStatusEnum.PLANNED,
      ),
    ).toBe(true);
  });
});
