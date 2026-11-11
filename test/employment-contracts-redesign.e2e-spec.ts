process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { Position } from '../src/modules/hr/positions/entities/position.entity';
import { Department } from '../src/modules/hr/departments/entities/department.entity';
import { EmployeeAddress } from '../src/modules/hr/employees/entities/employee-address.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { ProbationPolicy } from '../src/modules/hr/probation/entities/probation-policy.entity';
import { SecurityEvent } from '../src/modules/security/entities/security-event.entity';
import { EmploymentContractsService } from '../src/modules/hr/contracts/employment-contracts.service';
import {
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
} from '../src/modules/hr/contracts/entities/employment-contract.entity';
import { ContractNotifierService } from '../src/modules/hr/contracts/contract-notifier.service';
import { ContractSettingsService } from '../src/modules/hr/contracts/contract-settings.service';
import { ContractSignatoriesService } from '../src/modules/hr/contracts/contract-signatories.service';
import { ContractSigningService } from '../src/modules/hr/contracts/contract-signing.service';
import { ContractTemplatesService } from '../src/modules/hr/contracts/contract-templates.service';
import { sha256Json } from '../src/modules/hr/contracts/contract-live-values';
import { createE2eApp } from './helpers/create-e2e-app';

/**
 * Contract redesign, step A (real Postgres): frozen snapshot and certificate,
 * field-level draft audit, live drafts with reasons for overrides, D3
 * probation rule, unsaved preview, clause flags.
 */
