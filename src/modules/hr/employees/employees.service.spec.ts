import { DataSource, Repository } from 'typeorm';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { EmployeesService } from './employees.service';
import { Employee } from './entities/employee.entity';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeContact } from './entities/employee-contact.entity';
import { EmployeeAddress } from './entities/employee-address.entity';
import { EmployeeRelative } from './entities/employee-relative.entity';
import { EmployeeIdentification } from './entities/employee-identification.entity';
import { EmployeeBankAccount } from './entities/employee-bank-account.entity';
import { EmployeeAcademicQualification } from './entities/employee-academic-qualification.entity';
import { EmployeeProfessionalQualification } from './entities/employee-professional-qualification.entity';
import { EmployeeExperience } from './entities/employee-experience.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { EmployeePosition } from './entities/employee-position.entity';
import { CompaniesService } from '../../companies/companies.service';
import { UsersService } from '../../users/users.service';
import { HrAccessService } from '../shared/hr-access.service';
import { OnboardingService } from '../onboarding/onboarding.service';
import { LeaveBalanceService } from '../leave/services/leave-balance.service';
import { EmployeeAttendanceReadinessService } from '../launch-readiness/employee-attendance-readiness.service';
import { FilesService } from '../../files/files.service';
import { PositionAvailabilityService } from '../shared/position-availability.service';
import { DefaultAvatarsService } from '../default-avatars/default-avatars.service';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';

type MockRepo = Record<string, jest.Mock>;

const createRepositoryMock = (): MockRepo => ({
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
});

