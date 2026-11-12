import { ContractSigningService } from './contract-signing.service';
import { EmploymentContractStatus } from './entities/employment-contract.entity';
import { ContractSignature } from './entities/contract-signature.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';

describe('contract document access policy', () => {
  const contract = { id: 8, version: 2, companyId: 1, employeeId: 10, status: EmploymentContractStatus.SIGNED } as any;
  const actor = { id: 20, companyId: 1, companyMembershipId: 30, employeeId: 40, permissions: [] } as any;
  function service(active: boolean, signed: boolean) {
    const instance = Object.create(ContractSigningService.prototype) as ContractSigningService;
    Object.assign(instance, { dataSource: { getRepository: (entity: unknown) => ({ findOneBy: async () => entity === User || entity === CompanyUser ? (active ? { id: 1 } : null) : null, find: async () => entity === ContractSignature && signed ? [{ id: 1, verificationOutcome: null }] : [] }) }, actorSignatory: async () => ({ id: 1 }) });
    return instance;
  }
  it('allows the employee and a salary-permission reader', async () => {
    expect(await service(true, false).canViewDocument({ ...actor, employeeId: 10 }, contract)).toBe(true);
    expect(await service(true, false).canViewDocument({ ...actor, permissions: ['payroll:profiles:read'] }, contract)).toBe(true);
  });
  it('allows only active recorded company signers for signed versions', async () => {
    expect(await service(true, true).canViewDocument(actor, contract)).toBe(true);
    expect(await service(true, false).canViewDocument(actor, contract)).toBe(false);
    expect(await service(false, true).canViewDocument(actor, contract)).toBe(false);
  });
  it('allows a current active signatory only while awaiting company signature', async () => {
    expect(await service(true, false).canViewDocument(actor, { ...contract, status: EmploymentContractStatus.PENDING_HR_SIGNATURE })).toBe(true);
    expect(await service(false, false).canViewDocument(actor, { ...contract, status: EmploymentContractStatus.PENDING_HR_SIGNATURE })).toBe(false);
  });
});
