import { MigrationInterface, QueryRunner } from 'typeorm';

const REPORT_CODES = [
  'EMPLOYEE_MASTER',
  'NEW_JOINERS',
  'CONFIRMATION_DUE',
  'PROBATION',
  'TRANSFERS',
  'PROMOTIONS',
  'RESIGNATIONS',
  'EXITS',
  'EMPLOYEE_DOCUMENTS',
  'LEAVE_BALANCE',
  'LEAVE_PENDING_APPROVAL',
  'PAYROLL_REGISTER',
  'BANK_TRANSFER',
  'LOAN_OUTSTANDING',
  'FIELD_VISIT_MAP',
  'KPI_ASSIGNMENTS',
  'KPI_TARGET_VS_ACHIEVEMENT',
  'MONTHLY_KPI_SCORE',
  'QUARTERLY_KPI_AVERAGE',
  'ANNUAL_KPI_AVERAGE',
  'KPI_SCORE_HISTORY',
  'ATTENDANCE_EXCEPTIONS',
  'ATTENDANCE_CORRECTIONS',
];

export class SeedOperationalScheduledReportDefinitions1790500000000
  implements MigrationInterface
{
  name = 'SeedOperationalScheduledReportDefinitions1790500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "report_definitions"
        ("report_code", "name", "description", "supported_filters", "supported_formats", "generator_service", "is_active")
      VALUES
        ('EMPLOYEE_MASTER', 'Employee Master Report', 'Operational employee master data report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('NEW_JOINERS', 'New Joiner Report', 'Operational new joiner report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('CONFIRMATION_DUE', 'Confirmation Due Report', 'Operational confirmation due report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('PROBATION', 'Probation Report', 'Operational probation report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('TRANSFERS', 'Transfer Report', 'Operational transfer report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('PROMOTIONS', 'Promotion Report', 'Operational promotion report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('RESIGNATIONS', 'Resignation Report', 'Operational resignation report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('EXITS', 'Exit Report', 'Operational exit report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('EMPLOYEE_DOCUMENTS', 'Employee Document Report', 'Operational employee document report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('LEAVE_BALANCE', 'Leave Balance Report', 'Operational leave balance report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('LEAVE_PENDING_APPROVAL', 'Leave Pending Approval Report', 'Operational leave pending approval report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('PAYROLL_REGISTER', 'Payroll Register', 'Operational locked payroll register.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('BANK_TRANSFER', 'Bank Transfer Report', 'Operational bank transfer report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('LOAN_OUTSTANDING', 'Loan Outstanding Report', 'Operational loan outstanding report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('FIELD_VISIT_MAP', 'Map-Based Movement / Visit Report', 'Operational field visit map report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('KPI_ASSIGNMENTS', 'Employee KPI Assignment Report', 'Operational KPI assignment report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('KPI_TARGET_VS_ACHIEVEMENT', 'Monthly KPI Target vs Achievement', 'Operational KPI target versus achievement report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('MONTHLY_KPI_SCORE', 'Monthly KPI Score', 'Operational monthly KPI score report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('QUARTERLY_KPI_AVERAGE', 'Quarterly KPI Average', 'Operational quarterly KPI average report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('ANNUAL_KPI_AVERAGE', 'Annual KPI Average', 'Operational annual KPI average report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('KPI_SCORE_HISTORY', 'KPI Score History', 'Operational KPI score history report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('ATTENDANCE_EXCEPTIONS', 'Attendance Exception Report', 'Operational attendance exception report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true),
        ('ATTENDANCE_CORRECTIONS', 'Attendance Correction Report', 'Operational attendance correction report.', '{"fields":["company_id","branch_id","department_id","employee_id","employment_status","status","approval_status","payroll_period_id","payroll_run_id","month","quarter","year","date_from","date_to"]}'::jsonb, ARRAY['PDF','XLSX','CSV']::report_output_format_enum[], 'OperationalAnalyticsReportRunner', true)
      ON CONFLICT (report_code) DO UPDATE SET
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "supported_filters" = EXCLUDED."supported_filters",
        "supported_formats" = EXCLUDED."supported_formats",
        "generator_service" = EXCLUDED."generator_service",
        "is_active" = true,
        "updated_at" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "report_definitions" WHERE "report_code" = ANY($1::text[])`,
      [REPORT_CODES],
    );
  }
}
