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
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PDFDocument as PdfLibDocument } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { Company } from '../src/modules/companies/entities/company.entity';
import { CompanyUser } from '../src/modules/companies/entities/company-user.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Employee } from '../src/modules/hr/employees/entities/employee.entity';
import { Position } from '../src/modules/hr/positions/entities/position.entity';
import { EmploymentContractsService } from '../src/modules/hr/contracts/employment-contracts.service';
import {
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
} from '../src/modules/hr/contracts/entities/employment-contract.entity';
import { ContractSignatory } from '../src/modules/hr/contracts/entities/contract-signatory.entity';
import { ContractSignature } from '../src/modules/hr/contracts/entities/contract-signature.entity';
import { ContractExitService } from '../src/modules/hr/contracts/contract-exit.service';
import { ContractNotifierService } from '../src/modules/hr/contracts/contract-notifier.service';
import { ContractRemindersService } from '../src/modules/hr/contracts/contract-reminders.service';
import { ContractSettingsService } from '../src/modules/hr/contracts/contract-settings.service';
import { ContractSignatoriesService } from '../src/modules/hr/contracts/contract-signatories.service';
import { ContractSigningService } from '../src/modules/hr/contracts/contract-signing.service';
import { ContractTemplatesService } from '../src/modules/hr/contracts/contract-templates.service';
import { Document } from '../src/modules/hr/documents/entities/document.entity';
import { EmployeeAddress } from '../src/modules/hr/employees/entities/employee-address.entity';
import { EmploymentStatusEnum } from '../src/modules/hr/employees/enums/employment-status.enum';
import { AppNotification } from '../src/modules/notifications/entities/app-notification.entity';
import { createE2eApp } from './helpers/create-e2e-app';
import { OnboardingService } from '../src/modules/hr/onboarding/onboarding.service';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
).toString('base64');

