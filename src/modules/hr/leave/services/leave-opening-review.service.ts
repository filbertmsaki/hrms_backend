import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveBalance } from '../entities/leave-balance.entity';
import { LeaveAuditLog } from '../entities/leave-audit-log.entity';
import {
  openingPreviewFingerprint,
  previewLegacyOpeningBalance,
} from '../utils/leave-opening-preview.util';
import { LeaveAuditService } from './leave-audit.service';

@Injectable()
export class LeaveOpeningReviewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: HrAccessService,
    private readonly audit: LeaveAuditService,
  ) {}

  async listPreviewReviews(
    companyId: number,
    actor: AuthenticatedUser,
    balanceId: number,
  ) {
    const balance = await this.dataSource
      .getRepository(LeaveBalance)
      .findOne({ where: { id: balanceId } });
    if (
      !balance ||
      (balance.company_id !== null && balance.company_id !== companyId)
    )
      throw new NotFoundException('Leave balance not found');
    const employee = await this.dataSource
      .getRepository(Employee)
      .findOne({ where: { id: balance.employee_id, company_id: companyId } });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, employee);
    return this.dataSource.getRepository(LeaveAuditLog).find({
      where: {
        company_id: companyId,
        entity_name: 'leave_balance',
        entity_id: balanceId,
        action: 'leave_opening_preview.reviewed',
      },
      order: { id: 'DESC' },
      take: 100,
    });
  }

  async recordPreviewReview(
    companyId: number,
    actor: AuthenticatedUser,
    input: { balanceId: number; fingerprint: string; reason: string },
  ) {
    const reason = input.reason.trim();
    if (!reason) throw new BadRequestException('A review reason is required');
    if (!actor.companyMembershipId)
      throw new BadRequestException('A company membership is required');
    return this.dataSource.transaction(async (manager) => {
      const balance = await manager.getRepository(LeaveBalance).findOne({
        where: { id: input.balanceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !balance ||
        (balance.company_id !== null && balance.company_id !== companyId)
      )
        throw new NotFoundException('Leave balance not found');
      const employee = await manager
        .getRepository(Employee)
        .findOne({ where: { id: balance.employee_id, company_id: companyId } });
      if (!employee) throw new NotFoundException('Employee not found');
      await this.access.assertCanAccessEmployee(actor, employee);
      const fingerprint = openingPreviewFingerprint(balance);
      if (fingerprint !== input.fingerprint)
        throw new ConflictException(
          'Balance preview has changed; refresh it before review',
        );
      const preview = previewLegacyOpeningBalance(balance);
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_opening_preview.reviewed',
          entity_name: 'leave_balance',
          entity_id: balance.id,
          actor,
          payload: {
            employee_id: balance.employee_id,
            leave_type_id: balance.leave_type_id,
            fiscal_year: balance.fiscal_year,
            balance_version: balance.version,
            fingerprint,
            preview,
            reason,
            is_cutover_signoff: false,
          },
        },
        manager,
      );
      return {
        balance_id: balance.id,
        fingerprint,
        preview,
        status: 'preview_reviewed',
        is_cutover_signoff: false,
      };
    });
  }
}
