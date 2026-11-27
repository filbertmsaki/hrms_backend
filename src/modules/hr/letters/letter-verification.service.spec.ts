import { ConfigService } from '@nestjs/config';
import {
  LetterVerificationService,
  generateLetterVerificationToken,
  resolveLetterVerificationStatus,
} from './letter-verification.service';

const TOKEN = generateLetterVerificationToken();

function serviceWith(row: Record<string, unknown> | null) {
  const query = jest.fn().mockResolvedValue(row ? [row] : []);
  const config = new ConfigService({
    APP_FRONTEND_URL: 'https://hrms.example.co.tz/',
  });
  const files = { readManagedFile: jest.fn().mockResolvedValue(null) };
  return {
    service: new LetterVerificationService(
      { query } as never,
      config,
      files as never,
    ),
    query,
  };
}

const ISSUED_ROW = {
  status: 'ISSUED',
  reference_no: 'LTR-2026-00007',
  letter_type: 'SALARY_INCREMENT',
  issued_at: new Date('2026-11-20T10:00:00Z'),
  recipient_name: 'Asha Mwinyi',
  verification_revoked_at: null,
  company_name: 'Alliance',
  company_metadata: { logo_url: '/private-uploads/logo.png' },
  employee_no: 'AIC-0042',
  // Even if a query returned these, they must never reach the response.
  body: 'Your new salary is TZS 9,000,000',
  values: { salary: 'TZS 9,000,000' },
  cancellation_reason: 'secret',
};

describe('LetterVerificationService', () => {
  it('issues 43-char base64url tokens', () => {
    expect(TOKEN).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('builds the public URL like leave verification', () => {
    const { service } = serviceWith(null);
    expect(service.buildVerificationUrl(TOKEN)).toBe(
      `https://hrms.example.co.tz/verify/letter/${TOKEN}`,
    );
  });

  it('returns only public facts for a valid letter', async () => {
    const { service, query } = serviceWith(ISSUED_ROW);
    const now = new Date('2026-11-27T08:00:00Z');
    const result = await service.lookup(TOKEN, now);
    expect(Object.keys(result).sort()).toEqual(
      [
        'checked_at',
        'company_logo',
        'company_name',
        'employee_no',
        'issued_at',
        'letter_type_label',
        'recipient_name',
        'reference_no',
        'status',
      ].sort(),
    );
    expect(result).toMatchObject({
      status: 'valid',
      reference_no: 'LTR-2026-00007',
      letter_type_label: 'Salary increment letter',
      employee_no: 'AIC-0042',
      checked_at: now.toISOString(),
    });
    expect(JSON.stringify(result)).not.toMatch(/9,000,000|secret|salary is/);
    const sql = String(query.mock.calls[0][0]);
    expect(sql).not.toMatch(/l\.body|l\.values|extra_values|reason/);
  });

  it('reports not_found for unknown or malformed tokens without querying bad input', async () => {
    const { service, query } = serviceWith(null);
    expect((await service.lookup('short')).status).toBe('not_found');
    expect(query).not.toHaveBeenCalled();
    expect(await service.lookup(TOKEN)).toMatchObject({
      status: 'not_found',
      reference_no: null,
      recipient_name: null,
    });
  });

  it('maps statuses', () => {
    expect(
      resolveLetterVerificationStatus({
        status: 'ISSUED',
        verification_revoked_at: null,
      }),
    ).toBe('valid');
    expect(
      resolveLetterVerificationStatus({
        status: 'CANCELLED',
        verification_revoked_at: new Date(),
      }),
    ).toBe('cancelled');
    expect(
      resolveLetterVerificationStatus({
        status: 'SUPERSEDED',
        verification_revoked_at: null,
      }),
    ).toBe('superseded');
    expect(
      resolveLetterVerificationStatus({
        status: 'ISSUED',
        verification_revoked_at: new Date(),
      }),
    ).toBe('revoked');
  });
});
