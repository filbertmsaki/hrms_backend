import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { FilesService } from '../../../files/files.service';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveVerificationRevocation } from '../entities/leave-verification-revocation.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';

/** 32 random bytes, base64url: 43 chars, 256 bits — not enumerable. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type LeaveVerificationStatus =
  | 'valid'
  | 'expired'
  | 'pending'
  | 'returned'
  | 'rejected'
  | 'cancelled'
  | 'revoked';

/**
 * Everything the public verification page may show. Deliberately excludes
 * the leave reason, comments, approver names, attachments and balances.
 */
export type PublicLeaveVerification = {
  verification_status: LeaveVerificationStatus;
  company: { name: string; logo_data_url: string | null };
  employee_name: string;
  employee_no: string;
  department_name: string | null;
  leave_no: string;
  leave_type_name: string;
  start_date: string;
  end_date: string;
  total_days: string;
  approval_status: string;
  approved_at: string | null;
  /** Set only when HR revoked this specific code. */
  code_revoked_at: string | null;
  checked_at: string;
};

/** What HR sees about a request's current code (never the token itself). */
export type LeaveVerificationCodeState = {
  has_active_code: boolean;
  revocations: { revoked_at: string; reason: string }[];
};

const LOGO_MAX_BYTES = 512 * 1024;

