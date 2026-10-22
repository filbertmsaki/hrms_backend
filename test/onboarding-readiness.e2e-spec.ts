process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import { INestApplication } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { EmployeeBankAccount } from '../src/modules/hr/employees/entities/employee-bank-account.entity';
import { Position } from '../src/modules/hr/positions/entities/position.entity';
import { EmployeePayrollProfile } from '../src/modules/hr/payroll/entities/employee-payroll-profile.entity';
import { EmployeePayrollProfileService } from '../src/modules/hr/payroll/services/payroll-core.services';
import {
  EmployeeCompensationVersion,
  EmployeeCompensationVersionStatusEnum,
} from '../src/modules/hr/employee-movements/entities/employee-compensation-version.entity';
import {
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
} from '../src/modules/hr/contracts/entities/employment-contract.entity';
import { OnboardingRequest } from '../src/modules/hr/onboarding/entities/onboarding-request.entity';
import { OnboardingTask } from '../src/modules/hr/onboarding/entities/onboarding-task.entity';
import { OnboardingRequestStatusEnum } from '../src/modules/hr/onboarding/enums/onboarding-request-status.enum';
import { OnboardingTaskStatusEnum } from '../src/modules/hr/onboarding/enums/onboarding-task-status.enum';
import { OnboardingService } from '../src/modules/hr/onboarding/onboarding.service';
import { OnboardingWorkspaceService } from '../src/modules/hr/onboarding/services/onboarding-workspace.service';
import { randomUUID } from 'crypto';
import { OnboardingTaskCompletedEvent } from '../src/modules/hr/notifications/events';
import { ProbationService } from '../src/modules/hr/probation/probation.service';
import { createE2eApp } from './helpers/create-e2e-app';

