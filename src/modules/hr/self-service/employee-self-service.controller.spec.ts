import type { Request as ExpressRequest } from 'express';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
jest.mock('digest-fetch', () => ({
  __esModule: true,
  default: jest.fn(),
}));
import { EmployeeSelfServiceController } from './employee-self-service.controller';
import { ProfileChangeRequestsService } from './profile-change-requests.service';
import { EmployeeSelfServiceService } from './employee-self-service.service';
import { NotificationPreferencesService } from '../../notifications/notification-preferences.service';
import { ProbationService } from '../probation/probation.service';
import { EmployeeMovementsService } from '../employee-movements/employee-movements.service';

describe('EmployeeSelfServiceController', () => {
  let controller: EmployeeSelfServiceController;
  let employeeSelfServiceService: {
    getDashboard: jest.Mock;
    getProfile: jest.Mock;
    getProfilePhoto: jest.Mock;
    getStatus: jest.Mock;
    selectProfileAvatar: jest.Mock;
    uploadProfilePhoto: jest.Mock;
  };
  let profileChangeRequestsService: {
    createProfilePhotoRequest: jest.Mock;
  };
  let notificationPreferencesService: {
    findMine: jest.Mock;
    setPreference: jest.Mock;
  };
  let probationService: {
    getMyProbation: jest.Mock;
    submitSelfAssessment: jest.Mock;
  };
  let employeeMovementsService: {
    findMyMovements: jest.Mock;
    findMyMovement: jest.Mock;
    acknowledgeMyMovement: jest.Mock;
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
      getDashboard: jest.fn(),
      getProfile: jest.fn(),
      getProfilePhoto: jest.fn(),
      getStatus: jest.fn(),
      selectProfileAvatar: jest.fn(),
      uploadProfilePhoto: jest.fn(),
    };
    profileChangeRequestsService = {
      createProfilePhotoRequest: jest.fn(),
    };
    notificationPreferencesService = {
      findMine: jest.fn(),
      setPreference: jest.fn(),
    };
    probationService = {
      getMyProbation: jest.fn(),
      submitSelfAssessment: jest.fn(),
    };
    employeeMovementsService = {
      findMyMovements: jest.fn(),
      findMyMovement: jest.fn(),
      acknowledgeMyMovement: jest.fn(),
    };

    controller = new EmployeeSelfServiceController(
      employeeSelfServiceService as unknown as EmployeeSelfServiceService,
      profileChangeRequestsService as unknown as ProfileChangeRequestsService,
      notificationPreferencesService as unknown as NotificationPreferencesService,
      probationService as unknown as ProbationService,
      employeeMovementsService as unknown as EmployeeMovementsService,
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
        'http://localhost:3000/uploads/profile-photos/company-7/employee-15-avatar.png',
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

  it('reports a resolved default avatar as an available profile photo', async () => {
    employeeSelfServiceService.getProfilePhoto.mockResolvedValue({
      employee_id: 15,
      profile_photo_path: null,
      profile_photo_url:
        '/uploads/default-avatars/company-7/neutral-default.svg',
      profile_photo_source: 'neutral_default',
      default_avatar_id: null,
    });

    const result = await controller.getProfilePhoto({
      user,
      protocol: 'http',
      headers: {},
      get: jest.fn().mockReturnValue('localhost:3000'),
    } as unknown as ExpressRequest & { user: AuthenticatedUser });

    expect(result).toEqual(
      expect.objectContaining({
        has_profile_photo: true,
        profile_photo_path: null,
        profile_photo_url:
          'http://localhost:3000/uploads/default-avatars/company-7/neutral-default.svg',
      }),
    );
  });

  it('adds an absolute profile photo url to the profile response', async () => {
    employeeSelfServiceService.getProfile.mockResolvedValue({
      user: {
        id: 9,
        profile_photo_url:
          '/uploads/profile-photos/company-7/user-9-avatar.png',
      },
      employee: {
        id: 15,
        employee_no: 'EMP-0015',
        uploaded_profile_photo_url:
          '/uploads/profile-photos/company-7/employee-15-avatar.png',
        profile_photo_url:
          '/uploads/profile-photos/company-7/employee-15-avatar.png',
        manager: {
          id: 21,
          profile_photo_url:
            '/uploads/profile-photos/company-7/employee-21-avatar.png',
        },
      },
      links: {
        profile: '/me/profile',
      },
    });

    const rawResult: unknown = await controller.getProfile({
      user,
      protocol: 'http',
      headers: {},
      get: jest.fn().mockReturnValue('localhost:3000'),
    } as unknown as ExpressRequest & { user: AuthenticatedUser });
    const result = rawResult as {
      user: {
        id: number;
        profile_photo_url: string;
      };
      employee: {
        id: number;
        profile_photo_path: string | null;
        has_profile_photo: boolean;
        profile_photo_url: string;
        manager: {
          id: number;
          profile_photo_url: string;
        };
      };
    };

    expect(result.employee).toEqual(
      expect.objectContaining({
        id: 15,
        profile_photo_path:
          'http://localhost:3000/uploads/profile-photos/company-7/employee-15-avatar.png',
        has_profile_photo: true,
        profile_photo_url:
          'http://localhost:3000/uploads/profile-photos/company-7/employee-15-avatar.png',
      }),
    );
    expect(result.user).toEqual(
      expect.objectContaining({
        id: 9,
        profile_photo_url:
          'http://localhost:3000/uploads/profile-photos/company-7/user-9-avatar.png',
      }),
    );
    expect(result.employee.manager).toEqual(
      expect.objectContaining({
        id: 21,
        profile_photo_url:
          'http://localhost:3000/uploads/profile-photos/company-7/employee-21-avatar.png',
      }),
    );
  });

  it('adds absolute profile photo urls to nested dashboard relationships', async () => {
    employeeSelfServiceService.getDashboard.mockResolvedValue({
      user: {
        id: 9,
        profile_photo_url:
          '/uploads/profile-photos/company-7/user-9-avatar.png',
      },
      employee: {
        id: 15,
        profile_photo_url:
          '/uploads/profile-photos/company-7/employee-15-avatar.png',
        manager: {
          id: 21,
          name: 'Manager One',
          profile_photo_url:
            '/uploads/profile-photos/company-7/employee-21-avatar.png',
        },
      },
      leave: {
        recent_requests: [
          {
            approvals: [
              {
                approver: {
                  id: 31,
                  profile_photo_url:
                    '/uploads/profile-photos/company-7/employee-31-avatar.png',
                },
              },
            ],
          },
        ],
      },
    });

    const rawResult: unknown = await controller.getDashboard({
      user,
      protocol: 'http',
      headers: {},
      get: jest.fn().mockReturnValue('localhost:3000'),
    } as unknown as ExpressRequest & {
      user: AuthenticatedUser;
    });
    const result = rawResult as {
      employee: {
        manager: {
          id: number;
          profile_photo_url: string;
        };
      };
      leave: {
        recent_requests: Array<{
          approvals: Array<{
            approver: {
              profile_photo_url: string;
            };
          }>;
        }>;
      };
    };

    expect(result.employee.manager).toEqual(
      expect.objectContaining({
        id: 21,
        profile_photo_url:
          'http://localhost:3000/uploads/profile-photos/company-7/employee-21-avatar.png',
      }),
    );
    expect(
      result.leave.recent_requests[0].approvals[0].approver.profile_photo_url,
    ).toBe(
      'http://localhost:3000/uploads/profile-photos/company-7/employee-31-avatar.png',
    );
  });

  it('routes default avatar selection through the immediate self-service service', async () => {
    employeeSelfServiceService.selectProfileAvatar.mockResolvedValue({
      profile_photo_url: '/uploads/default-avatars/company-7/avatar-8.png',
    });

    await controller.selectProfileAvatar(
      {
        user,
      } as unknown as ExpressRequest & { user: AuthenticatedUser },
      { default_avatar_id: 8 },
    );

    expect(employeeSelfServiceService.selectProfileAvatar).toHaveBeenCalledWith(
      user,
      { default_avatar_id: 8 },
    );
  });

  it('applies HR profile photo uploads immediately without an approval request', async () => {
    const hrUser = { ...user, roles: ['HR_MANAGER'] };
    const file = {
      originalname: 'hr-avatar.png',
      mimetype: 'image/png',
      size: 128,
      buffer: Buffer.from('png'),
    };
    employeeSelfServiceService.uploadProfilePhoto.mockResolvedValue({
      profile_photo_url:
        '/uploads/profile-photos/company-7/employee-15-avatar.png',
    });

    await expect(
      controller.uploadProfilePhoto(
        {
          user: hrUser,
          headers: {},
        } as unknown as ExpressRequest & { user: AuthenticatedUser },
        file,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        approval_required: false,
        applied_immediately: true,
      }),
    );

    expect(employeeSelfServiceService.uploadProfilePhoto).toHaveBeenCalledWith(
      hrUser,
      file,
    );
    expect(
      profileChangeRequestsService.createProfilePhotoRequest,
    ).not.toHaveBeenCalled();
  });

  it('submits non-HR profile photo uploads for HR approval', async () => {
    const file = {
      originalname: 'staff-avatar.png',
      mimetype: 'image/png',
      size: 128,
      buffer: Buffer.from('png'),
    };
    profileChangeRequestsService.createProfilePhotoRequest.mockResolvedValue({
      id: 42,
      status: 'SUBMITTED',
    });

    await expect(
      controller.uploadProfilePhoto(
        {
          user,
          headers: {},
        } as unknown as ExpressRequest & { user: AuthenticatedUser },
        file,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 42,
        approval_required: true,
        applied_immediately: false,
      }),
    );

    expect(
      profileChangeRequestsService.createProfilePhotoRequest,
    ).toHaveBeenCalledWith(user, file, expect.any(Object));
    expect(
      employeeSelfServiceService.uploadProfilePhoto,
    ).not.toHaveBeenCalled();
  });

  it('routes self-service movement list and detail through employee-scoped calls', async () => {
    employeeMovementsService.findMyMovements.mockResolvedValue([{ id: 22 }]);
    employeeMovementsService.findMyMovement.mockResolvedValue({ id: 22 });

    await expect(
      controller.getMyMovements({
        user,
      } as unknown as ExpressRequest & { user: AuthenticatedUser }),
    ).resolves.toEqual([{ id: 22 }]);
    expect(employeeMovementsService.findMyMovements).toHaveBeenCalledWith(user);

    await expect(
      controller.getMyMovement(
        {
          user,
        } as unknown as ExpressRequest & { user: AuthenticatedUser },
        22,
      ),
    ).resolves.toEqual({ id: 22 });
    expect(employeeMovementsService.findMyMovement).toHaveBeenCalledWith(
      user,
      22,
    );
  });

  it('routes movement acknowledgement through the employee movement service', async () => {
    employeeMovementsService.acknowledgeMyMovement.mockResolvedValue({
      id: 22,
      acknowledged_at: '2026-09-22T06:00:00.000Z',
    });

    await expect(
      controller.acknowledgeMyMovement(
        {
          user,
        } as unknown as ExpressRequest & { user: AuthenticatedUser },
        22,
      ),
    ).resolves.toEqual({
      id: 22,
      acknowledged_at: '2026-09-22T06:00:00.000Z',
    });
    expect(employeeMovementsService.acknowledgeMyMovement).toHaveBeenCalledWith(
      user,
      22,
    );
  });
});