@Injectable()
export class LeaveVerificationService {
  constructor(
    @InjectRepository(LeaveRequest)
    private readonly leaveRequestRepository: Repository<LeaveRequest>,
    @InjectRepository(LeaveVerificationRevocation)
    private readonly revocationRepository: Repository<LeaveVerificationRevocation>,
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Returns the request's verification token, issuing one on first use.
   * The conditional update keeps concurrent PDF downloads on one token.
   */
  async ensureToken(leaveRequestId: number): Promise<string> {
    const existing = await this.readToken(leaveRequestId);
    if (existing) return existing;
    await this.leaveRequestRepository.update(
      { id: leaveRequestId, verification_token: IsNull() },
      { verification_token: randomBytes(32).toString('base64url') },
    );
    const token = await this.readToken(leaveRequestId);
    if (!token) throw new NotFoundException('Leave request not found');
    return token;
  }

  /**
   * Withdraws the request's current code. Old printouts then verify as
   * "revoked"; the next PDF download issues a fresh code. Caller checks
   * access and permission.
   */
  async revoke(
    manager: EntityManager,
    input: {
      companyId: number;
      leaveRequestId: number;
      reason: string;
      userId: number | null;
    },
  ): Promise<LeaveVerificationRevocation> {
    const row = await manager
      .getRepository(LeaveRequest)
      .createQueryBuilder('leave')
      .addSelect('leave.verification_token')
      .where('leave.id = :id AND leave.company_id = :companyId', {
        id: input.leaveRequestId,
        companyId: input.companyId,
      })
      .setLock('pessimistic_write')
      .getOne();
    if (!row) throw new NotFoundException('Leave request not found');
    if (!row.verification_token) {
      throw new BadRequestException(
        'This leave request has no active verification code to revoke. A code is issued when its PDF is downloaded.',
      );
    }
    const saved = await manager
      .getRepository(LeaveVerificationRevocation)
      .save({
        company_id: input.companyId,
        leave_request_id: row.id,
        token: row.verification_token,
        reason: input.reason,
        revoked_by_user_id: input.userId,
      });
    await manager
      .getRepository(LeaveRequest)
      .update({ id: row.id }, { verification_token: null });
    return saved;
  }

  async getCodeState(
    leaveRequestId: number,
  ): Promise<LeaveVerificationCodeState> {
    const [token, revocations] = await Promise.all([
      this.readToken(leaveRequestId),
      this.revocationRepository.find({
        where: { leave_request_id: leaveRequestId },
        order: { revoked_at: 'DESC' },
      }),
    ]);
    return {
      has_active_code: !!token,
      revocations: revocations.map((r) => ({
        revoked_at: r.revoked_at.toISOString(),
        reason: r.reason,
      })),
    };
  }

  buildVerificationUrl(token: string): string {
    const base = String(
      this.configService.get<string>('APP_FRONTEND_URL') ?? '',
    ).replace(/\/+$/, '');
    return `${base}/verify/leave/${token}`;
  }

  /** Public lookup. Unknown and malformed tokens get the same 404. */
  async lookup(
    token: string,
    now = new Date(),
  ): Promise<PublicLeaveVerification> {
    const notFound = new NotFoundException(
      'This verification code is not recognised.',
    );
    if (typeof token !== 'string' || !TOKEN_PATTERN.test(token)) throw notFound;

    const relations = {
      company: true,
      leave_type: true,
      employee: { primary_department: true },
    } as const;
    let leave = await this.leaveRequestRepository.findOne({
      where: { verification_token: token },
      relations,
    });
    let revocation: LeaveVerificationRevocation | null = null;
    if (!leave) {
      revocation = await this.revocationRepository.findOne({
        where: { token },
      });
      if (revocation) {
        leave = await this.leaveRequestRepository.findOne({
          where: { id: revocation.leave_request_id },
          relations,
        });
      }
    }
    if (!leave) throw notFound;

    const metadata = leave.company.metadata ?? {};
    const timezone =
      typeof metadata.timezone === 'string' && metadata.timezone.trim()
        ? metadata.timezone.trim()
        : 'Africa/Dar_es_Salaam';
    const logoUrl =
      typeof metadata.logo_url === 'string' ? metadata.logo_url.trim() : '';

    const employee = leave.employee;
    const employeeName = [
      employee.first_name,
      employee.middle_name,
      employee.last_name,
    ]
      .map((part) => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean)
      .join(' ');

    return {
      verification_status: revocation
        ? 'revoked'
        : this.resolveStatus(leave, this.today(now, timezone)),
      company: {
        name: leave.company.name,
        logo_data_url: logoUrl ? await this.readLogo(logoUrl) : null,
      },
      employee_name: employeeName,
      employee_no: employee.employee_no,
      department_name: employee.primary_department?.name ?? null,
      leave_no: leave.leave_no,
      leave_type_name: leave.leave_type.name,
      start_date: String(leave.start_date).slice(0, 10),
      end_date: String(leave.end_date).slice(0, 10),
      total_days: String(leave.total_days),
      approval_status: leave.status,
      approved_at: leave.approved_at ? leave.approved_at.toISOString() : null,
      code_revoked_at: revocation ? revocation.revoked_at.toISOString() : null,
      checked_at: now.toISOString(),
    };
  }

  resolveStatus(
    leave: Pick<LeaveRequest, 'status' | 'approved_at' | 'end_date'>,
    today: string,
  ): LeaveVerificationStatus {
    switch (leave.status) {
      case LeaveStatusEnum.APPROVED:
        return String(leave.end_date).slice(0, 10) < today
          ? 'expired'
          : 'valid';
      case LeaveStatusEnum.REJECTED:
        return 'rejected';
      case LeaveStatusEnum.RETURNED_FOR_CORRECTION:
        return 'returned';
      case LeaveStatusEnum.CANCELLED:
        // Cancelled after it was approved = the approval was withdrawn.
        return leave.approved_at ? 'revoked' : 'cancelled';
      default:
        // Draft, submitted and every in-review stage.
        return 'pending';
    }
  }

  private today(now: Date, timezone: string): string {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(now);
    } catch {
      return now.toISOString().slice(0, 10);
    }
  }

  private async readToken(id: number): Promise<string | null> {
    const row = await this.leaveRequestRepository
      .createQueryBuilder('leave')
      .addSelect('leave.verification_token')
      .where('leave.id = :id', { id })
      .getOne();
    return row?.verification_token ?? null;
  }

  private async readLogo(logoUrl: string): Promise<string | null> {
    try {
      const buffer = await this.filesService.readManagedFile(logoUrl);
      if (!buffer || buffer.length > LOGO_MAX_BYTES) return null;
      const mime = this.sniffImageMime(buffer);
      return mime ? `data:${mime};base64,${buffer.toString('base64')}` : null;
    } catch {
      return null;
    }
  }

  private sniffImageMime(buffer: Buffer): string | null {
    if (
      buffer
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ) {
      return 'image/png';
    }
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
    if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'image/webp';
    }
    return null;
  }
}