describe('EmployeesService', () => {
  let service: EmployeesService;
  let dataSource: { transaction: jest.Mock };
  let employeeRepository: MockRepo;
  let employeeDocumentRepository: MockRepo;
  let hrAccessService: { assertCanAccessEmployee: jest.Mock };
  let filesService: {
    savePrivateBase64File: jest.Mock;
    readManagedFile: jest.Mock;
  };

  const actor: AuthenticatedUser = {
    id: 9,
    email: 'hr@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 10,
    companyMembershipId: 33,
    roles: [],
    permissions: [],
  };

  beforeEach(() => {
    dataSource = {
      transaction: jest.fn(),
    };
    employeeRepository = createRepositoryMock();
    employeeDocumentRepository = createRepositoryMock();
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
    };
    filesService = {
      savePrivateBase64File: jest.fn(),
      readManagedFile: jest.fn(),
    };

    service = new EmployeesService(
      dataSource as unknown as DataSource,
      employeeRepository as unknown as Repository<Employee>,
      createRepositoryMock() as unknown as Repository<EmployeeDepartment>,
      employeeDocumentRepository as unknown as Repository<EmployeeDocument>,
      createRepositoryMock() as unknown as Repository<EmployeeContact>,
      createRepositoryMock() as unknown as Repository<EmployeeAddress>,
      createRepositoryMock() as unknown as Repository<EmployeeRelative>,
      createRepositoryMock() as unknown as Repository<EmployeeIdentification>,
      createRepositoryMock() as unknown as Repository<EmployeeBankAccount>,
      createRepositoryMock() as unknown as Repository<EmployeeAcademicQualification>,
      createRepositoryMock() as unknown as Repository<EmployeeProfessionalQualification>,
      createRepositoryMock() as unknown as Repository<EmployeeExperience>,
      createRepositoryMock() as unknown as Repository<CompanyUser>,
      createRepositoryMock() as unknown as Repository<User>,
      createRepositoryMock() as unknown as Repository<Branch>,
      createRepositoryMock() as unknown as Repository<Department>,
      createRepositoryMock() as unknown as Repository<Position>,
      createRepositoryMock() as unknown as Repository<EmployeePosition>,
      {} as CompaniesService,
      {} as UsersService,
      hrAccessService as unknown as HrAccessService,
      {} as PositionAvailabilityService,
      {} as OnboardingService,
      {} as LeaveBalanceService,
      {} as EmployeeAttendanceReadinessService,
      filesService as unknown as FilesService,
      {} as DefaultAvatarsService,
    );
  });

  it('generates an employee number when registration leaves employee_no blank', async () => {
    const manager = {
      getRepository: jest.fn(() => employeeRepository),
    };
    const membership = { id: 71 } as CompanyUser;
    const persistedEmployee = {
      id: 55,
      employee_no: '000123',
      first_name: 'Jane',
      last_name: 'Doe',
    };
    const serviceInternals = service as unknown as {
      createForCompanyUserMembership: (
        companyId: number,
        membership: CompanyUser,
        createEmployeeDto: {
          employee_no?: string;
          first_name: string;
          last_name: string;
          gender: string;
          onboarding?: {
            auto_start?: boolean;
          };
        },
        actor: AuthenticatedUser,
        manager: { getRepository: jest.Mock },
      ) => Promise<{ employeeId: number; onboardingRequestId: number | null }>;
      generateNextEmployeeNo: jest.Mock<
        Promise<string>,
        [number, { getRepository: jest.Mock }]
      >;
      assertUniqueEmployeeNumber: jest.Mock<
        Promise<void>,
        [number, string, number | undefined, { getRepository: jest.Mock }]
      >;
      persistEmployee: jest.Mock;
      initializeCurrentYearLeaveBalances: jest.Mock<
        Promise<void>,
        [number, object, { getRepository: jest.Mock }]
      >;
    };

    employeeRepository.findOne.mockResolvedValue(null);
    serviceInternals.generateNextEmployeeNo = jest
      .fn<Promise<string>, [number, { getRepository: jest.Mock }]>()
      .mockResolvedValue('000123');
    serviceInternals.assertUniqueEmployeeNumber = jest
      .fn<
        Promise<void>,
        [number, string, number | undefined, { getRepository: jest.Mock }]
      >()
      .mockResolvedValue(undefined);
    serviceInternals.persistEmployee = jest
      .fn()
      .mockResolvedValue(persistedEmployee);
    serviceInternals.initializeCurrentYearLeaveBalances = jest
      .fn<Promise<void>, [number, object, { getRepository: jest.Mock }]>()
      .mockResolvedValue(undefined);

    const result = await serviceInternals.createForCompanyUserMembership(
      10,
      membership,
      {
        employee_no: '   ',
        first_name: 'Jane',
        last_name: 'Doe',
        gender: 'female',
        onboarding: {
          auto_start: false,
        },
      },
      actor,
      manager,
    );

    expect(serviceInternals.generateNextEmployeeNo).toHaveBeenCalledWith(
      10,
      manager,
    );
    expect(serviceInternals.assertUniqueEmployeeNumber).toHaveBeenCalledWith(
      10,
      '000123',
      undefined,
      manager,
    );
    expect(employeeRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        company_user_id: 71,
        employee_no: '000123',
      }),
    );
    expect(result).toEqual({
      employeeId: 55,
      onboardingRequestId: null,
    });
  });

  it('stores employee documents through the shared files service', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 15,
      company_user: { company_id: 10 },
    });
    filesService.savePrivateBase64File.mockResolvedValue({
      publicPath:
        '/private-uploads/documents/employees/company-10/employee-15.pdf',
      originalFileName: 'signed-contract.pdf',
      mimeType: 'application/pdf',
      fileSize: 12,
    });
    employeeDocumentRepository.save.mockResolvedValue({ id: 44 });
    employeeDocumentRepository.findOneOrFail.mockResolvedValue({
      id: 44,
      employee_id: 15,
      type: 'contract',
      title: 'Signed Contract',
      file_url:
        '/private-uploads/documents/employees/company-10/employee-15.pdf',
      original_file_name: 'signed-contract.pdf',
      mime_type: 'application/pdf',
      file_size: '12',
      notes: 'Signed copy',
      uploaded_at: new Date('2026-07-23T08:00:00.000Z'),
      uploaded_by_company_user_id: 33,
      uploaded_by: {
        user: {
          id: 21,
          user_no: 'USR-21',
          first_name: 'Alice',
          last_name: 'Smith',
          email: 'alice@example.com',
        },
      },
    });

    const result = await service.addDocument(
      10,
      15,
      {
        type: 'contract',
        title: 'Signed Contract',
        notes: 'Signed copy',
        file: {
          fileName: 'signed-contract.pdf',
          fileSize: 12,
          mimeType: 'application/pdf',
          fileString: Buffer.from('hello world!').toString('base64'),
        },
      },
      actor,
    );

    expect(filesService.savePrivateBase64File).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'signed-contract.pdf' }),
      expect.objectContaining({
        directorySegments: ['documents', 'employees', 'company-10'],
      }),
    );
    expect(employeeDocumentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: 15,
        file_url:
          '/private-uploads/documents/employees/company-10/employee-15.pdf',
        original_file_name: 'signed-contract.pdf',
        mime_type: 'application/pdf',
        file_size: '12',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 44,
        employee_id: 15,
        file_url: '/api/employees/15/documents/44/download',
        original_file_name: 'signed-contract.pdf',
        mime_type: 'application/pdf',
        file_size: '12',
      }),
    );
  });

  it('returns stored employee document metadata for secure downloads', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 15,
      company_user: { company_id: 10 },
    });
    employeeDocumentRepository.findOne.mockResolvedValue({
      id: 44,
      employee_id: 15,
      file_url:
        '/private-uploads/documents/employees/company-10/employee-15.pdf',
      original_file_name: 'signed-contract.pdf',
      mime_type: 'application/pdf',
    });
    filesService.readManagedFile.mockResolvedValue(Buffer.from('pdf'));

    const result = await service.downloadDocument(10, 15, 44, actor);

    expect(filesService.readManagedFile).toHaveBeenCalledWith(
      '/private-uploads/documents/employees/company-10/employee-15.pdf',
    );
    expect(result).toEqual({
      buffer: Buffer.from('pdf'),
      fileName: 'signed-contract.pdf',
      mimeType: 'application/pdf',
    });
  });
});
