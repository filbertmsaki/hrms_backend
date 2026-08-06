import { ConfigService } from '@nestjs/config';
import { KpiApplicabilityRule } from '../entities/kpi-applicability-rule.entity';
import { KpiApplicabilityService } from './kpi-applicability.service';

describe('KpiApplicabilityService', () => {
  const service = new KpiApplicabilityService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  it('matches employee-specific rules ahead of broader branch rules', () => {
    const employee = {
      id: 55,
      primary_branch_id: 2,
      primary_department_id: 7,
      primary_position_id: 9,
      grade_id: 4,
      employment_type: 'full_time',
    } as any;

    const employeeRule = {
      financialYearId: 10,
      branchId: 2,
      departmentId: null,
      positionId: null,
      gradeId: null,
      employmentType: null,
      employeeId: 55,
      reviewCycle: 'MONTHLY',
      templateCode: null,
      weightOverride: null,
      targetOverride: null,
    } as KpiApplicabilityRule;

    const branchRule = {
      ...employeeRule,
      employeeId: null,
    } as KpiApplicabilityRule;

    expect(
      (service as any).matches(employeeRule, {
        employee,
        financialYearId: 10,
        reviewCycle: 'MONTHLY',
      }),
    ).toBe(true);
    expect(
      (service as any).specificity(employeeRule),
    ).toBeGreaterThan((service as any).specificity(branchRule));
  });
});
