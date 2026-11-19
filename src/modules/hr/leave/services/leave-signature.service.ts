import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import type { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveRequestApproval } from '../entities/leave-request-approval.entity';
import {
  LEAVE_SIGNATURE_METHOD,
  LeaveSignature,
} from '../entities/leave-signature.entity';
import { LeaveStatusEnum } from '../enums/leave-status.enum';
import { LeaveAuditService } from './leave-audit.service';

/** Content that the signer vouches for; any change invalidates the signature. */
export type SignableLeave = Pick<
  LeaveRequest,
  | 'id'
  | 'leave_no'
  | 'employee_id'
  | 'leave_type_id'
  | 'start_date'
  | 'end_date'
  | 'total_days'
  | 'duration_type'
  | 'half_day_session'
  | 'start_time'
  | 'end_time'
  | 'reason'
  | 'approval_cycle'
>;

export type SignatureMarkInput = {
  kind: 'TYPED' | 'DRAWN';
  text?: string;
  png_base64?: string;
};
type ParsedMark = {
  kind: 'TYPED' | 'DRAWN';
  text: string | null;
  png: Buffer | null;
};

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const MAX_SIGNATURE_PNG_BYTES = 200 * 1024;

/** Validates a typed or drawn signature; throws a clear 400 otherwise. */
export function parseSignatureMark(
  mark: SignatureMarkInput | null | undefined,
): ParsedMark {
  if (!mark || (mark.kind !== 'TYPED' && mark.kind !== 'DRAWN'))
    throw new BadRequestException(
      'Sign your decision: type your name or draw your signature.',
    );
  if (mark.kind === 'TYPED') {
    const text = (mark.text ?? '').trim();
    if (text.length < 2 || text.length > 100)
      throw new BadRequestException('Type your full name to sign.');
    return { kind: 'TYPED', text, png: null };
  }
  const raw = String(mark.png_base64 ?? '').replace(
    /^data:image\/png;base64,/i,
    '',
  );
  const png = Buffer.from(raw, 'base64');
  if (
    png.length < 100 ||
    png.length > MAX_SIGNATURE_PNG_BYTES ||
    !png.subarray(0, 4).equals(PNG_MAGIC)
  )
    throw new BadRequestException('The drawn signature is not a valid image.');
  return { kind: 'DRAWN', text: null, png };
}

export type SignatureView = {
  id: number;
  role: 'EMPLOYEE' | 'APPROVER';
  approval_id: number | null;
  signer_name: string;
  decision: string | null;
  signed_at: Date;
  reference: string;
  method: string;
  /** false when the application changed after signing or the decision changed. */
  valid: boolean;
  invalid_reason: string | null;
  /** TYPED / DRAWN, or null for older confirmation-only signatures. */
  kind: 'TYPED' | 'DRAWN' | null;
  typed_text: string | null;
};

const CLOSED_FOR_EMPLOYEE_SIGNING = [
  LeaveStatusEnum.CANCELLED,
  LeaveStatusEnum.REJECTED,
];
const DECIDED = ['approved', 'rejected', 'returned'];

/**
 * Authenticated electronic signing for leave applications (FRS-11 form).
 * A signature is an HRMS record — authenticated session + explicit
 * confirmation + timestamp + SHA-256 of the signed content + audit entry.
 * It is NOT a certificate-based PDF signature and is never inferred from
 * submission or approval alone.
 */
