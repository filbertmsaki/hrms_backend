import { AttendanceDeviceIdentityReviewService } from './attendance-device-identity-review.service';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceIdentity } from '../hr/attendance/processing/entities/employee-device-identity.entity';
import { EmployeeDeviceAccessAuditLog } from '../access-control/employee-device-access-audit-logs/entity/employee-device-access-audit-log.entity';

describe('device identity review', () => {
  it('unlinks only the HRMS assignment and creates an audit inside one transaction', async () => {
    const assignment = {
      employeeId: 7,
      employeeName: 'Device User',
      metadata: { other: true },
    };
    const assignments = {
      findOne: jest.fn().mockResolvedValue(assignment),
      save: jest.fn(),
    };
    const identities = { update: jest.fn() };
    const audits = { create: jest.fn((value) => value), save: jest.fn() };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === EmployeeDeviceAssignment
          ? assignments
          : entity === EmployeeDeviceIdentity
            ? identities
            : entity === EmployeeDeviceAccessAuditLog
              ? audits
              : null,
      ),
    };
    const dataSource = { transaction: jest.fn((fn) => fn(manager)) };
    const device = {
      updateUserOnDevice: jest.fn(),
      deleteUserFromDevice: jest.fn(),
    };
    const service = new AttendanceDeviceIdentityReviewService(
      device as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource as never,
    );
    await service.unlinkDeviceUser(
      1,
      2,
      {
        employee_no: '00000039',
        expected_employee_id: 7,
        reason: 'Wrong person',
      },
      10,
      11,
    );
    expect(assignment.employeeId).toBeNull();
    expect(assignment.metadata).toEqual(
      expect.objectContaining({
        other: true,
        attendance_identity_unlinked: true,
      }),
    );
    expect(identities.update).toHaveBeenCalledWith(
      { companyId: 1, deviceId: 2, employeeNo: '00000039', isActive: true },
      { isActive: false },
    );
    expect(audits.save).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { employee_id: 7 },
        newValues: { employee_id: null },
        requestPayload: {
          operation: 'unlink_hrms_only',
          reason: 'Wrong person',
        },
        performedByUserId: 10,
      }),
    );
    expect(device.updateUserOnDevice).not.toHaveBeenCalled();
    expect(device.deleteUserFromDevice).not.toHaveBeenCalled();
  });
  it('does not unlink a stale or changed assignment', async () => {
    const assignments = {
      findOne: jest.fn().mockResolvedValue({ employeeId: 8 }),
      save: jest.fn(),
    };
    const manager = { getRepository: jest.fn().mockReturnValue(assignments) };
    const service = new AttendanceDeviceIdentityReviewService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        transaction: (fn: (value: unknown) => unknown) => fn(manager),
      } as never,
    );
    await expect(
      service.unlinkDeviceUser(
        1,
        2,
        { employee_no: '39', expected_employee_id: 7, reason: 'Wrong person' },
        10,
        null,
      ),
    ).rejects.toThrow('assignment changed');
    expect(assignments.save).not.toHaveBeenCalled();
  });
  it('reads every device page and flags a name conflict and missing link', async () => {
    const users = {
      searchUsersOnDevice: jest
        .fn()
        .mockResolvedValueOnce({
          total_matches: 2,
          response_status: 'MORE',
          users: [{ employee_no: '39', name: 'Simon Mgendi Gitano' }],
        })
        .mockResolvedValueOnce({
          total_matches: 2,
          response_status: 'OK',
          users: [{ employee_no: '40', name: 'Unlinked User' }],
        }),
    };
    const resolver = {
      resolveEmployeeId: jest
        .fn()
        .mockResolvedValueOnce({ employeeId: 1, reason: 'ASSIGNMENT_MAP' })
        .mockResolvedValueOnce({
          employeeId: null,
          reason: 'IDENTITY_NOT_FOUND',
        }),
    };
    const employees = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        employee_no: 'HR1',
        first_name: 'Janki',
        middle_name: 'Pundrik',
        last_name: 'Sinha',
      }),
    };
    const service = new AttendanceDeviceIdentityReviewService(
      users as never,
      resolver as never,
      employees as never,
      {} as never,
      {} as never,
    );
    const result = await service.review(1, 2);
    expect(result.rows.map((row) => row.status)).toEqual([
      'MISMATCH',
      'IDENTITY_NOT_FOUND',
    ]);
    expect(result.rows[0].device_name).toBe('Simon Mgendi Gitano');
    expect(result.rows[0].employee_name).toBe('Janki Pundrik Sinha');
    expect(users.searchUsersOnDevice).toHaveBeenNthCalledWith(
      2,
      1,
      2,
      expect.objectContaining({ search_result_position: 1 }),
    );
  });

  it('fails rather than presenting an incomplete user list as complete', async () => {
    const users = {
      searchUsersOnDevice: jest.fn().mockResolvedValue({
        total_matches: 2,
        response_status: 'MORE',
        users: [],
      }),
    };
    const service = new AttendanceDeviceIdentityReviewService(
      users as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.review(1, 2)).rejects.toThrow('incomplete');
  });

  it('checks the current link and name, writes the HRMS name, verifies it, and audits the change', async () => {
    const users = {
      getUserByEmployeeNumber: jest
        .fn()
        .mockResolvedValueOnce({ exists: true, user: { name: 'Old Name' } })
        .mockResolvedValueOnce({
          exists: true,
          user: { name: 'Filbert Elisaria Msaki' },
        }),
      updateUserOnDevice: jest.fn().mockResolvedValue({}),
    };
    const resolver = {
      resolveEmployeeId: jest.fn().mockResolvedValue({ employeeId: 1 }),
    };
    const employees = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        first_name: 'Filbert',
        middle_name: 'Elisaria',
        last_name: 'Msaki',
      }),
    };
    const audit = {
      create: jest.fn().mockResolvedValue({ id: 77 }),
      markSuccess: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = new AttendanceDeviceIdentityReviewService(
      users as never,
      resolver as never,
      employees as never,
      audit as never,
      {} as never,
    );
    await service.correctDeviceName(
      2,
      3,
      {
        employee_no: '39',
        expected_employee_id: 1,
        expected_device_name: 'Old Name',
        expected_hrms_name: 'Filbert Elisaria Msaki',
        reason: 'Verified identity',
      },
      5,
      6,
    );
    expect(users.updateUserOnDevice).toHaveBeenCalledWith(2, 3, {
      employee_no: '39',
      name: 'Filbert Elisaria Msaki',
    });
    expect(audit.markSuccess).toHaveBeenCalledWith(77, {
      verified_device_name: 'Filbert Elisaria Msaki',
    });
  });

  it('refuses to update if the employee link changed', async () => {
    const users = { updateUserOnDevice: jest.fn() };
    const service = new AttendanceDeviceIdentityReviewService(
      users as never,
      {
        resolveEmployeeId: jest.fn().mockResolvedValue({ employeeId: 2 }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.correctDeviceName(
        1,
        2,
        {
          employee_no: '39',
          expected_employee_id: 1,
          expected_device_name: 'Old Name',
          expected_hrms_name: 'Filbert Msaki',
          reason: 'Verified',
        },
        5,
        null,
      ),
    ).rejects.toThrow('link changed');
    expect(users.updateUserOnDevice).not.toHaveBeenCalled();
  });

  it('records a failed audit when the device does not return the updated name', async () => {
    const users = {
      getUserByEmployeeNumber: jest
        .fn()
        .mockResolvedValue({ exists: true, user: { name: 'Old Name' } }),
      updateUserOnDevice: jest.fn().mockResolvedValue({}),
    };
    const audit = {
      create: jest.fn().mockResolvedValue({ id: 77 }),
      markSuccess: jest.fn(),
      markFailed: jest.fn(),
    };
    const service = new AttendanceDeviceIdentityReviewService(
      users as never,
      {
        resolveEmployeeId: jest.fn().mockResolvedValue({ employeeId: 1 }),
      } as never,
      {
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          first_name: 'Filbert',
          last_name: 'Msaki',
        }),
      } as never,
      audit as never,
      {} as never,
    );
    await expect(
      service.correctDeviceName(
        1,
        2,
        {
          employee_no: '39',
          expected_employee_id: 1,
          expected_device_name: 'Old Name',
          expected_hrms_name: 'Filbert Msaki',
          reason: 'Verified',
        },
        5,
        null,
      ),
    ).rejects.toThrow('could not be verified');
    expect(audit.markFailed).toHaveBeenCalledWith(
      77,
      expect.stringContaining('could not be verified'),
    );
    expect(audit.markSuccess).not.toHaveBeenCalled();
  });
});