describe('Onboarding readiness and activation (real PostgreSQL)', () => {
  let app: INestApplication;
  let source: DataSource;
  let service: OnboardingService;
  let actor: AuthenticatedUser;
  let employee: Employee;
  let onboarding: OnboardingRequest;
  let bank: EmployeeBankAccount;
  let contract: EmploymentContract;
  let companyId: number;
  let userId: number;
  let reviewerIds: number[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    source = app.get(DataSource);
    service = app.get(OnboardingService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(async () => {
    reviewerIds = [];
    jest
      .spyOn(service as any, 'emitOnboardingCompleted')
      .mockResolvedValue(undefined);
    jest.spyOn(app.get(EventEmitter2), 'emit').mockReturnValue(false);
    jest.spyOn(app.get(EventEmitter2), 'emitAsync').mockResolvedValue([]);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const company = await source.getRepository(Company).save({
      name: `Onboarding E2E ${suffix}`,
      slug: `onboarding-e2e-${suffix}`,
      status: 'active',
    });
    companyId = company.id;
    const user = await source.getRepository(User).save({
      user_no: `OB-${suffix}`.slice(0, 20),
      first_name: 'Test',
      last_name: 'HR',
      email: `onboarding-${suffix}@example.test`,
      phone: `+255${Date.now()}`.slice(0, 20),
      password: 'not-a-login-hash',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
    });
    userId = user.id;
    const member = await source.getRepository(CompanyUser).save({
      company_id: companyId,
      user_id: userId,
      status: 'active',
      is_default: true,
    });
    const position = await source
      .getRepository(Position)
      .save({ company_id: companyId, name: 'Test analyst' });
    const manager = await source.getRepository(Employee).save({
      company_id: companyId,
      employee_no: 'MANAGER',
      first_name: 'Test',
      last_name: 'Manager',
      gender: 'female',
    });
    employee = await source.getRepository(Employee).save({
      company_id: companyId,
      company_user_id: member.id,
      employee_no: 'JOINER',
      first_name: 'Amina',
      last_name: 'Test',
      gender: 'female',
      hire_date: '2026-01-01',
      primary_position_id: position.id,
      reports_to: manager.id,
    });
    actor = {
      id: userId,
      email: user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId,
      companyMembershipId: member.id,
      roles: ['HR'],
      permissions: [
        'data_scope:company',
        'onboarding_requests:read',
        'onboarding_requests:update',
        'onboarding_requests:complete',
        'onboarding_tasks:complete',
      ],
    };
    onboarding = await source.getRepository(OnboardingRequest).save({
      company_id: companyId,
      employee_id: employee.id,
      onboarding_no: 'TEST-ONB-1',
      title: 'Onboarding readiness test',
      status: OnboardingRequestStatusEnum.IN_PROGRESS,
      created_by_company_user_id: member.id,
    });
    await source.getRepository(OnboardingTask).save({
      onboarding_request_id: onboarding.id,
      title: 'Provide laptop',
      status: OnboardingTaskStatusEnum.COMPLETED,
      is_required: true,
    });
    bank = await source.getRepository(EmployeeBankAccount).save({
      employee_id: employee.id,
      account_number: 'TEST-ACCOUNT',
      verification_status: 'PENDING',
    });
    await source.getRepository(EmployeePayrollProfile).save({
      companyId,
      employeeId: employee.id,
      payrollNumber: 'TEST-PAYROLL',
      effectiveFrom: '2026-01-01',
      taxpayerIdentificationNumber: '123456789',
      socialSecuritySchemeCode: 'NSSF',
      socialSecurityNumber: 'TEST-PENSION',
      healthInsuranceSchemeCode: 'NHIF',
      healthInsuranceNumber: 'TEST-HEALTH',
      primaryBankAccountId: bank.id,
    });
    await source.getRepository(EmployeeCompensationVersion).save({
      companyId,
      employeeId: employee.id,
      baseSalary: '1000000.00',
      currency: 'TZS',
      effectiveFrom: '2026-01-01',
      status: EmployeeCompensationVersionStatusEnum.ACTIVE,
      createdByCompanyUserId: member.id,
      approvedByCompanyUserId: null,
    });
    contract = await source.getRepository(EmploymentContract).save({
      companyId,
      employeeId: employee.id,
      version: 1,
      contractType: EmploymentContractType.UNSPECIFIED,
      startDate: '2026-01-01',
      particulars: {},
      status: EmploymentContractStatus.ISSUED,
      issuedByCompanyUserId: member.id,
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    if (companyId)
      await source.getRepository(EmploymentContract).delete({ companyId });
    if (companyId) await source.getRepository(Company).delete(companyId);
    if (userId) await source.getRepository(User).delete(userId);
    for (const reviewerId of reviewerIds)
      await source.getRepository(User).delete(reviewerId);
  });

  async function makeReady() {
    const reviewer = await source.getRepository(User).save({
      user_no: `REV-${companyId}`,
      first_name: 'Independent',
      last_name: 'Reviewer',
      email: `reviewer-${companyId}@example.test`,
      phone: `+25588${companyId}`,
      password: 'not-a-login-hash',
      status: 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
    });
    reviewerIds.push(reviewer.id);
    const membership = await source.getRepository(CompanyUser).save({
      company_id: companyId,
      user_id: reviewer.id,
      status: 'active',
      is_default: true,
    });
    await source
      .getRepository(EmployeeCompensationVersion)
      .update(
        { companyId, employeeId: employee.id },
        { approvedByCompanyUserId: membership.id },
      );
    await source
      .getRepository(EmployeeBankAccount)
      .update(bank.id, { verification_status: 'VERIFIED' });
    await source
      .getRepository(EmploymentContract)
      .update(contract.id, { status: EmploymentContractStatus.SIGNED });
    return reviewer.id;
  }

  it('keeps internal notes private, rejects cross-company reads and deduplicates retries', async () => {
    const workspace = app.get(OnboardingWorkspaceService);
    const internal = {
      requirement_id: 'bank account',
      visibility: 'internal' as const,
      body: 'Internal verification discussion',
      client_key: randomUUID(),
    };
    await workspace.addNote(companyId, onboarding.id, actor, internal);
    await workspace.addNote(companyId, onboarding.id, actor, internal);
    await workspace.addNote(companyId, onboarding.id, actor, {
      ...internal,
      client_key: randomUUID(),
      visibility: 'employee',
      body: 'Please upload a clearer statement',
    });
    expect(await workspace.notes(companyId, onboarding.id, actor)).toHaveLength(
      2,
    );
    const employeeNotes = await workspace.notes(
      companyId,
      onboarding.id,
      actor,
      true,
    );
    expect(employeeNotes).toHaveLength(1);
    expect(employeeNotes[0].body).toBe('Please upload a clearer statement');
    expect(
      await workspace.notes(companyId, onboarding.id, {
        ...actor,
        permissions: ['data_scope:company', 'onboarding_requests:read'],
      }),
    ).toHaveLength(1);
    await expect(
      workspace.notes(companyId + 100000, onboarding.id, actor),
    ).rejects.toThrow('not found');
    await expect(
      workspace.notes(
        companyId,
        onboarding.id,
        {
          ...actor,
          employeeId: employee.id + 10000,
          companyMembershipId: undefined,
        },
        true,
      ),
    ).rejects.toThrow('Only the employee');
    await expect(
      workspace.addNote(companyId, onboarding.id, actor, {
        ...internal,
        requirement_id: 'invented',
        client_key: randomUUID(),
      }),
    ).rejects.toThrow('Unknown');
  });

  it('tracks each reviewer visit without changing the request version', async () => {
    const workspace = app.get(OnboardingWorkspaceService);
    const before = await source
      .getRepository(OnboardingRequest)
      .findOneByOrFail({ id: onboarding.id });
    const first = await workspace.visit(companyId, onboarding.id, actor);
    const second = await workspace.visit(companyId, onboarding.id, actor);
    expect(first.previous_viewed_at).toBeNull();
    expect(second.previous_viewed_at?.toISOString()).toBe(
      first.viewed_at.toISOString(),
    );
    expect(
      (
        await source
          .getRepository(OnboardingRequest)
          .findOneByOrFail({ id: onboarding.id })
      ).version,
    ).toBe(before.version);
  });

  it('rejects stale and simultaneous review decisions without overwriting the winner', async () => {
    const current = await source
      .getRepository(OnboardingRequest)
      .findOneByOrFail({ id: onboarding.id });
    const decision = {
      expected_version: current.version,
      sections: [{ section_key: 'personal', status: 'approved' as const }],
    };
    const results = await Promise.allSettled([
      service.reviewEmployeeDetails(companyId, onboarding.id, decision, actor),
      service.reviewEmployeeDetails(companyId, onboarding.id, decision, actor),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    const saved = await source
      .getRepository(OnboardingRequest)
      .findOneByOrFail({ id: onboarding.id });
    expect(saved.version).toBe(current.version + 1);
    await expect(
      service.reviewEmployeeDetails(companyId, onboarding.id, decision, actor),
    ).rejects.toThrow('changed');
  });

  it('keeps completed checklists blocked until bank, salary and contract prerequisites pass', async () => {
    const readiness = await service.getActivationReadiness(
      companyId,
      onboarding.id,
      actor,
    );
    expect(readiness.ready_to_activate).toBe(false);
    expect(
      readiness.requirements
        .filter((item) => item.status === 'pending')
        .map((item) => item.id),
    ).toEqual(
      expect.arrayContaining([
        'bank account',
        'independently approved starting salary',
        'signed employment contract',
      ]),
    );
    await expect(
      service.completeOnboarding(companyId, onboarding.id, actor),
    ).rejects.toThrow('not ready for activation');
    expect(
      (
        await source
          .getRepository(Employee)
          .findOneByOrFail({ id: employee.id })
      ).employment_status,
    ).toBe('onboarding');
    await makeReady();
    expect(
      (await service.getActivationReadiness(companyId, onboarding.id, actor))
        .ready_to_activate,
    ).toBe(true);
    const overview = await service.getOverview(companyId, 0, actor);
    expect(overview.data).toEqual([
      expect.objectContaining({
        id: onboarding.id,
        stage: 'Ready for activation',
      }),
    ]);
    const probation = jest.spyOn(
      app.get(ProbationService),
      'ensureCaseForEmployee',
    );
    const results = await Promise.all([
      service.completeOnboarding(companyId, onboarding.id, actor),
      service.completeOnboarding(companyId, onboarding.id, actor),
    ]);
    expect(results.map((result) => result.message).sort()).toEqual([
      'Onboarding already completed',
      'Onboarding completed successfully',
    ]);
    expect(probation).toHaveBeenCalledTimes(1);
    expect(
      (
        await source
          .getRepository(Employee)
          .findOneByOrFail({ id: employee.id })
      ).employment_status,
    ).toBe('active');
    expect((await service.getOverview(companyId, 0, actor)).data).toEqual([]);
  });

  it('rolls back employee/request changes if a transactional activation step fails, then allows retry', async () => {
    await makeReady();
    const probation = jest
      .spyOn(app.get(ProbationService), 'ensureCaseForEmployee')
      .mockRejectedValueOnce(new Error('Temporary probation failure'));
    await expect(
      service.completeOnboarding(companyId, onboarding.id, actor),
    ).rejects.toThrow('Temporary probation failure');
    expect(
      (
        await source
          .getRepository(Employee)
          .findOneByOrFail({ id: employee.id })
      ).employment_status,
    ).toBe('onboarding');
    expect(
      (
        await source
          .getRepository(OnboardingRequest)
          .findOneByOrFail({ id: onboarding.id })
      ).status,
    ).toBe('in_progress');
    probation.mockRestore();
    await service.completeOnboarding(companyId, onboarding.id, actor);
    expect(
      (
        await source
          .getRepository(Employee)
          .findOneByOrFail({ id: employee.id })
      ).employment_status,
    ).toBe('active');
  });

  it('saves the last assigned task but leaves activation to authorized HR', async () => {
    await makeReady();
    const tasks = source.getRepository(OnboardingTask);
    const task = await tasks.findOneByOrFail({
      onboarding_request_id: onboarding.id,
    });
    await tasks.update(task.id, {
      status: OnboardingTaskStatusEnum.PENDING,
      assigned_company_user_id: actor.companyMembershipId,
    });
    const worker = { ...actor, permissions: ['onboarding_tasks:complete'] };
    const result = await service.completeTask(
      companyId,
      onboarding.id,
      task.id,
      {},
      worker,
    );
    expect(result.activation.status).toBe('hr_review_required');
    expect((await tasks.findOneByOrFail({ id: task.id })).status).toBe(
      'completed',
    );
    expect(
      (
        await source
          .getRepository(Employee)
          .findOneByOrFail({ id: employee.id })
      ).employment_status,
    ).toBe('onboarding');
    expect(
      (await service.getActivationReadiness(companyId, onboarding.id, actor))
        .ready_to_activate,
    ).toBe(true);
    expect(app.get(EventEmitter2).emitAsync).toHaveBeenCalledWith(
      OnboardingTaskCompletedEvent.EVENT,
      expect.objectContaining({ taskId: task.id, employeeName: 'Amina Test' }),
    );
    await service.completeOnboarding(companyId, onboarding.id, actor);
    expect(
      (
        await source
          .getRepository(Employee)
          .findOneByOrFail({ id: employee.id })
      ).employment_status,
    ).toBe('active');
  });

  it('preserves private payroll identifiers and rejects stale profile saves', async () => {
    const profiles = source.getRepository(EmployeePayrollProfile);
    const original = await profiles.findOneByOrFail({
      companyId,
      employeeId: employee.id,
    });
    const payroll = app.get(EmployeePayrollProfileService);
    const update = {
      employee_id: employee.id,
      payroll_number: original.payrollNumber,
      effective_from: original.effectiveFrom,
      expected_version: original.version,
      preserve_existing_identifiers: true,
      payroll_hold: true,
      payroll_hold_reason: 'Awaiting verification',
      social_security_scheme_code: 'NSSF',
      health_insurance_scheme_code: 'NHIF',
      primary_bank_account_id: bank.id,
    };
    await payroll.upsert(actor, update);
    const saved = await profiles.findOneByOrFail({ id: original.id });
    expect(saved.taxpayerIdentificationNumber).toBe(
      original.taxpayerIdentificationNumber,
    );
    expect(saved.socialSecurityNumber).toBe(original.socialSecurityNumber);
    expect(saved.healthInsuranceNumber).toBe(original.healthInsuranceNumber);
    expect(saved.payrollHold).toBe(true);
    expect(saved.version).toBeGreaterThan(original.version);
    await expect(
      payroll.upsert(actor, { ...update, payroll_hold: false }),
    ).rejects.toThrow('changed');
    expect(
      (await profiles.findOneByOrFail({ id: original.id })).payrollHold,
    ).toBe(true);
  });

  it('does not expose another company request or readiness', async () => {
    await expect(
      service.getActivationReadiness(companyId + 100000, onboarding.id, {
        ...actor,
        companyId: companyId + 100000,
      }),
    ).rejects.toThrow();
    expect(
      (
        await service.getOverview(companyId + 100000, 0, {
          ...actor,
          companyId: companyId + 100000,
        })
      ).data,
    ).toEqual([]);
  });
});
