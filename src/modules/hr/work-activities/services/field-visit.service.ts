import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { AttendanceBusinessTrip } from '../../attendance/processing/entities/attendance-business-trip.entity';
import { AttendanceMobilePunchesService } from '../../attendance/mobile-punches/attendance-mobile-punches.service';
import { AttendanceMobilePunch } from '../../attendance/mobile-punches/entities/attendance-mobile-punch.entity';
import { AttendancePunchTypeEnum } from '../../attendance/mobile-punches/enums/attendance-punch-type.enum';
import { AttendancePunchValidationStatusEnum } from '../../attendance/mobile-punches/enums/attendance-punch-validation-status.enum';
import { suggestFieldRoute } from './field-route.util';
import { FilesService } from '../../../files/files.service';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  AddFieldVisitEvidenceDto,
  AssignFieldFollowUpDto,
  AssignFieldVisitPlanDto,
  CompleteFieldFollowUpDto,
  CreateFieldFollowUpDto,
  UpdateFieldFollowUpDto,
  CreateFieldOpportunityDto,
  CreateFieldVisitExpenseDto,
  CreateFieldVisitPlanDto,
  CreateUnplannedFieldVisitDto,
  FieldVisitCheckInDto,
  FieldVisitCheckOutDto,
  FieldVisitDispositionDto,
  RequestFieldCheckoutCorrectionDto,
  ReviseFieldVisitOutcomeDto,
  ReviewFieldCheckoutCorrectionDto,
  UploadFieldVisitAttachmentDto,
  ReviewFieldVisitDto,
  SubmitFieldVisitPlanDto,
  UpdateFieldVisitPlanDto,
  UpdateFieldOpportunityCommercialDto,
  UpsertFieldVisitCommercialPolicyDto,
} from '../dto/field-visit.dto';
import {
  FieldLocationMapQueryDto,
  WorkActivityQueryDto,
} from '../dto/queries.dto';
import { FieldParty } from '../entities/activity-config.entities';
import { FieldLocationAccessLog } from '../entities/analytics.entities';
import {
  FieldFollowUp,
  FieldOpportunity,
  FieldVisit,
  FieldVisitEvidence,
  FieldVisitExpense,
  FieldVisitLocationEvent,
  FieldVisitPlan,
  FieldVisitPlanItem,
  FieldVisitCheckoutCorrection,
  FieldVisitAttachment,
  FieldVisitCommercialPolicy,
} from '../entities/field-visit.entities';
import {
  FieldFollowUpStatusEnum,
  FieldOpportunityStatusEnum,
  FieldVisitExpenseStatusEnum,
  FieldVisitPlanStatusEnum,
  FieldVisitReviewDecisionEnum,
  FieldVisitStatusEnum,
} from '../enums/work-activity.enums';
import { ActivityPolicyService } from './activity-policy.service';
import { WorkActivityAuditService } from './work-activity-audit.service';
import { WorkActivityExceptionService } from './work-activity-exception.service';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { LocationPrivacyService } from '../../location-privacy/location-privacy.service';

