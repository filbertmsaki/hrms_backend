import { PayrollAttendanceDeductionPolicyService } from './payroll-attendance-deduction-policy.service';
import { PayrollAttendanceDeductionPolicyStatusEnum } from '../entities/payroll-attendance-deduction-policy.entities';

describe('PayrollAttendanceDeductionPolicyService', () => {
  function build(policy: Record<string, unknown> | null, overlapping = 0) {
    const repository: any = {
      create: (value: any) => value,
      save: async (value: any) => ({ id: 1, ...value }),
      findOne: async () => policy,
      createQueryBuilder: () => {
        const qb: any = {
          where: () => qb,
          andWhere: () => qb,
          getCount: async () => overlapping,
        };
        return qb;
      },
    };
    return new PayrollAttendanceDeductionPolicyService(
      { ensureActorCompanyId: () => 1 } as any,
      repository,
      { create: (v: any) => v, save: async () => undefined } as any,
    );
  }
  const author = { id: 3, companyMembershipId: 3 } as any;
  const approver = { id: 4, companyMembershipId: 4 } as any;

  it('creates policies as DRAFT so nothing is deducted until activation', async () => {
    const created = await build(null).create(author, {
      name: 'Absence policy',
      effective_from: '2027-01-01',
      rules: {
        standard_minutes_per_day: 480,
        unauthorized_absence: { enabled: true },
      },
    });
    expect(created.status).toBe(
      PayrollAttendanceDeductionPolicyStatusEnum.DRAFT,
    );
  });

  it('activates only with an independent approver and a legal review reference', async () => {
    const draft = () => ({
      id: 1,
      status: PayrollAttendanceDeductionPolicyStatusEnum.DRAFT,
      createdByCompanyUserId: 3,
      effectiveFrom: '2027-01-01',
      effectiveTo: null,
    });
    await expect(
      build(draft()).activate(author, 1, { legal_review_reference: 'LR-1' }),
    ).rejects.toThrow('other than the policy author');
    await expect(
      build(draft()).activate(approver, 1, { legal_review_reference: ' ' }),
    ).rejects.toThrow('legal compliance review');
    await expect(
      build(draft(), 1).activate(approver, 1, {
        legal_review_reference: 'LR-1',
      }),
    ).rejects.toThrow('Another active policy');
    const active = await build(draft()).activate(approver, 1, {
      legal_review_reference: 'LR-1',
    });
    expect(active).toMatchObject({
      status: PayrollAttendanceDeductionPolicyStatusEnum.ACTIVE,
      legalReviewReference: 'LR-1',
      approvedByCompanyUserId: 4,
    });
  });
});
