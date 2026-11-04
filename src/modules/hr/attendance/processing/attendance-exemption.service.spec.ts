import { BadRequestException } from '@nestjs/common';
import { AttendanceExemptionService } from './attendance-exemption.service';

describe('AttendanceExemptionService', () => {
  const setup = (
    locked: string | null,
    employee = { id: 1, attendance_exempt_from: null as string | null },
  ) => {
    const employeeRepository = {
      find: jest.fn(async () => [employee]),
      update: jest.fn(async () => undefined),
      manager: {
        query: jest.fn(async () => [{ locked_through: locked }]),
      },
    };
    const recalculationService = {
      refreshSummaries: jest.fn(async () => ({ job: { id: 99 } })),
    };
    const service = new AttendanceExemptionService(
      employeeRepository as never,
      recalculationService as never,
    );
    return { service, employeeRepository, recalculationService };
  };

  it('rejects an exemption starting inside a closed payroll period', async () => {
    const { service, employeeRepository } = setup('2026-08-31');

    await expect(
      service.updateExemptions(10, 5, {
        employee_ids: [1],
        exempt_from: '2026-08-15',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(employeeRepository.update).not.toHaveBeenCalled();
  });

  it('accepts an exemption after the closed period and recalculates from it', async () => {
    const { service, recalculationService } = setup('2026-08-31');

    await service.updateExemptions(10, 5, {
      employee_ids: [1],
      exempt_from: '2026-09-01',
    });

    expect(recalculationService.refreshSummaries).toHaveBeenCalledWith(
      10,
      5,
      expect.objectContaining({ start_date: '2026-09-01', employee_id: 1 }),
    );
  });

  it('only recalculates the open part when clearing an old exemption', async () => {
    const { service, recalculationService } = setup('2026-08-31', {
      id: 1,
      attendance_exempt_from: '2026-07-01',
    });

    await service.updateExemptions(10, 5, {
      employee_ids: [1],
      exempt_from: null,
    });

    expect(recalculationService.refreshSummaries).toHaveBeenCalledWith(
      10,
      5,
      expect.objectContaining({ start_date: '2026-09-01' }),
    );
  });
});
