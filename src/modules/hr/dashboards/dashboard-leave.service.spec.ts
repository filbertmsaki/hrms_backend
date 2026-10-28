import { Repository } from 'typeorm';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { DashboardLeaveService } from './dashboard-leave.service';

describe('DashboardLeaveService', () => {
  const employeeScope = {
    sql: 'SELECT employee_scope.id FROM employees employee_scope WHERE employee_scope.company_id = :scopeCompanyId',
    params: { scopeCompanyId: 10 },
  };

  function buildService(rows: Array<Record<string, unknown>>) {
    const query: Record<string, jest.Mock> = {};
    for (const method of [
      'innerJoin',
      'select',
      'addSelect',
      'where',
      'andWhere',
      'setParameters',
      'groupBy',
      'addGroupBy',
      'orderBy',
    ]) {
      query[method] = jest.fn().mockReturnValue(query);
    }
    query.getRawMany = jest.fn().mockResolvedValue(rows);
    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    return {
      service: new DashboardLeaveService(
        repository as unknown as Repository<LeaveRequest>,
      ),
      query,
    };
  }

  it('allocates approved leave days by included occurrence dates and type', async () => {
    const { service, query } = buildService([
      {
        leave_type_id: '4',
        leave_type: 'Annual Leave',
        approved_request_count: '2',
        approved_days: '3.5',
        unallocated_approved_requests: '0',
        monthly_breakdown: [
          {
            month: '2026-09',
            approved_request_count: '2',
            approved_days: '3.5',
          },
        ],
      },
    ]);

    await expect(
      service.getApprovedLeaveDaysByType(
        10,
        employeeScope,
        '2026-09-01',
        '2026-09-30',
      ),
    ).resolves.toEqual({
      available: true,
      unallocated_approved_requests: 0,
      items: [
        {
          leave_type_id: 4,
          leave_type: 'Annual Leave',
          month: '2026-09',
          label: '2026-09 · Annual Leave',
          approved_request_count: 2,
          approved_days: 3.5,
        },
      ],
    });
    expect(query.innerJoin).toHaveBeenCalledWith(
      'leave_types',
      'leaveType',
      'leaveType.id = request.leave_type_id AND leaveType.company_id = request.company_id',
    );
    expect(query.where).toHaveBeenCalledWith(
      'request.company_id = :companyId',
      { companyId: 10 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining(
        'request.employee_id IN (SELECT employee_scope.id',
      ),
    );
    expect(query.addSelect).toHaveBeenCalledWith(
      expect.stringContaining(
        "jsonb_array_elements_text(request.calculation_snapshot->'included_dates')",
      ),
      'approved_days',
    );
    expect(query.setParameters).toHaveBeenCalledWith({
      scopeCompanyId: 10,
      dateFrom: '2026-09-01',
      dateTo: '2026-09-30',
    });
  });

  it('marks the trend unavailable when approved requests lack included-date snapshots', async () => {
    const { service } = buildService([
      {
        leave_type_id: '4',
        leave_type: 'Annual Leave',
        approved_request_count: '0',
        approved_days: '0',
        unallocated_approved_requests: '1',
        monthly_breakdown: [],
      },
    ]);

    await expect(
      service.getApprovedLeaveDaysByType(
        10,
        employeeScope,
        '2026-09-01',
        '2026-09-30',
      ),
    ).resolves.toEqual({
      available: false,
      reason: 'LEAVE_DATE_ALLOCATION_INCOMPLETE',
      unallocated_approved_requests: 1,
      items: [],
    });
  });
});