describe('Employment contract lifecycle (e2e, real Postgres)', () => {
  let app: INestApplication;
  let source: DataSource;
  let service: EmploymentContractsService;
  let signing: ContractSigningService;
  let companyId: number;
  let hr: AuthenticatedUser;
  let self: AuthenticatedUser;
  let employee: Employee;
  let signatoryEmployee: Employee;

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
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    companyId = (
      await source.getRepository(Company).save({
        name: `Contracts E2E ${suffix}`,
        slug: `contracts-e2e-${suffix}`,
        status: 'active',
      })
    ).id;
    const makeUser = async (tag: string) => {
      const user = await source.getRepository(User).save({
        user_no: `EC-${companyId}-${tag}`,
        first_name: 'Test',
        last_name: tag,
        email: `contracts-${tag}-${suffix}@example.test`,
        phone: `+2559${companyId}${tag === 'hr' ? 1 : 2}`,
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
    });
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
  });

  const draftFor = (overrides: Record<string, unknown> = {}) =>
    service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-02-01',
      ...overrides,
    } as never);

  it('creates a prefilled draft with a final reference and leaves the signed contract effective', async () => {
    const signedV1 = await source.getRepository(EmploymentContract).save({
      companyId,
      employeeId: employee.id,
      version: 1,
      contractType: EmploymentContractType.UNSPECIFIED,
      startDate: '2026-01-01',
      particulars: {},
      status: EmploymentContractStatus.SIGNED,
      issuedByCompanyUserId: hr.companyMembershipId!,
    });
    expect(signedV1.referenceNo).toMatch(/^TMP-/);

    const draft = await draftFor();
    expect(draft.status).toBe(EmploymentContractStatus.DRAFT);
    expect(draft.version).toBe(2);
    expect(draft.referenceNo).toMatch(/^EC-\d{4}-\d{5}$/);
    expect(draft.jobTitle).toBe('Claims analyst');
    expect(draft.reportingManagerName).toBe('Neema Manager');
    expect(draft.particulars).toEqual(
      expect.objectContaining({
        employee_name: 'Amina Contract',
        sex: 'female',
        employee_age: 30,
      }),
    );
    const stored = await source
      .getRepository(EmploymentContract)
      .findOneByOrFail({ id: draft.id });
    expect(stored.referenceNo).toBe(draft.referenceNo);
    // Fix: creating v2 must not supersede the still-valid signed v1.
    expect(
      (
        await source
          .getRepository(EmploymentContract)
          .findOneByOrFail({ id: signedV1.id })
      ).status,
    ).toBe(EmploymentContractStatus.SIGNED);
  });

  it('rejects stale draft saves and any edit once the draft is cancelled', async () => {
    const draft = await draftFor();
    await expect(
      service.updateDraft(hr, draft.id, {
        expected_updated_at: new Date(
          draft.updatedAt.getTime() - 1000,
        ).toISOString(),
        hours_of_work: '08:00-17:00',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    const updated = await service.updateDraft(hr, draft.id, {
      expected_updated_at: draft.updatedAt.toISOString(),
      hours_of_work: '08:00-17:00',
      sections: [{ id: 's1', heading: 'Duties', body: 'Handle claims.' }],
    });
    expect(updated.hoursOfWork).toBe('08:00-17:00');
    expect(updated.sections).toHaveLength(1);

    const cancelled = await service.cancel(hr, draft.id, {
      reason: 'Wrong start date',
    });
    expect(cancelled.status).toBe(EmploymentContractStatus.CANCELLED);
    await expect(
      service.updateDraft(hr, draft.id, {
        expected_updated_at: cancelled.updatedAt.toISOString(),
        hours_of_work: 'x',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.cancel(hr, draft.id, { reason: 'again' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('refuses an inactive or self-assigned company signatory', async () => {
    const own = await source.getRepository(ContractSignatory).save({
      companyId,
      employeeId: employee.id,
      displayName: 'Amina Contract',
      jobTitle: 'Analyst',
      designatedByCompanyUserId: hr.companyMembershipId!,
    });
    const revoked = await source.getRepository(ContractSignatory).save({
      companyId,
      employeeId: signatoryEmployee.id,
      displayName: 'Juma Director',
      jobTitle: 'Director',
      isActive: false,
      designatedByCompanyUserId: hr.companyMembershipId!,
    });
    await expect(draftFor({ assigned_signatory_id: own.id })).rejects.toThrow(
      'cannot sign their own contract',
    );
    await expect(
      draftFor({ assigned_signatory_id: revoked.id }),
    ).rejects.toThrow('active authorized company signatory');
    await source
      .getRepository(ContractSignatory)
      .update(revoked.id, { isActive: true });
    const draft = await draftFor({ assigned_signatory_id: revoked.id });
    expect(draft.assignedSignatoryId).toBe(revoked.id);
  });

  it('lists with search, status and validity filters and hides drafts from the employee', async () => {
    const draft = await draftFor();
    const page = await service.listAll(hr, {
      q: 'amina',
      status: EmploymentContractStatus.DRAFT,
    });
    expect(page.total).toBe(1);
    expect(page.data[0]).toEqual(
      expect.objectContaining({
        id: draft.id,
        employeeName: 'Amina Contract',
        validity: 'NOT_EFFECTIVE',
      }),
    );
    expect((await service.listAll(hr, { q: '100%_' })).total).toBe(0);
    expect((await service.listAll(hr, { validity: 'ACTIVE' })).total).toBe(0);

    expect(await service.listMine(self)).toEqual([]);
    await expect(service.detail(self, draft.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const detail = await service.detail(hr, draft.id);
    expect(detail.allowedActions).toEqual(
      expect.arrayContaining(['UPDATE_DRAFT', 'SEND', 'CANCEL']),
    );
  });

  // ───────────── helpers for the signing workflow ─────────────

  const pdfFile = (base64 = PDF) =>
    ({
      fileName: 'contract.pdf',
      fileSize: Buffer.from(base64, 'base64').length,
      mimeType: 'application/pdf',
      fileString: base64,
    }) as never;

  /** Emailed signing codes are captured instead of sent (every test). */
  let codes: string[] = [];
  beforeEach(() => {
    codes = [];
    jest
      .spyOn(app.get(ContractNotifierService), 'sendEmail')
      .mockImplementation((_to, notice) => {
        if (notice.code) codes.push(notice.code);
        return Promise.resolve();
      });
  });
  afterEach(() => jest.restoreAllMocks());
  const captureCodes = () => codes;

  /** Juma (the HR actor's own employee record) as default company signatory. */
  const setupCompany = async () => {
    await source.getRepository(Employee).update(signatoryEmployee.id, {
      employment_status: EmploymentStatusEnum.ACTIVE,
    });
    await source.getRepository(Employee).update(employee.id, {
      employment_status: EmploymentStatusEnum.ONBOARDING,
    });
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
    return signatory;
  };

  const prepareSent = async () => {
    const signatory = await setupCompany();
    await app.get(ContractTemplatesService).upsert(hr, {
      contract_type: EmploymentContractType.UNSPECIFIED,
      title: 'Contract of Employment',
      sections: [
        {
          id: 'parties',
          heading: 'Parties',
          body: '{{company_legal_name}}, {{company_address}}, and {{employee_name}} of {{employee_address}}.',
        },
        {
          id: 'terms',
          heading: 'Terms',
          body: '{{job_title}} reporting to {{reporting_manager}}, recruited at {{place_of_recruitment}}. {{currency}} {{salary}} {{pay_frequency}} by {{remuneration_method}}. Hours {{hours_of_work}}. Leave {{annual_leave_days}} days. Law: {{governing_law}}.',
        },
      ],
    });
    const draft = await draftFor();
    const ready = await service.updateDraft(hr, draft.id, {
      expected_updated_at: draft.updatedAt.toISOString(),
      hours_of_work: '08:00-17:00, Monday to Friday',
      salary_amount: '1500000',
      salary_currency: 'TZS',
      pay_frequency: 'MONTHLY',
      place_of_recruitment: 'Dar es Salaam',
      remuneration_method: 'bank transfer',
    } as never);
    await source.getRepository(EmployeeAddress).save({
      employee_id: employee.id,
      address_line_1: 'Mikocheni',
      city: 'Dar es Salaam',
      country: 'Tanzania',
      is_primary: true,
    } as never);
    const sent = await signing.send(hr, ready.id, {});
    return { signatory, contract: sent };
  };

  const contracts = () => source.getRepository(EmploymentContract);

  // ───────────── Phase 1: templates, legal details, PDF, send ─────────────

  it('prepares a contract from the company template with legal details, previews it and sends it locked', async () => {
    const signatory = await setupCompany();
    const templates = app.get(ContractTemplatesService);
    await expect(
      templates.upsert(hr, {
        contract_type: EmploymentContractType.UNSPECIFIED,
        title: 'Contract of Employment',
        sections: [{ id: 'x', heading: 'Bad', body: 'Hello {{nope}}' }],
      }),
    ).rejects.toThrow('Unknown contract field');
    const template = await templates.upsert(hr, {
      contract_type: EmploymentContractType.UNSPECIFIED,
      title: 'Contract of Employment',
      sections: [
        {
          id: 'parties',
          heading: 'Parties',
          body: 'Between {{company_legal_name}} (TIN {{company_tin}}) and {{employee_name}}.',
        },
        {
          id: 'pay',
          heading: 'Pay and hours',
          body: 'Salary {{currency}} {{salary}}; hours {{hours_of_work}}.',
        },
      ],
    });

    const draft = await draftFor();
    expect(draft.sections).toHaveLength(2);
    expect(draft.templateId).toBe(template.id);
    expect(draft.assignedSignatoryId).toBe(signatory.id);

    const preview = await signing.preview(hr, draft.id);
    expect(
      Buffer.from(preview.content_base64, 'base64').subarray(0, 4).toString(),
    ).toBe('%PDF');
    expect(preview.preview_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.page_count).toBeGreaterThan(0);
    expect(preview.missing_fields).toEqual(
      expect.arrayContaining(['salary', 'hours_of_work']),
    );
    await expect(signing.send(hr, draft.id, {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );

    const ready = await service.updateDraft(hr, draft.id, {
      expected_updated_at: draft.updatedAt.toISOString(),
      hours_of_work: '08:00-17:00',
      salary_amount: '1500000',
      salary_currency: 'TZS',
      // HR overrides a field for this contract only.
      field_overrides: { company_tin: '999-888-777' },
    } as never);
    const fields = await signing.fields(hr, ready.id);
    expect(fields.find((row) => row.key === 'company_tin')).toEqual(
      expect.objectContaining({
        automatic: '123-456-789',
        override: '999-888-777',
        used: true,
      }),
    );
    await expect(
      service.updateDraft(hr, ready.id, {
        expected_updated_at: ready.updatedAt.toISOString(),
        field_overrides: { not_a_field: 'x' },
      } as never),
    ).rejects.toThrow('Unknown contract field');
    const sent = await signing.send(hr, ready.id, {});
    expect(sent.status).toBe(EmploymentContractStatus.PENDING_HR_SIGNATURE);
    expect(sent.baseDocumentSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(sent.sections[0].body).toBe(
      'Between Alliance Test Ltd (TIN 999-888-777) and Amina Contract.',
    );
    // Content is locked once sent.
    await expect(
      service.updateDraft(hr, sent.id, {
        expected_updated_at: sent.updatedAt.toISOString(),
        hours_of_work: 'changed',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const file = await signing.readFile(hr, sent.id, null);
    expect(file.sha256).toBe(sent.baseDocumentSha256);
    // The employee does not see it until the company has signed? It is visible
    // (sent) but they cannot sign yet.
    await expect(signing.challenge(self, sent.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  // ───────────── Phase 2: digital signing ─────────────

  it('company then employee sign digitally with email codes; the signature is bound to the exact document', async () => {
    const codes = captureCodes();
    const { contract } = await prepareSent();

    const companyChallenge = await signing.challenge(hr, contract.id);
    expect(companyChallenge).toEqual(
      expect.objectContaining({ method: 'EMAIL_OTP', party: 'COMPANY' }),
    );
    const signature = { kind: 'TYPED' as const, text: 'Juma Director' };
    await expect(
      signing.sign(hr, contract.id, {
        document_sha256: '0'.repeat(64),
        signature,
        code: codes[0],
        consent: true,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      signing.sign(hr, contract.id, {
        document_sha256: companyChallenge.document_sha256,
        signature,
        code: codes[0] === '000000' ? '111111' : '000000',
        consent: true,
      }),
    ).rejects.toThrow('not correct');
    const companySigned = await signing.sign(hr, contract.id, {
      document_sha256: companyChallenge.document_sha256,
      signature,
      code: codes[0],
      consent: true,
    });
    expect(companySigned.status).toBe(
      EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
    );
    expect(companySigned.companySignedSha256).not.toBe(
      contract.baseDocumentSha256,
    );

    const employeeChallenge = await signing.challenge(self, contract.id);
    expect(employeeChallenge.party).toBe('EMPLOYEE');
    const completed = await signing.sign(self, contract.id, {
      document_sha256: employeeChallenge.document_sha256,
      signature: { kind: 'TYPED', text: 'Amina Contract' },
      code: codes[1],
      consent: true,
    });
    expect(completed.status).toBe(EmploymentContractStatus.SIGNED);
    // Evidence read by onboarding activation readiness.
    expect(completed.signedAt).toBeTruthy();
    expect(completed.signedByUserId).toBe(self.id);
    expect(completed.signedName).toBe('Amina Contract');
    expect(completed.documentId).toBe(completed.finalDocumentId);

    const rows = await source
      .getRepository(ContractSignature)
      .find({ where: { contractId: contract.id }, order: { id: 'ASC' } });
    expect(rows.map((row) => [row.party, row.verificationMethod])).toEqual([
      ['COMPANY', 'EMAIL_OTP'],
      ['EMPLOYEE', 'EMAIL_OTP'],
    ]);
    const finalFile = await signing.readFile(self, contract.id, null);
    const base = await signing.readFile(
      hr,
      contract.id,
      contract.baseDocumentId,
    );
    const pages = async (buffer: Buffer) =>
      (await PdfLibDocument.load(buffer)).getPageCount();
    // Final = base pages + signature certificate page.
    expect(await pages(finalFile.buffer)).toBe((await pages(base.buffer)) + 1);

    // Tampering is detected on download.
    await source.getRepository(Document).update(completed.finalDocumentId!, {
      metadata: { sha256: 'f'.repeat(64) },
    });
    await expect(signing.readFile(hr, contract.id, null)).rejects.toThrow(
      'integrity check',
    );
  });

  it('locks a signing code after five wrong attempts', async () => {
    const codes = captureCodes();
    const { contract } = await prepareSent();
    const challenge = await signing.challenge(hr, contract.id);
    const wrong = codes[0] === '999999' ? '888888' : '999999';
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(
        signing.sign(hr, contract.id, {
          document_sha256: challenge.document_sha256,
          signature: { kind: 'TYPED', text: 'Juma' },
          code: wrong,
          consent: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      signing.sign(hr, contract.id, {
        document_sha256: challenge.document_sha256,
        signature: { kind: 'TYPED', text: 'Juma' },
        code: codes[0],
        consent: true,
      }),
    ).rejects.toThrow('Too many wrong codes');
  });

  // ───────────── Phase 2: paper signing ─────────────

  it('paper signing: company scan, employee scan rejected then accepted; digital can be switched off', async () => {
    const { contract } = await prepareSent();
    await app
      .get(ContractSettingsService)
      .updateContractSettings(hr, { digital_signing_enabled: false });
    await expect(signing.challenge(hr, contract.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      app.get(ContractSettingsService).updateContractSettings(hr, {
        paper_signing_enabled: false,
      }),
    ).rejects.toThrow('At least one signing method');

    const companySigned = await signing.signedUpload(hr, contract.id, {
      file: pdfFile(),
      document_sha256: contract.baseDocumentSha256!,
    });
    expect(companySigned.status).toBe(
      EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
    );
    await expect(
      signing.signedUpload(self, contract.id, {
        file: pdfFile(),
        document_sha256: contract.baseDocumentSha256!,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    const uploaded = await signing.signedUpload(self, contract.id, {
      file: pdfFile(),
      document_sha256: companySigned.companySignedSha256!,
    });
    expect(uploaded.status).toBe(EmploymentContractStatus.PENDING_VERIFICATION);

    const rejected = await signing.verify(hr, contract.id, {
      outcome: 'REJECT',
      reason: 'Page 2 is missing',
    });
    expect(rejected.status).toBe(
      EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
    );
    expect(rejected.lastRejectionReason).toBe('Page 2 is missing');

    await signing.signedUpload(self, contract.id, {
      file: pdfFile(),
      document_sha256: companySigned.companySignedSha256!,
    });
    const accepted = await signing.verify(hr, contract.id, {
      outcome: 'ACCEPT',
    });
    expect(accepted.status).toBe(EmploymentContractStatus.SIGNED);
    expect(accepted.finalDocumentId).toBeTruthy();
    expect(accepted.signedAt).toBeTruthy();
    expect(accepted.signedByUserId).toBe(self.id);
    expect(accepted.signedName).toBe('Amina Contract');
    expect(accepted.documentId).toBe(accepted.finalDocumentId);
    await source.getRepository(Employee).update(employee.id, {
      hire_date: accepted.startDate,
    });
    const onboarding = app.get(OnboardingService);
    expect(
      await onboarding.getPayrollAndContractReadiness(
        companyId,
        employee.id,
        source.manager,
      ),
    ).not.toContain('signed employment contract');
    const rows = await source
      .getRepository(ContractSignature)
      .find({ where: { contractId: contract.id }, order: { id: 'ASC' } });
    expect(rows.map((row) => row.verificationOutcome)).toEqual([
      null,
      'REJECTED',
      'ACCEPTED',
    ]);
  });

  it('protects actual uploaded scan and final signed PDF bytes', async () => {
    const { contract } = await prepareSent();
    const companySigned = await signing.signedUpload(hr, contract.id, {
      file: pdfFile(),
      document_sha256: contract.baseDocumentSha256!,
    });
    const uploaded = await signing.signedUpload(self, contract.id, {
      file: pdfFile(),
      document_sha256: companySigned.companySignedSha256!,
    });
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const user = await source.getRepository(User).save({
      user_no: `FILE-${suffix}`.slice(0, 20),
      first_name: 'Reader',
      last_name: 'Test',
      email: `file-${suffix}@example.test`,
      phone: `+2557${Date.now()}`.slice(0, 20),
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
    const reader = {
      id: user.id,
      email: user.email,
      companyId,
      companyMembershipId: member.id,
      scope: 'company',
      userType: 'COMPANY_USER',
      roles: [],
      permissions: ['data_scope:company', 'employment_contracts:read'],
    } as AuthenticatedUser;
    const scan = await signing.readFile(
      self,
      contract.id,
      uploaded.pendingUploadDocumentId,
    );
    expect(scan.buffer).toEqual(Buffer.from(PDF, 'base64'));
    await expect(
      signing.readFile(reader, contract.id, uploaded.pendingUploadDocumentId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const signed = await signing.verify(hr, contract.id, { outcome: 'ACCEPT' });
    const finalFile = await signing.readFile(
      self,
      contract.id,
      signed.finalDocumentId,
    );
    expect(finalFile.buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(finalFile.sha256).toBe(signed.finalSha256);
    await expect(
      signing.readFile(reader, contract.id, signed.finalDocumentId),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(
      (
        await signing.readFile(
          {
            ...reader,
            permissions: [...reader.permissions, 'payroll:profiles:read'],
          },
          contract.id,
          signed.finalDocumentId,
        )
      ).buffer,
    ).toEqual(finalFile.buffer);
  });

  // ───────────── Phase 0 (kept): replacing a sent PDF ─────────────

  it('locks a sent PDF: replacing it cancels that version and reissues the file as a new version for the company to sign', async () => {
    await setupCompany();
    const draft = await draftFor();
    await service.attachDocument(hr, draft.id, pdfFile());
    const sent = await contracts().findOneByOrFail({ id: draft.id });
    expect(sent.status).toBe(EmploymentContractStatus.PENDING_HR_SIGNATURE);
    expect(sent.baseDocumentSha256).toMatch(/^[0-9a-f]{64}$/);

    const result = await service.attachDocument(hr, draft.id, pdfFile());
    const cancelled = await contracts().findOneByOrFail({ id: draft.id });
    expect(cancelled.status).toBe(EmploymentContractStatus.CANCELLED);
    expect(cancelled.cancelReason).toContain('replaced');
    const replacement = await contracts().findOneByOrFail({
      id: result.contract_id,
    });
    expect(replacement.version).toBe(sent.version + 1);
    expect(replacement.status).toBe(
      EmploymentContractStatus.PENDING_HR_SIGNATURE,
    );
    expect(
      (await source.getRepository(Document).findOneByOrFail({ id: result.id }))
        .entity_id,
    ).toBe(replacement.id);
  });

  // ───────────── Phase 3: renewals, exit, reminders ─────────────

  it('creates a live renewal from legacy with explicit inherited reasons and preserves the signed source', async () => {
    await setupCompany();
    const snapshot = {
      version: 1,
      values: { employee_address: 'Arusha', salary: '1200.00' },
    };
    const signed = await contracts().save({
      companyId,
      employeeId: employee.id,
      version: 1,
      contractType: EmploymentContractType.UNSPECIFIED,
      startDate: '2025-01-01',
      status: EmploymentContractStatus.SIGNED,
      issuedByCompanyUserId: hr.companyMembershipId!,
      sentAt: new Date('2025-01-02T00:00:00Z'),
      sections: [
        { id: 'terms', heading: 'Terms', body: 'Original signed text' },
      ],
      particulars: {
        field_overrides: { employee_address: 'Arusha', salary: '1200.00' },
        snapshot,
      },
    });
    const ownerView = await service.detail(self, signed.id);
    expect(ownerView.can_edit_salary).toBe(false);
    expect(ownerView.sections[0].body).toBe('Original signed text');
    await expect(
      service.renewOrAmend(hr, signed.id, {
        kind: 'RENEWAL',
        reason: 'Renewal',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const noPayroll = {
      ...hr,
      permissions: hr.permissions.filter(
        (permission) => !permission.startsWith('payroll:'),
      ),
    } as AuthenticatedUser;
    await expect(
      service.createDraft(noPayroll, {
        employee_id: employee.id,
        contract_type: EmploymentContractType.UNSPECIFIED,
        start_date: '2026-01-01',
        mode: 'live',
        field_overrides: { salary: '1' },
        override_reasons: { salary: 'Attempted change' },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.renewOrAmend(noPayroll, signed.id, {
        kind: 'RENEWAL',
        reason: 'Renewal',
        override_reasons: {
          employee_address: 'Verified address',
          salary: 'Agreed salary',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const renewal = await service.renewOrAmend(hr, signed.id, {
      kind: 'RENEWAL',
      reason: 'Renewal',
      override_reasons: {
        employee_address: 'Verified address',
        salary: 'Agreed salary',
      },
    });
    expect(renewal.particulars.mode).toBe('live');
    expect(renewal.particulars.field_overrides).toMatchObject({
      employee_address: 'Arusha',
      salary: '1200.00',
    });
    expect(renewal.particulars.override_reasons).toMatchObject({
      employee_address: 'Verified address',
      salary: 'Agreed salary',
    });
    expect(renewal.particulars.snapshot).toBeUndefined();
    const duplicate = await service.createDraft(hr, {
      employee_id: employee.id,
      contract_type: EmploymentContractType.UNSPECIFIED,
      start_date: '2026-01-01',
      from_contract_id: signed.id,
      mode: 'live',
      override_reasons: {
        employee_address: 'Verified address',
        salary: 'Agreed salary',
      },
    });
    expect(duplicate.particulars.mode).toBe('live');
    expect(duplicate.particulars.field_overrides).toMatchObject({
      employee_address: 'Arusha',
      salary: '1200.00',
    });
    const original = await contracts().findOneByOrFail({ id: signed.id });
    expect(original.particulars.snapshot).toEqual(snapshot);
    expect(original.sections[0].body).toBe('Original signed text');
  });

  it('renews a signed contract, ends contracts on exit (scheduled for future dates) and alerts HR before expiry', async () => {
    await setupCompany();
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
    }).format(new Date());
    const plus = (days: number) =>
      new Date(Date.parse(`${today}T00:00:00Z`) + days * 86_400_000)
        .toISOString()
        .slice(0, 10);
    const signed = await contracts().save({
      companyId,
      employeeId: employee.id,
      version: 1,
      contractType: EmploymentContractType.FIXED_TERM,
      startDate: '2025-01-01',
      endDate: plus(20),
      particulars: {},
      status: EmploymentContractStatus.SIGNED,
      issuedByCompanyUserId: hr.companyMembershipId!,
    });

    // Renewal: a linked draft starting the day after the current end date.
    const renewal = await service.renewOrAmend(hr, signed.id, {
      kind: 'RENEWAL',
      reason: 'Project extended',
      end_date: plus(400),
    });
    expect(renewal.status).toBe(EmploymentContractStatus.DRAFT);
    expect(renewal.particulars.mode).toBe('live');
    expect(renewal.startDate).toBe(plus(21));
    expect(renewal.amendmentReason).toBe('Renewal: Project extended');
    expect((await contracts().findOneByOrFail({ id: signed.id })).status).toBe(
      EmploymentContractStatus.SIGNED,
    );

    // Expiry alert to HR in the 30-day window, de-duplicated.
    const reminders = app.get(ContractRemindersService);
    expect(await reminders.notifyExpiring(today)).toBe(1);
    expect(await reminders.notifyExpiring(today)).toBe(0);
    const alert = await source.getRepository(AppNotification).findOneByOrFail({
      company_id: companyId,
      dedupe_key: `contract:expiry:${signed.id}:30:${hr.companyMembershipId}`,
    });
    expect(alert.title).toContain('30 days');

    // Exit dated in the future: scheduled, then closed by the daily job.
    const exits = app.get(ContractExitService);
    const result = await source.transaction((manager) =>
      exits.endContractsForExit(manager, {
        companyId,
        employeeId: employee.id,
        exitDate: plus(5),
        reason: 'Resignation',
        source: 'status_change',
        actorCompanyUserId: hr.companyMembershipId,
      }),
    );
    expect(result.scheduled_contract_ids).toEqual([signed.id]);
    expect(result.cancelled_contract_ids).toEqual([renewal.id]);
    const scheduled = await contracts().findOneByOrFail({ id: signed.id });
    expect(scheduled.status).toBe(EmploymentContractStatus.SIGNED);
    expect(scheduled.endedAt).toBe(plus(5));
    // Ended (or ending) contracts get no more expiry alerts.
    expect(await reminders.notifyExpiring(plus(1))).toBe(0);

    expect(await exits.closeScheduledEnds(plus(4))).toBe(0);
    expect(await exits.closeScheduledEnds(plus(5))).toBe(1);
    expect((await contracts().findOneByOrFail({ id: signed.id })).status).toBe(
      EmploymentContractStatus.TERMINATED,
    );
    const list = await service.listAll(hr, { validity: 'TERMINATED' } as never);
    expect(list.data.map((row) => row.id)).toEqual([signed.id]);
  });
});
