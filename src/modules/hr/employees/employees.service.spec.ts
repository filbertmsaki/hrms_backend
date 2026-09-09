import type { AuditRequestContext } from '../../../common/interfaces/audit-request-context.interface';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmploymentStatusEnum } from './enums/employment-status.enum';
import { EmployeesService } from './employees.service';

const actor: AuthenticatedUser = {
  id: 7,
  email: 'hr@example.com',
  userType: 'COMPANY_USER',
  companyId: 12,
  companyMembershipId: 44,
  permissions: ['employees:update'],
  roles: ['HR_MANAGER'],
  scope: 'company',
};

const deleteActor: AuthenticatedUser = {
  ...actor,
  permissions: ['employees:delete'],
};

const context: AuditRequestContext = {
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  requestId: 'req-1',
};

describe('EmployeesService.remove', () => {
  it('archives active employees instead of hard deleting them', async () => {
    const employee = {
      id: 15,
      employment_status: EmploymentStatusEnum.ACTIVE,
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      changeStatus: jest.fn().mockResolvedValue(employee),
      employeeRepository: {
        remove: jest.fn(),
      },
    };

    const result = await EmployeesService.prototype.remove.call(
      service,
      deleteActor.companyId,
      employee.id,
      deleteActor,
      context,
    );

    expect(service.findEmployeeByIdOrFail).toHaveBeenCalledWith(
      deleteActor.companyId,
      employee.id,
    );
    expect(
      service.hrAccessService.assertCanAccessEmployee,
    ).toHaveBeenCalledWith(deleteActor, employee);
    expect(service.changeStatus).toHaveBeenCalledWith(
      deleteActor.companyId,
      employee.id,
      expect.objectContaining({
        employment_status: EmploymentStatusEnum.INACTIVE,
      }),
      deleteActor,
      context,
    );
    expect(service.employeeRepository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({ message: 'Employee archived successfully' });
  });

  it('keeps already historical employees without mutating them', async () => {
    const employee = {
      id: 21,
      employment_status: EmploymentStatusEnum.EXITED,
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      changeStatus: jest.fn(),
      employeeRepository: {
        remove: jest.fn(),
      },
    };

    const result = await EmployeesService.prototype.remove.call(
      service,
      deleteActor.companyId,
      employee.id,
      deleteActor,
      context,
    );

    expect(service.changeStatus).not.toHaveBeenCalled();
    expect(service.employeeRepository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message:
        'Employee retained in historical records. Hard delete is disabled.',
    });
  });
});

describe('EmployeesService.unlinkCompanyUser', () => {
  function buildService(employee: Record<string, unknown>) {
    return {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      employeeRepository: {
        save: jest.fn().mockImplementation((value) => Promise.resolve(value)),
      },
      companiesService: {
        removeUserFromCompany: jest.fn().mockResolvedValue({
          message: 'User removed from company successfully',
        }),
      },
      securityEventsService: {
        logBestEffort: jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  it('unlinks an inactive employee while preserving the company account', async () => {
    const employee = {
      id: 15,
      company_user_id: 55,
      company_user: { id: 55, user_id: 77, status: 'active' },
      employment_status: EmploymentStatusEnum.INACTIVE,
    };
    const service = buildService(employee);

    const result = await EmployeesService.prototype.unlinkCompanyUser.call(
      service,
      actor.companyId,
      employee.id,
      actor,
      context,
      false,
    );

    expect(employee.company_user_id).toBeNull();
    expect(employee.company_user).toBeNull();
    expect(service.employeeRepository.save).toHaveBeenCalledWith(employee);
    expect(
      service.companiesService.removeUserFromCompany,
    ).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'User account unlinked from employee successfully',
      unlinked_company_user_id: 55,
      account_deactivated: false,
    });
  });

  it('deactivates account access when removing a linked account', async () => {
    const employee = {
      id: 21,
      company_user_id: 66,
      company_user: { id: 66, user_id: 88, status: 'active' },
      employment_status: EmploymentStatusEnum.TERMINATED,
    };
    const service = buildService(employee);

    const result = await EmployeesService.prototype.unlinkCompanyUser.call(
      service,
      actor.companyId,
      employee.id,
      actor,
      context,
      true,
    );

    expect(service.companiesService.removeUserFromCompany).toHaveBeenCalledWith(
      actor.companyId,
      88,
      actor,
      context,
    );
    expect(result.account_deactivated).toBe(true);
    expect(result.unlinked_company_user_id).toBe(66);
  });

  it('refuses to unlink a current employee account', async () => {
    const employee = {
      id: 31,
      company_user_id: 77,
      company_user: { id: 77, user_id: 99, status: 'active' },
      employment_status: EmploymentStatusEnum.ACTIVE,
    };
    const service = buildService(employee);

    await expect(
      EmployeesService.prototype.unlinkCompanyUser.call(
        service,
        actor.companyId,
        employee.id,
        actor,
        context,
      ),
    ).rejects.toThrow(
      'Only inactive or historical employees can have their user account unlinked',
    );
    expect(service.employeeRepository.save).not.toHaveBeenCalled();
  });
});

describe('EmployeesService attendance activation readiness', () => {
  it('accepts a direct active shift assignment without requiring a timetable', async () => {
    const service = {
      attendanceReadinessService: {
        checkOne: jest.fn().mockResolvedValue({
          readinessScore: 57,
          checks: {
            hasShift: true,
            hasTimetable: false,
          },
        }),
      },
    };

    await expect(
      EmployeesService.prototype['assertAttendanceReady'].call(
        service,
        12,
        140,
      ),
    ).resolves.toBeUndefined();
  });

  it('blocks activation when neither a shift nor timetable is active', async () => {
    const service = {
      attendanceReadinessService: {
        checkOne: jest.fn().mockResolvedValue({
          readinessScore: 43,
          checks: {
            hasShift: false,
            hasTimetable: false,
          },
        }),
      },
    };

    await expect(
      EmployeesService.prototype['assertAttendanceReady'].call(
        service,
        12,
        140,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        issues: ['No active shift or timetable assignment'],
      }),
    });
  });
});

