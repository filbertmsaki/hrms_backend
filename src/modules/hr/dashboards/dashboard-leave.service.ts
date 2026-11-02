import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveRequest } from '../leave/entities/leave-request.entity';
import { LeaveStatusEnum } from '../leave/enums/leave-status.enum';
import { DashboardEmployeeSubquery } from './dashboard-employee-scope';

@Injectable()
export class DashboardLeaveService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
  ) {}

  async getApprovedLeaveDaysByType(
    companyId: number,
    employeeScope: DashboardEmployeeSubquery,
    dateFrom: string,
    dateTo: string,
  ) {
    const includedDateCount = `(
      SELECT COUNT(*)
      FROM jsonb_array_elements_text(request.calculation_snapshot->'included_dates') AS included_date(value)
      WHERE included_date.value::date BETWEEN :dateFrom AND :dateTo
    )`;
    const rows = await this.leaveRequestRepository
      .createQueryBuilder('request')
      .innerJoin(
        'leave_types',
        'leaveType',
        'leaveType.id = request.leave_type_id AND leaveType.company_id = request.company_id',
      )
      .select('leaveType.id', 'leave_type_id')
      .addSelect('leaveType.name', 'leave_type')
      .addSelect(
        `COUNT(request.id) FILTER (WHERE CASE
          WHEN jsonb_typeof(request.calculation_snapshot->'included_dates') = 'array'
          THEN ${includedDateCount} > 0 ELSE FALSE END)`,
        'approved_request_count',
      )
      .addSelect(
        `COALESCE(SUM(CASE
          WHEN jsonb_typeof(request.calculation_snapshot->'included_dates') = 'array'
          THEN ${includedDateCount} * request.total_days
            / NULLIF(jsonb_array_length(request.calculation_snapshot->'included_dates'), 0)
          ELSE 0 END), 0)`,
        'approved_days',
      )
      .addSelect(
        `COUNT(request.id) FILTER (WHERE
          jsonb_typeof(request.calculation_snapshot->'included_dates') IS DISTINCT FROM 'array')`,
        'unallocated_approved_requests',
      )
      .addSelect(
        `(SELECT COALESCE(
          jsonb_agg(
            jsonb_build_object(
              'month', monthly.month,
              'approved_request_count', monthly.approved_request_count,
              'approved_days', monthly.approved_days
            ) ORDER BY monthly.month
          ), '[]'::jsonb)
        FROM (
          SELECT to_char(included_date.value::date, 'YYYY-MM') AS month,
            COUNT(DISTINCT request.id) AS approved_request_count,
            SUM(request.total_days / NULLIF(
              jsonb_array_length(request.calculation_snapshot->'included_dates'), 0
            )) AS approved_days
          FROM leave_requests request
          INNER JOIN employees employee
            ON employee.id = request.employee_id
            AND employee.company_id = request.company_id
          CROSS JOIN LATERAL jsonb_array_elements_text(CASE
            WHEN jsonb_typeof(request.calculation_snapshot->'included_dates') = 'array'
            THEN request.calculation_snapshot->'included_dates'
            ELSE '[]'::jsonb END
          ) AS included_date(value)
          WHERE request.company_id = :companyId
            AND request.leave_type_id = "leaveType"."id"
            AND request.status = :approvedStatus
            AND included_date.value::date BETWEEN :dateFrom AND :dateTo
            AND employee.id IN (${employeeScope.sql})
          GROUP BY to_char(included_date.value::date, 'YYYY-MM')
        ) monthly)`,
        'monthly_breakdown',
      )
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.status = :approvedStatus', {
        approvedStatus: LeaveStatusEnum.APPROVED,
      })
      .andWhere('request.start_date <= :dateTo', { dateTo })
      .andWhere('request.end_date >= :dateFrom', { dateFrom })
      .andWhere(`request.employee_id IN (${employeeScope.sql})`)
      .setParameters({ ...employeeScope.params, dateFrom, dateTo })
      .groupBy('leaveType.id')
      .addGroupBy('leaveType.name')
      .orderBy('leaveType.name', 'ASC')
      .getRawMany<{
        leave_type_id: number | string;
        leave_type: string;
        approved_request_count: number | string;
        approved_days: number | string;
        unallocated_approved_requests: number | string;
        monthly_breakdown:
          | Array<{
              month: string;
              approved_request_count: number | string;
              approved_days: number | string;
            }>
          | string;
      }>();

    const unallocatedRequests = rows.reduce(
      (total, row) => total + Number(row.unallocated_approved_requests ?? 0),
      0,
    );
    if (unallocatedRequests > 0) {
      return {
        available: false,
        reason: 'LEAVE_DATE_ALLOCATION_INCOMPLETE',
        unallocated_approved_requests: unallocatedRequests,
        items: [],
      };
    }

    return {
      available: true,
      unallocated_approved_requests: 0,
      items: rows.flatMap((row) => {
        const breakdown =
          typeof row.monthly_breakdown === 'string'
            ? (JSON.parse(row.monthly_breakdown) as Array<{
                month: string;
                approved_request_count: number | string;
                approved_days: number | string;
              }>)
            : row.monthly_breakdown;
        return breakdown.map((month) => ({
          leave_type_id: Number(row.leave_type_id),
          leave_type: row.leave_type,
          month: month.month,
          label: `${month.month} · ${row.leave_type}`,
          approved_request_count: Number(month.approved_request_count),
          approved_days: Number(Number(month.approved_days).toFixed(2)),
        }));
      }),
    };
  }
}
