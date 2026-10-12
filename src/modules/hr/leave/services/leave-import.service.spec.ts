import ExcelJS from 'exceljs';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { LeaveType } from '../entities/leave-type.entity';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveService } from '../leave.service';
import { LeaveImportService } from './leave-import.service';

describe('LeaveImportService', () => {
  const employeeQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const typeQuery = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const employeeRepository = {
    createQueryBuilder: jest.fn(() => employeeQuery),
  };
  const leaveTypeRepository = { createQueryBuilder: jest.fn(() => typeQuery) };
  const leaveService = { createLeaveRequest: jest.fn() };
  const service = new LeaveImportService(
    employeeRepository as never,
    leaveTypeRepository as never,
    leaveService as unknown as LeaveService,
  );
  const actor = { companyId: 8, companyMembershipId: 11 } as AuthenticatedUser;

  async function workbookFile() {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Leave Requests');
    sheet.addRow([
      'employee_no',
      'leave_type_code',
      'duration_type',
      'start_date',
      'end_date',
      'half_day_session',
      'start_time',
      'end_time',
      'reason',
      'submit',
    ]);
    sheet.addRow([
      'EMP-1',
      'ANNUAL',
      'FULL_DAY',
      '2026-10-12',
      '2026-10-12',
      '',
      '',
      '',
      'Annual leave',
      'Yes',
    ]);
    return {
      originalname: 'leave-import.xlsx',
      size: 1000,
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    employeeQuery.getMany.mockResolvedValue([
      { id: 4, employee_no: 'EMP-1', company_id: 8 } as Employee,
    ]);
    typeQuery.getMany.mockResolvedValue([
      {
        id: 6,
        code: 'ANNUAL',
        name: 'Annual Leave',
        company_id: 8,
        status: LeaveRecordStatusEnum.ACTIVE,
        requires_attachment: false,
      } as LeaveType,
    ]);
    leaveService.createLeaveRequest.mockResolvedValue({
      id: 12,
      leave_no: 'LV-2026-000012',
    });
  });

  it('previews valid rows without creating any leave requests', async () => {
    const result = await service.import(8, await workbookFile(), actor, true);

    expect(result).toMatchObject({
      preview: true,
      total: 1,
      ready: 1,
      created: 0,
      failed: 0,
    });
    expect(result.results[0].status).toBe('ready');
    expect(leaveService.createLeaveRequest).not.toHaveBeenCalled();
  });

  it('creates rows only when the confirmation stage is called', async () => {
    const result = await service.import(8, await workbookFile(), actor);

    expect(result).toMatchObject({
      preview: false,
      total: 1,
      created: 1,
      failed: 0,
    });
    expect(leaveService.createLeaveRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects a required attachment row during preview instead of marking it ready', async () => {
    typeQuery.getMany.mockResolvedValue([
      {
        id: 6,
        code: 'ANNUAL',
        name: 'Annual Leave',
        company_id: 8,
        status: LeaveRecordStatusEnum.ACTIVE,
        requires_attachment: true,
      } as LeaveType,
    ]);

    const result = await service.import(8, await workbookFile(), actor, true);

    expect(result.results[0]).toMatchObject({ status: 'failed' });
    expect(result.results[0].message).toContain('requires an attachment');
    expect(leaveService.createLeaveRequest).not.toHaveBeenCalled();
  });
});
