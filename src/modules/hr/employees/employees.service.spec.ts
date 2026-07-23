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
  let employeeRepository: MockRepo;
  let employeeDocumentRepository: MockRepo;
  let hrAccessService: { assertCanAccessEmployee: jest.Mock };
  let filesService: { saveBase64File: jest.Mock };

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
    employeeRepository = createRepositoryMock();
    employeeDocumentRepository = createRepositoryMock();
    hrAccessService = {
      assertCanAccessEmployee: jest.fn(),
    };
    filesService = {
      saveBase64File: jest.fn(),
    };

    service = new EmployeesService(
      {} as DataSource,
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
      {} as OnboardingService,
      {} as LeaveBalanceService,
      {} as EmployeeAttendanceReadinessService,
      filesService as unknown as FilesService,
    );
  });

  it('stores employee documents through the shared files service', async () => {
    employeeRepository.findOne.mockResolvedValue({
      id: 15,
      company_user: { company_id: 10 },
    });
    filesService.saveBase64File.mockResolvedValue({
      publicPath: '/uploads/documents/employees/company-10/employee-15.pdf',
    });
    employeeDocumentRepository.save.mockResolvedValue({ id: 44 });
    employeeDocumentRepository.findOneOrFail.mockResolvedValue({
      id: 44,
      employee_id: 15,
      type: 'contract',
      title: 'Signed Contract',
      file_url: '/uploads/documents/employees/company-10/employee-15.pdf',
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

    expect(filesService.saveBase64File).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'signed-contract.pdf' }),
      expect.objectContaining({
        directorySegments: ['documents', 'employees', 'company-10'],
      }),
    );
    expect(employeeDocumentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        employee_id: 15,
        file_url: '/uploads/documents/employees/company-10/employee-15.pdf',
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 44,
        employee_id: 15,
        file_url: '/uploads/documents/employees/company-10/employee-15.pdf',
      }),
    );
  });
});
