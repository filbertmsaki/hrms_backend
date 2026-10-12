import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { FilesService } from '../../files/files.service';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventsService } from '../../security/security-events.service';
import { HrAccessService } from '../shared/hr-access.service';
import { Employee } from './entities/employee.entity';
import { EmploymentStatusEnum } from './enums/employment-status.enum';

type Reference = { table: string; column: string; label: string };

// Someone else's record points at this employee in a supervising role.
// Deleting would silently orphan that record, so we refuse instead.
const SUPERVISING_REFERENCES: Reference[] = [
  {
    table: 'employees',
    column: 'reports_to',
    label: 'manager of other employees',
  },
  {
    table: 'employee_reporting_lines',
    column: 'manager_employee_id',
    label: 'reporting-line manager',
  },
  {
    table: 'departments',
    column: 'manager_employee_id',
    label: 'department manager',
  },
  {
    table: 'recruitment_requests',
    column: 'manager_employee_id',
    label: 'recruitment request manager',
  },
  {
    table: 'probation_cases',
    column: 'manager_employee_id',
    label: 'probation manager',
  },
  {
    table: 'probation_review_cycles',
    column: 'manager_employee_id',
    label: 'probation reviewer',
  },
  {
    table: 'payroll_overtime_requests',
    column: 'manager_employee_id',
    label: 'overtime approver',
  },
  {
    table: 'employee_kpis',
    column: 'reviewer_employee_id',
    label: 'KPI reviewer',
  },
  {
    table: 'performance_reviews',
    column: 'manager_employee_id',
    label: 'performance reviewer',
  },
  {
    table: 'performance_feedback_360_requests',
    column: 'rater_employee_id',
    label: '360 feedback rater',
  },
  {
    table: 'performance_review_workflow_steps',
    column: 'assigned_employee_id',
    label: 'review workflow approver',
  },
];

// Real working history means the person is no longer just "onboarding";
// those records must be kept, so the employee should be archived instead.
const OPERATIONAL_HISTORY: Reference[] = [
  { table: 'leave_requests', column: 'employee_id', label: 'leave requests' },
  {
    table: 'attendance_daily_summaries',
    column: 'employee_id',
    label: 'attendance records',
  },
  {
    table: 'attendance_mobile_punches',
    column: 'employee_id',
    label: 'attendance punches',
  },
  {
    table: 'hikvision_attendance_logs',
    column: 'employee_id',
    label: 'device attendance logs',
  },
  {
    table: 'payroll_overtime_requests',
    column: 'employee_id',
    label: 'overtime requests',
  },
  {
    table: 'performance_reviews',
    column: 'employee_id',
    label: 'performance reviews',
  },
  { table: 'employee_kpis', column: 'employee_id', label: 'KPIs' },
  {
    table: 'kpi_achievements',
    column: 'employee_id',
    label: 'KPI achievements',
  },
];

// Physical access is provisioned on Hikvision devices; deleting the row here
// would leave the person enrolled on the device.
const DEVICE_ACCESS: Reference[] = [
  {
    table: 'employee_device_assignments',
    column: 'employee_id',
    label: 'device assignments',
  },
  {
    table: 'employee_access_credentials',
    column: 'employee_id',
    label: 'access credentials',
  },
  {
    table: 'employee_device_identities',
    column: 'employee_id',
    label: 'device identities',
  },
];

