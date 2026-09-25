import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { formatDateOnly } from '../shared/hr.utils';
import { EmployeeEmploymentEvent } from './entities/employee-employment-event.entity';
import { EmploymentEventTypeEnum } from './enums/employment-event-type.enum';

export type RecordEmploymentEventInput = {
  companyId: number;
  employeeId: number;
  eventType: EmploymentEventTypeEnum;
  title: string;
  effectiveDate?: string | null;
  description?: string | null;
  sourceModule?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: number | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  /** When set, a second event with the same key for the company is ignored. */
  dedupeKey?: string | null;
  actorCompanyUserId?: number | null;
};

@Injectable()
export class EmploymentHistoryService {
  constructor(
    @InjectRepository(EmployeeEmploymentEvent)
    private readonly eventRepository: Repository<EmployeeEmploymentEvent>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    private readonly hrAccessService: HrAccessService,
  ) {}

  async record(
    input: RecordEmploymentEventInput,
    manager?: EntityManager,
  ): Promise<EmployeeEmploymentEvent | null> {
    const repository =
      manager?.getRepository(EmployeeEmploymentEvent) ?? this.eventRepository;
    const context = resolveAuditContext();

    try {
      return await repository.save(repository.create({
        company_id: input.companyId,
        employee_id: input.employeeId,
        event_type: input.eventType,
        effective_date: input.effectiveDate ?? formatDateOnly(new Date()),
        title: input.title.slice(0, 200),
        description: input.description ?? null,
        source_module: input.sourceModule ?? null,
        source_entity_type: input.sourceEntityType ?? null,
        source_entity_id: input.sourceEntityId ?? null,
        old_values: input.oldValues ?? null,
        new_values: input.newValues ?? null,
        dedupe_key: input.dedupeKey ?? null,
        created_by_company_user_id: input.actorCompanyUserId ?? null,
        ip_address: context.ipAddress?.slice(0, 64) ?? null,
        request_id: context.requestId,
      }));
    } catch (error) {
      if (input.dedupeKey && (error as { code?: string }).code === '23505') {
        return null;
      }
      throw error;
    }
  }

  async listForEmployee(
    actor: AuthenticatedUser,
    employeeId: number,
  ): Promise<EmployeeEmploymentEvent[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    return this.eventRepository.find({
      where: { company_id: companyId, employee_id: employeeId },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }

  async listMine(actor: AuthenticatedUser): Promise<EmployeeEmploymentEvent[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    if (!actor.employeeId) {
      throw new NotFoundException('No employee record linked to this user');
    }

    return this.eventRepository.find({
      where: { company_id: companyId, employee_id: actor.employeeId },
      order: { effective_date: 'DESC', id: 'DESC' },
    });
  }
}
