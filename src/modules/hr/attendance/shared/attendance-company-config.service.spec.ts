import { AttendanceCompanyConfigService } from './attendance-company-config.service';

describe('AttendanceCompanyConfigService.resolveRuntimeDefaults', () => {
  const defaultPolicy = { id: 1, company_id: 7, is_active: true };
  const assignedPolicy = { id: 2, company_id: 7, is_active: false };

  function build(employeeMetadata: Record<string, unknown> | null) {
    const policyRepo = {
      findOne: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if (where.id === 2 && where.company_id === 7) {
          return Promise.resolve(
            where.is_active === true ? null : assignedPolicy,
          );
        }
        if (where.is_active === true) return Promise.resolve(defaultPolicy);
        return Promise.resolve(null);
      }),
    };
    const employeeRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 5, metadata: employeeMetadata }),
    };
    return new AttendanceCompanyConfigService(
      policyRepo as never,
      employeeRepo as never,
    );
  }

  it('applies an assigned policy even when it is not the company default', async () => {
    const service = build({ attendance_policy_id: 2 });
    await expect(service.resolveRuntimeDefaults(7, 5)).resolves.toBe(
      assignedPolicy,
    );
  });

  it('falls back to the company default when nothing is assigned', async () => {
    const service = build(null);
    await expect(service.resolveRuntimeDefaults(7, 5)).resolves.toBe(
      defaultPolicy,
    );
  });

  it('falls back to the company default when the assigned policy is gone', async () => {
    const service = build({ attendance_policy_id: 99 });
    await expect(service.resolveRuntimeDefaults(7, 5)).resolves.toBe(
      defaultPolicy,
    );
  });
});