// Rows that reference the employee without a cascading FK (or with a
// blocking one). Everything else is removed by ON DELETE CASCADE.
// Order matters: children before parents.
const EXPLICIT_DELETES: Reference[] = [
  { table: 'employment_contracts', column: 'employee_id', label: '' },
  { table: 'employee_employment_events', column: 'employee_id', label: '' },
  { table: 'action_items', column: 'assignee_employee_id', label: '' },
  { table: 'attendance_correction_requests', column: 'employee_id', label: '' },
  {
    table: 'employee_profile_update_requests',
    column: 'employee_id',
    label: '',
  },
  {
    table: 'sms_notification_logs',
    column: 'recipient_employee_id',
    label: '',
  },
  { table: 'report_template_recipients', column: 'employee_id', label: '' },
  { table: 'access_group_employees', column: 'employee_id', label: '' },
  { table: 'attendance_recalculation_jobs', column: 'employee_id', label: '' },
  { table: 'attendance_processed_events', column: 'employee_id', label: '' },
  {
    table: 'attendance_processing_exceptions',
    column: 'employee_id',
    label: '',
  },
  {
    table: 'employee_device_access_audit_logs',
    column: 'employee_id',
    label: '',
  },
  {
    table: 'employee_biometric_capture_sessions',
    column: 'employee_id',
    label: '',
  },
  { table: 'employee_kpi_cycle_scores', column: 'employee_id', label: '' },
  { table: 'employee_kpi_cycle_reviews', column: 'employee_id', label: '' },
  { table: 'kpi_applicability_rules', column: 'employee_id', label: '' },
  { table: 'performance_aggregates', column: 'employee_id', label: '' },
  { table: 'performance_audit_logs', column: 'employee_id', label: '' },
  { table: 'performance_appeals', column: 'employee_id', label: '' },
  { table: 'performance_development_plans', column: 'employee_id', label: '' },
  { table: 'performance_improvement_plans', column: 'employee_id', label: '' },
  {
    table: 'performance_feedback_360_requests',
    column: 'subject_employee_id',
    label: '',
  },
];

export interface PermanentDeletionResult {
  message: string;
  employee_id: number;
  company_user_removed: boolean;
  user_account_removed: boolean;
  files_removed: number;
}

@Injectable()
export class EmployeePermanentDeletionService {
  private readonly logger = new Logger(EmployeePermanentDeletionService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly hrAccessService: HrAccessService,
    private readonly filesService: FilesService,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  async deleteOnboardingEmployee(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    context?: AuditRequestContext,
  ): Promise<PermanentDeletionResult> {
    const outcome = await this.dataSource.transaction(async (manager) => {
      const employee = await manager
        .getRepository(Employee)
        .createQueryBuilder('employee')
        .setLock('pessimistic_write')
        .where(
          'employee.id = :employeeId AND employee.company_id = :companyId',
          {
            employeeId,
            companyId,
          },
        )
        .getOne();
      if (!employee) throw new NotFoundException('Employee not found');
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);

      if (employee.employment_status !== EmploymentStatusEnum.ONBOARDING) {
        throw new ConflictException(
          'Only employees still in onboarding can be permanently deleted. Archive this employee instead.',
        );
      }

      await this.assertNoBlockers(manager, employee.id);

      const filePaths = await this.collectFilePaths(manager, employee);
      await this.deleteDocuments(manager, companyId, employee.id);
      for (const ref of EXPLICIT_DELETES) {
        await this.deleteWhere(manager, ref, employee.id);
      }
      await this.releaseInvitation(manager, companyId, employee.id);

      const companyUserId = employee.company_user_id;
      await manager.query(
        'UPDATE "employees" SET "company_user_id" = NULL WHERE "id" = $1',
        [employee.id],
      );
      await manager.query('DELETE FROM "employees" WHERE "id" = $1', [
        employee.id,
      ]);

      const account = await this.removeAccount(manager, companyUserId);
      return {
        employee,
        companyUserId,
        filePaths,
        ...account,
      };
    });

    let filesRemoved = 0;
    for (const path of outcome.filePaths) {
      try {
        await this.filesService.removeManagedFile(path);
        filesRemoved += 1;
      } catch (error) {
        this.logger.warn(
          `Could not remove file ${path} for deleted employee ${employeeId}: ${String(error)}`,
        );
      }
    }

    await this.securityEventsService.logBestEffort({
      eventType: SecurityEventType.EMPLOYEE_PERMANENTLY_DELETED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      targetUserId: outcome.userId ?? undefined,
      targetCompanyUserId: outcome.companyUserId ?? undefined,
      resourceType: 'employee',
      resourceId: employeeId,
      oldValues: {
        employee_no: outcome.employee.employee_no,
        first_name: outcome.employee.first_name,
        last_name: outcome.employee.last_name,
        employment_status: outcome.employee.employment_status,
      },
      newValues: null,
      context,
      metadata: {
        action: 'onboarding_employee_permanently_deleted',
        company_user_removed: outcome.companyUserRemoved,
        user_account_removed: outcome.userRemoved,
        files_removed: filesRemoved,
      },
    });

    return {
      message: 'Onboarding employee permanently deleted',
      employee_id: employeeId,
      company_user_removed: outcome.companyUserRemoved,
      user_account_removed: outcome.userRemoved,
      files_removed: filesRemoved,
    };
  }

