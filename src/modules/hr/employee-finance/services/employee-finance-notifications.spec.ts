import { NotificationChannelEnum } from '../../../notifications/enums/notification-channel.enum';
import { EmployeeFinanceReportsService } from './employee-finance-core.services';
import { EmployeeFinanceNotifierService } from './employee-finance-policy.services';

describe('employee finance notifications and report catalog', () => {
  it('registers the full, uniquely keyed set of required loan notification events', () => {
    const reports = new EmployeeFinanceReportsService(
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
      undefined as never,
    );
    const events = reports.notificationCatalog();
    const codes = events.map((event) => event.code);

    expect(events).toHaveLength(16);
    expect(new Set(codes).size).toBe(codes.length);
    expect(events.every((event) => event.required)).toBe(true);
    expect(codes).toContain('employee_finance.application.escalated');
    expect(codes).toContain('employee_finance.installment.overdue');
    expect(codes).toContain('employee_finance.account.settled');
  });

  it('sends deduplicated in-app and email notifications and excludes requested recipients', async () => {
    const createAndPush = jest.fn().mockResolvedValue(undefined);
    const service = new EmployeeFinanceNotifierService(
      { createAndPush } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const recipients = await service.notifyMemberships(
      42,
      [7, 8, 7],
      {
        title: 'Loan update',
        message: 'Your loan application changed.',
        entityType: 'EMPLOYEE_FINANCE_APPLICATION',
        entityId: 123,
        dedupeKey: 'finance-update-123',
      },
      [8],
    );

    expect(recipients).toEqual([7]);
    expect(createAndPush).toHaveBeenCalledTimes(1);
    expect(createAndPush).toHaveBeenCalledWith(
      expect.objectContaining({
        company_id: 42,
        receiver_company_user_id: 7,
        related_module: 'employee-finance',
        entity_id: 123,
        channels: [
          NotificationChannelEnum.IN_APP,
          NotificationChannelEnum.EMAIL,
        ],
        dedupe_key: 'finance-update-123:7',
      }),
    );
  });

  it('does not fail a loan action when notification delivery throws', async () => {
    const service = new EmployeeFinanceNotifierService(
      {
        createAndPush: jest
          .fn()
          .mockRejectedValue(new Error('email unavailable')),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.notifyMemberships(42, [7], {
        title: 'Loan update',
        message: 'Your loan application changed.',
        entityType: 'EMPLOYEE_FINANCE_APPLICATION',
        entityId: 123,
      }),
    ).resolves.toEqual([7]);
  });
});
