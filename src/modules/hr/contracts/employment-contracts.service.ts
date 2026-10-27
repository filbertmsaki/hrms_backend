import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { SecurityEventsService } from '../../security/security-events.service';
import { SecurityEventType } from '../../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../../security/enums/security-event-outcome.enum';
import { resolveAuditContext } from '../../../common/request-context/request-context';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { HrDocumentsService } from '../documents/hr-documents.service';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { CreateEmploymentContractDto } from './dto/create-employment-contract.dto';
import {
  EmploymentContract,
  EmploymentContractStatus,
  EmploymentContractType,
} from './entities/employment-contract.entity';
import { AppNotification } from '../../notifications/entities/app-notification.entity';
import { EmploymentHistoryService } from '../employment-history/employment-history.service';
import { EmploymentEventTypeEnum } from '../employment-history/enums/employment-event-type.enum';

@Injectable()
export class EmploymentContractsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(EmploymentContract)
    private readonly contracts: Repository<EmploymentContract>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(AppNotification)
    private readonly notifications: Repository<AppNotification>,
    private readonly access: HrAccessService,
    private readonly documents: HrDocumentsService,
    private readonly securityEvents: SecurityEventsService,
    private readonly history: EmploymentHistoryService,
  ) {}

  async issue(actor: AuthenticatedUser, dto: CreateEmploymentContractDto) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const employee = await this.employees.findOne({
      where: { id: dto.employee_id, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, employee);
    if (
      dto.contract_type === EmploymentContractType.FIXED_TERM &&
      !dto.end_date
    ) {
      throw new BadRequestException('Fixed-term contracts require an end date');
    }
    if (dto.end_date && dto.end_date < dto.start_date) {
      throw new BadRequestException('Contract end date precedes start date');
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        companyId,
        employee.id,
      ]);
      const repository = manager.getRepository(EmploymentContract);
      const previous = await repository.findOne({
        where: { companyId, employeeId: employee.id },
        order: { version: 'DESC' },
      });
      if (previous) {
        previous.status = EmploymentContractStatus.SUPERSEDED;
        await repository.save(previous);
      }
      const created = await repository.save(
        repository.create({
          companyId,
          employeeId: employee.id,
          version: (previous?.version ?? 0) + 1,
          contractType: dto.contract_type,
          startDate: dto.start_date,
          endDate: dto.end_date ?? null,
          particulars: {
            employee_name:
              `${employee.first_name} ${employee.last_name}`.trim(),
            employee_age: dto.employee_age,
            sex: employee.gender,
            permanent_address: dto.permanent_address.trim(),
            place_of_recruitment: dto.place_of_recruitment.trim(),
            job_description: dto.job_description.trim(),
            place_of_work: dto.place_of_work.trim(),
            hours_of_work: dto.hours_of_work.trim(),
            remuneration: dto.remuneration.trim(),
            remuneration_method: dto.remuneration_method.trim(),
            benefits: dto.benefits.trim(),
          },
          status: EmploymentContractStatus.ISSUED,
          documentId: null,
          issuedByCompanyUserId: actor.companyMembershipId!,
        }),
      );
      await this.history.record(
        {
          companyId,
          employeeId: employee.id,
          eventType: previous
            ? EmploymentEventTypeEnum.CONTRACT_AMENDED
            : EmploymentEventTypeEnum.CONTRACT_ISSUED,
          title: previous ? 'Contract amended' : 'Contract issued',
          effectiveDate: created.startDate,
          sourceModule: 'contracts',
          sourceEntityType: 'EMPLOYMENT_CONTRACT',
          sourceEntityId: created.id,
          newValues: {
            version: created.version,
            contract_type: created.contractType,
            start_date: created.startDate,
            end_date: created.endDate,
          },
          dedupeKey: `contract:issued:${created.id}`,
          actorCompanyUserId: actor.companyMembershipId,
        },
        manager,
      );
      return created;
    });
  }

  async list(actor: AuthenticatedUser, employeeId: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const employee = await this.employees.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.access.assertCanAccessEmployee(actor, employee);
    return this.contracts.find({
      where: { companyId, employeeId },
      order: { version: 'DESC' },
    });
  }

  async summary(actor: AuthenticatedUser) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const accessibleEmployeeIds =
      await this.access.getAccessibleEmployeeIds(actor);
    if (accessibleEmployeeIds?.length === 0) return [];

    const query = this.contracts
      .createQueryBuilder('contract')
      .select('contract.employeeId', 'employeeId')
      .addSelect('COUNT(contract.id)', 'contractCount')
      .where('contract.companyId = :companyId', { companyId })
      .groupBy('contract.employeeId');
    if (accessibleEmployeeIds) {
      query.andWhere('contract.employeeId IN (:...accessibleEmployeeIds)', {
        accessibleEmployeeIds,
      });
    }
    const rows = await query.getRawMany<{
      employeeId: string;
      contractCount: string;
    }>();

    return rows.map((row) => ({
      employeeId: Number(row.employeeId),
      contractCount: Number(row.contractCount),
    }));
  }

  async attachDocument(
    actor: AuthenticatedUser,
    id: number,
    file: Base64FileDto,
  ) {
    const contract = await this.contracts.findOne({
      where: { id, companyId: this.access.ensureActorCompanyId(actor) },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== EmploymentContractStatus.ISSUED)
      throw new BadRequestException('Contract version is closed');
    if (contract.documentId)
      throw new BadRequestException(
        'Issue a new contract version to replace its document',
      );
    const employee = await this.employees.findOneByOrFail({
      id: contract.employeeId,
    });
    await this.access.assertCanAccessEmployee(actor, employee);
    const document = await this.documents.upload({
      companyId: contract.companyId,
      entityType: DocumentEntityTypeEnum.CONTRACT,
      entityId: contract.id,
      module: DocumentModuleEnum.CONTRACT,
      documentTypeCode: 'EMPLOYMENT_CONTRACT',
      title: `Employment contract v${contract.version}`,
      file,
      uploadedByCompanyUserId: actor.companyMembershipId ?? null,
      directorySegments: [
        'documents',
        'contracts',
        `company-${contract.companyId}`,
      ],
      fileNamePrefix: `contract-${contract.id}`,
    });
    contract.documentId = document.id;
    await this.contracts.save(contract);
    return document;
  }

  async sign(actor: AuthenticatedUser, id: number, signedName: string) {
    const companyId = this.access.ensureActorCompanyId(actor);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(EmploymentContract);
      const contract = await repository.findOneBy({ id, companyId });
      if (!contract) throw new NotFoundException('Contract not found');
      if (actor.employeeId !== contract.employeeId)
        throw new ForbiddenException(
          'Only the employee can sign this contract',
        );
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [
        companyId,
        contract.employeeId,
      ]);
      const current = await repository
        .createQueryBuilder('contract')
        .setLock('pessimistic_write')
        .where('contract.id = :id AND contract.companyId = :companyId', {
          id,
          companyId,
        })
        .getOneOrFail();
      if (current.status !== EmploymentContractStatus.ISSUED)
        throw new BadRequestException('Contract is not available for signing');
      if (!current.documentId)
        throw new BadRequestException(
          'Contract document must be attached before signing',
        );
      const employee = await manager
        .getRepository(Employee)
        .findOneByOrFail({ id: current.employeeId, company_id: companyId });
      if (
        signedName.trim().toLowerCase() !==
        `${employee.first_name} ${employee.last_name}`.trim().toLowerCase()
      ) {
        throw new BadRequestException('Signed name must match employee name');
      }
      current.status = EmploymentContractStatus.SIGNED;
      current.signedByUserId = actor.id;
      current.signedName = signedName.trim();
      current.signedIp = resolveAuditContext().ipAddress?.slice(0, 64) ?? null;
      current.signedAt = new Date();
      const signed = await repository.save(current);
      await this.history.record(
        {
          companyId,
          employeeId: current.employeeId,
          eventType: EmploymentEventTypeEnum.CONTRACT_SIGNED,
          title: 'Contract signed',
          effectiveDate: new Date().toISOString().slice(0, 10),
          sourceModule: 'contracts',
          sourceEntityType: 'EMPLOYMENT_CONTRACT',
          sourceEntityId: current.id,
          newValues: {
            version: current.version,
            signed_at: current.signedAt?.toISOString(),
            signed_by_user_id: actor.id,
          },
          dedupeKey: `contract:signed:${current.id}`,
          actorCompanyUserId: actor.companyMembershipId,
        },
        manager,
      );
      return signed;
    });
  }

  async readDocument(actor: AuthenticatedUser, id: number) {
    const companyId = this.access.ensureActorCompanyId(actor);
    const contract = await this.contracts.findOneBy({ id, companyId });
    if (!contract || !contract.documentId)
      throw new NotFoundException('Contract document not found');
    if (actor.employeeId !== contract.employeeId) {
      const employee = await this.employees.findOneByOrFail({
        id: contract.employeeId,
        company_id: companyId,
      });
      await this.access.assertCanAccessEmployee(actor, employee);
    }
    const document = await this.documents.findOneForEntityOrFail(
      companyId,
      DocumentEntityTypeEnum.CONTRACT,
      contract.id,
      contract.documentId,
    );
    const buffer = await this.documents.readFile(document);
    if (!buffer) throw new NotFoundException('Contract file not found');
    await this.securityEvents.log({
      eventType: SecurityEventType.EMPLOYEE_DOCUMENT_DOWNLOADED,
      outcome: SecurityEventOutcome.SUCCESS,
      actor,
      companyId,
      resourceType: 'employment_contract_document',
      resourceId: document.id,
      metadata: { contract_id: contract.id, employee_id: contract.employeeId },
      context: resolveAuditContext(),
    });
    return {
      buffer,
      mimeType: document.mime_type,
      fileName: document.original_file_name,
    };
  }

  @Cron('0 0 8 * * *', { timeZone: 'Africa/Dar_es_Salaam' })
  async notifyExpiringContracts() {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Dar_es_Salaam',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const through = new Date(`${today}T00:00:00.000Z`);
    through.setUTCDate(through.getUTCDate() + 30);
    const contracts = await this.contracts
      .createQueryBuilder('contract')
      .where('contract.status = :status', {
        status: EmploymentContractStatus.SIGNED,
      })
      .andWhere('contract.endDate BETWEEN :today AND :through', {
        today,
        through: through.toISOString().slice(0, 10),
      })
      .getMany();
    for (const contract of contracts) {
      if (!contract.endDate) continue;
      const employee = await this.employees.findOneBy({
        id: contract.employeeId,
        company_id: contract.companyId,
      });
      if (!employee) continue;
      const remaining = Math.round(
        (Date.parse(`${contract.endDate}T00:00:00.000Z`) -
          Date.parse(`${today}T00:00:00.000Z`)) /
          86400000,
      );
      const window = remaining <= 1 ? 1 : remaining <= 7 ? 7 : 30;
      const recipients = new Set(
        [employee.company_user_id, contract.issuedByCompanyUserId].filter(
          (id): id is number => typeof id === 'number' && id > 0,
        ),
      );
      for (const receiver of recipients) {
        const dedupeKey = `contract:expiry:${contract.id}:${window}:${receiver}`;
        if (
          await this.notifications.findOneBy({
            company_id: contract.companyId,
            dedupe_key: dedupeKey,
          })
        )
          continue;
        await this.notifications.save(
          this.notifications.create({
            company_id: contract.companyId,
            sender_company_user_id: null,
            receiver_company_user_id: receiver,
            title: 'Employment contract expiring',
            message: `${employee.first_name} ${employee.last_name}'s contract ends on ${contract.endDate}.`,
            related_module: 'contracts',
            entity_type: 'EMPLOYMENT_CONTRACT',
            entity_id: String(contract.id),
            action_url: '/dashboard/operations/recruitment?tab=contracts',
            dedupe_key: dedupeKey,
          }),
        );
      }
    }
    return contracts.length;
  }
}
