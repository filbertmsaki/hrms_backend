import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  CreateLeaveManagementApprovalRuleDto,
  UpdateLeaveManagementApprovalRuleDto,
} from '../dtos/leave-management-approval-rule.dto';
import { LeaveManagementApprovalRule } from '../entities/leave-management-approval-rule.entity';
import { LeaveApproverTypeEnum } from '../enums/leave-approver-type.enum';
import { LeaveRecordStatusEnum } from '../enums/leave-record-status.enum';
import { LeaveAuditService } from './leave-audit.service';

/** HR configuration of conditional management approval (after HR). */
@Injectable()
export class LeaveManagementRuleService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly leaveAuditService: LeaveAuditService,
  ) {}

  private get repository() {
    return this.dataSource.getRepository(LeaveManagementApprovalRule);
  }

  list(companyId: number) {
    return this.repository.find({
      where: { company_id: companyId },
      order: { id: 'ASC' },
    });
  }

  async create(
    companyId: number,
    dto: CreateLeaveManagementApprovalRuleDto,
    actor: AuthenticatedUser,
  ) {
    const rule = this.repository.create({
      company_id: companyId,
      status: LeaveRecordStatusEnum.ACTIVE,
      created_by_company_user_id: actor.companyMembershipId ?? null,
    });
    this.applyChanges(rule, dto);
    this.assertApproverConfigured(rule);
    const saved = await this.repository.save(rule);
    await this.audit(companyId, saved, 'leave_management_rule.created', actor);
    return saved;
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateLeaveManagementApprovalRuleDto,
    actor: AuthenticatedUser,
  ) {
    const rule = await this.findOrFail(companyId, id);
    this.applyChanges(rule, dto);
    this.assertApproverConfigured(rule);
    const saved = await this.repository.save(rule);
    await this.audit(companyId, saved, 'leave_management_rule.updated', actor);
    return saved;
  }

  /** Deactivates the rule; requests already routed keep their approvers. */
  async deactivate(companyId: number, id: number, actor: AuthenticatedUser) {
    const rule = await this.findOrFail(companyId, id);
    rule.status = LeaveRecordStatusEnum.INACTIVE;
    const saved = await this.repository.save(rule);
    await this.audit(
      companyId,
      saved,
      'leave_management_rule.deactivated',
      actor,
    );
    return saved;
  }

  private async findOrFail(companyId: number, id: number) {
    const rule = await this.repository.findOne({
      where: { id, company_id: companyId },
    });
    if (!rule)
      throw new NotFoundException('Management approval rule not found');
    return rule;
  }

  private applyChanges(
    rule: LeaveManagementApprovalRule,
    dto: UpdateLeaveManagementApprovalRuleDto,
  ) {
    const list = (value: number[] | null | undefined) =>
      value?.length ? value : null;
    if (dto.name !== undefined) rule.name = dto.name.trim();
    if (dto.description !== undefined)
      rule.description = dto.description?.trim() || null;
    if (dto.status !== undefined) rule.status = dto.status;
    if (dto.leave_type_ids !== undefined)
      rule.leave_type_ids = list(dto.leave_type_ids);
    if (dto.position_ids !== undefined)
      rule.position_ids = list(dto.position_ids);
    if (dto.grade_ids !== undefined) rule.grade_ids = list(dto.grade_ids);
    if (dto.department_ids !== undefined)
      rule.department_ids = list(dto.department_ids);
    if (dto.min_total_days !== undefined)
      rule.min_total_days =
        dto.min_total_days === null ? null : String(dto.min_total_days);
    if (dto.approver_type !== undefined) rule.approver_type = dto.approver_type;
    if (dto.role_id !== undefined) rule.role_id = dto.role_id ?? null;
    if (dto.position_id !== undefined)
      rule.position_id = dto.position_id ?? null;
    if (dto.company_user_id !== undefined)
      rule.company_user_id = dto.company_user_id ?? null;
  }

  private assertApproverConfigured(rule: LeaveManagementApprovalRule) {
    const configured =
      (rule.approver_type === LeaveApproverTypeEnum.ROLE && rule.role_id) ||
      (rule.approver_type === LeaveApproverTypeEnum.POSITION &&
        rule.position_id) ||
      (rule.approver_type === LeaveApproverTypeEnum.COMPANY_USER &&
        rule.company_user_id);
    if (!configured) {
      throw new BadRequestException(
        'Choose the management approver: a role, a position or a specific user.',
      );
    }
    if (!rule.name?.trim()) {
      throw new BadRequestException('A rule name is required.');
    }
  }

  private audit(
    companyId: number,
    rule: LeaveManagementApprovalRule,
    action: string,
    actor: AuthenticatedUser,
  ) {
    return this.leaveAuditService.log({
      company_id: companyId,
      leave_request_id: null,
      action,
      entity_name: 'leave_management_approval_rule',
      entity_id: rule.id,
      actor,
      payload: { ...rule },
    });
  }
}
