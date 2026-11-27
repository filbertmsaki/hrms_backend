import { randomBytes } from 'crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { FilesService } from '../../files/files.service';
import { isPrivateHost } from '../leave/services/leave-verification.service';
import { LetterStatusEnum, letterTypeLabel } from './letter-catalogue';

/** 32 random bytes, base64url: 43 chars. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const LOGO_MAX_BYTES = 512 * 1024;

export type LetterVerificationStatus =
  | 'valid'
  | 'cancelled'
  | 'superseded'
  | 'revoked'
  | 'not_found';

/**
 * Everything the public page may show. Never the body, salary, reasons or
 * extra values.
 */
export type PublicLetterVerification = {
  status: LetterVerificationStatus;
  company_name: string | null;
  company_logo: string | null;
  reference_no: string | null;
  letter_type_label: string | null;
  issued_at: string | null;
  recipient_name: string | null;
  employee_no: string | null;
  checked_at: string;
};

type LookupRow = {
  status: string;
  reference_no: string;
  letter_type: string;
  issued_at: Date | string | null;
  recipient_name: string;
  verification_revoked_at: Date | string | null;
  company_name: string;
  company_metadata: Record<string, unknown> | null;
  employee_no: string | null;
};

export function generateLetterVerificationToken(): string {
  return randomBytes(32).toString('base64url');
}

export function resolveLetterVerificationStatus(row: {
  status: string;
  verification_revoked_at: unknown;
}): LetterVerificationStatus {
  if ((row.status as LetterStatusEnum) === LetterStatusEnum.CANCELLED)
    return 'cancelled';
  if ((row.status as LetterStatusEnum) === LetterStatusEnum.SUPERSEDED)
    return 'superseded';
  if (row.verification_revoked_at) return 'revoked';
  if ((row.status as LetterStatusEnum) === LetterStatusEnum.ISSUED)
    return 'valid';
  return 'not_found';
}

@Injectable()
export class LetterVerificationService {
  private readonly logger = new Logger(LetterVerificationService.name);
  private privateHostWarned = false;

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
  ) {}

  /** Same env resolution as LeaveVerificationService.buildVerificationUrl. */
  buildVerificationUrl(token: string): string {
    const raw = String(
      this.configService.get<string>('LEAVE_VERIFICATION_BASE_URL') ||
        this.configService.get<string>('APP_FRONTEND_URL') ||
        '',
    ).trim();
    let parsed: URL | null = null;
    try {
      parsed = raw ? new URL(raw) : null;
    } catch {
      parsed = null;
    }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      throw new ServiceUnavailableException(
        'Letter verification is not configured: set LEAVE_VERIFICATION_BASE_URL or APP_FRONTEND_URL to the public HRMS address.',
      );
    }
    if (isPrivateHost(parsed.hostname) && !this.privateHostWarned) {
      this.privateHostWarned = true;
      this.logger.warn(
        `Letter QR codes point at a private address (${parsed.hostname}); they only open on the internal network.`,
      );
    }
    return `${raw.replace(/\/+$/, '')}/verify/letter/${token}`;
  }

  async lookup(
    token: string,
    now = new Date(),
  ): Promise<PublicLetterVerification> {
    const notFound: PublicLetterVerification = {
      status: 'not_found',
      company_name: null,
      company_logo: null,
      reference_no: null,
      letter_type_label: null,
      issued_at: null,
      recipient_name: null,
      employee_no: null,
      checked_at: now.toISOString(),
    };
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token))
      return notFound;
    const rows = await this.dataSource.query<LookupRow[]>(
      `SELECT l.status, l.reference_no, l.letter_type, l.issued_at, l.recipient_name,
              l.verification_revoked_at, c.name AS company_name, c.metadata AS company_metadata,
              e.employee_no
         FROM employee_letters l
         JOIN companies c ON c.id = l.company_id
         LEFT JOIN employees e ON e.id = l.employee_id
        WHERE l.verification_token = $1
        LIMIT 1`,
      [token],
    );
    const row = rows[0];
    if (!row || !row.issued_at) return notFound;
    const logoUrl =
      typeof row.company_metadata?.logo_url === 'string'
        ? row.company_metadata.logo_url.trim()
        : '';
    return {
      status: resolveLetterVerificationStatus(row),
      company_name: row.company_name,
      company_logo: logoUrl ? await this.readLogo(logoUrl) : null,
      reference_no: row.reference_no,
      letter_type_label: letterTypeLabel(row.letter_type),
      issued_at: new Date(row.issued_at).toISOString(),
      recipient_name: row.recipient_name,
      employee_no: row.employee_no ?? null,
      checked_at: now.toISOString(),
    };
  }

  private async readLogo(logoUrl: string): Promise<string | null> {
    try {
      const buffer = await this.filesService.readManagedFile(logoUrl);
      if (!buffer || buffer.length > LOGO_MAX_BYTES) return null;
      const mime =
        buffer[0] === 0x89 && buffer[1] === 0x50
          ? 'image/png'
          : buffer[0] === 0xff && buffer[1] === 0xd8
            ? 'image/jpeg'
            : buffer.subarray(8, 12).toString('ascii') === 'WEBP'
              ? 'image/webp'
              : null;
      return mime ? `data:${mime};base64,${buffer.toString('base64')}` : null;
    } catch {
      return null;
    }
  }
}
