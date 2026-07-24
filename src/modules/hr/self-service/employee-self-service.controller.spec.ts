import type { Request as ExpressRequest } from 'express';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { EmployeeSelfServiceController } from './employee-self-service.controller';
import { EmployeeSelfServiceService } from './employee-self-service.service';

describe('EmployeeSelfServiceController', () => {
  let controller: EmployeeSelfServiceController;
  let employeeSelfServiceService: {
    getProfile: jest.Mock;
    getProfilePhoto: jest.Mock;
  };

  const user: AuthenticatedUser = {
    id: 9,
    email: 'staff@example.com',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 7,
    companyMembershipId: 11,
    employeeId: 15,
    employeeNo: 'EMP-0015',
    roles: ['USER'],
    permissions: [],
  };

  beforeEach(() => {
    employeeSelfServiceService = {
      getProfile: jest.fn(),
      getProfilePhoto: jest.fn(),
    };

    controller = new EmployeeSelfServiceController(
      employeeSelfServiceService as unknown as EmployeeSelfServiceService,
    );
  });

  it('returns an absolute profile photo url', async () => {
    employeeSelfServiceService.getProfilePhoto.mockResolvedValue({
      employee_id: 15,
      profile_photo_path:
        '/uploads/profile-photos/company-7/employee-15-avatar.png',
    });

    const result = await controller.getProfilePhoto({
      user,
      protocol: 'http',
      headers: {},
      get: jest.fn().mockReturnValue('localhost:3000'),
    } as unknown as ExpressRequest & { user: AuthenticatedUser });

    expect(result).toEqual({
      employee_id: 15,
      has_profile_photo: true,
      profile_photo_path:
        '/uploads/profile-photos/company-7/employee-15-avatar.png',
      profile_photo_url:
        'http://localhost:3000/uploads/profile-photos/company-7/employee-15-avatar.png',
    });
  });

  it('prefers forwarded headers when building the profile photo url', async () => {
    employeeSelfServiceService.getProfilePhoto.mockResolvedValue({
      employee_id: 15,
      profile_photo_path:
        '/uploads/profile-photos/company-7/employee-15-avatar.png',
    });

    const result = await controller.getProfilePhoto({
      user,
      protocol: 'http',
      headers: {
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'hrms.example.com',
      },
      get: jest.fn().mockReturnValue('localhost:3000'),
    } as unknown as ExpressRequest & { user: AuthenticatedUser });

    expect(result.profile_photo_url).toBe(
      'https://hrms.example.com/uploads/profile-photos/company-7/employee-15-avatar.png',
    );
  });

  it('adds an absolute profile photo url to the profile response', async () => {
    employeeSelfServiceService.getProfile.mockResolvedValue({
      user: {
        id: 9,
      },
      employee: {
        id: 15,
        employee_no: 'EMP-0015',
        profile_photo_url:
          '/uploads/profile-photos/company-7/employee-15-avatar.png',
      },
      links: {
        profile: '/me/profile',
      },
    });

    const result = await controller.getProfile({
      user,
      protocol: 'http',
      headers: {},
      get: jest.fn().mockReturnValue('localhost:3000'),
    } as unknown as ExpressRequest & { user: AuthenticatedUser });

    expect(result.employee).toEqual(
      expect.objectContaining({
        id: 15,
        profile_photo_path:
          '/uploads/profile-photos/company-7/employee-15-avatar.png',
        has_profile_photo: true,
        profile_photo_url:
          'http://localhost:3000/uploads/profile-photos/company-7/employee-15-avatar.png',
      }),
    );
  });
});
