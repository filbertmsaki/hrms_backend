import { AttendanceEmployeeResolverService } from './attendance-employee-resolver.service';

function makeResolver(
  deviceAssignments: unknown[],
  deviceIdentities: unknown[],
  globalAssignments: unknown[],
  globalIdentities: unknown[],
  employees: unknown[] = [],
) {
  const assignment = {
    find: jest
      .fn()
      .mockResolvedValue([
        ...deviceAssignments.map((row) => ({
          ...(row as object),
          deviceId: 2,
        })),
        ...globalAssignments.map((row) => ({
          ...(row as object),
          deviceId: null,
        })),
      ]),
  };
  const identity = {
    find: jest
      .fn()
      .mockResolvedValue([
        ...deviceIdentities.map((row) => ({ ...(row as object), deviceId: 2 })),
        ...globalIdentities.map((row) => ({
          ...(row as object),
          deviceId: null,
        })),
      ]),
  };
  const query: Record<string, jest.Mock> = {};
  for (const method of ['innerJoin', 'where', 'andWhere', 'orderBy', 'take'])
    query[method] = jest.fn().mockReturnValue(query);
  query.getMany = jest.fn().mockResolvedValue(employees);
  const employee = { createQueryBuilder: jest.fn().mockReturnValue(query) };
  return {
    service: new AttendanceEmployeeResolverService(
      assignment as never,
      identity as never,
      employee as never,
    ),
    assignment,
    identity,
    employee,
  };
}

describe('attendance employee resolution', () => {
  it('uses a device-specific identity before a global assignment', async () => {
    const { service, assignment } = makeResolver(
      [],
      [{ employeeId: 7 }],
      [{ employeeId: 9 }],
      [],
    );
    expect(await service.resolveEmployeeId(1, ' 001 ', 2)).toEqual({
      employeeId: 7,
      reason: 'IDENTITY_MAP',
    });
    expect(assignment.find).toHaveBeenCalledTimes(1);
  });
  it('leaves conflicting device mappings unmatched', async () => {
    const { service, employee } = makeResolver(
      [{ employeeId: 7 }],
      [{ employeeId: 9 }],
      [],
      [],
    );
    expect(await service.resolveEmployeeId(1, '001', 2)).toEqual({
      employeeId: null,
      reason: 'AMBIGUOUS_IDENTITY',
    });
    expect(employee.createQueryBuilder).not.toHaveBeenCalled();
  });
  it('leaves duplicate HR employee numbers unmatched', async () => {
    const { service } = makeResolver([], [], [], [], [{ id: 7 }, { id: 9 }]);
    expect(await service.resolveEmployeeId(1, '001', 2)).toEqual({
      employeeId: null,
      reason: 'AMBIGUOUS_EMPLOYEE_NO',
    });
  });
  it('uses an unambiguous global fallback if device-specific maps are absent', async () => {
    const { service } = makeResolver([], [], [{ employeeId: 9 }], []);
    expect(await service.resolveEmployeeId(1, '001', 2)).toEqual({
      employeeId: 9,
      reason: 'ASSIGNMENT_MAP',
    });
  });
});
