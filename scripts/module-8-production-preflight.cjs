function yes(value) {
  return typeof value === 'string' && /^(true|1|yes|on)$/i.test(value.trim());
}

function has(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPublicHttps(value) {
  if (!has(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(
        url.hostname.toLowerCase(),
      )
    );
  } catch {
    return false;
  }
}

function report(label, passed, detail = '') {
  console.log(
    `${passed ? 'PASS' : 'BLOCKED'} ${label}${detail ? ` — ${detail}` : ''}`,
  );
  return passed;
}

function run() {
  const env = process.env;
  const results = [];
  const dbName = env.DB_NAME?.trim() ?? '';
  const production = env.APP_ENV?.trim().toLowerCase() === 'production';
  results.push(report('APP_ENV is production', production));
  results.push(
    report(
      'production database explicitly confirmed',
      has(dbName) && env.ATTENDANCE_PROD_CONFIRM_DB?.trim() === dbName,
      'ATTENDANCE_PROD_CONFIRM_DB must exactly match DB_NAME',
    ),
  );
  results.push(report('APP_URL uses HTTPS', isPublicHttps(env.APP_URL)));
  results.push(
    report('APP_FRONTEND_URL uses HTTPS', isPublicHttps(env.APP_FRONTEND_URL)),
  );
  results.push(
    report(
      'database connection is configured',
      has(env.DB_HOST) && has(env.DB_USERNAME) && has(env.DB_PASSWORD),
    ),
  );
  const dbTlsEnabled = yes(env.DB_SSL_ENABLED);
  const dbTlsPolicyExplicit =
    /^(true|false|1|0|yes|no|on|off)$/i.test(env.DB_SSL_ENABLED ?? '') &&
    /^(true|false|1|0|yes|no|on|off)$/i.test(
      env.DB_SSL_REJECT_UNAUTHORIZED ?? '',
    );
  const dbTlsSafe =
    dbTlsPolicyExplicit &&
    (dbTlsEnabled
      ? yes(env.DB_SSL_REJECT_UNAUTHORIZED)
      : has(env.ATTENDANCE_PROD_DB_TLS_EXCEPTION_REF));
  results.push(
    report(
      'database TLS policy is explicit and approved',
      dbTlsSafe,
      dbTlsEnabled
        ? 'certificate verification must remain enabled'
        : 'private-network exception evidence is required',
    ),
  );
  results.push(
    report(
      'public health detail exposure is disabled',
      /^(false|0|no|off)$/i.test(env.HEALTH_EXPOSE_DETAILS ?? ''),
    ),
  );
  results.push(
    report(
      'attendance processing state is explicit',
      /^(true|false|1|0|yes|no|on|off)$/i.test(
        env.ATTENDANCE_PROCESSING_ENABLED ?? '',
      ),
    ),
  );

  const requiredSecrets = [
    'APP_KEY',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'ATTENDANCE_DEVICE_SECRET_KEY',
    'BIOMETRIC_ENCRYPTION_KEY',
  ];
  for (const name of requiredSecrets) {
    results.push(report(`${name} supplied by secret manager`, has(env[name])));
  }

  const requiredEvidence = [
    ['ATTENDANCE_PROD_RELEASE_REF', 'approved release/change record'],
    ['ATTENDANCE_PROD_OPERATOR_REF', 'authorized deployment operator'],
    ['ATTENDANCE_PROD_PHASE5_SIGNOFF_REF', 'Phase 5 UAT sign-off'],
    ['ATTENDANCE_PROD_PHASE6_SIGNOFF_REF', 'Phase 6 hypercare exit sign-off'],
    ['ATTENDANCE_PROD_PHASE7_HANDOVER_REF', 'Phase 7 operational handover'],
    ['ATTENDANCE_PROD_BACKUP_RESTORE_REF', 'backup and restore rehearsal'],
    ['ATTENDANCE_PROD_MONITORING_REF', 'external monitoring and alert receipt'],
    [
      'ATTENDANCE_PROD_DEVICE_OWNER_REF',
      'device owner and connectivity approval',
    ],
    [
      'ATTENDANCE_PROD_RETENTION_APPROVAL_REF',
      'approved raw-log/location/selfie retention',
    ],
    [
      'ATTENDANCE_PROD_PRIVACY_SECURITY_REF',
      'Privacy/Security policy approval',
    ],
    [
      'ATTENDANCE_PROD_PAYROLL_APPROVAL_REF',
      'Payroll rules and reconciliation approval',
    ],
    ['ATTENDANCE_PROD_HR_APPROVAL_REF', 'HR attendance policy approval'],
    [
      'ATTENDANCE_PROD_OWNERS_TARGETS_REF',
      'Phase 7 owners, service targets, escalation routes',
    ],
  ];
  for (const [name, label] of requiredEvidence) {
    results.push(report(`${label} evidence supplied`, has(env[name])));
  }

  const blocked = results.filter((passed) => !passed).length;
  console.log(
    `\nProduction preflight: ${blocked === 0 ? 'READY FOR AUTHORIZED OPERATOR REVIEW' : `BLOCKED (${blocked} unmet gate(s))`}.`,
  );
  console.log(
    'This static check does not connect to production, deploy, run migrations, change settings, or prove runtime/device behavior.',
  );
  if (blocked > 0) process.exitCode = 1;
}

run();
