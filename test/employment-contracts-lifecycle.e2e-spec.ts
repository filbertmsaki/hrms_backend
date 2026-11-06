process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';
process.env.DB_NAME = process.env.DB_NAME ?? 'hrms_test_db';

import 'reflect-metadata';
import {
  ConflictException,
  INestApplication,
  NotFoundException,
} from '@nestjs/common';
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
import { createE2eApp } from './helpers/create-e2e-app';

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n',
).toString('base64');

describe('Employment contract lifecycle (e2e, real Postgres)', () => {
  let app: INestApplication;
  let source: DataSource;
  let service: EmploymentContractsService;
  let companyId: number;
  let hr: AuthenticatedUser;
  let self: AuthenticatedUser;
  let employee: Employee;
  let signatoryEmployee: Employee;

  beforeAll(async () => {
    app = await createE2eApp();
    source = app.get(DataSource);
    service = app.get(EmploymentContractsService);
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

  it('completes a legacy attach + employee signature and only then supersedes the previous version', async () => {
    const v1 = await source.getRepository(EmploymentContract).save({
      companyId,
      employeeId: employee.id,
      version: 1,
      contractType: EmploymentContractType.UNSPECIFIED,
      startDate: '2025-01-01',
      particulars: {},
      status: EmploymentContractStatus.SIGNED,
      issuedByCompanyUserId: hr.companyMembershipId!,
    });
    const draft = await draftFor();
    await expect(
      service.sign(self, draft.id, 'Amina Contract'),
    ).rejects.toThrow('not available for signing');

    await service.attachDocument(hr, draft.id, {
      fileName: 'contract.pdf',
      fileSize: Buffer.from(PDF, 'base64').length,
      mimeType: 'application/pdf',
      fileString: PDF,
    } as never);
    const pending = await source
      .getRepository(EmploymentContract)
      .findOneByOrFail({ id: draft.id });
    expect(pending.status).toBe(
      EmploymentContractStatus.PENDING_EMPLOYEE_SIGNATURE,
    );
    expect(pending.companySignedDocumentId).toBe(pending.documentId);
    expect((await service.listMine(self)).map((row) => row.id)).toEqual([
      draft.id,
      v1.id,
    ]);
    expect(
      (
        await source
          .getRepository(EmploymentContract)
          .findOneByOrFail({ id: v1.id })
      ).status,
    ).toBe(EmploymentContractStatus.SIGNED);

    const signed = await service.sign(self, draft.id, 'amina contract');
    expect(signed.status).toBe(EmploymentContractStatus.SIGNED);
    expect(signed.finalDocumentId).toBe(pending.documentId);
    expect(
      (
        await source
          .getRepository(EmploymentContract)
          .findOneByOrFail({ id: v1.id })
      ).status,
    ).toBe(EmploymentContractStatus.SUPERSEDED);
    const signatures = await source
      .getRepository(ContractSignature)
      .findBy({ contractId: draft.id });
    expect(signatures).toEqual([
      expect.objectContaining({
        party: 'EMPLOYEE',
        method: 'DIGITAL_TYPED',
        signerName: 'amina contract',
      }),
    ]);
    await expect(
      service.sign(self, draft.id, 'Amina Contract'),
    ).rejects.toThrow('not available for signing');
    await expect(
      service.cancel(hr, draft.id, { reason: 'too late' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