describe('EmployeesService.removeDocument', () => {
  it('archives employee documents instead of deleting the record and file', async () => {
    const employee = { id: 15 };
    const document = {
      id: 9,
      employee_id: employee.id,
      file_url: '/private/doc.pdf',
      notes: 'original note',
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      employeeDocumentRepository: {
        findOne: jest.fn().mockResolvedValue(document),
        save: jest.fn().mockImplementation(async (value) => value),
        remove: jest.fn(),
      },
      filesService: {
        removeManagedFile: jest.fn(),
      },
      isArchivedDocument: EmployeesService.prototype['isArchivedDocument'],
      buildArchiveAuditNote:
        EmployeesService.prototype['buildArchiveAuditNote'],
    };

    const result = await EmployeesService.prototype.removeDocument.call(
      service,
      actor.companyId,
      employee.id,
      document.id,
      actor,
    );

    expect(service.employeeDocumentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: document.id,
        notes: expect.stringContaining('[ARCHIVED_DOCUMENT]'),
      }),
    );
    expect(service.employeeDocumentRepository.remove).not.toHaveBeenCalled();
    expect(service.filesService.removeManagedFile).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee document archived successfully',
    });
  });
});

describe('EmployeesService.downloadDocument', () => {
  it('increments download audit fields and writes a security event', async () => {
    const employee = { id: 15 };
    const document = {
      id: 9,
      employee_id: employee.id,
      file_url: '/private/doc.pdf',
      original_file_name: 'doc.pdf',
      mime_type: 'application/pdf',
      classification: 'PRIVATE',
      download_count: 2,
      retention_until: null,
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      employeeDocumentRepository: {
        findOne: jest.fn().mockResolvedValue(document),
        save: jest.fn().mockImplementation(async (value) => value),
      },
      filesService: {
        readManagedFile: jest.fn().mockResolvedValue(Buffer.from('file')),
      },
      securityEventsService: {
        logBestEffort: jest.fn().mockResolvedValue(undefined),
      },
      isArchivedDocument: EmployeesService.prototype['isArchivedDocument'],
    };

    const result = await EmployeesService.prototype.downloadDocument.call(
      service,
      actor.companyId,
      employee.id,
      document.id,
      actor,
      context,
    );

    expect(service.employeeDocumentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: document.id,
        download_count: 3,
        last_downloaded_by_company_user_id: actor.companyMembershipId,
      }),
    );
    expect(service.securityEventsService.logBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'EMPLOYEE_DOCUMENT_DOWNLOADED',
        companyId: actor.companyId,
        context,
      }),
    );
    expect(result).toEqual({
      buffer: Buffer.from('file'),
      fileName: 'doc.pdf',
      mimeType: 'application/pdf',
    });
  });
});