describe('Employment contract redesign, step A (e2e, real Postgres)', () => {
  let app: INestApplication;
  let source: DataSource;
  let service: EmploymentContractsService;
  let signing: ContractSigningService;
  let companyId: number;
  let hr: AuthenticatedUser;
  let self: AuthenticatedUser;
  let employee: Employee;
  let signatoryEmployee: Employee;
  let codes: string[];

  beforeAll(async () => {
    app = await createE2eApp();
    source = app.get(DataSource);
    service = app.get(EmploymentContractsService);
    signing = app.get(ContractSigningService);
  });
  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    codes = [];
    jest
      .spyOn(app.get(ContractNotifierService), 'sendEmail')
      .mockImplementation((_to, notice) => {
        if (notice.code) codes.push(notice.code);
        return Promise.resolve();
      });
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    companyId = (
      await source.getRepository(Company).save({
        name: `Contracts Redesign ${suffix}`,
        slug: `contracts-redesign-${suffix}`,
        status: 'active',
      })
    ).id;
    const makeUser = async (tag: string) => {
      const user = await source.getRepository(User).save({
        user_no: `ECR-${companyId}-${tag}`,
        first_name: 'Test',
        last_name: tag,
        email: `contracts-redesign-${tag}-${suffix}@example.test`,
        phone: `+2558${companyId}${tag === 'hr' ? 1 : 2}`,
        password: 'not-a-login-hash',
        status: 'active',
        user_type: 'COMPANY_USER',
        is_email_verified: true,
      });
      const member = await source.getRepository(CompanyUser).save({
        company_id: companyId,
        user_id: user.id,
        status: 'active',
        is_default: true,
      });
      return { user, member };
    };
    const hrUser = await makeUser('hr');
    const staffUser = await makeUser('staff');
    const position = await source
      .getRepository(Position)
      .save({ company_id: companyId, name: 'Claims analyst' });
    const manager = await source.getRepository(Employee).save({
      company_id: companyId,
      employee_no: `MGR-${suffix}`.slice(0, 50),
      first_name: 'Neema',
      last_name: 'Manager',
      gender: 'female',
    });
    signatoryEmployee = await source.getRepository(Employee).save({
      company_id: companyId,
      company_user_id: hrUser.member.id,
      employee_no: `SIG-${suffix}`.slice(0, 50),
      first_name: 'Juma',
      last_name: 'Director',
      gender: 'male',
      employment_status: EmploymentStatusEnum.ACTIVE,
    });
    employee = await source.getRepository(Employee).save({
      company_id: companyId,
      company_user_id: staffUser.member.id,
      employee_no: `EMP-${suffix}`.slice(0, 50),
      first_name: 'Amina',
      last_name: 'Contract',
      gender: 'female',
      date_of_birth: '1995-05-20',
      hire_date: '2026-01-01',
      primary_position_id: position.id,
      reports_to: manager.id,
      employment_status: EmploymentStatusEnum.ONBOARDING,
    });
    await source.getRepository(EmployeeAddress).save({
      employee_id: employee.id,
      address_line_1: 'Mikocheni',
      city: 'Dar es Salaam',
      country: 'Tanzania',
      is_primary: true,
    } as never);
    hr = {
      id: hrUser.user.id,
      email: hrUser.user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId,
      companyMembershipId: hrUser.member.id,
      employeeId: signatoryEmployee.id,
      roles: ['HR'],
      permissions: [
        'data_scope:company',
        'employment_contracts:read',
        'employment_contracts:manage',
        'contract_signatories:manage',
        'payroll:profiles:read',
      ],
    } as AuthenticatedUser;
    self = {
      id: staffUser.user.id,
      email: staffUser.user.email,
      scope: 'company',
      userType: 'COMPANY_USER',
      companyId,
      companyMembershipId: staffUser.member.id,
      employeeId: employee.id,
      roles: ['EMPLOYEE'],
      permissions: ['data_scope:self', 'employment_contracts:self'],
    } as AuthenticatedUser;

    const settings = app.get(ContractSettingsService);
    await settings.updateLegal(hr, {
      legal_name: 'Alliance Test Ltd',
      address: 'Plot 1, Dar es Salaam',
      registration_number: 'REG-1',
      tin: '123-456-789',
    });
    const signatory = await app.get(ContractSignatoriesService).create(hr, {
      employee_id: signatoryEmployee.id,
      job_title: 'Managing Director',
    });
    await settings.updateContractSettings(hr, {
      default_signatory_id: signatory.id,
    });
  });
  afterEach(() => jest.restoreAllMocks());

  const contracts = () => source.getRepository(EmploymentContract);
  const useTemplate = (sections: Array<Record<string, unknown>>) =>
    app.get(ContractTemplatesService).upsert(hr, {
      contract_type: EmploymentContractType.UNSPECIFIED,
      title: 'Contract of Employment',
      sections: sections as never,
    });
  const signBoth = async (id: number) => {
    const company = await signing.challenge(hr, id);
    await signing.sign(hr, id, {
      document_sha256: company.document_sha256,
      signature: { kind: 'TYPED', text: 'Juma Director' },
      code: codes[codes.length - 1],
      consent: true,
    });
    const staff = await signing.challenge(self, id);
    return signing.sign(self, id, {
      document_sha256: staff.document_sha256,
      signature: { kind: 'TYPED', text: 'Amina Contract' },
      code: codes[codes.length - 1],
      consent: true,
    });
  };

  it('freezes every value at send and the certificate at signing; later record changes never reach either', async () => {
    await useTemplate([
      {
        id: 'parties',
        heading: 'Parties',
        body: '{{company_legal_name}} and {{employee_name}} as {{job_title}}.',
      },
    ]);
    const draft = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
    });
    const sent = await signing.send(hr, draft.id, {});
    const snapshot = sent.particulars.snapshot as Record<string, unknown>;
    expect(snapshot).toEqual(
      expect.objectContaining({
        company_name: 'Alliance Test Ltd',
        employee_name: 'Amina Contract',
        signatory_name: 'Juma Director',
        signatory_title: 'Managing Director',
      }),
    );
    expect(sent.particulars.snapshot_sha256).toBe(sha256Json(snapshot));

    // Names and company details change after the contract was sent.
    await source
      .getRepository(Employee)
      .update(employee.id, { first_name: 'Renamed' });
    await app.get(ContractSettingsService).updateLegal(hr, {
      legal_name: 'Renamed Holdings Ltd',
    });

    const fields = await signing.fields(hr, sent.id);
    expect(fields.find((row) => row.key === 'employee_name')).toEqual(
      expect.objectContaining({ value: 'Amina Contract', frozen: true }),
    );

    const completed = await signBoth(sent.id);
    expect(completed.status).toBe(EmploymentContractStatus.SIGNED);
    const certificate = completed.particulars.certificate as Record<
      string,
      unknown
    >;
    expect(certificate).toEqual(
      expect.objectContaining({
        company_name: 'Alliance Test Ltd',
        employee_name: 'Amina Contract',
        contract_version: completed.version,
        names_source: 'snapshot',
        final_document_sha256: completed.finalSha256,
      }),
    );
    // Each signer is recorded as they were at the moment they signed (from the
    // immutable signature row), so the renamed employee signs under the new
    // name while the contract parties stay as sent.
    expect(certificate.signatures).toEqual([
      expect.objectContaining({ party: 'COMPANY', name: 'Juma Director' }),
      expect.objectContaining({ party: 'EMPLOYEE', name: 'Renamed Contract' }),
    ]);
    expect(completed.particulars.certificate_sha256).toBe(
      sha256Json(certificate),
    );

    // Later changes never touch the stored certificate.
    await source
      .getRepository(Employee)
      .update(employee.id, { first_name: 'Changed again' });
    const reread = await contracts().findOneByOrFail({ id: completed.id });
    expect(reread.particulars.certificate).toEqual(certificate);
    expect(reread.particulars.certificate_sha256).toBe(
      sha256Json(reread.particulars.certificate),
    );

    // A renewal starts a new version without the old snapshot or certificate.
    const renewal = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2027-02-01',
      from_contract_id: completed.id,
    });
    expect(renewal.particulars.snapshot).toBeUndefined();
    expect(renewal.particulars.certificate).toBeUndefined();
  });

  it('audits every draft edit field by field (who, old, new, reason)', async () => {
    const draft = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
    });
    await service.updateDraft(hr, draft.id, {
      expected_updated_at: draft.updatedAt.toISOString(),
      hours_of_work: '08:00-17:00',
      field_overrides: { company_tin: '999-888-777' },
    } as never);
    const events = await source.getRepository(SecurityEvent).find({
      where: {
        resource_type: 'employment_contract',
        resource_id: String(draft.id),
      },
      order: { id: 'ASC' },
    });
    const actions = events.map(
      (event) => (event.metadata as Record<string, unknown>).action,
    );
    expect(actions).toEqual(['draft_create', 'draft_update']);
    const update = events[1];
    expect(update.actor_company_user_id).toBe(hr.companyMembershipId);
    expect(update.old_values).toEqual(
      expect.objectContaining({ hours_of_work: null }),
    );
    expect(update.new_values).toEqual(
      expect.objectContaining({
        hours_of_work: '08:00-17:00',
        'override.company_tin': '999-888-777',
      }),
    );
    expect((update.metadata as Record<string, unknown>).changed_fields).toEqual(
      expect.arrayContaining(['hours_of_work', 'override.company_tin']),
    );
  });

  it('step D: template clause flags hold on every draft; switched-off clauses are not rendered', async () => {
    await useTemplate([
      {
        id: 'parties',
        heading: 'Parties',
        body: 'Between {{company_legal_name}} and {{employee_name}}.',
      },
      {
        id: 'car',
        heading: 'Company car',
        body: 'A car is provided.',
        optional: true,
      },
      {
        id: 'bonus',
        heading: 'Bonus',
        body: 'Discretionary bonus.',
        optional: true,
        enabled: false,
      },
      {
        id: 'law',
        heading: 'Governing law',
        body: 'Tanzanian law applies.',
        editable: false,
      },
    ]);
    const draft = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
    });
    expect(
      draft.sections.map((s) => [s.id, s.optional, s.enabled ?? true]),
    ).toEqual([
      ['parties', false, true],
      ['car', true, true],
      ['bonus', true, false],
      ['law', false, true],
    ]);
    const save = (sections: unknown[], at: Date) =>
      service.updateDraft(hr, draft.id, {
        expected_updated_at: at.toISOString(),
        sections: sections as never,
      });
    const [parties, car, bonus, law] = draft.sections;

    // A required clause cannot be removed, switched off or (if locked) edited.
    await expect(
      save([car, bonus, law], draft.updatedAt),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      save([{ ...parties, enabled: false }, car, bonus, law], draft.updatedAt),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      save(
        [parties, car, bonus, { ...law, body: 'Other law.' }],
        draft.updatedAt,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    // Resending a clause without its flags does not unlock it.
    await expect(
      save(
        [
          parties,
          car,
          bonus,
          { id: law.id, heading: law.heading, body: 'Other law.' },
        ],
        draft.updatedAt,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Optional clauses switch on and off; editable wording can change.
    const saved = await save(
      [
        { ...parties, body: `${parties.body} Edited.` },
        { ...car, enabled: false },
        { ...bonus, enabled: true },
        law,
      ],
      draft.updatedAt,
    );
    expect(saved.sections.find((s) => s.id === 'car')?.enabled).toBe(false);
    expect(saved.sections.find((s) => s.id === 'law')?.editable).toBe(false);
    const fields = await signing.fields(hr, saved.id);
    expect(fields).toBeDefined();
    const preview = await signing.preview(hr, saved.id);
    expect(preview.content_base64.length).toBeGreaterThan(100);
  });

  it('step D: redesigned drafts get clauses that refer to the Particulars instead of repeating values', async () => {
    const live = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.FIXED_TERM,
      start_date: '2026-02-01',
      end_date: '2026-12-31',
      mode: 'live',
    });
    const body = (id: string) =>
      live.sections.find((s) => s.id === id)?.body ?? '';
    expect(body('hours')).toContain('set out in the Particulars');
    expect(body('remuneration')).not.toContain('{{salary}}');
    expect(body('duration')).not.toContain('{{end_date}}');
    expect(live.sections.every((s) => s.optional === false)).toBe(true);

    const legacy = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.FIXED_TERM,
      start_date: '2026-02-01',
      end_date: '2026-12-31',
    });
    // Older (legacy) drafts keep the classic wording.
    expect(
      legacy.sections.find((s) => s.id === 'remuneration')?.body,
    ).toContain('{{salary}}');
  });

  it('step C: the wizard body (refs with nulls, cleared overrides, full preview body) saves, previews and sends', async () => {
    await useTemplate([
      {
        id: 'parties',
        heading: 'Parties',
        body: '{{company_legal_name}} and {{employee_name}}.',
      },
      {
        id: 'terms',
        heading: 'Terms',
        body: 'Hours {{hours_of_work}}. Leave {{annual_leave_days}} days.',
      },
    ]);
    const draft = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
      mode: 'live',
    });
    const wizardBody = (
      overrides: Record<string, string>,
      reasons: Record<string, string>,
    ) => ({
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
      end_date: null,
      title: 'Contract of Employment',
      place_of_recruitment: 'Dar es Salaam',
      job_description: 'Handle claims',
      benefits: 'Medical cover',
      part_time: false,
      refs: {
        department_id: null,
        position_id: null,
        grade_id: null,
        branch_id: null,
        reports_to_id: null,
      },
      field_overrides: overrides,
      override_reasons: reasons,
      sections: draft.sections,
    });

    // A department from another company is refused (tenant isolation).
    const otherCompany = await source.getRepository(Company).save({
      name: `Other company ${Date.now()}`,
      slug: `other-company-${Date.now()}`,
      status: 'active',
    });
    const foreign: Array<{ id: number }> = await source.query(
      'INSERT INTO "departments" ("company_id", "name") VALUES ($1, $2) RETURNING "id"',
      [otherCompany.id, 'Foreign dept'],
    );
    await expect(
      service.updateDraft(hr, draft.id, {
        ...wizardBody({}, {}),
        refs: { department_id: foreign[0].id },
        override_reasons: { department: 'Testing another company' },
        expected_updated_at: draft.updatedAt.toISOString(),
      } as never),
    ).rejects.toThrow('do not belong to this company');

    // An override without a reason is refused, with the field named.
    await expect(
      service.updateDraft(hr, draft.id, {
        ...wizardBody({ hours_of_work: '07:00-15:00' }, {}),
        expected_updated_at: draft.updatedAt.toISOString(),
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    const saved = await service.updateDraft(hr, draft.id, {
      ...wizardBody(
        { hours_of_work: '07:00-15:00' },
        { hours_of_work: 'Early shift for this site' },
      ),
      expected_updated_at: draft.updatedAt.toISOString(),
    } as never);
    expect(saved.particulars.field_overrides).toEqual({
      hours_of_work: '07:00-15:00',
    });

    // Preview of the unsaved state (override cleared with '') does not save it.
    const preview = await service.previewDraft(
      hr,
      draft.id,
      wizardBody({ hours_of_work: '' }, {}) as never,
    );
    expect(
      Buffer.from(preview.content_base64, 'base64').subarray(0, 4).toString(),
    ).toBe('%PDF');
    expect(
      (await contracts().findOneByOrFail({ id: draft.id })).particulars
        .field_overrides,
    ).toEqual({
      hours_of_work: '07:00-15:00',
    });

    // Clearing the override ('') removes it and its reason.
    const cleared = await service.updateDraft(hr, draft.id, {
      ...wizardBody(
        { hours_of_work: '' },
        { hours_of_work: 'Early shift for this site' },
      ),
      expected_updated_at: saved.updatedAt.toISOString(),
    } as never);
    expect(cleared.particulars.field_overrides ?? {}).toEqual({});
    expect(cleared.particulars.override_reasons ?? {}).toEqual({});

    // A stale save (another tab) is refused.
    await expect(
      service.updateDraft(hr, draft.id, {
        ...wizardBody({}, {}),
        expected_updated_at: saved.updatedAt.toISOString(),
      } as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('D4: hides salary from HR without payroll access, keeps it on save, shows it to the employee', async () => {
    const legacy = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
    });
    const priced = await service.updateDraft(hr, legacy.id, {
      expected_updated_at: legacy.updatedAt.toISOString(),
      salary_amount: '1500000',
      salary_currency: 'TZS',
    });
    expect(Number(priced.salaryAmount)).toBe(1500000);

    const noPayroll = {
      ...hr,
      permissions: hr.permissions.filter(
        (permission) => !permission.startsWith('payroll:'),
      ),
    } as AuthenticatedUser;
    const detail = await service.detail(noPayroll, legacy.id);
    expect(detail.salaryAmount).toBeNull();
    expect((detail as unknown as { salaryHidden?: boolean }).salaryHidden).toBe(
      true,
    );
    const listed = await service.listAll(noPayroll, {
      employee_id: employee.id,
    } as never);
    expect(
      listed.data.find((row) => row.id === legacy.id)?.salaryAmount,
    ).toBeNull();
    const fields = await signing.fields(noPayroll, legacy.id);
    expect(fields.find((row) => row.key === 'salary')).toEqual(
      expect.objectContaining({ value: '', hidden: true }),
    );

    // Their save leaves the hidden salary as it was.
    await service.updateDraft(noPayroll, legacy.id, {
      expected_updated_at: priced.updatedAt.toISOString(),
      salary_amount: '1',
      hours_of_work: '08:00-17:00',
    });
    const stored = await contracts().findOneByOrFail({ id: legacy.id });
    expect(Number(stored.salaryAmount)).toBe(1500000);
    expect(stored.hoursOfWork).toBe('08:00-17:00');

    // Payroll users and the employee see it.
    expect((await service.detail(hr, legacy.id)).salaryAmount).toBe(
      '1500000.00',
    );
    const activity = await service.activity(noPayroll, legacy.id);
    const edit = activity.items.find((item) =>
      item.changed_fields.includes('salary_amount'),
    );
    expect(edit?.new_values?.salary_amount).toBe('(hidden)');
  });

  it('lists the activity & audit trail newest first, for HR only (step B)', async () => {
    const draft = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
    });
    await service.updateDraft(hr, draft.id, {
      expected_updated_at: draft.updatedAt.toISOString(),
      hours_of_work: '08:00-17:00',
    } as never);
    await service.cancel(hr, draft.id, { reason: 'Wrong employee' });

    const { items } = await service.activity(hr, draft.id);
    const actions = items.map((item) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining(['draft_create', 'draft_update', 'cancel']),
    );
    expect(actions.indexOf('cancel')).toBeLessThan(
      actions.indexOf('draft_create'),
    );
    const update = items.find((item) => item.action === 'draft_update')!;
    expect(update.changed_fields).toContain('hours_of_work');
    expect(update.new_values).toEqual(
      expect.objectContaining({ hours_of_work: '08:00-17:00' }),
    );
    expect(items.find((item) => item.action === 'cancel')?.detail).toBe(
      'Wrong employee',
    );
    await expect(service.activity(self, draft.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('live draft: follows the employee, needs reasons for overrides, applies D3 and freezes on send', async () => {
    await useTemplate([
      {
        id: 'job',
        heading: 'Job',
        body: '{{job_title}} in {{department}}, {{employment_basis}}. Probation {{probation_months}} months. Leave {{annual_leave_days}} days.',
      },
      {
        id: 'confidentiality',
        heading: 'Confidentiality',
        body: 'Standard wording.',
        editable: false,
      },
      {
        id: 'car',
        heading: 'Company car',
        body: 'A car is provided.',
        optional: true,
        enabled: false,
      },
    ]);
    const finance = await source
      .getRepository(Department)
      .save({ company_id: companyId, name: 'Finance' } as never);
    const audit = await source
      .getRepository(Department)
      .save({ company_id: companyId, name: 'Audit' } as never);
    await source
      .getRepository(Employee)
      .update(employee.id, { primary_department_id: finance.id });
    await source.getRepository(ProbationPolicy).save({
      companyId,
      code: `PP-${companyId}`,
      name: 'Standard staff',
      probationPeriodDays: 45,
      effectiveFrom: '2020-01-01',
      status: 'ACTIVE',
    } as never);

    // Legacy copy fields are refused for live drafts.
    await expect(
      service.createDraft(hr, {
        employee_id: employee.id,
        contract_type: EmploymentContractType.UNSPECIFIED,
        start_date: '2026-02-01',
        mode: 'live',
        job_title: 'Typed by hand',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const draft = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
      mode: 'live',
      part_time: true,
    });
    expect(draft.departmentName).toBe('Finance');
    expect(draft.probationMonths).toBeNull(); // 45 days: never rounded

    let fields = await signing.fields(hr, draft.id);
    const field = (key: string) => fields.find((row) => row.key === key)!;
    expect(field('department')).toEqual(
      expect.objectContaining({
        value: 'Finance',
        source: 'Current assignment',
      }),
    );
    expect(field('probation_months').warning).toMatch(/45 days/);
    expect(field('annual_leave_days')).toEqual(
      expect.objectContaining({
        value: '28',
        source: 'Company contract settings',
      }),
    );
    expect(field('employment_basis').value).toBe('part-time');

    // D3: send is blocked until HR decides the probation period.
    await expect(signing.send(hr, draft.id, {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    // The employee's assignment changes: the draft follows it.
    await source
      .getRepository(Employee)
      .update(employee.id, { primary_department_id: audit.id });
    fields = await signing.fields(hr, draft.id);
    expect(field('department').value).toBe('Audit');

    // Overrides need a reason.
    await expect(
      service.updateDraft(hr, draft.id, {
        expected_updated_at: draft.updatedAt.toISOString(),
        field_overrides: { probation_months: '2' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updateDraft(hr, draft.id, {
        expected_updated_at: draft.updatedAt.toISOString(),
        field_overrides: { probation_months: '1.5' },
        override_reasons: { probation_months: 'Policy is 45 days' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Unsaved preview renders without saving anything.
    const before = await contracts().findOneByOrFail({ id: draft.id });
    const preview = await service.previewDraft(hr, draft.id, {
      field_overrides: { probation_months: '2' },
      override_reasons: { probation_months: 'Policy is 45 days' },
    });
    expect(preview.missing_fields).not.toContain('probation_months');
    const after = await contracts().findOneByOrFail({ id: draft.id });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.particulars).toEqual(before.particulars);

    // Clause rules come from the template.
    await expect(
      service.updateDraft(hr, draft.id, {
        expected_updated_at: before.updatedAt.toISOString(),
        sections: before.sections.map((section) =>
          section.id === 'confidentiality'
            ? { ...section, body: 'Changed', editable: true }
            : section,
        ),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const saved = await service
      .updateDraft(hr, draft.id, {
        expected_updated_at: before.updatedAt.toISOString(),
        field_overrides: { probation_months: '2' },
        override_reasons: { probation_months: 'Policy is 45 days' },
        refs: { department_id: finance.id },
      })
      .catch((error: unknown) => error);
    // The department reference is an override too, so it needs its own reason.
    expect(saved).toBeInstanceOf(BadRequestException);

    const ready = await service.updateDraft(hr, draft.id, {
      expected_updated_at: before.updatedAt.toISOString(),
      field_overrides: { probation_months: '2' },
      refs: { department_id: finance.id },
      override_reasons: {
        probation_months: 'Policy is 45 days',
        department: 'Joins Finance on start date',
      },
    });
    expect(ready.probationMonths).toBe(2);
    expect(ready.departmentName).toBe('Finance');

    const sent = await signing.send(hr, ready.id, {});
    expect(sent.sections.map((section) => section.id)).toEqual([
      'job',
      'confidentiality',
    ]);
    expect(sent.sections[0].body).toBe(
      'Claims analyst in Finance, part-time. Probation 2 months. Leave 28 days.',
    );
    const snapshot = sent.particulars.snapshot as {
      override_reasons: Record<string, string>;
    };
    expect(snapshot.override_reasons).toEqual({
      probation_months: 'Policy is 45 days',
      department: 'Joins Finance on start date',
    });

    // After send nothing follows the records any more.
    await source
      .getRepository(Employee)
      .update(employee.id, { primary_department_id: audit.id });
    fields = await signing.fields(hr, sent.id);
    expect(field('department')).toEqual(
      expect.objectContaining({ value: 'Finance', frozen: true }),
    );
  });
});
