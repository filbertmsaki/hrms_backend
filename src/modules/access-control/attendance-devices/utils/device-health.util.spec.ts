import { readDeviceHealth, updateDeviceHealth } from './device-health.util';

describe('device connection health', () => {
  it('preserves the last successful connection after a failure and expires stale status', () => {
    const first = new Date('2026-01-01T10:00:00Z');
    const online = updateDeviceHealth(null, true, 'OK', 20, first);
    const failed = updateDeviceHealth(
      online,
      false,
      'Network timeout',
      5000,
      new Date('2026-01-01T10:10:00Z'),
    );
    expect(
      readDeviceHealth(failed, new Date('2026-01-01T10:11:00Z')),
    ).toMatchObject({
      status: 'OFFLINE',
      last_success_at: first.toISOString(),
    });
    expect(
      readDeviceHealth(failed, new Date('2026-01-01T11:00:00Z')).status,
    ).toBe('UNKNOWN');
  });
  it('classifies authentication failures and counts consecutive failures', () => {
    const first = updateDeviceHealth(
      null,
      false,
      '401 authentication failed',
      50,
    );
    const second = updateDeviceHealth(
      first,
      false,
      '401 authentication failed',
      50,
    );
    expect(readDeviceHealth(second).status).toBe('AUTHENTICATION_FAILED');
    expect(
      (second.operational as any).connection_test.consecutive_failures,
    ).toBe(2);
  });
});