describe('EmployeesService.removeBankAccount', () => {
  it('archives bank accounts instead of deleting them', async () => {
    const employee = { id: 15 };
    const bankAccount = {
      id: 4,
      employee_id: employee.id,
      verification_status: 'VERIFIED',
      is_primary: true,
      effective_to: null,
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(bankAccount),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeBankAccountRepository: jest.fn().mockReturnValue(repository),
      isArchivedBankAccount:
        EmployeesService.prototype['isArchivedBankAccount'],
    };

    const result = await EmployeesService.prototype.removeBankAccount.call(
      service,
      actor.companyId,
      employee.id,
      bankAccount.id,
      actor,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: bankAccount.id,
        verification_status: 'ARCHIVED',
        is_primary: false,
        effective_to: expect.any(String),
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee bank account archived successfully',
    });
  });
});

describe('EmployeesService.removeContact', () => {
  it('archives employee contacts instead of deleting them', async () => {
    const employee = { id: 15 };
    const contact = {
      id: 3,
      employee_id: employee.id,
      is_primary: true,
      is_verified: true,
      notes: 'primary contact',
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(contact),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeContactRepository: jest.fn().mockReturnValue(repository),
      isArchivedContact: EmployeesService.prototype['isArchivedContact'],
      buildArchiveAuditNote:
        EmployeesService.prototype['buildArchiveAuditNote'],
    };

    const result = await EmployeesService.prototype.removeContact.call(
      service,
      actor.companyId,
      employee.id,
      contact.id,
      actor,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: contact.id,
        is_primary: false,
        is_verified: false,
        notes: expect.stringContaining('[ARCHIVED_CONTACT]'),
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee contact archived successfully',
    });
  });
});

describe('EmployeesService.removeAddress', () => {
  it('archives employee addresses instead of deleting them', async () => {
    const employee = { id: 15 };
    const address = {
      id: 5,
      employee_id: employee.id,
      address_line_1: '123 Main Street',
      is_primary: true,
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(address),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeAddressRepository: jest.fn().mockReturnValue(repository),
      isArchivedAddress: EmployeesService.prototype['isArchivedAddress'],
      buildArchivedFieldValue:
        EmployeesService.prototype['buildArchivedFieldValue'],
      normalizeOptionalString:
        EmployeesService.prototype['normalizeOptionalString'],
    };

    const result = await EmployeesService.prototype.removeAddress.call(
      service,
      actor.companyId,
      employee.id,
      address.id,
      actor,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: address.id,
        address_line_1: expect.stringContaining('[ARCHIVED_ADDRESS]'),
        is_primary: false,
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee address archived successfully',
    });
  });
});

describe('EmployeesService.removeRelative', () => {
  it('archives employee relatives instead of deleting them', async () => {
    const employee = { id: 15 };
    const relative = {
      id: 6,
      employee_id: employee.id,
      relationship: 'Spouse',
      is_primary: true,
      is_emergency_contact: true,
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(relative),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeRelativeRepository: jest.fn().mockReturnValue(repository),
      isArchivedRelative: EmployeesService.prototype['isArchivedRelative'],
      buildArchivedFieldValue:
        EmployeesService.prototype['buildArchivedFieldValue'],
      normalizeOptionalString:
        EmployeesService.prototype['normalizeOptionalString'],
    };

    const result = await EmployeesService.prototype.removeRelative.call(
      service,
      actor.companyId,
      employee.id,
      relative.id,
      actor,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: relative.id,
        relationship: expect.stringContaining('[ARCHIVED_RELATIVE]'),
        is_primary: false,
        is_emergency_contact: false,
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee relative archived successfully',
    });
  });
});

