import { DataSource } from 'typeorm';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import {
  FieldOpportunity,
  FieldVisit,
  FieldVisitCommercialPolicy,
} from '../../modules/hr/work-activities/entities/field-visit.entities';
import {
  FieldOpportunityStatusEnum,
  FieldOpportunityTypeEnum,
  FieldVisitStatusEnum,
  FieldVisitTypeEnum,
} from '../../modules/hr/work-activities/enums/work-activity.enums';

type DemoSeedOptions = {
  companyId: number;
  employeeId: number;
  visitDate?: string;
};

/**
 * Creates one clearly labelled internal HRMS demo visit and opportunity for an
 * existing company employee. Never creates companies, users, customers, or CRM data.
 */
export async function seedFieldVisitUatDemo(
  dataSource: DataSource,
  options: DemoSeedOptions,
) {
  const employeeRepository = dataSource.getRepository(Employee);
  const visitRepository = dataSource.getRepository(FieldVisit);
  const opportunityRepository = dataSource.getRepository(FieldOpportunity);
  const policyRepository = dataSource.getRepository(FieldVisitCommercialPolicy);

  const employee = await employeeRepository.findOne({
    where: { id: options.employeeId, company_id: options.companyId },
  });
  if (!employee) {
    throw new Error(
      `Employee ${options.employeeId} was not found in company ${options.companyId}.`,
    );
  }
  if (!employee.company_user_id) {
    throw new Error(
      `Employee ${options.employeeId} has no linked company account; use an employee with an active HRMS login for acceptance testing.`,
    );
  }
  if (!employee.reports_to) {
    throw new Error(
      `Employee ${options.employeeId} has no manager assigned; set reports_to before seeding manager review data.`,
    );
  }

  const policy = await policyRepository.findOne({
    where: { companyId: options.companyId },
  });
  if (!policy) {
    throw new Error(
      `Company ${options.companyId} has no Field Visit commercial policy; apply migrations first.`,
    );
  }
  if (!policy.supportedCurrencies.includes(policy.defaultCurrency)) {
    throw new Error(
      `Company ${options.companyId} default currency is not in its supported currency list. Configure policy before seeding.`,
    );
  }

  const visitNo = `FV-UAT-${options.companyId}-${employee.id}`;
  let visit = await visitRepository.findOne({
    where: { companyId: options.companyId, visitNo },
  });
  if (!visit) {
    const manager = employee.reports_to
      ? await employeeRepository.findOne({
          where: {
            id: employee.reports_to,
            company_id: options.companyId,
          },
        })
      : null;
    if (!manager?.company_user_id) {
      throw new Error(
        `Employee ${options.employeeId}'s assigned manager has no linked company account.`,
      );
    }

    visit = await visitRepository.save(
      visitRepository.create({
        companyId: options.companyId,
        employeeId: employee.id,
        visitPlanId: null,
        visitPlanItemId: null,
        businessTripId: null,
        fieldPartyId: null,
        visitNo,
        visitDate: options.visitDate ?? new Date().toISOString().slice(0, 10),
        visitType: FieldVisitTypeEnum.OTHER,
        status: FieldVisitStatusEnum.PLANNED,
        isUnplanned: true,
        unplannedReason: 'UAT demo data; internal HRMS test only.',
        purpose:
          'HRMS UAT demo visit for employee and manager acceptance checks.',
        discussionNotes: null,
        outcome: null,
        followUpRequired: false,
        nextFollowUpDate: null,
        checkInAt: null,
        checkOutAt: null,
        durationMinutes: null,
        managerEmployeeId: manager?.id ?? null,
        managerCompanyUserId: manager.company_user_id,
        managerReviewStatus: 'REQUIRED',
        managerComments: null,
        managerReviewedAt: null,
        linkedDailyActivityEntryId: null,
        employeeSnapshot: {
          employee_id: employee.id,
          employee_no: employee.employee_no,
          full_name: [
            employee.first_name,
            employee.middle_name,
            employee.last_name,
          ]
            .filter(Boolean)
            .join(' '),
          branch_id: employee.primary_branch_id,
          department_id: employee.primary_department_id,
          position_id: employee.primary_position_id,
          grade_id: employee.grade_id,
          employment_type: employee.employment_type,
        },
        partySnapshot: null,
        policySnapshot: {
          field_visit_plan_required: false,
          allow_unplanned_visits: true,
          require_visit_selfie: false,
          require_device_binding: true,
          require_gps: true,
          maximum_accuracy_meters: 100,
          demo_data: true,
        },
        clientRequestId: null,
      }),
    );
  }

  let opportunity = await opportunityRepository.findOne({
    where: {
      companyId: options.companyId,
      fieldVisitId: visit.id,
      title: 'HRMS UAT demo opportunity',
    },
  });
  if (!opportunity) {
    opportunity = await opportunityRepository.save(
      opportunityRepository.create({
        companyId: options.companyId,
        fieldVisitId: visit.id,
        employeeId: employee.id,
        fieldPartyId: null,
        opportunityType: FieldOpportunityTypeEnum.OTHER,
        title: 'HRMS UAT demo opportunity',
        description:
          'Synthetic internal test record. Contains no customer or CRM data.',
        potentialValue: '1000.00',
        currency: policy.defaultCurrency,
        premiumValue: null,
        premiumCurrency: null,
        expectedCloseDate: null,
        actualValue: null,
        status: FieldOpportunityStatusEnum.IDENTIFIED,
        sourceSystem: 'HRMS_UAT_DEMO',
        externalReference: null,
        clientRequestId: null,
        validatedByManager: false,
        validatedAt: null,
      }),
    );
  }

  return {
    companyId: options.companyId,
    employeeId: employee.id,
    visitId: visit.id,
    visitNo: visit.visitNo,
    opportunityId: opportunity.id,
    currency: policy.defaultCurrency,
  };
}
