import { EmployeeDeviceAssignmentsService } from './employee-device-assignments.service';

describe('device employee number sequence', () => {
  it('counts padded and unpadded numbers, including deleted assignments and inactive identities', async () => {
    const assignments = {
      find: jest
        .fn()
        .mockResolvedValue([
          { employeeNo: '00000039' },
          { employeeNo: '120' },
          { employeeNo: 'not-numeric' },
        ]),
    };
    const identities = {
      find: jest.fn().mockResolvedValue([{ employeeNo: '00000130' }]),
    };
    const service = Object.create(
      EmployeeDeviceAssignmentsService.prototype,
    ) as {
      assignmentRepository: typeof assignments;
      employeeDeviceIdentityRepository: typeof identities;
      resolveNextDeviceEmployeeNumber(companyId: number): Promise<number>;
    };
    service.assignmentRepository = assignments;
    service.employeeDeviceIdentityRepository = identities;
    await expect(service.resolveNextDeviceEmployeeNumber(4)).resolves.toBe(131);
    expect(assignments.find).toHaveBeenCalledWith(
      expect.objectContaining({ withDeleted: true, where: { companyId: 4 } }),
    );
    expect(identities.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: 4 } }),
    );
  });
});
