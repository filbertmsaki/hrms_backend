import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { AttendanceDailySummary } from '../../attendance/processing/entities/attendance-daily-summary.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { PayrollOvertimeRequest } from '../entities/payroll-overtime-request.entity';
import { PayrollPeriod } from '../entities/payroll-configuration.entities';
import { PayrollAuditService } from './payroll-core.services';
import { PayrollOvertimeRequestService } from './payroll-overtime-request.service';

const actor = (
  employeeId: number,
  roles: string[] = [],
): AuthenticatedUser => ({
  id: employeeId,
  email: `${employeeId}@example.com`,
  scope: 'company',
  userType: 'COMPANY_USER',
  companyId: 1,
  companyMembershipId: employeeId + 100,
  employeeId,
  roles,
  permissions: [],
});

describe('PayrollOvertimeRequestService', () => {
  let service: PayrollOvertimeRequestService;
  let rows: PayrollOvertimeRequest[];

  beforeEach(() => {
    rows = [];
    const requestRepository = {
      create: jest.fn((value: Partial<PayrollOvertimeRequest>) =>
        Object.assign(new PayrollOvertimeRequest(), value),
      ),
      save: jest.fn(async (value: PayrollOvertimeRequest) => {
        value.id = rows.length + 1;
        rows.push(value);
        return value;
      }),
      findOne: jest.fn(async ({ where }: { where: { id?: number } }) =>
        where.id ? (rows.find((row) => row.id === where.id) ?? null) : null,
      ),
      find: jest.fn(
        async ({
          where,
        }: {
          where: {
            status?: string;
            employeeId?: number;
            managerEmployeeId?: number;
          };
        }) =>
          rows.filter(
            (row) =>
              (!where.status || row.status === where.status) &&
              (!where.employeeId || row.employeeId === where.employeeId) &&
              (!where.managerEmployeeId ||
                row.managerEmployeeId === where.managerEmployeeId),
          ),
      ),
      update: jest.fn(
        async (
          where: { id: number; status: string },
          fields: Partial<PayrollOvertimeRequest>,
        ) => {
          const row = rows.find(
            (item) => item.id === where.id && item.status === where.status,
          );
          if (!row) return { affected: 0 };
          Object.assign(row, fields);
          return { affected: 1 };
        },
      ),
    } as unknown as Repository<PayrollOvertimeRequest>;
    const employeeRepository = {
      findOne: jest.fn(async ({ where }: { where: { id: number } }) => ({
        id: where.id,
        company_id: 1,
        company_user_id: where.id + 100,
        reports_to: where.id === 1 ? 2 : null,
      })),
      find: jest.fn(async () => []),
    } as unknown as Repository<Employee>;
    const attendanceRepository = {
      findOne: jest.fn(async () => ({ overtimeMinutes: 120 })),
      find: jest.fn(async () => []),
    } as unknown as Repository<AttendanceDailySummary>;
    const payrollPeriodQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    };
    const payrollPeriodRepository = {
      createQueryBuilder: jest.fn(() => payrollPeriodQuery),
    } as unknown as Repository<PayrollPeriod>;
    const accessService = {
      ensureActorCompanyId: jest.fn(
        (user: AuthenticatedUser) => user.companyId,
      ),
    } as unknown as HrAccessService;
    const auditService = {
      log: jest.fn(async () => undefined),
    } as unknown as PayrollAuditService;
    service = new PayrollOvertimeRequestService(
      accessService,
      auditService,
      requestRepository,
      employeeRepository,
      attendanceRepository,
      payrollPeriodRepository,
    );
  });

  it('moves an employee request through the assigned manager and HR before payroll can see it', async () => {
    const request = await service.create(actor(1), {
      work_date: '2026-09-23',
      requested_minutes: 90,
      reason: 'Month-end close',
    });
    expect(request.status).toBe('PENDING_MANAGER');
    expect(await service.listPayroll(actor(4))).toEqual([]);
    await expect(
      service.decideManager(actor(5), request.id, true, {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.decideHr(actor(3, ['HR_MANAGER']), request.id, true, {}),
    ).rejects.toBeInstanceOf(ConflictException);

    const managerApproved = await service.decideManager(
      actor(2),
      request.id,
      true,
      {},
    );
    expect(managerApproved.status).toBe('PENDING_HR');
    const hrApproved = await service.decideHr(
      actor(3, ['HR_MANAGER']),
      request.id,
      true,
      {},
    );
    expect(hrApproved.status).toBe('APPROVED');
    expect((await service.listPayroll(actor(4))).map((row) => row.id)).toEqual([
      request.id,
    ]);
  });

  it('requires a reason for rejection and excludes rejected requests from payroll', async () => {
    const request = await service.create(actor(1), {
      work_date: '2026-09-23',
      requested_minutes: 60,
      reason: 'Inventory',
    });
    await expect(
      service.decideManager(actor(2), request.id, false, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
    const rejected = await service.decideManager(actor(2), request.id, false, {
      comments: 'Not scheduled',
    });
    expect(rejected.status).toBe('REJECTED');
    expect(await service.listPayroll(actor(4))).toEqual([]);
  });
});
