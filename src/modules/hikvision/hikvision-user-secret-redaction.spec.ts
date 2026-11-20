import { HikvisionUserManagementService } from './hikvision-user-management.service';

describe('Hikvision user response redaction', () => {
  it('removes nested secrets without destroying access plan data', () => {
    const service = Object.create(
      HikvisionUserManagementService.prototype,
    ) as HikvisionUserManagementService;
    const input = {
      employeeNo: '42',
      password: '123456',
      nested: { pinCode: '5555', fingerData: 'template' },
      RightPlan: [{ doorNo: 1, planTemplateNo: '2' }],
    };
    const redact = (
      service as unknown as {
        redactUserSecrets: (
          user: Record<string, unknown>,
        ) => Record<string, unknown>;
      }
    ).redactUserSecrets.bind(service);
    const result = redact(input);
    expect(result).toEqual({
      employeeNo: '42',
      password: '[REDACTED]',
      nested: { pinCode: '[REDACTED]', fingerData: '[REDACTED]' },
      RightPlan: input.RightPlan,
    });
    expect(input.password).toBe('123456');
  });
});
