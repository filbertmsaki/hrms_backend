import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { PayslipService } from './payroll-core.services';

describe('PayslipService employee self-access', () => {
  const employeeA: AuthenticatedUser = {
    id: 101,
    email: 'employee-a@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 7,
    companyMembershipId: 21,
    employeeId: 15,
    roles: ['EMPLOYEE'],
    permissions: ['payroll:payslips:self'],
  };
  const employeeB: AuthenticatedUser = {
    ...employeeA,
    id: 102,
    email: 'employee-b@example.com',
    companyMembershipId: 22,
    employeeId: 16,
  };
  const payslip = {
    id: 501,
    companyId: 7,
    employeeId: 15,
    payslipNo: 'PS-2026-15',
    status: 'PUBLISHED',
    snapshot: {},
  };

  function createService() {
    const service: any = Object.create(PayslipService.prototype);
    service.hrAccessService = {
      ensureActorCompanyId: jest.fn((actor: AuthenticatedUser) => {
        if (!actor.companyId || !actor.companyMembershipId) {
          throw new Error('Active company context is required');
        }
        return actor.companyId;
      }),
    };
    service.payslipRepository = {
      find: jest.fn().mockResolvedValue([payslip]),
      findOne: jest.fn(async ({ where }: { where: Record<string, number> }) =>
        where.companyId === payslip.companyId &&
        where.employeeId === payslip.employeeId &&
        where.id === payslip.id
          ? payslip
          : null,
      ),
    };
    service.employeeRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 15,
        exit_date: null,
        employment_status: 'ACTIVE',
      }),
    };
    service.auditService = { log: jest.fn().mockResolvedValue(undefined) };
    service.hrDocumentsService = {
      findOneForEntityOrFail: jest.fn(),
      readFile: jest.fn(),
    };
    return service;
  }

  it('lists only payslips matching the authenticated employee and company', async () => {
    const service = createService();

    await service.listMine(employeeA);

    expect(service.payslipRepository.find).toHaveBeenCalledWith({
      where: { companyId: 7, employeeId: 15 },
      order: { createdAt: 'DESC' },
    });
  });

  it('denies another employee access to a payslip detail', async () => {
    const service = createService();

    await expect(service.getMine(employeeB, payslip.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(service.payslipRepository.findOne).toHaveBeenCalledWith({
      where: { id: 501, companyId: 7, employeeId: 16 },
    });
    expect(service.auditService.log).not.toHaveBeenCalled();
  });

  it('denies another employee PDF download without retrieving the document', async () => {
    const service = createService();

    await expect(
      service.downloadMine(employeeB, payslip.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      service.hrDocumentsService.findOneForEntityOrFail,
    ).not.toHaveBeenCalled();
    expect(service.hrDocumentsService.readFile).not.toHaveBeenCalled();
    expect(service.auditService.log).not.toHaveBeenCalled();
  });

  it('denies access to a payslip from a different company', async () => {
    const service = createService();
    const otherCompanyActor = {
      ...employeeA,
      companyId: 8,
      companyMembershipId: 23,
    };

    await expect(
      service.getMine(otherCompanyActor, payslip.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(service.payslipRepository.findOne).toHaveBeenCalledWith({
      where: { id: 501, companyId: 8, employeeId: 15 },
    });
  });
});
