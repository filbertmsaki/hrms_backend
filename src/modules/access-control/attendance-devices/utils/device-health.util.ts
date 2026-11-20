export function updateDeviceHealth(
  metadata: Record<string, unknown> | null,
  success: boolean,
  message: string,
  latencyMs: number,
  now = new Date(),
): Record<string, unknown> {
  const current = metadata ?? {};
  const operational = (
    current.operational &&
    typeof current.operational === 'object' &&
    !Array.isArray(current.operational)
      ? current.operational
      : {}
  ) as Record<string, unknown>;
  const prior = (
    operational.connection_test &&
    typeof operational.connection_test === 'object' &&
    !Array.isArray(operational.connection_test)
      ? operational.connection_test
      : {}
  ) as Record<string, unknown>;
  const authenticationFailed =
    !success &&
    /\b401\b|authentication|unauthorized|credentials/i.test(message);
  return {
    ...current,
    operational: {
      ...operational,
      connection_test: {
        success,
        status: success
          ? 'ONLINE'
          : authenticationFailed
            ? 'AUTHENTICATION_FAILED'
            : 'OFFLINE',
        tested_at: now.toISOString(),
        last_success_at: success
          ? now.toISOString()
          : (prior.last_success_at ?? null),
        consecutive_failures: success
          ? 0
          : Number(prior.consecutive_failures ?? 0) + 1,
        failure_started_at: success
          ? null
          : (prior.failure_started_at ?? now.toISOString()),
        latency_ms: latencyMs,
        message,
      },
    },
  };
}

export function readDeviceHealth(
  metadata: Record<string, unknown> | null,
  now = new Date(),
) {
  const operational = metadata?.operational as
    | Record<string, unknown>
    | undefined;
  const check = operational?.connection_test as
    | Record<string, unknown>
    | undefined;
  const testedAt =
    typeof check?.tested_at === 'string' ? Date.parse(check.tested_at) : NaN;
  const stale =
    !Number.isFinite(testedAt) || now.getTime() - testedAt > 30 * 60_000;
  return {
    status: stale
      ? 'UNKNOWN'
      : (check?.status ??
        (check?.success === true
          ? 'ONLINE'
          : check?.success === false
            ? 'OFFLINE'
            : 'UNKNOWN')),
    tested_at: check?.tested_at ?? null,
    last_success_at: check?.last_success_at ?? null,
    message: check?.message ?? null,
    latency_ms: check?.latency_ms ?? null,
  };
}
