import { NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ProfileChangeRequestsService } from './profile-change-requests.service';

describe('ProfileChangeRequestsService employee file access', () => {
  const employeeA: AuthenticatedUser = {
    id: 101,
    email: 'employee-a@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 7,
    companyMembershipId: 21,
    employeeId: 15,
    roles: ['EMPLOYEE'],
    permissions: [],
  };
  const employeeB: AuthenticatedUser = {
    ...employeeA,
    id: 102,
    email: 'employee-b@example.com',
    companyMembershipId: 22,
    employeeId: 16,
  };
  const pendingFile = {
    id: 91,
    file_path: 'private/profile-change/91',
    mime_type: 'application/pdf',
    original_file_name: 'supporting-document.pdf',
  };

  function createService() {
    const service: any = Object.create(ProfileChangeRequestsService.prototype);
    service.requireOwnSnapshot = jest.fn(async (actor: AuthenticatedUser) => ({
      membership: { company_id: actor.companyId },
      employee: { id: actor.employeeId },
    }));
    service.findRequestOrFail = jest.fn().mockResolvedValue({
      id: 501,
      company_id: 7,
      employee_id: 15,
      deleted_at: null,
      files: [pendingFile],
    });
    service.filesService = {
      readManagedFile: jest.fn().mockResolvedValue(Buffer.from('private file')),
    };
    return service;
  }

  it('denies another employee access to a pending profile-change file', async () => {
    const service = createService();

    await expect(
      service.getPendingFileForEmployee(employeeB, 501, 91),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(service.findRequestOrFail).toHaveBeenCalledWith(501, 7);
    expect(service.filesService.readManagedFile).not.toHaveBeenCalled();
  });

  it('denies an employee a file ID that is not attached to their own request', async () => {
    const service = createService();

    await expect(
      service.getPendingFileForEmployee(employeeA, 501, 92),
    ).rejects.toThrow('Pending file not found.');

    expect(service.filesService.readManagedFile).not.toHaveBeenCalled();
  });

  it('reads an attached profile-change file for its owner only', async () => {
    const service = createService();

    const result = await service.getPendingFileForEmployee(employeeA, 501, 91);

    expect(result).toEqual({
      buffer: Buffer.from('private file'),
      mimeType: 'application/pdf',
      originalFileName: 'supporting-document.pdf',
    });
    expect(service.filesService.readManagedFile).toHaveBeenCalledWith(
      pendingFile.file_path,
    );
  });
});