@Injectable()
export class LeaveSignatureService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: LeaveAuditService,
  ) {}

  static documentHash(r: SignableLeave): string {
    const canonical = JSON.stringify({
      id: r.id,
      leave_no: r.leave_no,
      employee_id: r.employee_id,
      leave_type_id: r.leave_type_id,
      start_date: String(r.start_date).slice(0, 10),
      end_date: String(r.end_date).slice(0, 10),
      total_days: Number(r.total_days),
      duration_type: r.duration_type ?? null,
      half_day_session: r.half_day_session ?? null,
      start_time: r.start_time ?? null,
      end_time: r.end_time ?? null,
      reason: (r.reason ?? '').trim(),
      approval_cycle: r.approval_cycle,
    });
    return createHash('sha256').update(canonical).digest('hex');
  }

  private reference(): string {
    return `LSG-${randomBytes(5).toString('hex').toUpperCase()}`;
  }

  private async lockRequest(m: EntityManager, companyId: number, id: number) {
    const request = await m.getRepository(LeaveRequest).findOne({
      where: { id, company_id: companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!request) throw new NotFoundException('Leave request not found');
    return request;
  }

  private async nameOf(
    m: EntityManager,
    companyUserId: number,
  ): Promise<string> {
    const [row] = await m.query<Array<{ name: string | null }>>(
      `SELECT trim(concat_ws(' ', u.first_name, u.last_name)) AS name
         FROM company_users cu JOIN users u ON u.id = cu.user_id WHERE cu.id=$1`,
      [companyUserId],
    );
    return row?.name || `User ${companyUserId}`;
  }

  private assertConfirmed(confirm: unknown) {
    if (confirm !== true)
      throw new BadRequestException(
        'Signing needs explicit confirmation (confirm: true).',
      );
  }

  async signAsEmployee(
    companyId: number,
    requestId: number,
    actor: AuthenticatedUser,
    confirm: unknown,
    context: { ip?: string | null; userAgent?: string | null } = {},
    mark?: SignatureMarkInput | null,
  ): Promise<SignatureView> {
    this.assertConfirmed(confirm);
    const parsed = mark ? parseSignatureMark(mark) : null;
    const saved = await this.dataSource
      .transaction(async (m) => {
        const request = await this.lockRequest(m, companyId, requestId);
        const [owner] = await m.query<
          Array<{ company_user_id: number | null; name: string | null }>
        >(
          `SELECT company_user_id, trim(concat_ws(' ', first_name, last_name)) AS name FROM employees WHERE id=$1 AND company_id=$2`,
          [request.employee_id, companyId],
        );
        if (
          !owner ||
          !actor.companyMembershipId ||
          owner.company_user_id !== actor.companyMembershipId
        )
          throw new ForbiddenException(
            'Only the employee who applied can sign this application.',
          );
        if (CLOSED_FOR_EMPLOYEE_SIGNING.includes(request.status))
          throw new ConflictException(
            `A ${request.status} application cannot be signed.`,
          );
        const hash = LeaveSignatureService.documentHash(request);
        const repo = m.getRepository(LeaveSignature);
        const current = await repo.findOne({
          where: {
            leave_request_id: request.id,
            signer_role: 'EMPLOYEE',
            status: 'valid',
          },
        });
        if (current?.document_hash === hash)
          throw new ConflictException(
            `You already signed this application (reference ${current.audit_reference}).`,
          );
        if (current) {
          // The application changed since the last signature: keep it as history.
          current.status = 'superseded';
          current.superseded_at = new Date();
          await repo.save(current);
        }
        return repo.save(
          repo.create({
            company_id: companyId,
            leave_request_id: request.id,
            leave_request_approval_id: null,
            signer_role: 'EMPLOYEE',
            signer_company_user_id: actor.companyMembershipId,
            signer_employee_id: request.employee_id,
            signer_name:
              owner.name || (await this.nameOf(m, actor.companyMembershipId)),
            decision: null,
            method: parsed
              ? `HRMS_${parsed.kind}_SIGNATURE`
              : LEAVE_SIGNATURE_METHOD,
            signature_kind: parsed?.kind ?? null,
            signature_text: parsed?.text ?? null,
            signature_png: parsed?.png ?? null,
            document_hash: hash,
            approval_cycle: request.approval_cycle,
            status: 'valid',
            audit_reference: this.reference(),
            ip_address: context.ip?.slice(0, 64) ?? null,
            user_agent: context.userAgent?.slice(0, 300) ?? null,
          }),
        );
      })
      .catch((error) => this.rethrowDuplicate(error));
    await this.audit.log({
      company_id: companyId,
      leave_request_id: requestId,
      action: 'leave_request.signed_by_employee',
      entity_name: 'leave_signature',
      entity_id: saved.id,
      actor,
      payload: {
        reference: saved.audit_reference,
        document_hash: saved.document_hash,
        method: saved.method,
      },
    });
    return (await this.list(companyId, requestId)).find(
      (s) => s.id === saved.id,
    )!;
  }

  async signApproval(
    companyId: number,
    requestId: number,
    approvalId: number,
    actor: AuthenticatedUser,
    confirm: unknown,
    context: { ip?: string | null; userAgent?: string | null } = {},
    mark?: SignatureMarkInput | null,
    /** Run inside the caller's transaction (approve = sign). */
    outer?: EntityManager,
  ): Promise<SignatureView> {
    this.assertConfirmed(confirm);
    const parsed = mark ? parseSignatureMark(mark) : null;
    const run = <T>(fn: (m: EntityManager) => Promise<T>) =>
      outer ? fn(outer) : this.dataSource.transaction(fn);
    const saved = await run(async (m) => {
      const request = await this.lockRequest(m, companyId, requestId);
      const approval = await m.getRepository(LeaveRequestApproval).findOne({
        where: { id: approvalId, leave_request_id: request.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!approval)
        throw new NotFoundException(
          'Approval stage not found on this application.',
        );
      if (
        !actor.companyMembershipId ||
        approval.approver_company_user_id !== actor.companyMembershipId
      )
        throw new ForbiddenException(
          'Only the officer who decided this stage can sign it.',
        );
      if (!DECIDED.includes(String(approval.status)))
        throw new ConflictException(
          'Record the decision for this stage before signing it.',
        );
      if (approval.approval_cycle !== request.approval_cycle)
        throw new ConflictException(
          'This stage belongs to an earlier approval cycle and can no longer be signed.',
        );
      if (request.status === LeaveStatusEnum.CANCELLED)
        throw new ConflictException(
          'A cancelled application cannot be signed.',
        );
      const repo = m.getRepository(LeaveSignature);
      const existing = await repo.findOne({
        where: { leave_request_approval_id: approval.id },
      });
      if (existing)
        throw new ConflictException(
          `This stage is already signed (reference ${existing.audit_reference}).`,
        );
      return repo.save(
        repo.create({
          company_id: companyId,
          leave_request_id: request.id,
          leave_request_approval_id: approval.id,
          signer_role: 'APPROVER',
          signer_company_user_id: actor.companyMembershipId,
          signer_employee_id: actor.employeeId ?? null,
          signer_name: await this.nameOf(m, actor.companyMembershipId),
          decision: String(approval.status),
          method: parsed
            ? `HRMS_${parsed.kind}_SIGNATURE`
            : LEAVE_SIGNATURE_METHOD,
          signature_kind: parsed?.kind ?? null,
          signature_text: parsed?.text ?? null,
          signature_png: parsed?.png ?? null,
          document_hash: LeaveSignatureService.documentHash(request),
          approval_cycle: request.approval_cycle,
          status: 'valid',
          audit_reference: this.reference(),
          ip_address: context.ip?.slice(0, 64) ?? null,
          user_agent: context.userAgent?.slice(0, 300) ?? null,
        }),
      );
    }).catch((error) => this.rethrowDuplicate(error));
    await this.audit.log(
      {
        company_id: companyId,
        leave_request_id: requestId,
        action: 'leave_request.approval_signed',
        entity_name: 'leave_signature',
        entity_id: saved.id,
        actor,
        payload: {
          reference: saved.audit_reference,
          approval_id: approvalId,
          decision: saved.decision,
          document_hash: saved.document_hash,
          signature_kind: saved.signature_kind,
        },
      },
      outer,
    );
    return (await this.list(companyId, requestId, outer)).find(
      (s) => s.id === saved.id,
    )!;
  }

  /** All signatures with their current validity (history included). */
  async list(
    companyId: number,
    requestId: number,
    m: EntityManager = this.dataSource.manager,
  ): Promise<SignatureView[]> {
    const request = await m
      .getRepository(LeaveRequest)
      .findOne({ where: { id: requestId, company_id: companyId } });
    if (!request) throw new NotFoundException('Leave request not found');
    const hash = LeaveSignatureService.documentHash(request);
    const rows = await m.getRepository(LeaveSignature).find({
      where: { company_id: companyId, leave_request_id: requestId },
      order: { signed_at: 'ASC', id: 'ASC' },
    });
    const approvals = new Map(
      (
        await m
          .getRepository(LeaveRequestApproval)
          .find({ where: { leave_request_id: requestId } })
      ).map((a) => [a.id, a]),
    );
    return rows.map((s) => {
      let invalid: string | null = null;
      if (s.status === 'superseded')
        invalid = 'Superseded by a later signature';
      else if (s.document_hash !== hash)
        invalid = 'Application changed after signing';
      else if (s.leave_request_approval_id) {
        const a = approvals.get(s.leave_request_approval_id);
        if (!a) invalid = 'Approval stage no longer exists';
        else if (String(a.status) !== s.decision)
          invalid = 'Decision changed after signing';
      }
      return {
        id: s.id,
        role: s.signer_role,
        approval_id: s.leave_request_approval_id,
        signer_name: s.signer_name,
        decision: s.decision,
        signed_at: s.signed_at,
        reference: s.audit_reference,
        method: s.method,
        valid: invalid === null,
        invalid_reason: invalid,
        kind: s.signature_kind ?? null,
        typed_text: s.signature_text ?? null,
      };
    });
  }

  /** Drawn signature images by signature id (for the PDF only). */
  async drawnImages(
    companyId: number,
    requestId: number,
    m: EntityManager = this.dataSource.manager,
  ): Promise<Map<number, Buffer>> {
    const rows = await m
      .getRepository(LeaveSignature)
      .createQueryBuilder('s')
      .select(['s.id', 's.signature_png'])
      .addSelect('s.signature_png')
      .where('s.company_id = :companyId AND s.leave_request_id = :requestId', {
        companyId,
        requestId,
      })
      .andWhere("s.signature_kind = 'DRAWN'")
      .getMany();
    return new Map(
      rows
        .filter((r) => r.signature_png)
        .map((r) => [r.id, r.signature_png as Buffer]),
    );
  }

  private rethrowDuplicate(error: unknown): never {
    if (
      error instanceof QueryFailedError &&
      (error as QueryFailedError & { driverError?: { code?: string } })
        .driverError?.code === '23505'
    )
      throw new ConflictException('This signature was already recorded.');
    throw error;
  }
}