@Injectable()
export class FieldVisitService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly hrAccessService: HrAccessService,
    private readonly actionItemsService: ActionItemsService,
    private readonly policyService: ActivityPolicyService,
    private readonly auditService: WorkActivityAuditService,
    private readonly exceptionService: WorkActivityExceptionService,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(FieldParty)
    private readonly partyRepository: Repository<FieldParty>,
    @InjectRepository(FieldVisitPlan)
    private readonly planRepository: Repository<FieldVisitPlan>,
    @InjectRepository(FieldVisitPlanItem)
    private readonly planItemRepository: Repository<FieldVisitPlanItem>,
    @InjectRepository(FieldVisit)
    private readonly visitRepository: Repository<FieldVisit>,
    @InjectRepository(FieldVisitLocationEvent)
    private readonly locationEventRepository: Repository<FieldVisitLocationEvent>,
    @InjectRepository(FieldVisitEvidence)
    private readonly evidenceRepository: Repository<FieldVisitEvidence>,
    @InjectRepository(FieldOpportunity)
    private readonly opportunityRepository: Repository<FieldOpportunity>,
    @InjectRepository(FieldFollowUp)
    private readonly followUpRepository: Repository<FieldFollowUp>,
    @InjectRepository(FieldVisitExpense)
    private readonly expenseRepository: Repository<FieldVisitExpense>,
    @InjectRepository(FieldLocationAccessLog)
    private readonly accessLogRepository: Repository<FieldLocationAccessLog>,
    @InjectRepository(AttendanceBusinessTrip)
    private readonly businessTripRepository: Repository<AttendanceBusinessTrip>,
    @InjectRepository(FieldVisitCommercialPolicy)
    private readonly commercialPolicyRepository: Repository<FieldVisitCommercialPolicy>,
    private readonly locationPrivacyService: LocationPrivacyService,
    @Optional()
    private readonly attendancePunchesService?: AttendanceMobilePunchesService,
    @Optional() private readonly filesService?: FilesService,
  ) {}

  private getCompanyId(actor: AuthenticatedUser): number {
    return this.hrAccessService.ensureActorCompanyId(actor);
  }

  private getEmployeeId(actor: AuthenticatedUser): number {
    if (!actor.employeeId) {
      throw new ForbiddenException('Employee profile is required.');
    }
    return actor.employeeId;
  }

  private async getEmployee(companyId: number, employeeId: number) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId, company_id: companyId },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found.');
    }
    return employee;
  }

  async listMyPlans(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const qb = this.planRepository
      .createQueryBuilder('plan')
      .where('plan.companyId = :companyId', { companyId })
      .andWhere('plan.employeeId = :employeeId', { employeeId })
      .orderBy('plan.visitDate', 'DESC')
      .addOrderBy('plan.id', 'DESC');

    if (query.date_from) {
      qb.andWhere('plan.visitDate >= :dateFrom', { dateFrom: query.date_from });
    }
    if (query.date_to) {
      qb.andWhere('plan.visitDate <= :dateTo', { dateTo: query.date_to });
    }

    const plans = await qb.getMany();
    return Promise.all(plans.map((plan) => this.getPlanResponse(plan)));
  }

  async listForHr(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    return this.listScopedVisits(actor, query, true);
  }

  async createMyPlan(actor: AuthenticatedUser, dto: CreateFieldVisitPlanDto) {
    return this.createPlanForEmployee(
      actor,
      dto,
      this.getEmployeeId(actor),
      false,
    );
  }

  async assignPlan(actor: AuthenticatedUser, dto: AssignFieldVisitPlanDto) {
    await this.assertManagerCanAccess(actor, dto.employee_id, null);
    const companyId = this.getCompanyId(actor);
    const existing = await this.planRepository.findOne({
      where: {
        companyId,
        employeeId: dto.employee_id,
        visitDate: dto.visit_date,
      },
    });
    const plan = existing
      ? await this.appendAssignedVisits(actor, existing.id, dto)
      : await this.createPlanForEmployee(actor, dto, dto.employee_id, true);
    const employee = await this.getEmployee(plan.companyId, dto.employee_id);
    if (employee.company_user_id) {
      await this.actionItemsService.upsertOpen(
        {
          companyId: plan.companyId,
          assigneeCompanyUserId: employee.company_user_id,
          assigneeEmployeeId: employee.id,
          actionType: ActionItemTypeEnum.TASK,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'FIELD_VISIT_PLAN',
          sourceEntityId: plan.id,
          sourceKey: `field-visit-plan:assigned:${plan.id}:${dto.client_request_id ?? randomUUID()}`,
          title: 'Field visit assigned',
          description: `A field plan has been assigned for ${plan.visitDate}.`,
          actionUrl: '/dashboard/me/field/plans',
        },
        { reopenCompleted: false },
      );
    }
    return plan;
  }

  private async appendAssignedVisits(
    actor: AuthenticatedUser,
    planId: number,
    dto: AssignFieldVisitPlanDto,
  ) {
    if (!dto.items.length)
      throw new BadRequestException('At least one visit is required.');
    return this.dataSource.transaction(async (manager) => {
      const companyId = this.getCompanyId(actor);
      const plan = await manager.getRepository(FieldVisitPlan).findOne({
        where: { id: planId, companyId, employeeId: dto.employee_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new NotFoundException('Visit plan not found.');
      if (
        dto.client_request_id &&
        plan.clientRequestId === dto.client_request_id
      )
        return this.getPlanResponse(plan, manager);
      if (
        ![
          FieldVisitPlanStatusEnum.APPROVED,
          FieldVisitPlanStatusEnum.IN_PROGRESS,
          FieldVisitPlanStatusEnum.COMPLETED,
        ].includes(plan.status)
      )
        throw new ConflictException(
          'Review the existing daily plan before adding a manager-assigned visit.',
        );
      const itemRepo = manager.getRepository(FieldVisitPlanItem);
      const existing = await itemRepo.find({
        where: { companyId, visitPlanId: plan.id },
        order: { displayOrder: 'DESC' },
      });
      if (
        dto.client_request_id &&
        existing.some((item) => item.clientRequestId === dto.client_request_id)
      )
        return this.getPlanResponse(plan, manager);
      if (plan.status === FieldVisitPlanStatusEnum.COMPLETED) {
        plan.status = FieldVisitPlanStatusEnum.IN_PROGRESS;
        plan.completedAt = null;
        await manager.getRepository(FieldVisitPlan).save(plan);
      }
      let order = (existing[0]?.displayOrder ?? -1) + 1;
      for (const item of dto.items) {
        if (!item.purpose.trim())
          throw new BadRequestException('Each visit must have a purpose.');
        if (
          item.planned_start_time &&
          item.planned_end_time &&
          new Date(item.planned_end_time).getTime() <=
            new Date(item.planned_start_time).getTime()
        )
          throw new BadRequestException(
            'The planned end time must be after the start time.',
          );
        const party = item.field_party_id
          ? await manager
              .getRepository(FieldParty)
              .findOne({ where: { id: item.field_party_id, companyId } })
          : null;
        if (item.field_party_id && !party)
          throw new BadRequestException(
            'The selected field party was not found.',
          );
        const savedItem = await itemRepo.save(
          itemRepo.create({
            companyId,
            visitPlanId: plan.id,
            fieldPartyId: item.field_party_id ?? null,
            visitType: item.visit_type,
            plannedStartTime: item.planned_start_time
              ? new Date(item.planned_start_time)
              : null,
            plannedEndTime: item.planned_end_time
              ? new Date(item.planned_end_time)
              : null,
            visitName: item.visit_name?.trim() || null,
            priority: item.priority ?? 'NORMAL',
            purpose: item.purpose.trim(),
            expectedOutcome: item.expected_outcome?.trim() ?? null,
            plannedLatitude:
              item.latitude !== undefined ? String(item.latitude) : null,
            plannedLongitude:
              item.longitude !== undefined ? String(item.longitude) : null,
            plannedAddress: item.planned_address?.trim() ?? null,
            displayOrder: order++,
            clientRequestId: dto.client_request_id ?? null,
          }),
        );
        await manager.getRepository(FieldVisit).save(
          manager.getRepository(FieldVisit).create({
            companyId,
            employeeId: plan.employeeId,
            visitPlanId: plan.id,
            visitPlanItemId: savedItem.id,
            businessTripId: plan.businessTripId,
            fieldPartyId: item.field_party_id ?? null,
            visitNo: this.generateVisitNo(companyId),
            visitDate: plan.visitDate,
            visitType: item.visit_type,
            status: FieldVisitStatusEnum.PLANNED,
            isUnplanned: false,
            unplannedReason: null,
            visitName: item.visit_name?.trim() || null,
            priority: item.priority ?? 'NORMAL',
            purpose: item.purpose.trim(),
            discussionNotes: null,
            outcome: null,
            followUpRequired: false,
            nextFollowUpDate: null,
            checkInAt: null,
            checkOutAt: null,
            durationMinutes: null,
            managerEmployeeId: plan.managerEmployeeId,
            managerCompanyUserId: plan.managerCompanyUserId,
            managerReviewStatus: 'PENDING',
            managerComments: null,
            managerReviewedAt: null,
            linkedDailyActivityEntryId: null,
            employeeSnapshot: plan.employeeSnapshot,
            partySnapshot: party ? this.buildPartySnapshot(party) : null,
            policySnapshot: plan.policySnapshot,
            clientRequestId: null,
          }),
        );
      }
      await this.auditService.log(
        {
          actor,
          companyId,
          employeeId: plan.employeeId,
          action: 'FIELD_VISIT_PLAN_ASSIGNMENT_ADDED',
          entityType: 'FIELD_VISIT_PLAN',
          entityId: plan.id,
          afterValues: {
            item_count: dto.items.length,
            visit_date: plan.visitDate,
          },
        },
        manager,
      );
      return this.getPlanResponse(plan, manager);
    });
  }

  private async createPlanForEmployee(
    actor: AuthenticatedUser,
    dto: CreateFieldVisitPlanDto,
    employeeId: number,
    assignedByManager: boolean,
  ) {
    const companyId = this.getCompanyId(actor);
    const employee = await this.getEmployee(companyId, employeeId);
    const policy = await this.policyService.resolveForEmployee(
      companyId,
      employee,
      dto.visit_date,
    );
    const managerCompanyUserId = await this.resolveManagerCompanyUserId(
      employee.reports_to,
      companyId,
    );

    if (!this.configService.get<boolean>('FIELD_VISIT_ENABLED', true)) {
      throw new ForbiddenException('Field visits are currently disabled.');
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.client_request_id) {
        const existingByRequest = await manager
          .getRepository(FieldVisitPlan)
          .findOne({
            where: {
              companyId,
              employeeId,
              clientRequestId: dto.client_request_id,
            },
          });
        if (existingByRequest) {
          return this.getPlanResponse(existingByRequest, manager);
        }
      }

      const existing = await manager.getRepository(FieldVisitPlan).findOne({
        where: { companyId, employeeId, visitDate: dto.visit_date },
      });

      if (existing) {
        throw new ConflictException(
          'A visit plan already exists for this date.',
        );
      }

      const businessTripId = await this.findBusinessTripId(
        companyId,
        employeeId,
        dto.visit_date,
      );

      const plan = await manager.getRepository(FieldVisitPlan).save(
        manager.getRepository(FieldVisitPlan).create({
          companyId,
          employeeId,
          visitDate: dto.visit_date,
          status: assignedByManager
            ? FieldVisitPlanStatusEnum.APPROVED
            : FieldVisitPlanStatusEnum.DRAFT,
          managerEmployeeId: employee.reports_to ?? null,
          managerCompanyUserId,
          businessTripId,
          employeeSnapshot: this.buildEmployeeSnapshot(employee),
          policySnapshot: this.buildPolicySnapshot(
            policy as Record<string, unknown>,
          ),
          planSummary: dto.plan_summary?.trim() ?? null,
          managerComments: null,
          submittedAt: null,
          approvedAt: assignedByManager ? new Date() : null,
          approvedByCompanyUserId: assignedByManager
            ? (actor.companyMembershipId ?? null)
            : null,
          completedAt: null,
          clientRequestId: dto.client_request_id ?? null,
        }),
      );

      await this.replacePlanItemsAndVisits(manager, plan, dto.items);
      await this.auditService.log({
        action: assignedByManager
          ? 'FIELD_VISIT_PLAN_ASSIGNED'
          : 'FIELD_VISIT_PLAN_CREATED',
        actor,
        companyId,
        employeeId,
        entityType: 'FIELD_VISIT_PLAN',
        entityId: plan.id,
        afterValues: {
          visit_date: plan.visitDate,
          item_count: dto.items.length,
        },
      });
      return this.getPlanResponse(plan, manager);
    });
  }

  async getMyPlan(actor: AuthenticatedUser, id: number) {
    const plan = await this.planRepository.findOne({
      where: {
        id,
        companyId: this.getCompanyId(actor),
        employeeId: this.getEmployeeId(actor),
      },
    });
    if (!plan) {
      throw new NotFoundException('Visit plan not found.');
    }
    return this.getPlanResponse(plan);
  }

  async getPlanRoute(actor: AuthenticatedUser, id: number) {
    const plan = await this.getMyPlan(actor, id);
    const partyIds = plan.items
      .map((item) => item.fieldPartyId)
      .filter((value): value is number => value !== null);
    const parties = partyIds.length
      ? await this.partyRepository.find({
          where: { companyId: plan.companyId, id: In(partyIds) },
        })
      : [];
    const byId = new Map(parties.map((party) => [party.id, party]));
    return suggestFieldRoute(
      plan.items.map((item) => {
        const party = item.fieldPartyId
          ? byId.get(item.fieldPartyId)
          : undefined;
        const lat = item.plannedLatitude ?? party?.latitude;
        const lon = item.plannedLongitude ?? party?.longitude;
        return {
          id: item.id,
          name: item.visitName || item.purpose,
          latitude: lat == null ? null : Number(lat),
          longitude: lon == null ? null : Number(lon),
        };
      }),
    );
  }

  async repeatPlanWeekly(actor: AuthenticatedUser, id: number, weeks: number) {
    const original = await this.getMyPlan(actor, id);
    const results: Array<{
      date: string;
      status: string;
      message?: string;
      plan_id?: number;
    }> = [];
    for (let week = 1; week <= weeks; week++) {
      const shift = week * 7 * 86400000;
      const date = new Date(`${original.visitDate}T00:00:00Z`);
      const visitDate = new Date(date.getTime() + shift)
        .toISOString()
        .slice(0, 10);
      const shiftTime = (value: Date | null) =>
        value
          ? new Date(new Date(value).getTime() + shift).toISOString()
          : undefined;
      try {
        const plan = await this.createMyPlan(actor, {
          visit_date: visitDate,
          plan_summary: original.planSummary ?? undefined,
          items: original.items.map((item) => ({
            field_party_id: item.fieldPartyId ?? undefined,
            visit_type:
              item.visitType as CreateFieldVisitPlanDto['items'][number]['visit_type'],
            visit_name: item.visitName ?? undefined,
            priority: item.priority,
            purpose: item.purpose,
            planned_start_time: shiftTime(item.plannedStartTime),
            planned_end_time: shiftTime(item.plannedEndTime),
            expected_outcome: item.expectedOutcome ?? undefined,
            planned_address: item.plannedAddress ?? undefined,
            latitude:
              item.plannedLatitude === null
                ? undefined
                : Number(item.plannedLatitude),
            longitude:
              item.plannedLongitude === null
                ? undefined
                : Number(item.plannedLongitude),
            display_order: item.displayOrder,
          })),
        });
        results.push({ date: visitDate, status: 'CREATED', plan_id: plan.id });
      } catch (error) {
        results.push({
          date: visitDate,
          status: 'FAILED',
          message:
            error instanceof Error ? error.message : 'Could not create plan.',
        });
      }
    }
    return { results };
  }

  async updateMyPlan(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateFieldVisitPlanDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    return this.dataSource.transaction(async (manager) => {
      const plan = await manager.getRepository(FieldVisitPlan).findOne({
        where: { id, companyId, employeeId },
      });

      if (!plan) {
        throw new NotFoundException('Visit plan not found.');
      }

      if (
        ![
          FieldVisitPlanStatusEnum.DRAFT,
          FieldVisitPlanStatusEnum.RETURNED,
        ].includes(plan.status)
      ) {
        throw new ConflictException('This visit plan can no longer be edited.');
      }

      if (dto.visit_date !== undefined) {
        if (dto.visit_date !== plan.visitDate && !dto.items) {
          throw new BadRequestException(
            'Include the visit items when changing a plan date.',
          );
        }
        plan.visitDate = dto.visit_date;
      }
      if (dto.plan_summary !== undefined) {
        plan.planSummary = dto.plan_summary?.trim() ?? null;
      }

      const saved = await manager.getRepository(FieldVisitPlan).save(plan);
      if (dto.items) {
        await this.replacePlanItemsAndVisits(manager, saved, dto.items);
      }
      return this.getPlanResponse(saved, manager);
    });
  }

  async submitMyPlan(
    actor: AuthenticatedUser,
    id: number,
    dto: SubmitFieldVisitPlanDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const plan = await this.planRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!plan) {
      throw new NotFoundException('Visit plan not found.');
    }
    if (
      ![
        FieldVisitPlanStatusEnum.DRAFT,
        FieldVisitPlanStatusEnum.RETURNED,
      ].includes(plan.status)
    ) {
      throw new ConflictException('This visit plan cannot be submitted.');
    }

    plan.planSummary = dto.plan_summary?.trim() ?? plan.planSummary;
    plan.status = FieldVisitPlanStatusEnum.SUBMITTED;
    plan.submittedAt = new Date();
    const saved = await this.planRepository.save(plan);

    if (saved.managerCompanyUserId) {
      await this.actionItemsService.upsertOpen({
        companyId: saved.companyId,
        assigneeCompanyUserId: saved.managerCompanyUserId,
        assigneeEmployeeId: saved.managerEmployeeId ?? null,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: 'WORK_ACTIVITIES',
        sourceEntityType: 'FIELD_VISIT_PLAN',
        sourceEntityId: saved.id,
        sourceKey: `field-visit-plan-review:${saved.id}`,
        title: 'Review field visit plan',
        description: `Field visit plan for ${saved.visitDate} requires review.`,
        actionUrl: '/dashboard/field/visits',
      });
    }

    return this.getPlanResponse(saved);
  }

  async listMyVisits(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const qb = this.visitRepository
      .createQueryBuilder('visit')
      .where('visit.companyId = :companyId', {
        companyId: this.getCompanyId(actor),
      })
      .andWhere('visit.employeeId = :employeeId', {
        employeeId: this.getEmployeeId(actor),
      })
      .orderBy('visit.visitDate', 'DESC')
      .addOrderBy('visit.id', 'DESC');

    if (query.date_from) {
      qb.andWhere('visit.visitDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('visit.visitDate <= :dateTo', { dateTo: query.date_to });
    }
    if (query.status) {
      qb.andWhere('visit.status = :status', { status: query.status });
    }
    const visits = await qb.getMany();
    return Promise.all(visits.map((visit) => this.getVisitResponse(visit.id)));
  }

  async getMyVisit(actor: AuthenticatedUser, id: number) {
    const visit = await this.visitRepository.findOne({
      where: {
        id,
        companyId: this.getCompanyId(actor),
        employeeId: this.getEmployeeId(actor),
      },
    });
    if (!visit) {
      throw new NotFoundException('Field visit not found.');
    }
    return this.getVisitResponse(visit.id);
  }

  async createUnplannedVisit(
    actor: AuthenticatedUser,
    dto: CreateUnplannedFieldVisitDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const employee = await this.getEmployee(companyId, employeeId);
    const policy = await this.policyService.resolveForEmployee(
      companyId,
      employee,
      dto.visit_date,
    );
    const allowUnplanned =
      (policy as Record<string, unknown>).allowUnplannedVisits !== false;

    if (!allowUnplanned) {
      throw new ForbiddenException(
        'Unplanned visits are not allowed by the applicable activity policy.',
      );
    }

    if (!dto.unplanned_reason.trim()) {
      throw new BadRequestException(
        'A reason is required for an unplanned visit.',
      );
    }

    const party = dto.field_party_id
      ? await this.partyRepository.findOne({
          where: { id: dto.field_party_id, companyId },
        })
      : null;
    const managerCompanyUserId = await this.resolveManagerCompanyUserId(
      employee.reports_to,
      companyId,
    );

    const businessTripId = await this.findBusinessTripId(
      companyId,
      employeeId,
      dto.visit_date,
    );

    const visit = await this.visitRepository.save(
      this.visitRepository.create({
        companyId,
        employeeId,
        visitPlanId: null,
        visitPlanItemId: null,
        businessTripId,
        fieldPartyId: dto.field_party_id ?? null,
        visitNo: this.generateVisitNo(companyId),
        visitDate: dto.visit_date,
        visitType: dto.visit_type,
        status: FieldVisitStatusEnum.PLANNED,
        isUnplanned: true,
        unplannedReason: dto.unplanned_reason.trim(),
        visitName: dto.visit_name?.trim() || null,
        priority: dto.priority ?? 'NORMAL',
        purpose: dto.purpose.trim(),
        discussionNotes: null,
        outcome: null,
        followUpRequired: false,
        nextFollowUpDate: null,
        checkInAt: null,
        checkOutAt: null,
        durationMinutes: null,
        managerEmployeeId: employee.reports_to ?? null,
        managerCompanyUserId,
        managerReviewStatus: 'REQUIRED',
        managerComments: null,
        managerReviewedAt: null,
        linkedDailyActivityEntryId: null,
        employeeSnapshot: this.buildEmployeeSnapshot(employee),
        partySnapshot: party ? this.buildPartySnapshot(party) : null,
        policySnapshot: this.buildPolicySnapshot(
          policy as Record<string, unknown>,
        ),
        clientRequestId: dto.client_request_id ?? null,
      }),
    );

    return this.getVisitResponse(visit.id);
  }

  async checkIn(
    actor: AuthenticatedUser,
    visitId: number,
    dto: FieldVisitCheckInDto,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const companyId = this.getCompanyId(actor);
      const employeeId = this.getEmployeeId(actor);
      const duplicate = await manager
        .getRepository(FieldVisitLocationEvent)
        .findOne({
          where: {
            companyId,
            employeeId,
            clientRequestId: dto.client_request_id,
          },
        });
      if (duplicate) {
        if (
          duplicate.fieldVisitId !== visitId ||
          duplicate.eventType !== 'CHECK_IN'
        ) {
          throw new ConflictException(
            'This request ID was already used for another field event.',
          );
        }
        return this.getVisitResponse(duplicate.fieldVisitId, manager);
      }
      await this.locationPrivacyService.assertAcknowledged(
        companyId,
        employeeId,
      );

      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id: visitId, companyId, employeeId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!visit) {
        throw new NotFoundException('Field visit not found.');
      }
      if (visit.status !== FieldVisitStatusEnum.PLANNED) {
        const replay = await manager
          .getRepository(FieldVisitLocationEvent)
          .findOne({
            where: {
              companyId,
              employeeId,
              fieldVisitId: visitId,
              eventType: 'CHECK_IN',
              clientRequestId: dto.client_request_id,
            },
          });
        if (replay) return this.getVisitResponse(visitId, manager);
        throw new ConflictException('The visit is not available for check-in.');
      }
      if (
        visit.visitPlanId &&
        Boolean(
          visit.policySnapshot?.field_plan_approval_required ??
          this.configService.get<boolean>(
            'FIELD_VISIT_REQUIRE_MANAGER_APPROVAL',
            false,
          ),
        )
      ) {
        const plan = await manager
          .getRepository(FieldVisitPlan)
          .findOne({ where: { id: visit.visitPlanId, companyId } });
        if (
          !plan ||
          ![
            FieldVisitPlanStatusEnum.APPROVED,
            FieldVisitPlanStatusEnum.IN_PROGRESS,
          ].includes(plan.status)
        ) {
          throw new ConflictException(
            'The visit plan must be approved before check-in.',
          );
        }
      }

      const capturedAt = new Date(dto.captured_at);
      this.assertOfflineEventAllowed(capturedAt, new Date());
      const locationException = this.assertVisitAccuracy(
        dto.accuracy_meters ?? null,
        visit.policySnapshot?.maximum_accuracy_meters,
        visit.policySnapshot?.allow_gps_exception === true,
        dto.location_exception_reason,
      );

      const locationEvent = await manager
        .getRepository(FieldVisitLocationEvent)
        .save(
          manager.getRepository(FieldVisitLocationEvent).create({
            companyId,
            fieldVisitId: visit.id,
            employeeId,
            eventType: 'CHECK_IN',
            latitude: String(dto.latitude),
            longitude: String(dto.longitude),
            accuracyMeters:
              dto.accuracy_meters !== undefined
                ? String(dto.accuracy_meters)
                : null,
            capturedAt,
            receivedAt: new Date(),
            timezoneOffsetMinutes: null,
            deviceIdentifier: dto.device_identifier ?? null,
            deviceInfo: dto.device_info ?? null,
            address: null,
            addressStatus: 'PENDING',
            distanceFromPlannedLocationMeters: null,
            locationValidationStatus: locationException
              ? 'EXCEPTION_PENDING'
              : 'CAPTURED',
            locationValidationResult: {
              status: locationException ? 'EXCEPTION_PENDING' : 'CAPTURED',
              exception_reason: locationException
                ? dto.location_exception_reason?.trim()
                : undefined,
              maximum_accuracy_meters:
                visit.policySnapshot?.maximum_accuracy_meters ??
                this.configService.get<number>(
                  'FIELD_VISIT_MAX_GPS_ACCURACY_METERS',
                  100,
                ),
            },
            isOfflineCapture:
              dto.offline_queued === true || this.isOfflineCapture(capturedAt),
            clientRequestId: dto.client_request_id,
            selfieDocumentId: dto.selfie_document_id ?? null,
            attendanceMobilePunchId: null,
            rawPayloadHash: this.hashPayload({
              visit_id: visit.id,
              captured_at: dto.captured_at,
              latitude: dto.latitude,
              longitude: dto.longitude,
              accuracy_meters: dto.accuracy_meters ?? null,
            }),
            legalHold: false,
          }),
        );

      visit.status = FieldVisitStatusEnum.CHECKED_IN;
      visit.checkInAt = capturedAt;
      await manager.getRepository(FieldVisit).save(visit);
      if (visit.visitPlanId) {
        await manager.getRepository(FieldVisitPlan).update(
          {
            id: visit.visitPlanId,
            companyId,
            status: FieldVisitPlanStatusEnum.APPROVED,
          },
          { status: FieldVisitPlanStatusEnum.IN_PROGRESS },
        );
      }

      await this.auditService.log({
        action: 'FIELD_VISIT_CHECKED_IN',
        actor,
        companyId,
        employeeId,
        entityType: 'FIELD_VISIT',
        entityId: visit.id,
        afterValues: {
          captured_at: capturedAt.toISOString(),
          location_event_id: locationEvent.id,
        },
      });

      return this.getVisitResponse(visit.id, manager);
    });
    const attendance = await this.trySyncFieldAttendance(
      actor,
      visitId,
      dto,
      'CHECK_IN',
    );
    return { ...result, attendance };
  }

  async checkOut(
    actor: AuthenticatedUser,
    visitId: number,
    dto: FieldVisitCheckOutDto,
  ) {
    const result = await this.dataSource.transaction(async (manager) => {
      const companyId = this.getCompanyId(actor);
      const employeeId = this.getEmployeeId(actor);
      const duplicate = await manager
        .getRepository(FieldVisitLocationEvent)
        .findOne({
          where: {
            companyId,
            employeeId,
            clientRequestId: dto.client_request_id,
          },
        });
      if (duplicate) {
        if (
          duplicate.fieldVisitId !== visitId ||
          duplicate.eventType !== 'CHECK_OUT'
        ) {
          throw new ConflictException(
            'This request ID was already used for another field event.',
          );
        }
        return this.getVisitResponse(duplicate.fieldVisitId, manager);
      }
      await this.locationPrivacyService.assertAcknowledged(
        companyId,
        employeeId,
      );

      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id: visitId, companyId, employeeId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!visit) {
        throw new NotFoundException('Field visit not found.');
      }
      if (
        visit.status !== FieldVisitStatusEnum.CHECKED_IN ||
        !visit.checkInAt
      ) {
        const replay = await manager
          .getRepository(FieldVisitLocationEvent)
          .findOne({
            where: {
              companyId,
              employeeId,
              fieldVisitId: visitId,
              eventType: 'CHECK_OUT',
              clientRequestId: dto.client_request_id,
            },
          });
        if (replay) return this.getVisitResponse(visitId, manager);
        throw new ConflictException('The visit has not been checked in.');
      }

      const capturedAt = new Date(dto.captured_at);
      this.assertOfflineEventAllowed(capturedAt, new Date());
      const locationException = this.assertVisitAccuracy(
        dto.accuracy_meters ?? null,
        visit.policySnapshot?.maximum_accuracy_meters,
        visit.policySnapshot?.allow_gps_exception === true,
        dto.location_exception_reason,
      );
      if (capturedAt <= visit.checkInAt) {
        throw new BadRequestException('Check-out must occur after check-in.');
      }

      const durationMinutes = Math.floor(
        (capturedAt.getTime() - visit.checkInAt.getTime()) / 60000,
      );
      const minimum = this.configService.get<number>(
        'FIELD_VISIT_MIN_DURATION_MINUTES',
        5,
      );
      if (durationMinutes < minimum) {
        throw new BadRequestException(
          `Visit duration must be at least ${minimum} minutes.`,
        );
      }
      if (dto.follow_up_required && !dto.next_follow_up_date) {
        throw new BadRequestException('A follow-up date is required.');
      }

      const locationEvent = await manager
        .getRepository(FieldVisitLocationEvent)
        .save(
          manager.getRepository(FieldVisitLocationEvent).create({
            companyId,
            fieldVisitId: visit.id,
            employeeId,
            eventType: 'CHECK_OUT',
            latitude: String(dto.latitude),
            longitude: String(dto.longitude),
            accuracyMeters:
              dto.accuracy_meters !== undefined
                ? String(dto.accuracy_meters)
                : null,
            capturedAt,
            receivedAt: new Date(),
            timezoneOffsetMinutes: null,
            deviceIdentifier: dto.device_identifier ?? null,
            deviceInfo: dto.device_info ?? null,
            address: null,
            addressStatus: 'PENDING',
            distanceFromPlannedLocationMeters: null,
            locationValidationStatus: locationException
              ? 'EXCEPTION_PENDING'
              : 'CAPTURED',
            locationValidationResult: {
              status: locationException ? 'EXCEPTION_PENDING' : 'CAPTURED',
              exception_reason: locationException
                ? dto.location_exception_reason?.trim()
                : undefined,
            },
            isOfflineCapture:
              dto.offline_queued === true || this.isOfflineCapture(capturedAt),
            clientRequestId: dto.client_request_id,
            selfieDocumentId: dto.selfie_document_id ?? null,
            attendanceMobilePunchId: null,
            rawPayloadHash: this.hashPayload({
              visit_id: visit.id,
              captured_at: dto.captured_at,
              latitude: dto.latitude,
              longitude: dto.longitude,
              accuracy_meters: dto.accuracy_meters ?? null,
              outcome: dto.outcome,
            }),
            legalHold: false,
          }),
        );

      visit.checkOutAt = capturedAt;
      visit.durationMinutes = durationMinutes;
      visit.discussionNotes = dto.discussion_notes.trim();
      visit.outcome = dto.outcome.trim();
      visit.followUpRequired = dto.follow_up_required;
      visit.nextFollowUpDate = dto.next_follow_up_date ?? null;
      const priorLocationException = await manager
        .getRepository(FieldVisitLocationEvent)
        .count({
          where: {
            companyId,
            fieldVisitId: visit.id,
            locationValidationStatus: 'EXCEPTION_PENDING',
          },
        });
      visit.status =
        priorLocationException > 0 ||
        this.configService.get<boolean>(
          'FIELD_VISIT_REQUIRE_MANAGER_APPROVAL',
          false,
        )
          ? FieldVisitStatusEnum.MANAGER_REVIEW_PENDING
          : FieldVisitStatusEnum.REVIEWED;
      visit.managerReviewStatus =
        visit.status === FieldVisitStatusEnum.REVIEWED ? 'APPROVED' : 'PENDING';

      const savedVisit = await manager.getRepository(FieldVisit).save(visit);
      await this.completePlanIfFinished(manager, savedVisit);

      const commercialPolicy = await this.getCommercialPolicy(companyId);
      for (const opportunity of dto.opportunities ?? []) {
        if (!commercialPolicy.allowEmployeeOpportunityValues) {
          throw new ForbiddenException(
            'Employee opportunity value entry is disabled by company policy.',
          );
        }
        this.assertSupportedCurrency(
          opportunity.currency,
          commercialPolicy,
          'Sales',
        );
        this.assertSupportedCurrency(
          opportunity.premium_currency,
          commercialPolicy,
          'Premium',
        );
        if (
          opportunity.potential_value !== undefined &&
          !opportunity.currency
        ) {
          opportunity.currency = commercialPolicy.defaultCurrency;
        }
        if (
          opportunity.premium_value !== undefined &&
          !opportunity.premium_currency
        ) {
          opportunity.premium_currency = commercialPolicy.defaultCurrency;
        }
        await this.createOpportunityFromDto(manager, savedVisit, opportunity);
      }

      for (const expense of dto.expenses ?? []) {
        await this.createExpenseFromDto(manager, savedVisit, expense);
      }

      if (dto.follow_up_required && dto.next_follow_up_date) {
        await manager.getRepository(FieldFollowUp).save(
          manager.getRepository(FieldFollowUp).create({
            companyId,
            fieldVisitId: savedVisit.id,
            fieldOpportunityId: null,
            employeeId,
            assignedToEmployeeId: employeeId,
            dueDate: dto.next_follow_up_date,
            action: `Follow up on ${savedVisit.visitType.toLowerCase().replace(/_/g, ' ')}`,
            status: FieldFollowUpStatusEnum.OPEN,
            completedAt: null,
            completionNote: null,
          }),
        );
      }

      if (savedVisit.status === FieldVisitStatusEnum.MANAGER_REVIEW_PENDING) {
        await this.createManagerReviewAction(savedVisit);
      }

      const employee = await this.getEmployee(companyId, employeeId);
      await this.exceptionService.reconcileForEmployeeDate(
        employee,
        savedVisit.visitDate,
        {
          dailySubmissionRequired: true,
          fieldVisitPlanRequired: true,
        },
      );

      await this.auditService.log({
        action: 'FIELD_VISIT_CHECKED_OUT',
        actor,
        companyId,
        employeeId,
        entityType: 'FIELD_VISIT',
        entityId: savedVisit.id,
        afterValues: {
          captured_at: capturedAt.toISOString(),
          duration_minutes: durationMinutes,
          location_event_id: locationEvent.id,
          status: savedVisit.status,
        },
      });

      return this.getVisitResponse(savedVisit.id, manager);
    });
    const attendance = dto.end_workday
      ? await this.trySyncFieldAttendance(actor, visitId, dto, 'CHECK_OUT')
      : {
          status: 'NOT_REQUESTED',
          message: 'The field visit ended; attendance was not checked out.',
        };
    return { ...result, attendance };
  }

  private async trySyncFieldAttendance(
    actor: AuthenticatedUser,
    visitId: number,
    dto: FieldVisitCheckInDto,
    eventType: 'CHECK_IN' | 'CHECK_OUT',
  ) {
    try {
      return await this.syncFieldAttendance(actor, visitId, dto, eventType);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Attendance synchronization failed.';
      await this.locationEventRepository
        .update(
          {
            companyId: this.getCompanyId(actor),
            employeeId: this.getEmployeeId(actor),
            fieldVisitId: visitId,
            eventType,
            clientRequestId: dto.client_request_id,
          },
          {
            attendanceSyncStatus: 'FAILED',
            attendanceSyncMessage: message.slice(0, 1000),
          },
        )
        .catch(() => undefined);
      return { status: 'FAILED', message };
    }
  }

  async getMyFieldAttendancePolicy(actor: AuthenticatedUser) {
    const companyId = this.getCompanyId(actor);
    const employee = await this.getEmployee(
      companyId,
      this.getEmployeeId(actor),
    );
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.configService.get<string>(
        'APP_TIMEZONE',
        'Africa/Dar_es_Salaam',
      ),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const policy = await this.policyService.resolveForEmployee(
      companyId,
      employee,
      today,
    );
    const mode = (policy as Record<string, unknown>).fieldAttendanceMode;
    return {
      field_attendance_mode: typeof mode === 'string' ? mode : 'NONE',
      allow_gps_exception:
        (policy as Record<string, unknown>).fieldAllowGpsException === true,
    };
  }

  async retryFieldAttendance(
    actor: AuthenticatedUser,
    visitId: number,
    eventType: 'CHECK_IN' | 'CHECK_OUT',
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    const event = await this.locationEventRepository.findOne({
      where: {
        companyId: visit.companyId,
        employeeId: visit.employeeId,
        fieldVisitId: visit.id,
        eventType,
      },
    });
    if (!event || event.latitude === null || event.longitude === null) {
      throw new NotFoundException(
        'The field event or its location is not available.',
      );
    }
    if (eventType === 'CHECK_OUT' && !event.attendanceSyncStatus) {
      throw new ConflictException(
        'Ending the workday was not requested for this event.',
      );
    }
    return this.syncFieldAttendance(
      actor,
      visitId,
      {
        client_request_id: event.clientRequestId,
        captured_at: event.capturedAt.toISOString(),
        latitude: Number(event.latitude),
        longitude: Number(event.longitude),
        accuracy_meters:
          event.accuracyMeters === null
            ? undefined
            : Number(event.accuracyMeters),
        device_identifier: event.deviceIdentifier ?? undefined,
      },
      eventType,
    );
  }

  private async syncFieldAttendance(
    actor: AuthenticatedUser,
    visitId: number,
    dto: FieldVisitCheckInDto,
    eventType: 'CHECK_IN' | 'CHECK_OUT',
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const event = await this.locationEventRepository.findOne({
      where: {
        companyId,
        employeeId,
        fieldVisitId: visitId,
        eventType,
        clientRequestId: dto.client_request_id,
      },
    });
    if (!event) throw new NotFoundException('Field event not found.');
    if (event.attendanceSyncStatus === 'ALREADY_RECORDED') {
      return {
        status: event.attendanceSyncStatus,
        message: event.attendanceSyncMessage,
        punch_id: event.attendanceMobilePunchId,
      };
    }
    const visit = await this.findMyVisitEntity(actor, visitId);
    const employee = await this.getEmployee(companyId, employeeId);
    const policy = await this.policyService.resolveForEmployee(
      companyId,
      employee,
      visit.visitDate,
    );
    const policyMode = (policy as Record<string, unknown>).fieldAttendanceMode;
    const mode = typeof policyMode === 'string' ? policyMode : 'NONE';
    if (
      mode === 'NONE' ||
      (eventType === 'CHECK_OUT' && mode !== 'START_AND_END')
    ) {
      return {
        status: 'NOT_ENABLED',
        message: 'Field attendance is not enabled for this action.',
      };
    }
    event.attendanceSyncStatus = 'PENDING';
    event.attendanceSyncMessage = 'Attendance synchronization is pending.';
    await this.locationEventRepository.save(event);
    try {
      if (!this.attendancePunchesService)
        throw new Error('Attendance service is unavailable.');
      if (event.latitude === null || event.longitude === null)
        throw new Error(
          'The field location is no longer available for attendance.',
        );
      let punch =
        await this.attendancePunchesService.findEmployeePunchByRequest(
          companyId,
          employeeId,
          dto.client_request_id,
        );
      const expectedPunchType =
        eventType === 'CHECK_IN'
          ? AttendancePunchTypeEnum.CHECK_IN
          : AttendancePunchTypeEnum.CHECK_OUT;
      if (punch && punch.punchType !== expectedPunchType)
        throw new ConflictException(
          'The attendance request ID belongs to a different punch type.',
        );
      if (!punch) {
        const state = await this.attendancePunchesService.getEmployeePunchState(
          companyId,
          employeeId,
          event.capturedAt,
        );
        if (
          (eventType === 'CHECK_IN' && state.hasCheckIn) ||
          (eventType === 'CHECK_OUT' && state.hasCheckOut)
        ) {
          event.attendanceSyncStatus = 'ALREADY_RECORDED';
          event.attendanceSyncMessage =
            eventType === 'CHECK_IN'
              ? 'An attendance check-in is already recorded or awaiting review for this attendance day.'
              : 'An attendance checkout is already recorded or awaiting review for this attendance day.';
          await this.locationEventRepository.save(event);
          return {
            status: event.attendanceSyncStatus,
            message: event.attendanceSyncMessage,
          };
        }
        const attendancePolicy =
          await this.attendancePunchesService.getMyPunchPolicy(companyId);
        const channel: 'WEB' | 'MOBILE' =
          event.deviceIdentifier?.startsWith('web-') ||
          event.deviceIdentifier?.startsWith('field-web-')
            ? 'WEB'
            : 'MOBILE';
        const params = {
          companyId,
          employeeId,
          authenticatedEmployeeId: employeeId,
          forceReview:
            mode === 'REVIEW' ||
            event.locationValidationStatus === 'EXCEPTION_PENDING',
          channel,
          dto: {
            clientRequestId: event.clientRequestId,
            clientCapturedAt: event.capturedAt.toISOString(),
            offlineQueued: event.isOfflineCapture,
            latitude: Number(event.latitude),
            longitude: Number(event.longitude),
            accuracyMeters:
              event.accuracyMeters === null
                ? undefined
                : Number(event.accuracyMeters),
            deviceIdentifier: event.deviceIdentifier ?? undefined,
            overrideReason: attendancePolicy.allow_location_exception_override
              ? `Field visit ${visit.visitNo}: attendance location exception requires review.`
              : undefined,
          },
        };
        const result =
          eventType === 'CHECK_IN'
            ? await this.attendancePunchesService.checkIn(params)
            : await this.attendancePunchesService.checkOut(params);
        punch = result.punch;
      }
      event.attendanceMobilePunchId = punch.id;
      const rejected = [
        AttendancePunchValidationStatusEnum.REJECTED,
        AttendancePunchValidationStatusEnum.OVERRIDE_REJECTED,
      ].includes(punch.validationStatus);
      const approved = [
        AttendancePunchValidationStatusEnum.APPROVED,
        AttendancePunchValidationStatusEnum.OVERRIDE_APPROVED,
      ].includes(punch.validationStatus);
      event.attendanceSyncStatus = rejected ? 'FAILED' : 'LINKED';
      event.attendanceSyncMessage = rejected
        ? 'Attendance punch was rejected. Use the attendance correction process.'
        : approved
          ? 'Attendance punch recorded.'
          : 'Attendance punch submitted and awaiting review.';
    } catch (error) {
      const response =
        error instanceof HttpException ? error.getResponse() : null;
      const message =
        typeof response === 'string'
          ? response
          : response && typeof response === 'object' && 'message' in response
            ? String(response.message)
            : error instanceof Error
              ? error.message
              : 'Attendance could not be recorded.';
      event.attendanceSyncStatus = 'FAILED';
      event.attendanceSyncMessage = message.slice(0, 1000);
    }
    await this.locationEventRepository.save(event);
    return {
      status: event.attendanceSyncStatus,
      message: event.attendanceSyncMessage,
      punch_id: event.attendanceMobilePunchId,
    };
  }

  async setVisitDisposition(
    actor: AuthenticatedUser,
    visitId: number,
    dto: FieldVisitDispositionDto,
  ) {
    if (!dto.reason.trim())
      throw new BadRequestException('A reason is required.');
    if (dto.reschedule_date && dto.status !== 'DEFERRED')
      throw new BadRequestException(
        'A proposed new date is only available for deferred visits.',
      );
    return this.dataSource.transaction(async (manager) => {
      const visit = await manager.getRepository(FieldVisit).findOne({
        where: {
          id: visitId,
          companyId: this.getCompanyId(actor),
          employeeId: this.getEmployeeId(actor),
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!visit) throw new NotFoundException('Field visit not found.');
      if (visit.status !== FieldVisitStatusEnum.PLANNED)
        throw new ConflictException(
          'Only a planned visit can be marked missed, deferred or cancelled.',
        );
      visit.status = dto.status as FieldVisitStatusEnum;
      visit.statusReason = dto.reason.trim();
      visit.rescheduleDate = dto.reschedule_date ?? null;
      await manager.getRepository(FieldVisit).save(visit);
      await this.completePlanIfFinished(manager, visit);
      await this.auditService.log(
        {
          actor,
          companyId: visit.companyId,
          employeeId: visit.employeeId,
          action: 'FIELD_VISIT_DISPOSITION_CHANGED',
          entityType: 'FIELD_VISIT',
          entityId: visit.id,
          afterValues: {
            status: visit.status,
            reschedule_date: visit.rescheduleDate,
          },
          reason: visit.statusReason,
        },
        manager,
      );
      return this.getVisitResponse(visit.id, manager);
    });
  }

  async reviseReturnedVisit(
    actor: AuthenticatedUser,
    visitId: number,
    dto: ReviseFieldVisitOutcomeDto,
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    if (visit.status !== FieldVisitStatusEnum.RETURNED || !visit.checkOutAt)
      throw new ConflictException(
        'Only a returned, completed visit can be revised.',
      );
    if (!dto.discussion_notes.trim() || !dto.outcome.trim())
      throw new BadRequestException('Notes and outcome are required.');
    const before = {
      discussionNotes: visit.discussionNotes,
      outcome: visit.outcome,
    };
    visit.discussionNotes = dto.discussion_notes.trim();
    visit.outcome = dto.outcome.trim();
    visit.status = FieldVisitStatusEnum.MANAGER_REVIEW_PENDING;
    visit.managerReviewStatus = 'PENDING';
    await this.visitRepository.save(visit);
    await this.auditService.log({
      actor,
      companyId: visit.companyId,
      employeeId: visit.employeeId,
      action: 'FIELD_VISIT_REVISED',
      entityType: 'FIELD_VISIT',
      entityId: visit.id,
      beforeValues: before,
      afterValues: {
        discussionNotes: visit.discussionNotes,
        outcome: visit.outcome,
      },
    });
    await this.createManagerReviewAction(visit);
    return this.getVisitResponse(visit.id);
  }

  async requestCheckoutCorrection(
    actor: AuthenticatedUser,
    visitId: number,
    dto: RequestFieldCheckoutCorrectionDto,
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    if (visit.status !== FieldVisitStatusEnum.CHECKED_IN || !visit.checkInAt)
      throw new ConflictException(
        'Only a checked-in visit can have a checkout correction.',
      );
    const checkout = new Date(dto.requested_checkout_at);
    const duration = (checkout.getTime() - visit.checkInAt.getTime()) / 60000;
    const minimum = this.configService.get<number>(
      'FIELD_VISIT_MIN_DURATION_MINUTES',
      5,
    );
    const maximum =
      this.configService.get<number>('FIELD_VISIT_MAX_OPEN_HOURS', 12) * 60;
    if (
      !Number.isFinite(duration) ||
      duration < minimum ||
      duration > maximum ||
      checkout.getTime() > Date.now()
    )
      throw new BadRequestException(
        'The proposed checkout must be in the past and within the allowed visit duration.',
      );
    if (
      !dto.reason.trim() ||
      !dto.discussion_notes.trim() ||
      !dto.outcome.trim()
    )
      throw new BadRequestException('Reason, notes and outcome are required.');
    const repo = this.dataSource.getRepository(FieldVisitCheckoutCorrection);
    if (
      await repo.findOne({
        where: {
          companyId: visit.companyId,
          fieldVisitId: visit.id,
          status: 'PENDING',
        },
      })
    )
      throw new ConflictException(
        'A checkout correction is already awaiting review.',
      );
    const request = await repo.save(
      repo.create({
        companyId: visit.companyId,
        fieldVisitId: visit.id,
        employeeId: visit.employeeId,
        requestedCheckoutAt: checkout,
        reason: dto.reason.trim(),
        discussionNotes: dto.discussion_notes.trim(),
        outcome: dto.outcome.trim(),
        status: 'PENDING',
        reviewComments: null,
        reviewedByCompanyUserId: null,
        reviewedAt: null,
      }),
    );
    await this.auditService.log({
      actor,
      companyId: visit.companyId,
      employeeId: visit.employeeId,
      action: 'FIELD_CHECKOUT_CORRECTION_REQUESTED',
      entityType: 'FIELD_CHECKOUT_CORRECTION',
      entityId: request.id,
      afterValues: {
        visit_id: visit.id,
        requested_checkout_at: checkout.toISOString(),
      },
      reason: request.reason,
    });
    if (visit.managerCompanyUserId)
      await this.actionItemsService.upsertOpen({
        companyId: visit.companyId,
        assigneeCompanyUserId: visit.managerCompanyUserId,
        assigneeEmployeeId: visit.managerEmployeeId,
        actionType: ActionItemTypeEnum.APPROVAL,
        sourceModule: 'WORK_ACTIVITIES',
        sourceEntityType: 'FIELD_CHECKOUT_CORRECTION',
        sourceEntityId: request.id,
        sourceKey: `field-checkout-correction:${request.id}`,
        title: 'Review field checkout correction',
        description: `Review a checkout correction for ${visit.visitNo}.`,
        actionUrl: '/dashboard/field/visits',
      });
    return request;
  }

  async listCheckoutCorrections(actor: AuthenticatedUser) {
    const companyId = this.getCompanyId(actor);
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (employeeIds !== null && !employeeIds.length) return [];
    const qb = this.dataSource
      .getRepository(FieldVisitCheckoutCorrection)
      .createQueryBuilder('correction')
      .where('correction.companyId = :companyId', { companyId })
      .orderBy('correction.createdAt', 'DESC');
    if (employeeIds !== null)
      qb.andWhere('correction.employeeId IN (:...employeeIds)', {
        employeeIds,
      });
    return qb.getMany();
  }

  async reviewCheckoutCorrection(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewFieldCheckoutCorrectionDto,
  ) {
    if (!dto.comments.trim())
      throw new BadRequestException('Review comments are required.');
    const companyId = this.getCompanyId(actor);
    const saved = await this.dataSource.transaction(async (manager) => {
      const request = await manager
        .getRepository(FieldVisitCheckoutCorrection)
        .findOne({
          where: { id, companyId },
          lock: { mode: 'pessimistic_write' },
        });
      if (!request)
        throw new NotFoundException('Checkout correction not found.');
      if (request.status !== 'PENDING')
        throw new ConflictException(
          'This correction has already been reviewed.',
        );
      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id: request.fieldVisitId, companyId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!visit) throw new NotFoundException('Field visit not found.');
      await this.assertManagerCanAccess(
        actor,
        visit.employeeId,
        visit.managerEmployeeId,
      );
      if (dto.decision === 'APPROVE') {
        if (
          visit.status !== FieldVisitStatusEnum.CHECKED_IN ||
          !visit.checkInAt
        )
          throw new ConflictException(
            'The visit is no longer awaiting checkout.',
          );
        visit.checkOutAt = request.requestedCheckoutAt;
        visit.durationMinutes = Math.floor(
          (request.requestedCheckoutAt.getTime() - visit.checkInAt.getTime()) /
            60000,
        );
        visit.discussionNotes = request.discussionNotes;
        visit.outcome = request.outcome;
        visit.status = FieldVisitStatusEnum.MANAGER_REVIEW_PENDING;
        visit.managerReviewStatus = 'PENDING';
        await manager.getRepository(FieldVisit).save(visit);
        await this.completePlanIfFinished(manager, visit);
      }
      request.status = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      request.reviewComments = dto.comments.trim();
      request.reviewedByCompanyUserId = actor.companyMembershipId ?? null;
      request.reviewedAt = new Date();
      await manager.getRepository(FieldVisitCheckoutCorrection).save(request);
      await this.auditService.log(
        {
          actor,
          companyId,
          employeeId: request.employeeId,
          action: 'FIELD_CHECKOUT_CORRECTION_REVIEWED',
          entityType: 'FIELD_CHECKOUT_CORRECTION',
          entityId: request.id,
          afterValues: { status: request.status, visit_id: visit.id },
          reason: request.reviewComments,
        },
        manager,
      );
      return { request, visit };
    });
    await this.actionItemsService.completeAllOpenForEntity(
      companyId,
      'WORK_ACTIVITIES',
      'FIELD_CHECKOUT_CORRECTION',
      id,
    );
    if (dto.decision === 'APPROVE')
      await this.createManagerReviewAction(saved.visit);
    const employee = await this.getEmployee(
      companyId,
      saved.request.employeeId,
    );
    if (employee.company_user_id) {
      await this.actionItemsService.upsertOpen(
        {
          companyId,
          assigneeCompanyUserId: employee.company_user_id,
          assigneeEmployeeId: employee.id,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'FIELD_CHECKOUT_CORRECTION',
          sourceEntityId: saved.request.id,
          sourceKey: `field-checkout-correction:decision:${saved.request.id}`,
          title: 'Field checkout correction reviewed',
          description: `Your field checkout correction was ${saved.request.status.toLowerCase()}. ${saved.request.reviewComments ?? ''}`,
          actionUrl: '/dashboard/me/field/visits',
        },
        { reopenCompleted: false },
      );
    }
    return saved.request;
  }

  async addEvidence(
    actor: AuthenticatedUser,
    visitId: number,
    dto: AddFieldVisitEvidenceDto,
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    await this.evidenceRepository.save(
      this.evidenceRepository.create({
        companyId: visit.companyId,
        fieldVisitId: visit.id,
        evidenceType: dto.evidence_type,
        documentId: dto.document_id,
        description: dto.description?.trim() ?? null,
        capturedAt: dto.captured_at ? new Date(dto.captured_at) : null,
        clientRequestId: dto.client_request_id ?? null,
      }),
    );
    return this.getVisitResponse(visit.id);
  }

  async uploadAttachment(
    actor: AuthenticatedUser,
    visitId: number,
    dto: UploadFieldVisitAttachmentDto,
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    if (!this.filesService)
      throw new ServiceUnavailableException(
        'Field attachment storage is unavailable.',
      );
    const stored = await this.filesService.savePrivateBase64File(dto.file, {
      directorySegments: [
        'field-visits',
        `company-${visit.companyId}`,
        `visit-${visit.id}`,
      ],
      fileNamePrefix: 'evidence',
      allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
      maxFileSizeBytes: 10 * 1024 * 1024,
      validateFileSignature: true,
    });
    const repo = this.dataSource.getRepository(FieldVisitAttachment);
    let attachment: FieldVisitAttachment;
    try {
      attachment = await repo.save(
        repo.create({
          companyId: visit.companyId,
          fieldVisitId: visit.id,
          employeeId: visit.employeeId,
          fileName: stored.originalFileName,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          filePath: stored.publicPath,
          description: dto.description?.trim() || null,
        }),
      );
    } catch (error) {
      await this.filesService
        .removeManagedFile(stored.publicPath)
        .catch(() => undefined);
      throw error;
    }
    await this.auditService.log({
      actor,
      companyId: visit.companyId,
      employeeId: visit.employeeId,
      action: 'FIELD_VISIT_ATTACHMENT_ADDED',
      entityType: 'FIELD_VISIT_ATTACHMENT',
      entityId: attachment.id,
      afterValues: {
        visit_id: visit.id,
        file_name: attachment.fileName,
        mime_type: attachment.mimeType,
      },
    });
    return {
      id: attachment.id,
      companyId: attachment.companyId,
      fieldVisitId: attachment.fieldVisitId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
      description: attachment.description,
      createdAt: attachment.createdAt,
    };
  }

  async downloadAttachment(
    actor: AuthenticatedUser,
    visitId: number,
    attachmentId: number,
    managerAccess = false,
  ) {
    const companyId = this.getCompanyId(actor);
    const visit = managerAccess
      ? await this.visitRepository.findOne({
          where: { id: visitId, companyId },
        })
      : await this.findMyVisitEntity(actor, visitId);
    if (!visit) throw new NotFoundException('Field visit not found.');
    if (managerAccess)
      await this.assertManagerCanAccess(
        actor,
        visit.employeeId,
        visit.managerEmployeeId,
      );
    const attachment = await this.dataSource
      .getRepository(FieldVisitAttachment)
      .findOne({
        where: { id: attachmentId, companyId, fieldVisitId: visit.id },
        select: {
          id: true,
          companyId: true,
          fieldVisitId: true,
          fileName: true,
          mimeType: true,
          filePath: true,
        },
      });
    if (!attachment || !this.filesService)
      throw new NotFoundException('Field attachment not found.');
    const buffer = await this.filesService.readManagedFile(attachment.filePath);
    if (!buffer)
      throw new NotFoundException('Field attachment file not found.');
    return {
      buffer,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
    };
  }

  async addOpportunity(
    actor: AuthenticatedUser,
    visitId: number,
    dto: CreateFieldOpportunityDto,
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    if (dto.client_request_id) {
      const existing = await this.opportunityRepository.findOne({
        where: {
          companyId: visit.companyId,
          employeeId: visit.employeeId,
          clientRequestId: dto.client_request_id,
        },
      });
      if (existing) return this.getVisitResponse(existing.fieldVisitId);
    }
    const companyPolicy = await this.getCommercialPolicy(visit.companyId);
    if (!companyPolicy.allowEmployeeOpportunityValues) {
      throw new ForbiddenException(
        'Employee opportunity value entry is disabled by company policy.',
      );
    }
    this.assertSupportedCurrency(dto.currency, companyPolicy, 'Sales');
    this.assertSupportedCurrency(
      dto.premium_currency,
      companyPolicy,
      'Premium',
    );
    if (dto.potential_value !== undefined && !dto.currency)
      dto.currency = companyPolicy.defaultCurrency;
    if (dto.premium_value !== undefined && !dto.premium_currency)
      dto.premium_currency = companyPolicy.defaultCurrency;
    await this.createOpportunityFromDto(this.dataSource.manager, visit, dto);
    return this.getVisitResponse(visit.id);
  }

  async getCommercialPolicyForCompany(actor: AuthenticatedUser) {
    return this.getCommercialPolicy(this.getCompanyId(actor));
  }

  async upsertCommercialPolicy(
    actor: AuthenticatedUser,
    dto: UpsertFieldVisitCommercialPolicyDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const supportedCurrencies = [
      ...new Set(
        dto.supported_currencies.map((code) => code.trim().toUpperCase()),
      ),
    ];
    const defaultCurrency = dto.default_currency.trim().toUpperCase();
    if (
      !supportedCurrencies.length ||
      !supportedCurrencies.includes(defaultCurrency)
    ) {
      throw new BadRequestException(
        'Default currency must be included in the supported currency list.',
      );
    }
    const existing = await this.getCommercialPolicy(companyId);
    const saved = await this.commercialPolicyRepository.save({
      ...existing,
      companyId,
      defaultCurrency,
      supportedCurrencies,
      allowEmployeeOpportunityValues:
        dto.allow_employee_opportunity_values ??
        existing.allowEmployeeOpportunityValues,
      updatedByCompanyUserId: actor.companyMembershipId ?? null,
    });
    await this.auditService.log({
      actor,
      companyId,
      action: 'FIELD_VISIT_COMMERCIAL_POLICY_UPDATED',
      entityType: 'FIELD_VISIT_COMMERCIAL_POLICY',
      entityId: saved.id,
      afterValues: {
        defaultCurrency,
        supportedCurrencies,
        allowEmployeeOpportunityValues: saved.allowEmployeeOpportunityValues,
      },
    });
    return saved;
  }

  async updateOpportunityCommercial(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateFieldOpportunityCommercialDto,
  ) {
    if (!dto.reason.trim()) {
      throw new BadRequestException(
        'A reason is required for opportunity commercial changes.',
      );
    }
    const companyId = this.getCompanyId(actor);
    const opportunity = await this.opportunityRepository.findOne({
      where: { id, companyId },
    });
    if (!opportunity)
      throw new NotFoundException('Field opportunity not found.');
    const visit = await this.visitRepository.findOne({
      where: { id: opportunity.fieldVisitId, companyId },
    });
    if (!visit) throw new NotFoundException('Field visit not found.');
    await this.assertManagerCanAccess(
      actor,
      visit.employeeId,
      visit.managerEmployeeId,
    );
    const policy = await this.getCommercialPolicy(companyId);
    const before = {
      status: opportunity.status,
      actualValue: opportunity.actualValue,
    };
    if (dto.actual_value !== undefined) {
      const currency = opportunity.currency ?? policy.defaultCurrency;
      this.assertSupportedCurrency(currency, policy, 'Actual sales');
      opportunity.actualValue = String(dto.actual_value);
      opportunity.validatedByManager = true;
      opportunity.validatedAt = new Date();
    }
    if (dto.status !== undefined) {
      const allowedTransitions: Record<
        FieldOpportunityStatusEnum,
        FieldOpportunityStatusEnum[]
      > = {
        [FieldOpportunityStatusEnum.IDENTIFIED]: [
          FieldOpportunityStatusEnum.FOLLOW_UP,
          FieldOpportunityStatusEnum.QUOTATION_ISSUED,
          FieldOpportunityStatusEnum.WON,
          FieldOpportunityStatusEnum.LOST,
          FieldOpportunityStatusEnum.DEFERRED,
          FieldOpportunityStatusEnum.CANCELLED,
        ],
        [FieldOpportunityStatusEnum.FOLLOW_UP]: [
          FieldOpportunityStatusEnum.IDENTIFIED,
          FieldOpportunityStatusEnum.QUOTATION_ISSUED,
          FieldOpportunityStatusEnum.WON,
          FieldOpportunityStatusEnum.LOST,
          FieldOpportunityStatusEnum.DEFERRED,
          FieldOpportunityStatusEnum.CANCELLED,
        ],
        [FieldOpportunityStatusEnum.QUOTATION_ISSUED]: [
          FieldOpportunityStatusEnum.FOLLOW_UP,
          FieldOpportunityStatusEnum.WON,
          FieldOpportunityStatusEnum.LOST,
          FieldOpportunityStatusEnum.DEFERRED,
          FieldOpportunityStatusEnum.CANCELLED,
        ],
        [FieldOpportunityStatusEnum.DEFERRED]: [
          FieldOpportunityStatusEnum.FOLLOW_UP,
          FieldOpportunityStatusEnum.QUOTATION_ISSUED,
          FieldOpportunityStatusEnum.LOST,
          FieldOpportunityStatusEnum.CANCELLED,
        ],
        [FieldOpportunityStatusEnum.WON]: [],
        [FieldOpportunityStatusEnum.LOST]: [],
        [FieldOpportunityStatusEnum.CANCELLED]: [],
      };
      if (
        dto.status !== opportunity.status &&
        !allowedTransitions[opportunity.status]?.includes(dto.status)
      ) {
        throw new ConflictException(
          `Opportunity cannot move from ${opportunity.status} to ${dto.status}. Terminal stages cannot be changed.`,
        );
      }
      if (
        dto.status === FieldOpportunityStatusEnum.WON &&
        dto.actual_value === undefined &&
        opportunity.actualValue === null
      ) {
        throw new BadRequestException(
          'A realized sales value is required before marking an opportunity as won.',
        );
      }
      opportunity.status = dto.status;
    }
    const saved = await this.opportunityRepository.save(opportunity);
    await this.auditService.log({
      actor,
      companyId,
      employeeId: opportunity.employeeId,
      action: 'FIELD_VISIT_OPPORTUNITY_COMMERCIAL_UPDATED',
      entityType: 'FIELD_OPPORTUNITY',
      entityId: opportunity.id,
      beforeValues: before,
      afterValues: { status: saved.status, actualValue: saved.actualValue },
      reason: dto.reason.trim(),
    });
    return this.getVisitResponse(opportunity.fieldVisitId);
  }

  async addExpense(
    actor: AuthenticatedUser,
    visitId: number,
    dto: CreateFieldVisitExpenseDto,
  ) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    await this.createExpenseFromDto(this.dataSource.manager, visit, dto);
    return this.getVisitResponse(visit.id);
  }

  async listMyFollowUps(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const qb = this.followUpRepository
      .createQueryBuilder('followUp')
      .where('followUp.companyId = :companyId', {
        companyId: this.getCompanyId(actor),
      })
      .andWhere('followUp.assignedToEmployeeId = :employeeId', {
        employeeId: this.getEmployeeId(actor),
      })
      .orderBy('followUp.dueDate', 'ASC')
      .addOrderBy('followUp.id', 'DESC');
    if (query.status) {
      qb.andWhere('followUp.status = :status', { status: query.status });
    }
    return this.enrichFollowUps(await qb.getMany());
  }

  async listManagerFollowUps(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);

    if (employeeIds !== null && employeeIds.length === 0) {
      return [];
    }

    const qb = this.followUpRepository
      .createQueryBuilder('followUp')
      .where('followUp.companyId = :companyId', { companyId })
      .orderBy('followUp.dueDate', 'ASC')
      .addOrderBy('followUp.id', 'DESC');

    if (employeeIds !== null) {
      qb.andWhere('followUp.assignedToEmployeeId IN (:...employeeIds)', {
        employeeIds,
      });
    }
    if (query.employee_id) {
      qb.andWhere('followUp.assignedToEmployeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    if (query.status) {
      qb.andWhere('followUp.status = :status', { status: query.status });
    }
    if (query.date_from) {
      qb.andWhere('followUp.dueDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('followUp.dueDate <= :dateTo', { dateTo: query.date_to });
    }

    return this.enrichFollowUps(await qb.getMany());
  }

  private async enrichFollowUps(followUps: FieldFollowUp[]) {
    if (!followUps.length) return [];
    const visits = await this.visitRepository.find({
      where: {
        companyId: followUps[0].companyId,
        id: In([...new Set(followUps.map((item) => item.fieldVisitId))]),
      },
    });
    const byId = new Map(visits.map((visit) => [visit.id, visit]));
    return followUps.map((item) => {
      const visit = byId.get(item.fieldVisitId);
      return {
        ...item,
        visit_name: visit?.visitName ?? visit?.purpose ?? null,
        party: visit?.partySnapshot ?? null,
      };
    });
  }

  async assignFollowUp(
    actor: AuthenticatedUser,
    id: number,
    dto: AssignFieldFollowUpDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const followUp = await this.followUpRepository.findOne({
      where: { id, companyId },
    });
    if (!followUp) throw new NotFoundException('Follow-up not found.');
    if (followUp.status !== FieldFollowUpStatusEnum.OPEN)
      throw new ConflictException('Only open follow-ups can be reassigned.');
    if (!dto.reason.trim())
      throw new BadRequestException('A reason is required.');
    await this.assertManagerCanAccess(
      actor,
      followUp.assignedToEmployeeId,
      null,
    );
    await this.assertManagerCanAccess(actor, dto.employee_id, null);
    const assignee = await this.getEmployee(companyId, dto.employee_id);
    const previous = followUp.assignedToEmployeeId;
    followUp.assignedToEmployeeId = dto.employee_id;
    const saved = await this.followUpRepository.save(followUp);
    await this.actionItemsService.completeAllOpenForEntity(
      companyId,
      'WORK_ACTIVITIES',
      'FIELD_FOLLOW_UP',
      id,
    );
    await this.auditService.log({
      actor,
      companyId,
      employeeId: followUp.employeeId,
      action: 'FIELD_FOLLOW_UP_ASSIGNED',
      entityType: 'FIELD_FOLLOW_UP',
      entityId: id,
      beforeValues: { assignedToEmployeeId: previous },
      afterValues: { assignedToEmployeeId: dto.employee_id },
      reason: dto.reason.trim(),
    });
    if (assignee.company_user_id) {
      await this.actionItemsService.upsertOpen(
        {
          companyId,
          assigneeCompanyUserId: assignee.company_user_id,
          assigneeEmployeeId: assignee.id,
          actionType: ActionItemTypeEnum.TASK,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'FIELD_FOLLOW_UP',
          sourceEntityId: id,
          sourceKey: `field-follow-up:assignment:${id}:${assignee.id}`,
          title: 'Field follow-up assigned',
          description: `A field follow-up is due on ${saved.dueDate}.`,
          actionUrl: '/dashboard/me/field/follow-ups',
        },
        { reopenCompleted: true },
      );
    }
    return saved;
  }

  async completeMyFollowUp(
    actor: AuthenticatedUser,
    id: number,
    dto: CompleteFieldFollowUpDto,
  ) {
    const followUp = await this.findMyFollowUp(actor, id);
    if (followUp.status === FieldFollowUpStatusEnum.COMPLETED) {
      throw new ConflictException('This follow-up is already completed.');
    }
    if (followUp.status === FieldFollowUpStatusEnum.CANCELLED) {
      throw new ConflictException('This follow-up was cancelled.');
    }

    followUp.status = FieldFollowUpStatusEnum.COMPLETED;
    followUp.completedAt = new Date();
    followUp.completionNote = dto.completion_note?.trim() ?? null;
    const saved = await this.followUpRepository.save(followUp);
    await this.actionItemsService.completeAllOpenForEntity(
      saved.companyId,
      'WORK_ACTIVITIES',
      'FIELD_FOLLOW_UP',
      saved.id,
    );
    return saved;
  }

  async createMyFollowUp(
    actor: AuthenticatedUser,
    dto: CreateFieldFollowUpDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const visit = await this.findMyVisitEntity(actor, dto.field_visit_id);
    if (!dto.action.trim())
      throw new BadRequestException('A follow-up action is required.');
    if (dto.field_opportunity_id) {
      const opportunity = await this.opportunityRepository.findOne({
        where: {
          id: dto.field_opportunity_id,
          companyId,
          fieldVisitId: visit.id,
        },
      });
      if (!opportunity)
        throw new BadRequestException(
          'The opportunity is not part of this visit.',
        );
    }
    return this.followUpRepository.save(
      this.followUpRepository.create({
        companyId,
        fieldVisitId: visit.id,
        fieldOpportunityId: dto.field_opportunity_id ?? null,
        employeeId,
        assignedToEmployeeId: employeeId,
        dueDate: dto.due_date,
        dueAt: dto.due_at ? new Date(dto.due_at) : null,
        actionType: dto.action_type ?? 'OTHER',
        priority: dto.priority ?? 'NORMAL',
        action: dto.action.trim(),
        status: FieldFollowUpStatusEnum.OPEN,
        completedAt: null,
        completionNote: null,
      }),
    );
  }

  async updateMyFollowUp(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateFieldFollowUpDto,
  ) {
    const followUp = await this.findMyFollowUp(actor, id);
    if (followUp.status !== FieldFollowUpStatusEnum.OPEN) {
      throw new ConflictException('Only open follow-ups can be edited.');
    }
    if (
      dto.due_date &&
      dto.due_date !== followUp.dueDate &&
      dto.due_at === undefined
    )
      followUp.dueAt = null;
    if (dto.due_date) followUp.dueDate = dto.due_date;
    if (dto.action !== undefined) {
      if (!dto.action.trim())
        throw new BadRequestException('A follow-up action is required.');
      followUp.action = dto.action.trim();
    }
    if (dto.due_at !== undefined)
      followUp.dueAt = dto.due_at ? new Date(dto.due_at) : null;
    if (dto.action_type !== undefined) followUp.actionType = dto.action_type;
    if (dto.priority !== undefined) followUp.priority = dto.priority;
    const saved = await this.followUpRepository.save(followUp);
    if (dto.due_date !== undefined || dto.due_at !== undefined) {
      await this.actionItemsService.completeAllOpenForEntity(
        saved.companyId,
        'WORK_ACTIVITIES',
        'FIELD_FOLLOW_UP',
        saved.id,
      );
    }
    return saved;
  }

  async cancelMyFollowUp(actor: AuthenticatedUser, id: number) {
    const followUp = await this.findMyFollowUp(actor, id);
    if (followUp.status !== FieldFollowUpStatusEnum.OPEN) {
      throw new ConflictException('Only open follow-ups can be cancelled.');
    }
    followUp.status = FieldFollowUpStatusEnum.CANCELLED;
    const saved = await this.followUpRepository.save(followUp);
    await this.actionItemsService.completeAllOpenForEntity(
      saved.companyId,
      'WORK_ACTIVITIES',
      'FIELD_FOLLOW_UP',
      saved.id,
    );
    return saved;
  }

  private async findMyFollowUp(actor: AuthenticatedUser, id: number) {
    const followUp = await this.followUpRepository.findOne({
      where: {
        id,
        companyId: this.getCompanyId(actor),
        assignedToEmployeeId: this.getEmployeeId(actor),
      },
    });
    if (!followUp) {
      throw new NotFoundException('Follow-up not found.');
    }
    return followUp;
  }

  async listManagerPlans(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const qb = this.planRepository
      .createQueryBuilder('plan')
      .where('plan.companyId = :companyId', {
        companyId: this.getCompanyId(actor),
      })
      .orderBy('plan.visitDate', 'DESC');
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (employeeIds !== null) {
      if (employeeIds.length === 0) return [];
      qb.andWhere('plan.employeeId IN (:...employeeIds)', { employeeIds });
    }
    if (query.status) {
      qb.andWhere('plan.status = :status', { status: query.status });
    }
    const plans = await qb.getMany();
    return Promise.all(plans.map((plan) => this.getPlanResponse(plan)));
  }

  async reviewPlan(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewFieldVisitDto,
  ) {
    const plan = await this.planRepository.findOne({
      where: { id, companyId: this.getCompanyId(actor) },
    });
    if (!plan) {
      throw new NotFoundException('Visit plan not found.');
    }
    await this.assertManagerCanAccess(
      actor,
      plan.employeeId,
      plan.managerEmployeeId,
    );
    if (plan.status !== FieldVisitPlanStatusEnum.SUBMITTED) {
      throw new ConflictException(
        'Only submitted visit plans can be reviewed.',
      );
    }

    switch (dto.decision) {
      case FieldVisitReviewDecisionEnum.APPROVE:
        plan.status = FieldVisitPlanStatusEnum.APPROVED;
        plan.approvedAt = new Date();
        plan.approvedByCompanyUserId = actor.companyMembershipId ?? null;
        break;
      case FieldVisitReviewDecisionEnum.RETURN:
        plan.status = FieldVisitPlanStatusEnum.RETURNED;
        break;
      case FieldVisitReviewDecisionEnum.REJECT:
        plan.status = FieldVisitPlanStatusEnum.REJECTED;
        break;
    }

    plan.managerComments = dto.comments.trim();
    const updated = await this.planRepository.update(
      {
        id: plan.id,
        companyId: plan.companyId,
        status: FieldVisitPlanStatusEnum.SUBMITTED,
      },
      {
        status: plan.status,
        approvedAt: plan.approvedAt,
        approvedByCompanyUserId: plan.approvedByCompanyUserId,
        managerComments: plan.managerComments,
      },
    );
    if (!updated.affected)
      throw new ConflictException(
        'This plan was already reviewed. Refresh before continuing.',
      );
    const saved = await this.planRepository.findOneOrFail({
      where: { id: plan.id, companyId: plan.companyId },
    });
    await this.auditService.log({
      actor,
      companyId: saved.companyId,
      employeeId: saved.employeeId,
      action: 'FIELD_VISIT_PLAN_REVIEWED',
      entityType: 'FIELD_VISIT_PLAN',
      entityId: saved.id,
      beforeValues: { status: 'SUBMITTED' },
      afterValues: { status: saved.status },
      reason: saved.managerComments,
    });
    await this.actionItemsService.completeAllOpenForEntity(
      saved.companyId,
      'WORK_ACTIVITIES',
      'FIELD_VISIT_PLAN',
      saved.id,
    );
    const employee = await this.getEmployee(saved.companyId, saved.employeeId);
    if (employee.company_user_id) {
      await this.actionItemsService.upsertOpen(
        {
          companyId: saved.companyId,
          assigneeCompanyUserId: employee.company_user_id,
          assigneeEmployeeId: employee.id,
          actionType: ActionItemTypeEnum.REMINDER,
          sourceModule: 'WORK_ACTIVITIES',
          sourceEntityType: 'FIELD_VISIT_PLAN',
          sourceEntityId: saved.id,
          sourceKey: `field-visit-plan:decision:${saved.id}:${saved.status}`,
          title: 'Field plan reviewed',
          description: `Your field plan for ${saved.visitDate} was ${saved.status.toLowerCase()}. ${saved.managerComments ?? ''}`,
          actionUrl: '/dashboard/me/field/plans',
        },
        { reopenCompleted: true },
      );
    }
    return this.getPlanResponse(saved);
  }

  async listManagerVisits(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    return this.listScopedVisits(actor, query, false);
  }

  async getForManager(actor: AuthenticatedUser, id: number) {
    const visit = await this.visitRepository.findOne({
      where: { id, companyId: this.getCompanyId(actor) },
    });
    if (!visit) {
      throw new NotFoundException('Field visit not found.');
    }
    await this.assertManagerCanAccess(
      actor,
      visit.employeeId,
      visit.managerEmployeeId,
    );
    return this.getVisitResponse(visit.id);
  }

  async reviewVisit(
    actor: AuthenticatedUser,
    id: number,
    dto: ReviewFieldVisitDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id, companyId: this.getCompanyId(actor) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!visit) {
        throw new NotFoundException('Field visit not found.');
      }
      await this.assertManagerCanAccess(
        actor,
        visit.employeeId,
        visit.managerEmployeeId,
      );

      if (
        ![
          FieldVisitStatusEnum.MANAGER_REVIEW_PENDING,
          FieldVisitStatusEnum.COMPLETED,
          FieldVisitStatusEnum.REVIEWED,
          FieldVisitStatusEnum.RETURNED,
        ].includes(visit.status)
      ) {
        throw new ConflictException(
          'This visit must be completed before it can be reviewed.',
        );
      }

      const opportunities = await manager.getRepository(FieldOpportunity).find({
        where: { companyId: visit.companyId, fieldVisitId: visit.id },
      });
      const expenses = await manager.getRepository(FieldVisitExpense).find({
        where: { companyId: visit.companyId, fieldVisitId: visit.id },
      });

      if (dto.validate_opportunities) {
        for (const opportunity of opportunities) {
          const wasValidated = opportunity.validatedByManager;
          const validation = dto.opportunity_validations?.find(
            (item) => item.opportunity_id === opportunity.id,
          );
          opportunity.validatedByManager = validation?.validated ?? true;
          opportunity.validatedAt = opportunity.validatedByManager
            ? new Date()
            : null;
          await manager.getRepository(FieldOpportunity).save(opportunity);
          await this.auditService.log(
            {
              actor,
              companyId: visit.companyId,
              employeeId: opportunity.employeeId,
              action: opportunity.validatedByManager
                ? 'FIELD_VISIT_OPPORTUNITY_VALIDATED'
                : 'FIELD_VISIT_OPPORTUNITY_VALIDATION_REVOKED',
              entityType: 'FIELD_OPPORTUNITY',
              entityId: opportunity.id,
              beforeValues: { validatedByManager: wasValidated },
              afterValues: {
                validatedByManager: opportunity.validatedByManager,
              },
              reason: dto.comments.trim(),
            },
            manager,
          );
        }
      }

      const approvedExpenseIds = new Set(dto.approved_expense_ids ?? []);
      for (const expense of expenses) {
        if (approvedExpenseIds.has(expense.id)) {
          expense.status = 'MANAGER_APPROVED' as never;
          expense.approvedByCompanyUserId = actor.companyMembershipId ?? null;
          expense.approvedAt = new Date();
          await manager.getRepository(FieldVisitExpense).save(expense);
        }
      }

      const previousStatus = visit.status;
      visit.managerComments = dto.comments.trim();
      visit.managerReviewedAt = new Date();
      switch (dto.decision) {
        case FieldVisitReviewDecisionEnum.APPROVE:
          visit.status = FieldVisitStatusEnum.REVIEWED;
          visit.managerReviewStatus = 'APPROVED';
          break;
        case FieldVisitReviewDecisionEnum.RETURN:
          visit.status = FieldVisitStatusEnum.RETURNED;
          visit.managerReviewStatus = 'RETURNED';
          break;
        case FieldVisitReviewDecisionEnum.REJECT:
          visit.status = FieldVisitStatusEnum.REJECTED;
          visit.managerReviewStatus = 'REJECTED';
          break;
      }
      const saved = await manager.getRepository(FieldVisit).save(visit);
      await this.auditService.log(
        {
          actor,
          companyId: saved.companyId,
          employeeId: saved.employeeId,
          action: 'FIELD_VISIT_REVIEWED',
          entityType: 'FIELD_VISIT',
          entityId: saved.id,
          beforeValues: { status: previousStatus },
          afterValues: {
            status: saved.status,
            review_status: saved.managerReviewStatus,
          },
          reason: saved.managerComments,
        },
        manager,
      );
      if (dto.decision !== FieldVisitReviewDecisionEnum.RETURN) {
        const eventRepo = manager.getRepository(FieldVisitLocationEvent);
        const events = await eventRepo.find({
          where: {
            companyId: saved.companyId,
            fieldVisitId: saved.id,
            locationValidationStatus: 'EXCEPTION_PENDING',
          },
        });
        for (const event of events) {
          event.locationValidationStatus =
            dto.decision === FieldVisitReviewDecisionEnum.APPROVE
              ? 'EXCEPTION_APPROVED'
              : 'EXCEPTION_REJECTED';
          event.locationValidationResult = {
            ...event.locationValidationResult,
            status: event.locationValidationStatus,
            reviewed_by_company_user_id: actor.companyMembershipId ?? null,
            review_comments: dto.comments.trim(),
          };
          await eventRepo.save(event);
        }
      }

      await this.actionItemsService.completeAllOpenForEntity(
        saved.companyId,
        'WORK_ACTIVITIES',
        'FIELD_VISIT',
        saved.id,
      );

      const employee = await this.getEmployee(
        saved.companyId,
        saved.employeeId,
      );
      if (employee.company_user_id) {
        await this.actionItemsService.upsertOpen(
          {
            companyId: saved.companyId,
            assigneeCompanyUserId: employee.company_user_id,
            assigneeEmployeeId: employee.id,
            actionType: ActionItemTypeEnum.REMINDER,
            sourceModule: 'WORK_ACTIVITIES',
            sourceEntityType: 'FIELD_VISIT',
            sourceEntityId: saved.id,
            sourceKey: `field-visit:decision:${saved.id}:${saved.status}`,
            title: 'Field visit reviewed',
            description: `Visit ${saved.visitNo} was ${saved.managerReviewStatus.toLowerCase()}. ${saved.managerComments ?? ''}`,
            actionUrl: '/dashboard/me/field/visits',
          },
          { reopenCompleted: true },
        );
      }
      await this.exceptionService.reconcileForEmployeeDate(
        employee,
        saved.visitDate,
        { dailySubmissionRequired: true, fieldVisitPlanRequired: true },
      );

      return this.getVisitResponse(saved.id, manager);
    });
  }

  async getMapPoints(
    actor: AuthenticatedUser,
    query: FieldLocationMapQueryDto,
    requestContext?: { requestId?: string | null; ipAddress?: string | null },
  ) {
    const companyId = this.getCompanyId(actor);
    const accessibleEmployeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const qb = this.locationEventRepository
      .createQueryBuilder('event')
      .innerJoin(FieldVisit, 'visit', 'visit.id = event.fieldVisitId')
      .where('event.companyId = :companyId', { companyId })
      .andWhere('visit.status = :status', {
        status: FieldVisitStatusEnum.REVIEWED,
      })
      .andWhere('visit.managerReviewStatus = :reviewStatus', {
        reviewStatus: 'APPROVED',
      })
      .orderBy('event.capturedAt', 'DESC');

    if (query.date_from) {
      qb.andWhere('event.capturedAt >= :dateFrom', {
        dateFrom: `${query.date_from}T00:00:00.000Z`,
      });
    }
    if (query.date_to) {
      qb.andWhere('event.capturedAt <= :dateTo', {
        dateTo: `${query.date_to}T23:59:59.999Z`,
      });
    }
    if (query.employee_id) {
      qb.andWhere('event.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    if (accessibleEmployeeIds !== null) {
      if (accessibleEmployeeIds.length === 0) return [];
      qb.andWhere('event.employeeId IN (:...employeeIds)', {
        employeeIds: accessibleEmployeeIds,
      });
    }

    await this.accessLogRepository.save(
      this.accessLogRepository.create({
        companyId,
        actorCompanyUserId: actor.companyMembershipId ?? 0,
        employeeId: query.employee_id ?? null,
        accessType: 'FIELD_VISIT_MAP',
        dateFrom: query.date_from ?? null,
        dateTo: query.date_to ?? null,
        purpose: query.purpose,
        requestId: requestContext?.requestId ?? null,
        ipAddress: requestContext?.ipAddress ?? null,
      }),
    );

    return qb.getRawMany();
  }

  async listLocationAccessLogs(actor: AuthenticatedUser) {
    return this.accessLogRepository.find({
      where: { companyId: this.getCompanyId(actor) },
      order: { accessedAt: 'DESC', id: 'DESC' },
      take: 100,
    });
  }

  async getPlannedVsActual(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const visits = await this.listManagerVisits(actor, query);
    const activeVisits = visits.filter(
      (visit) => visit.status !== FieldVisitStatusEnum.CANCELLED,
    );
    const planned = activeVisits.filter((visit) => !visit.isUnplanned);
    const completed = planned.filter(
      (visit) =>
        visit.status === FieldVisitStatusEnum.REVIEWED &&
        visit.managerReviewStatus === 'APPROVED',
    ).length;
    const unplanned = activeVisits.filter((visit) => visit.isUnplanned).length;
    return {
      planned: planned.length,
      completed,
      unplanned,
      completion_rate:
        planned.length > 0
          ? Number(((completed / planned.length) * 100).toFixed(2))
          : 0,
    };
  }

  async getFieldOperationsReport(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const visits = await this.listManagerVisits(actor, query);
    const followUps = await this.listManagerFollowUps(actor, query);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.configService.get<string>(
        'APP_TIMEZONE',
        'Africa/Dar_es_Salaam',
      ),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const counts: Record<string, number> = {};
    const types: Record<string, number> = {};
    const coverage = new Map<
      number,
      { name: string; visits: number; last_visit: string }
    >();
    let durationTotal = 0;
    let durationCount = 0;
    let attendanceFailures = 0;
    for (const visit of visits) {
      counts[visit.status] = (counts[visit.status] ?? 0) + 1;
      types[visit.visitType] = (types[visit.visitType] ?? 0) + 1;
      if (visit.durationMinutes !== null) {
        durationTotal += visit.durationMinutes;
        durationCount++;
      }
      attendanceFailures += visit.location_events.filter(
        (event) =>
          event.attendanceSyncStatus === 'FAILED' ||
          ['REJECTED', 'OVERRIDE_REJECTED'].includes(
            event.attendance_punch_validation_status ?? '',
          ),
      ).length;
      if (visit.fieldPartyId && visit.checkOutAt) {
        const current = coverage.get(visit.fieldPartyId);
        const partyName = visit.partySnapshot?.name;
        const name =
          typeof partyName === 'string'
            ? partyName
            : `Party ${visit.fieldPartyId}`;
        coverage.set(visit.fieldPartyId, {
          name,
          visits: (current?.visits ?? 0) + 1,
          last_visit:
            current && current.last_visit > visit.visitDate
              ? current.last_visit
              : visit.visitDate,
        });
      }
    }
    return {
      total_visits: visits.length,
      status_counts: counts,
      visit_type_counts: types,
      planned: visits.filter((visit) => !visit.isUnplanned).length,
      unplanned: visits.filter((visit) => visit.isUnplanned).length,
      average_duration_minutes: durationCount
        ? Math.round(durationTotal / durationCount)
        : null,
      attendance_failures: attendanceFailures,
      open_follow_ups: followUps.filter(
        (item) => item.status === FieldFollowUpStatusEnum.OPEN,
      ).length,
      overdue_follow_ups: followUps.filter(
        (item) =>
          item.status === FieldFollowUpStatusEnum.OPEN && item.dueDate < today,
      ).length,
      completed_follow_ups: followUps.filter(
        (item) => item.status === FieldFollowUpStatusEnum.COMPLETED,
      ).length,
      party_coverage: [...coverage.entries()]
        .map(([id, value]) => ({ id, ...value }))
        .sort((a, b) => a.last_visit.localeCompare(b.last_visit)),
    };
  }

  async getPartyVisitHistory(actor: AuthenticatedUser, partyId: number) {
    const companyId = this.getCompanyId(actor);
    const party = await this.partyRepository.findOne({
      where: { id: partyId, companyId },
    });
    if (!party) throw new NotFoundException('Field party not found.');
    const visits = await this.listManagerVisits(actor, {
      field_party_id: partyId,
    });
    return {
      party: { id: party.id, name: party.name, party_type: party.partyType },
      visits: visits.map((visit) => ({
        id: visit.id,
        employee_id: visit.employeeId,
        visit_name: visit.visitName,
        purpose: visit.purpose,
        visit_date: visit.visitDate,
        status: visit.status,
        outcome: visit.outcome,
        follow_ups: visit.follow_ups,
        opportunities: visit.opportunities,
      })),
    };
  }

  async listExceptions(actor: AuthenticatedUser) {
    const companyId = this.getCompanyId(actor);
    const ids = await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (ids !== null && !ids.length) return { returned_visits: 0 };
    const visits = await this.visitRepository.count({
      where: {
        companyId,
        status: FieldVisitStatusEnum.RETURNED,
        ...(ids !== null ? { employeeId: In(ids) } : {}),
      },
    });
    return {
      returned_visits: visits,
    };
  }

  private async listScopedVisits(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
    allowCompanyScope: boolean,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (
      !allowCompanyScope &&
      employeeIds !== null &&
      employeeIds.length === 0
    ) {
      return [];
    }

    const qb = this.visitRepository
      .createQueryBuilder('visit')
      .where('visit.companyId = :companyId', { companyId })
      .orderBy('visit.visitDate', 'DESC')
      .addOrderBy('visit.id', 'DESC');

    if (employeeIds !== null) {
      if (employeeIds.length === 0) return [];
      qb.andWhere('visit.employeeId IN (:...employeeIds)', { employeeIds });
    }
    if (query.employee_id) {
      qb.andWhere('visit.employeeId = :employeeId', {
        employeeId: query.employee_id,
      });
    }
    if (query.field_party_id)
      qb.andWhere('visit.fieldPartyId = :fieldPartyId', {
        fieldPartyId: query.field_party_id,
      });
    if (query.status)
      qb.andWhere('visit.status = :status', { status: query.status });
    if (query.date_from) {
      qb.andWhere('visit.visitDate >= :dateFrom', {
        dateFrom: query.date_from,
      });
    }
    if (query.date_to) {
      qb.andWhere('visit.visitDate <= :dateTo', { dateTo: query.date_to });
    }
    const visits = await qb.getMany();
    return Promise.all(visits.map((visit) => this.getVisitResponse(visit.id)));
  }

  private async completePlanIfFinished(
    manager: DataSource['manager'],
    visit: FieldVisit,
  ) {
    if (!visit.visitPlanId) return;
    const plan = await manager.getRepository(FieldVisitPlan).findOne({
      where: { id: visit.visitPlanId, companyId: visit.companyId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!plan) return;
    const repo = manager.getRepository(FieldVisit);
    const remaining = await repo.count({
      where: {
        companyId: visit.companyId,
        visitPlanId: visit.visitPlanId,
        status: In([
          FieldVisitStatusEnum.PLANNED,
          FieldVisitStatusEnum.CHECKED_IN,
        ]),
      },
    });
    if (!remaining) {
      await manager.getRepository(FieldVisitPlan).update(
        {
          id: visit.visitPlanId,
          companyId: visit.companyId,
          status: In([
            FieldVisitPlanStatusEnum.APPROVED,
            FieldVisitPlanStatusEnum.IN_PROGRESS,
          ]),
        },
        {
          status: FieldVisitPlanStatusEnum.COMPLETED,
          completedAt: new Date(),
        },
      );
    }
  }

  private async replacePlanItemsAndVisits(
    manager: DataSource['manager'],
    plan: FieldVisitPlan,
    items: CreateFieldVisitPlanDto['items'],
  ) {
    if (!items.length) {
      throw new BadRequestException('A plan must contain at least one visit.');
    }
    for (const item of items) {
      if (!item.purpose.trim()) {
        throw new BadRequestException('Each visit must have a purpose.');
      }
      if (
        item.planned_start_time &&
        item.planned_end_time &&
        new Date(item.planned_end_time).getTime() <=
          new Date(item.planned_start_time).getTime()
      ) {
        throw new BadRequestException(
          'The planned end time must be after the start time.',
        );
      }
    }

    const existingVisits = await manager.getRepository(FieldVisit).find({
      where: { companyId: plan.companyId, visitPlanId: plan.id },
    });
    const blocked = existingVisits.some(
      (visit) => visit.status !== FieldVisitStatusEnum.PLANNED,
    );
    if (blocked) {
      throw new ConflictException(
        'This plan already has active visit progress and cannot be replaced.',
      );
    }

    const existingItems = await manager.getRepository(FieldVisitPlanItem).find({
      where: { companyId: plan.companyId, visitPlanId: plan.id },
    });
    const itemsById = new Map(existingItems.map((item) => [item.id, item]));
    const visitsByItem = new Map(
      existingVisits.map((visit) => [visit.visitPlanItemId, visit]),
    );
    const retainedIds = new Set<number>();
    for (const item of items) {
      if (item.id === undefined) continue;
      if (!itemsById.has(item.id) || retainedIds.has(item.id)) {
        throw new BadRequestException('A visit item is invalid or duplicated.');
      }
      retainedIds.add(item.id);
    }

    for (const existing of existingItems) {
      if (retainedIds.has(existing.id)) continue;
      const visit = visitsByItem.get(existing.id);
      if (visit) {
        const related = [
          await manager.getRepository(FieldVisitEvidence).count({
            where: { companyId: plan.companyId, fieldVisitId: visit.id },
          }),
          await manager.getRepository(FieldOpportunity).count({
            where: { companyId: plan.companyId, fieldVisitId: visit.id },
          }),
          await manager.getRepository(FieldFollowUp).count({
            where: { companyId: plan.companyId, fieldVisitId: visit.id },
          }),
          await manager.getRepository(FieldVisitExpense).count({
            where: { companyId: plan.companyId, fieldVisitId: visit.id },
          }),
          await manager.getRepository(FieldVisitAttachment).count({
            where: { companyId: plan.companyId, fieldVisitId: visit.id },
          }),
        ];
        if (related.some((count) => count > 0)) {
          throw new ConflictException(
            'A visit with related records cannot be removed from the plan.',
          );
        }
        await manager.getRepository(FieldVisit).remove(visit);
      }
      await manager.getRepository(FieldVisitPlanItem).remove(existing);
    }

    for (const item of items) {
      const party = item.field_party_id
        ? await this.partyRepository.findOne({
            where: { id: item.field_party_id, companyId: plan.companyId },
          })
        : null;
      if (item.field_party_id && !party) {
        throw new BadRequestException(
          'The selected field party was not found.',
        );
      }

      const existingItem = item.id ? itemsById.get(item.id) : undefined;

      const savedItem = await manager.getRepository(FieldVisitPlanItem).save(
        manager.getRepository(FieldVisitPlanItem).create({
          ...(existingItem ? { id: existingItem.id } : {}),
          companyId: plan.companyId,
          visitPlanId: plan.id,
          fieldPartyId: item.field_party_id ?? null,
          visitType: item.visit_type,
          plannedStartTime: item.planned_start_time
            ? new Date(item.planned_start_time)
            : null,
          plannedEndTime: item.planned_end_time
            ? new Date(item.planned_end_time)
            : null,
          visitName: item.visit_name?.trim() || null,
          priority: item.priority ?? 'NORMAL',
          purpose: item.purpose.trim(),
          expectedOutcome: item.expected_outcome?.trim() ?? null,
          plannedLatitude:
            item.latitude !== undefined ? String(item.latitude) : null,
          plannedLongitude:
            item.longitude !== undefined ? String(item.longitude) : null,
          plannedAddress: item.planned_address?.trim() ?? null,
          displayOrder: Number(item.display_order ?? 0),
          clientRequestId: item.client_request_id ?? null,
        }),
      );

      const existingVisit = existingItem
        ? visitsByItem.get(existingItem.id)
        : undefined;
      if (existingVisit) {
        existingVisit.visitDate = plan.visitDate;
        existingVisit.fieldPartyId = item.field_party_id ?? null;
        existingVisit.visitType = item.visit_type;
        existingVisit.visitName = item.visit_name?.trim() || null;
        existingVisit.priority = item.priority ?? 'NORMAL';
        existingVisit.purpose = item.purpose.trim();
        existingVisit.partySnapshot = party
          ? this.buildPartySnapshot(party)
          : null;
        await manager.getRepository(FieldVisit).save(existingVisit);
        continue;
      }

      await manager.getRepository(FieldVisit).save(
        manager.getRepository(FieldVisit).create({
          companyId: plan.companyId,
          employeeId: plan.employeeId,
          visitPlanId: plan.id,
          visitPlanItemId: savedItem.id,
          businessTripId: plan.businessTripId ?? null,
          fieldPartyId: item.field_party_id ?? null,
          visitNo: this.generateVisitNo(plan.companyId),
          visitDate: plan.visitDate,
          visitType: item.visit_type,
          status: FieldVisitStatusEnum.PLANNED,
          isUnplanned: false,
          unplannedReason: null,
          visitName: item.visit_name?.trim() || null,
          priority: item.priority ?? 'NORMAL',
          purpose: item.purpose.trim(),
          discussionNotes: null,
          outcome: null,
          followUpRequired: false,
          nextFollowUpDate: null,
          checkInAt: null,
          checkOutAt: null,
          durationMinutes: null,
          managerEmployeeId: plan.managerEmployeeId ?? null,
          managerCompanyUserId: plan.managerCompanyUserId ?? null,
          managerReviewStatus: 'PENDING',
          managerComments: null,
          managerReviewedAt: null,
          linkedDailyActivityEntryId: null,
          employeeSnapshot: plan.employeeSnapshot,
          partySnapshot: party ? this.buildPartySnapshot(party) : null,
          policySnapshot: plan.policySnapshot,
          clientRequestId: null,
        }),
      );
    }
  }

  private buildEmployeeSnapshot(employee: Employee) {
    return {
      employee_id: employee.id,
      employee_no: employee.employee_no,
      full_name: [employee.first_name, employee.middle_name, employee.last_name]
        .filter(Boolean)
        .join(' '),
      branch_id: employee.primary_branch_id,
      department_id: employee.primary_department_id,
      position_id: employee.primary_position_id,
      grade_id: employee.grade_id,
      employment_type: employee.employment_type,
    };
  }

  private buildPolicySnapshot(policy: Record<string, unknown> | object) {
    const policyRecord = policy as Record<string, unknown>;
    return {
      field_visit_plan_required: Boolean(
        policyRecord.fieldVisitPlanRequired ?? false,
      ),
      allow_unplanned_visits: policyRecord.allowUnplannedVisits !== false,
      field_plan_approval_required:
        policyRecord.fieldPlanApprovalRequired ??
        this.configService.get<boolean>(
          'FIELD_VISIT_REQUIRE_MANAGER_APPROVAL',
          false,
        ),
      require_visit_selfie: Boolean(policyRecord.requireVisitSelfie ?? false),
      require_device_binding: policyRecord.requireDeviceBinding !== false,
      allow_gps_exception: policyRecord.fieldAllowGpsException === true,
      require_gps: this.configService.get<boolean>(
        'FIELD_VISIT_REQUIRE_GPS',
        true,
      ),
      maximum_accuracy_meters:
        policyRecord.fieldMaxGpsAccuracyMeters ??
        this.configService.get<number>(
          'FIELD_VISIT_MAX_GPS_ACCURACY_METERS',
          100,
        ),
    };
  }

  private buildPartySnapshot(party: FieldParty) {
    return {
      id: party.id,
      name: party.name,
      party_type: party.partyType,
      contact_person: party.contactPerson,
      phone: party.phone,
      email: party.email,
      address: party.address,
      latitude: party.latitude,
      longitude: party.longitude,
      source_system: party.sourceSystem,
      external_reference: party.externalReference,
    };
  }

  private async findBusinessTripId(
    companyId: number,
    employeeId: number,
    visitDate: string,
  ) {
    const trip = await this.businessTripRepository
      .createQueryBuilder('trip')
      .where('trip.company_id = :companyId', { companyId })
      .andWhere('trip.employee_id = :employeeId', { employeeId })
      .andWhere('trip.status = :status', { status: 'approved' })
      .andWhere('trip.start_date <= :visitDate', { visitDate })
      .andWhere('trip.end_date >= :visitDate', { visitDate })
      .getOne();

    return trip?.id ?? null;
  }

  private generateVisitNo(companyId: number) {
    return `FV-${companyId}-${randomUUID()}`;
  }

  private async resolveManagerCompanyUserId(
    managerEmployeeId: number | null,
    companyId: number,
  ) {
    if (!managerEmployeeId) {
      return null;
    }

    const manager = await this.employeeRepository.findOne({
      where: { id: managerEmployeeId, company_id: companyId },
      select: ['id', 'company_user_id'],
    });

    return manager?.company_user_id ?? null;
  }

  private assertVisitAccuracy(
    accuracy: number | null,
    policyLimit?: unknown,
    allowException = false,
    reason?: string,
  ) {
    if (accuracy === null) {
      if (allowException && reason?.trim()) return true;
      throw new BadRequestException(
        'GPS accuracy is unavailable. Retry or provide an allowed exception reason.',
      );
    }
    const maxAccuracy =
      typeof policyLimit === 'number' &&
      Number.isFinite(policyLimit) &&
      policyLimit > 0
        ? policyLimit
        : this.configService.get<number>(
            'FIELD_VISIT_MAX_GPS_ACCURACY_METERS',
            100,
          );
    if (accuracy > maxAccuracy) {
      if (allowException && reason?.trim()) return true;
      throw new BadRequestException(
        `GPS accuracy must be within ${maxAccuracy} meters.`,
      );
    }
    return false;
  }

  private assertOfflineEventAllowed(capturedAt: Date, receivedAt: Date) {
    if (capturedAt > receivedAt) {
      throw new BadRequestException('Captured time cannot be in the future.');
    }
    const maximumDays = this.configService.get<number>(
      'FIELD_VISIT_OFFLINE_SYNC_MAX_DAYS',
      3,
    );
    const ageDays = Math.floor(
      (receivedAt.getTime() - capturedAt.getTime()) / 86400000,
    );
    if (ageDays > maximumDays) {
      throw new BadRequestException(
        `Offline visit events cannot be older than ${maximumDays} days.`,
      );
    }
  }

  private isOfflineCapture(capturedAt: Date) {
    return Math.abs(Date.now() - capturedAt.getTime()) > 5 * 60 * 1000;
  }

  private hashPayload(payload: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(payload))
      .toString('base64url')
      .slice(0, 120);
  }

  private async createOpportunityFromDto(
    manager: DataSource['manager'],
    visit: FieldVisit,
    dto: CreateFieldOpportunityDto,
  ) {
    return manager.getRepository(FieldOpportunity).save(
      manager.getRepository(FieldOpportunity).create({
        companyId: visit.companyId,
        fieldVisitId: visit.id,
        employeeId: visit.employeeId,
        fieldPartyId: visit.fieldPartyId,
        opportunityType: dto.opportunity_type,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? null,
        potentialValue:
          dto.potential_value !== undefined
            ? String(dto.potential_value)
            : null,
        currency: dto.currency?.trim().toUpperCase() ?? null,
        premiumValue:
          dto.premium_value !== undefined ? String(dto.premium_value) : null,
        premiumCurrency: dto.premium_currency?.trim().toUpperCase() ?? null,
        expectedCloseDate: dto.expected_close_date ?? null,
        actualValue: null,
        status: FieldOpportunityStatusEnum.IDENTIFIED,
        sourceSystem: dto.source_system?.trim() ?? null,
        externalReference: dto.external_reference?.trim() ?? null,
        clientRequestId: dto.client_request_id ?? null,
        validatedByManager: false,
        validatedAt: null,
      }),
    );
  }

  private async getCommercialPolicy(companyId: number) {
    let policy = await this.commercialPolicyRepository.findOne({
      where: { companyId },
    });
    if (!policy) {
      policy = await this.commercialPolicyRepository.save(
        this.commercialPolicyRepository.create({
          companyId,
          defaultCurrency: 'TZS',
          supportedCurrencies: ['TZS'],
          allowEmployeeOpportunityValues: true,
          updatedByCompanyUserId: null,
        }),
      );
    }
    return policy;
  }

  private assertSupportedCurrency(
    currency: string | undefined,
    policy: FieldVisitCommercialPolicy,
    label: string,
  ) {
    if (!currency) return;
    if (
      !policy.supportedCurrencies
        .map((code) => code.toUpperCase())
        .includes(currency.trim().toUpperCase())
    ) {
      throw new BadRequestException(
        `${label} currency must be one of the currencies configured for this company: ${policy.supportedCurrencies.join(', ')}.`,
      );
    }
  }

  private async createExpenseFromDto(
    manager: DataSource['manager'],
    visit: FieldVisit,
    dto: CreateFieldVisitExpenseDto,
  ) {
    return manager.getRepository(FieldVisitExpense).save(
      manager.getRepository(FieldVisitExpense).create({
        companyId: visit.companyId,
        fieldVisitId: visit.id,
        employeeId: visit.employeeId,
        expenseType: dto.expense_type,
        amount: String(dto.amount),
        currency: dto.currency.trim(),
        description: dto.description.trim(),
        receiptDocumentId: dto.receipt_document_id ?? null,
        status: FieldVisitExpenseStatusEnum.SUBMITTED,
        approvedByCompanyUserId: null,
        approvedAt: null,
        financeReference: null,
      }),
    );
  }

  private async createManagerReviewAction(visit: FieldVisit) {
    if (!visit.managerCompanyUserId) {
      return;
    }
    await this.actionItemsService.upsertOpen({
      companyId: visit.companyId,
      assigneeCompanyUserId: visit.managerCompanyUserId,
      assigneeEmployeeId: visit.managerEmployeeId ?? null,
      actionType: ActionItemTypeEnum.APPROVAL,
      sourceModule: 'WORK_ACTIVITIES',
      sourceEntityType: 'FIELD_VISIT',
      sourceEntityId: visit.id,
      sourceKey: `field-visit-review:${visit.id}`,
      title: 'Review field visit',
      description: `Field visit ${visit.visitNo} is awaiting manager review.`,
      actionUrl: '/dashboard/field/visits',
    });
  }

  private async assertManagerCanAccess(
    actor: AuthenticatedUser,
    employeeId: number,
    managerEmployeeId: number | null,
  ) {
    if (
      actor.employeeId &&
      managerEmployeeId &&
      actor.employeeId === managerEmployeeId
    ) {
      return;
    }
    const employeeIds =
      await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (employeeIds === null || employeeIds.includes(employeeId)) {
      return;
    }
    throw new ForbiddenException('You are not allowed to review this visit.');
  }

  private async findMyVisitEntity(actor: AuthenticatedUser, visitId: number) {
    const visit = await this.visitRepository.findOne({
      where: {
        id: visitId,
        companyId: this.getCompanyId(actor),
        employeeId: this.getEmployeeId(actor),
      },
    });
    if (!visit) {
      throw new NotFoundException('Field visit not found.');
    }
    return visit;
  }

  private async getPlanResponse(
    plan: FieldVisitPlan,
    manager = this.dataSource.manager,
  ) {
    const items = await manager.getRepository(FieldVisitPlanItem).find({
      where: { companyId: plan.companyId, visitPlanId: plan.id },
      order: { displayOrder: 'ASC', id: 'ASC' },
    });
    return {
      ...plan,
      items,
    };
  }

  async getVisitResponse(visitId: number, manager = this.dataSource.manager) {
    const visit = await manager.getRepository(FieldVisit).findOne({
      where: { id: visitId },
    });
    if (!visit) {
      throw new NotFoundException('Field visit not found.');
    }
    // Transactional managers share one PostgreSQL client. Queue their reads;
    // the ordinary manager can still use separate pooled connections in parallel.
    let previousRead: Promise<unknown> = Promise.resolve();
    const read = <T>(query: () => Promise<T>): Promise<T> => {
      if (!manager.queryRunner) return query();
      const current = previousRead.then(query);
      previousRead = current;
      return current;
    };
    const [
      locationEvents,
      evidence,
      opportunities,
      followUps,
      expenses,
      planItem,
      corrections,
      attachments,
    ] = await Promise.all([
      read(() =>
        manager.getRepository(FieldVisitLocationEvent).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { capturedAt: 'ASC', id: 'ASC' },
        }),
      ),
      read(() =>
        manager.getRepository(FieldVisitEvidence).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
      ),
      read(() =>
        manager.getRepository(FieldOpportunity).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
      ),
      read(() =>
        manager.getRepository(FieldFollowUp).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { dueDate: 'ASC', id: 'ASC' },
        }),
      ),
      read(() =>
        manager.getRepository(FieldVisitExpense).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
      ),
      read(() =>
        visit.visitPlanItemId
          ? manager.getRepository(FieldVisitPlanItem).findOne({
              where: { id: visit.visitPlanItemId, companyId: visit.companyId },
            })
          : Promise.resolve(null),
      ),
      read(() =>
        manager.getRepository(FieldVisitCheckoutCorrection).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'DESC' },
        }),
      ),
      read(() =>
        manager.getRepository(FieldVisitAttachment).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'DESC' },
        }),
      ),
    ]);

    const punchIds = locationEvents
      .map((event) => event.attendanceMobilePunchId)
      .filter((id): id is number => id !== null);
    const punches = punchIds.length
      ? await manager.getRepository(AttendanceMobilePunch).find({
          where: {
            companyId: visit.companyId,
            employeeId: visit.employeeId,
            id: In(punchIds),
          },
          select: { id: true, validationStatus: true },
        })
      : [];
    const punchStatuses = new Map(
      punches.map((punch) => [punch.id, punch.validationStatus]),
    );
    return {
      ...visit,
      location_events: locationEvents.map((event) => ({
        ...event,
        attendance_punch_validation_status: event.attendanceMobilePunchId
          ? (punchStatuses.get(event.attendanceMobilePunchId) ?? null)
          : null,
      })),
      evidence,
      opportunities,
      follow_ups: followUps,
      expenses,
      plan_item: planItem,
      checkout_corrections: corrections,
      attachments,
    };
  }
}