  private async assertNoBlockers(
    manager: EntityManager,
    employeeId: number,
  ): Promise<void> {
    const groups: Array<[string, Reference[]]> = [
      ['This employee is still referenced as', SUPERVISING_REFERENCES],
      ['This employee already has', OPERATIONAL_HISTORY],
      ['Remove physical access first. This employee has', DEVICE_ACCESS],
    ];
    for (const [prefix, refs] of groups) {
      const found: string[] = [];
      for (const ref of refs) {
        if (await this.hasRows(manager, ref, employeeId)) found.push(ref.label);
      }
      if (found.length) {
        const hint =
          refs === DEVICE_ACCESS ? '' : ' Archive the employee instead.';
        throw new ConflictException(`${prefix}: ${found.join(', ')}.${hint}`);
      }
    }
  }

  private async tableExists(
    manager: EntityManager,
    table: string,
  ): Promise<boolean> {
    const [row]: Array<{ exists: boolean }> = await manager.query(
      `SELECT to_regclass($1) IS NOT NULL AS "exists"`,
      [`public.${table}`],
    );
    return Boolean(row?.exists);
  }

  private async hasRows(
    manager: EntityManager,
    ref: Reference,
    employeeId: number,
  ): Promise<boolean> {
    if (!(await this.tableExists(manager, ref.table))) return false;
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM "${ref.table}" WHERE "${ref.column}" = $1 LIMIT 1`,
      [employeeId],
    );
    return rows.length > 0;
  }

  private async deleteWhere(
    manager: EntityManager,
    ref: Reference,
    employeeId: number,
  ): Promise<void> {
    if (!(await this.tableExists(manager, ref.table))) return;
    await manager.query(
      `DELETE FROM "${ref.table}" WHERE "${ref.column}" = $1`,
      [employeeId],
    );
  }

  private async onboardingRequestIds(
    manager: EntityManager,
    employeeId: number,
  ): Promise<number[]> {
    if (!(await this.tableExists(manager, 'onboarding_requests'))) return [];
    const rows: Array<{ id: number }> = await manager.query(
      'SELECT "id" FROM "onboarding_requests" WHERE "employee_id" = $1',
      [employeeId],
    );
    return rows.map((row) => row.id);
  }

  private async documentScope(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
  ): Promise<{ where: string; params: unknown[] }> {
    const onboardingIds = await this.onboardingRequestIds(manager, employeeId);
    return {
      where: `"company_id" = $1 AND (
        ("entity_type" = 'EMPLOYEE' AND "entity_id" = $2)
        OR ("entity_type" = 'ONBOARDING' AND "entity_id" = ANY($3::int[]))
        OR "id" IN (SELECT "document_id" FROM "employment_contracts"
                    WHERE "employee_id" = $2 AND "document_id" IS NOT NULL)
      )`,
      params: [companyId, employeeId, onboardingIds],
    };
  }

  private async collectFilePaths(
    manager: EntityManager,
    employee: Employee,
  ): Promise<string[]> {
    const paths = new Set<string>();
    if (employee.profile_photo_url) paths.add(employee.profile_photo_url);

    const employeeDocs: Array<{ file_url: string | null }> =
      await manager.query(
        'SELECT "file_url" FROM "employee_documents" WHERE "employee_id" = $1',
        [employee.id],
      );
    employeeDocs.forEach((doc) => doc.file_url && paths.add(doc.file_url));

    if (await this.tableExists(manager, 'documents')) {
      const scope = await this.documentScope(
        manager,
        employee.company_id,
        employee.id,
      );
      const docs: Array<{ file_path: string | null }> = await manager.query(
        `SELECT "file_path" FROM "documents" WHERE ${scope.where}`,
        scope.params,
      );
      docs.forEach((doc) => doc.file_path && paths.add(doc.file_path));
    }
    return [...paths];
  }

  private async deleteDocuments(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
  ): Promise<void> {
    if (!(await this.tableExists(manager, 'documents'))) return;
    const scope = await this.documentScope(manager, companyId, employeeId);
    const docs: Array<{ id: number }> = await manager.query(
      `SELECT "id" FROM "documents" WHERE ${scope.where}`,
      scope.params,
    );
    if (!docs.length) return;
    // Contracts point at documents, so detach them before the documents go.
    await manager.query(
      'UPDATE "employment_contracts" SET "document_id" = NULL WHERE "employee_id" = $1',
      [employeeId],
    );
    await manager.query('DELETE FROM "documents" WHERE "id" = ANY($1::int[])', [
      docs.map((doc) => doc.id),
    ]);
  }

  // Free the invitation and the candidate so HR can invite the person again.
  private async releaseInvitation(
    manager: EntityManager,
    companyId: number,
    employeeId: number,
  ): Promise<void> {
    const invitations: Array<{ id: number }> = await manager
      .query(
        `UPDATE "employee_invitations"
          SET "status" = 'cancelled', "accepted_employee_id" = NULL,
              "source_candidate_id" = NULL, "updated_at" = now()
        WHERE "company_id" = $1 AND "accepted_employee_id" = $2
        RETURNING "id"`,
        [companyId, employeeId],
      )
      .then((result: unknown) =>
        Array.isArray(result) && Array.isArray(result[0])
          ? (result[0] as Array<{ id: number }>)
          : ((result as Array<{ id: number }>) ?? []),
      );
    const ids = invitations.map((row) => row.id);
    if (!ids.length) return;
    await manager.query(
      `UPDATE "recruitment_candidates"
          SET "status" = 'OFFER_ACCEPTED', "invitation_id" = NULL, "updated_at" = now()
        WHERE "company_id" = $1 AND "status" = 'HIRED' AND "invitation_id" = ANY($2::int[])`,
      [companyId, ids],
    );
  }

  /**
   * Removes this company's membership. The login itself is only deleted when
   * it belongs to no other company and is an ordinary company user. If some
   * audit row still blocks a delete, we fall back to keeping the row but
   * inactive, inside a savepoint so the outer transaction survives.
   */
  private async removeAccount(
    manager: EntityManager,
    companyUserId: number | null,
  ): Promise<{
    userId: number | null;
    companyUserRemoved: boolean;
    userRemoved: boolean;
  }> {
    if (!companyUserId) {
      return { userId: null, companyUserRemoved: false, userRemoved: false };
    }
    const [membership]: Array<{ user_id: number }> = await manager.query(
      'SELECT "user_id" FROM "company_users" WHERE "id" = $1',
      [companyUserId],
    );
    if (!membership) {
      return { userId: null, companyUserRemoved: false, userRemoved: false };
    }
    const userId = membership.user_id;

    const companyUserRemoved = await this.tryDelete(
      manager,
      'DELETE FROM "company_users" WHERE "id" = $1',
      [companyUserId],
    );
    if (!companyUserRemoved) {
      await manager.query(
        `UPDATE "company_users" SET "status" = 'inactive' WHERE "id" = $1`,
        [companyUserId],
      );
      return { userId, companyUserRemoved, userRemoved: false };
    }

    const [{ count }]: Array<{ count: string }> = await manager.query(
      'SELECT COUNT(*) AS "count" FROM "company_users" WHERE "user_id" = $1',
      [userId],
    );
    const [user]: Array<{ user_type: string }> = await manager.query(
      'SELECT "user_type" FROM "users" WHERE "id" = $1',
      [userId],
    );
    if (Number(count) > 0 || user?.user_type !== 'COMPANY_USER') {
      return { userId, companyUserRemoved, userRemoved: false };
    }
    const userRemoved = await this.tryDelete(
      manager,
      'DELETE FROM "users" WHERE "id" = $1',
      [userId],
    );
    return { userId, companyUserRemoved, userRemoved };
  }

  private async tryDelete(
    manager: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<boolean> {
    await manager.query('SAVEPOINT permanent_delete_account');
    try {
      await manager.query(sql, params);
      await manager.query('RELEASE SAVEPOINT permanent_delete_account');
      return true;
    } catch (error) {
      if ((error as { code?: string })?.code !== '23503') throw error;
      await manager.query('ROLLBACK TO SAVEPOINT permanent_delete_account');
      return false;
    }
  }
}
