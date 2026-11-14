import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveAuditService } from './leave-audit.service';
import {
  LeaveEmployeeProfileService,
  LeaveProfileInput,
} from './leave-employee-profile.service';

describe('employee leave profile', () => {
  const actor = { companyId: 1, companyMembershipId: 3 } as AuthenticatedUser;
  const employee = {
    id: 5,
    company_id: 1,
    hire_date: '2025-03-15',
  } as Employee;
  const input: LeaveProfileInput = {
    effectiveDate: '2027-01-01',
    jurisdiction: 'mainland',
    fte: 0.5,
    previousEmploymentPeriods: [
      { start_date: '2023-01-01', end_date: '2023-12-31' },
    ],
    reason: 'HR verified',
  };
  let access: { assertCanAccessEmployee: jest.Mock };
  let audit: { log: jest.Mock };
  let employeeFind: jest.Mock;
  let profileFind: jest.Mock;
  let save: jest.Mock;
  let service: LeaveEmployeeProfileService;

  beforeEach(() => {
    employeeFind = jest.fn().mockResolvedValue(employee);
    profileFind = jest.fn().mockResolvedValue(null);
    save = jest.fn((value: Record<string, unknown>) =>
      Promise.resolve({ id: 10, ...value }),
    );
    const repo = (entity: unknown) =>
      entity === Employee
        ? { findOne: employeeFind }
        : { findOne: profileFind, create: (value: unknown) => value, save };
    const manager = { getRepository: jest.fn(repo) };
    const ds = {
      getRepository: jest.fn(repo),
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        callback(manager),
      ),
    };
    access = {
      assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new LeaveEmployeeProfileService(
      ds as unknown as DataSource,
      access as unknown as HrAccessService,
      audit as unknown as LeaveAuditService,
    );
  });

  it('records an audited effective profile without activating the new engine', async () => {
    const result = await service.create(1, 5, actor, input);
    expect(result.applied_to_leave_engine).toBe(false);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: 5,
        fte: '0.5000',
        jurisdiction: 'mainland',
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 1,
        action: 'leave_employee_profile.created',
      }),
      expect.anything(),
    );
  });

  it('resolves only explicitly recorded profiles as of a date', async () => {
    expect(await service.asOf(1, 5, actor, '2027-01-01')).toBeNull();
    expect(profileFind).toHaveBeenCalledWith(
      expect.objectContaining({
        order: { effective_date: 'DESC', id: 'DESC' },
        where: expect.objectContaining({ company_id: 1, employee_id: 5 }),
      }),
    );
  });

  it('rejects invalid FTE and overlapping or post-hire spells', async () => {
    await expect(
      service.create(1, 5, actor, { ...input, fte: 1.1 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(1, 5, actor, {
        ...input,
        previousEmploymentPeriods: [
          { start_date: '2025-01-01', end_date: '2025-03-15' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.create(1, 5, actor, {
        ...input,
        previousEmploymentPeriods: [
          { start_date: '2023-01-01', end_date: '2023-06-01' },
          { start_date: '2023-06-01', end_date: '2023-12-01' },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('denies inaccessible and foreign employees', async () => {
    access.assertCanAccessEmployee.mockRejectedValue(new ForbiddenException());
    await expect(service.create(1, 5, actor, input)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    employeeFind.mockResolvedValue(null);
    await expect(
      service.asOf(2, 5, actor, '2027-01-01'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(save).not.toHaveBeenCalled();
  });
});
