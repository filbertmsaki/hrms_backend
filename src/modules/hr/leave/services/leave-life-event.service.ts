import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { LeaveDocument } from '../entities/leave-document.entity';
import {
  LeaveLifeEvent,
  LeaveLifeEventType,
  LeaveRuleOverride,
} from '../entities/leave-life-event.entity';
import { LeaveRequest } from '../entities/leave-request.entity';
import { LeaveAuditService } from './leave-audit.service';

/** Rules whose override must carry a certificate (policy: certificate + reason). */
const CERTIFICATE_REQUIRED = new Set([
  'RETURN_TO_WORK',
  'MATERNITY_EARLY_START',
]);

@Injectable()
export class LeaveLifeEventService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly access: HrAccessService,
    private readonly audit: LeaveAuditService,
  ) {}

  private async employee(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
  ) {
    const e = await this.dataSource
      .getRepository(Employee)
      .findOne({ where: { id: employeeId, company_id: companyId } });
    if (!e) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, e);
    return e;
  }

  private async assertDocument(
    companyId: number,
    employeeId: number,
    documentId?: number | null,
  ) {
    if (!documentId) return;
    const doc = await this.dataSource
      .getRepository(LeaveDocument)
      .findOne({ where: { id: documentId } });
    const req = doc
      ? await this.dataSource.getRepository(LeaveRequest).findOne({
          where: { id: doc.leave_request_id, company_id: companyId },
        })
      : null;
    if (!doc || !req || req.employee_id !== employeeId)
      throw new ForbiddenException('Document does not belong to this employee');
  }

  async list(companyId: number, employeeId: number, actor: AuthenticatedUser) {
    await this.employee(companyId, employeeId, actor);
    return this.dataSource.getRepository(LeaveLifeEvent).find({
      where: { company_id: companyId, employee_id: employeeId },
      order: { event_date: 'DESC' },
    });
  }

  async create(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    dto: {
      event_type: string;
      event_date: string;
      related_event_id?: number;
      multiple_birth?: boolean;
      historical_paid_maternity_term?: boolean;
      nssf_reference?: string;
      document_id?: number;
      notes?: string;
    },
  ) {
    await this.employee(companyId, employeeId, actor);
    if (!actor.companyMembershipId)
      throw new BadRequestException('Company membership required');
    await this.assertDocument(companyId, employeeId, dto.document_id);
    if (dto.event_type === 'child_death') {
      const birth = dto.related_event_id
        ? await this.dataSource.getRepository(LeaveLifeEvent).findOne({
            where: {
              id: dto.related_event_id,
              company_id: companyId,
              employee_id: employeeId,
            },
          })
        : null;
      if (!birth || birth.event_type !== 'birth')
        throw new BadRequestException(
          'A child death must reference the recorded birth',
        );
      if (dto.event_date < birth.event_date)
        throw new BadRequestException('Death cannot precede birth');
    }
    if (
      dto.historical_paid_maternity_term &&
      !actor.permissions.includes('leave-balances.manage')
    )
      throw new ForbiddenException(
        'Only HR can record historical maternity terms',
      );
    return this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(LeaveLifeEvent);
      const ev = await repo.save(
        repo.create({
          company_id: companyId,
          employee_id: employeeId,
          event_type: dto.event_type as LeaveLifeEventType,
          event_date: dto.event_date,
          related_event_id: dto.related_event_id ?? null,
          multiple_birth: !!dto.multiple_birth,
          historical_paid_maternity_term: !!dto.historical_paid_maternity_term,
          nssf_reference: dto.nssf_reference?.trim() || null,
          document_id: dto.document_id ?? null,
          notes: dto.notes?.trim() || null,
          created_by_company_user_id: actor.companyMembershipId!,
        }),
      );
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_life_event.created',
          entity_name: 'employee',
          entity_id: employeeId,
          actor,
          payload: {
            event_id: ev.id,
            event_type: ev.event_type,
            event_date: ev.event_date,
          },
        },
        m,
      );
      return ev;
    });
  }

  async verify(
    companyId: number,
    employeeId: number,
    eventId: number,
    actor: AuthenticatedUser,
  ) {
    await this.employee(companyId, employeeId, actor);
    const repo = this.dataSource.getRepository(LeaveLifeEvent);
    const ev = await repo.findOne({
      where: { id: eventId, company_id: companyId, employee_id: employeeId },
    });
    if (!ev) throw new NotFoundException('Life event not found');
    if (ev.created_by_company_user_id === actor.companyMembershipId)
      throw new ForbiddenException('Another person must verify the event');
    ev.verified_at = new Date();
    ev.verified_by_company_user_id = actor.companyMembershipId ?? null;
    await repo.save(ev);
    await this.audit.log({
      company_id: companyId,
      action: 'leave_life_event.verified',
      entity_name: 'employee',
      entity_id: employeeId,
      actor,
      payload: { event_id: ev.id },
    });
    return ev;
  }

  async override(
    companyId: number,
    employeeId: number,
    actor: AuthenticatedUser,
    dto: {
      rule_code: string;
      leave_request_id?: number;
      applies_on?: string;
      reason: string;
      certificate_document_id?: number;
    },
  ) {
    await this.employee(companyId, employeeId, actor);
    if (!dto.reason?.trim() || !actor.companyMembershipId)
      throw new BadRequestException('A reason is required');
    if (CERTIFICATE_REQUIRED.has(dto.rule_code) && !dto.certificate_document_id)
      throw new BadRequestException(
        'This override requires a certificate document',
      );
    if (dto.rule_code === 'RETURN_TO_WORK' && !dto.applies_on)
      throw new BadRequestException('applies_on is required');
    if (dto.rule_code !== 'RETURN_TO_WORK' && !dto.leave_request_id)
      throw new BadRequestException('leave_request_id is required');
    if (dto.leave_request_id) {
      const req = await this.dataSource.getRepository(LeaveRequest).findOne({
        where: { id: dto.leave_request_id, company_id: companyId },
      });
      if (!req || req.employee_id !== employeeId)
        throw new NotFoundException('Leave request not found');
    }
    await this.assertDocument(
      companyId,
      employeeId,
      dto.certificate_document_id,
    );
    return this.dataSource.transaction(async (m) => {
      const repo = m.getRepository(LeaveRuleOverride);
      const o = await repo.save(
        repo.create({
          company_id: companyId,
          employee_id: employeeId,
          leave_request_id: dto.leave_request_id ?? null,
          rule_code: dto.rule_code,
          applies_on: dto.applies_on ?? null,
          reason: dto.reason.trim(),
          certificate_document_id: dto.certificate_document_id ?? null,
          created_by_company_user_id: actor.companyMembershipId!,
        }),
      );
      await this.audit.log(
        {
          company_id: companyId,
          action: 'leave_rule_override.created',
          entity_name: 'employee',
          entity_id: employeeId,
          actor,
          payload: {
            override_id: o.id,
            rule_code: o.rule_code,
            leave_request_id: o.leave_request_id,
            applies_on: o.applies_on,
            reason: o.reason,
            certificate_document_id: o.certificate_document_id,
          },
        },
        m,
      );
      return o;
    });
  }
}