describe('EmployeesService.removeIdentification', () => {
  it('archives employee identifications instead of deleting them', async () => {
    const employee = { id: 15 };
    const identification = {
      id: 8,
      employee_id: employee.id,
      identification_number: 'A12345678',
      is_primary: true,
      is_verified: true,
      verified_at: new Date('2025-01-01T00:00:00.000Z'),
      verified_by_company_user_id: 22,
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(identification),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeIdentificationRepository: jest
        .fn()
        .mockReturnValue(repository),
      isArchivedIdentification:
        EmployeesService.prototype['isArchivedIdentification'],
      buildArchivedUniqueFieldValue:
        EmployeesService.prototype['buildArchivedUniqueFieldValue'],
      normalizeOptionalString:
        EmployeesService.prototype['normalizeOptionalString'],
    };

    const result = await EmployeesService.prototype.removeIdentification.call(
      service,
      actor.companyId,
      employee.id,
      identification.id,
      actor,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: identification.id,
        identification_number: expect.stringContaining(
          '[ARCHIVED_IDENTIFICATION]',
        ),
        is_primary: false,
        is_verified: false,
        verified_at: null,
        verified_by_company_user_id: null,
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee identification archived successfully',
    });
  });
});

describe('EmployeesService.removeAcademicQualification', () => {
  it('archives academic qualifications instead of deleting them', async () => {
    const employee = { id: 15 };
    const qualification = {
      id: 10,
      employee_id: employee.id,
      field_of_study: 'Computer Science',
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(qualification),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeAcademicQualificationRepository: jest
        .fn()
        .mockReturnValue(repository),
      isArchivedAcademicQualification:
        EmployeesService.prototype['isArchivedAcademicQualification'],
      buildArchivedFieldValue:
        EmployeesService.prototype['buildArchivedFieldValue'],
      normalizeOptionalString:
        EmployeesService.prototype['normalizeOptionalString'],
    };

    const result =
      await EmployeesService.prototype.removeAcademicQualification.call(
        service,
        actor.companyId,
        employee.id,
        qualification.id,
        actor,
      );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: qualification.id,
        field_of_study: expect.stringContaining('[ARCHIVED_ACADEMIC]'),
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee academic qualification archived successfully',
    });
  });
});

describe('EmployeesService.removeProfessionalQualification', () => {
  it('archives professional qualifications instead of deleting them', async () => {
    const employee = { id: 15 };
    const qualification = {
      id: 11,
      employee_id: employee.id,
      programme_name: 'Project Management',
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(qualification),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeProfessionalQualificationRepository: jest
        .fn()
        .mockReturnValue(repository),
      isArchivedProfessionalQualification:
        EmployeesService.prototype['isArchivedProfessionalQualification'],
      buildArchivedFieldValue:
        EmployeesService.prototype['buildArchivedFieldValue'],
      normalizeOptionalString:
        EmployeesService.prototype['normalizeOptionalString'],
    };

    const result =
      await EmployeesService.prototype.removeProfessionalQualification.call(
        service,
        actor.companyId,
        employee.id,
        qualification.id,
        actor,
      );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: qualification.id,
        programme_name: expect.stringContaining('[ARCHIVED_PROFESSIONAL]'),
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee professional qualification archived successfully',
    });
  });
});

describe('EmployeesService.removeExperienceDetail', () => {
  it('archives experience details instead of deleting them', async () => {
    const employee = { id: 15 };
    const experienceDetail = {
      id: 12,
      employee_id: employee.id,
      job_title: 'Engineer',
      currently_working: true,
      end_date: null,
    };

    const repository = {
      findOne: jest.fn().mockResolvedValue(experienceDetail),
      save: jest.fn().mockImplementation(async (value) => value),
      remove: jest.fn(),
    };

    const service = {
      findEmployeeByIdOrFail: jest.fn().mockResolvedValue(employee),
      hrAccessService: {
        assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
      },
      getEmployeeExperienceRepository: jest.fn().mockReturnValue(repository),
      isArchivedExperienceDetail:
        EmployeesService.prototype['isArchivedExperienceDetail'],
      buildArchivedFieldValue:
        EmployeesService.prototype['buildArchivedFieldValue'],
      normalizeOptionalString:
        EmployeesService.prototype['normalizeOptionalString'],
    };

    const result = await EmployeesService.prototype.removeExperienceDetail.call(
      service,
      actor.companyId,
      employee.id,
      experienceDetail.id,
      actor,
    );

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: experienceDetail.id,
        job_title: expect.stringContaining('[ARCHIVED_EXPERIENCE]'),
        currently_working: false,
        end_date: expect.any(String),
      }),
    );
    expect(repository.remove).not.toHaveBeenCalled();
    expect(result).toEqual({
      message: 'Employee experience detail archived successfully',
    });
  });
});
