import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActionItemTypeEnum } from '../../action-inbox/enums/action-item-type.enum';
import { ActionItemsService } from '../../action-inbox/action-items.service';
import { AttendanceBusinessTrip } from '../../attendance/processing/entities/attendance-business-trip.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import {
  AddFieldVisitEvidenceDto,
  CompleteFieldFollowUpDto,
  CreateFieldOpportunityDto,
  CreateFieldVisitExpenseDto,
  CreateFieldVisitPlanDto,
  CreateUnplannedFieldVisitDto,
  FieldVisitCheckInDto,
  FieldVisitCheckOutDto,
  ReviewFieldVisitDto,
  SubmitFieldVisitPlanDto,
  UpdateFieldVisitPlanDto,
} from '../dto/field-visit.dto';
import { FieldLocationMapQueryDto, WorkActivityQueryDto } from '../dto/queries.dto';
import { FieldParty } from '../entities/activity-config.entities';
import { FieldLocationAccessLog } from '../entities/analytics.entities';
import {
  FieldFollowUp,
  FieldMobileSyncRequest,
  FieldOpportunity,
  FieldVisit,
  FieldVisitEvidence,
  FieldVisitExpense,
  FieldVisitLocationEvent,
  FieldVisitPlan,
  FieldVisitPlanItem,
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
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const employee = await this.getEmployee(companyId, employeeId);
    const policy = await this.policyService.resolveForEmployee(
      companyId,
      employee,
      dto.visit_date,
    );
    const managerCompanyUserId = await this.resolveManagerCompanyUserId(
      employee.reports_to,
    );

    if (!this.configService.get<boolean>('FIELD_VISIT_ENABLED', true)) {
      throw new ForbiddenException('Field visits are currently disabled.');
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.client_request_id) {
        const existingByRequest = await manager.getRepository(FieldVisitPlan).findOne({
          where: { companyId, employeeId, clientRequestId: dto.client_request_id },
        });
        if (existingByRequest) {
          return this.getPlanResponse(existingByRequest, manager);
        }
      }

      const existing = await manager.getRepository(FieldVisitPlan).findOne({
        where: { companyId, employeeId, visitDate: dto.visit_date },
      });

      if (existing) {
        throw new ConflictException('A visit plan already exists for this date.');
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
          status: FieldVisitPlanStatusEnum.DRAFT,
          managerEmployeeId: employee.reports_to ?? null,
          managerCompanyUserId,
          businessTripId,
          employeeSnapshot: this.buildEmployeeSnapshot(employee),
          policySnapshot: this.buildPolicySnapshot(policy as Record<string, unknown>),
          planSummary: dto.plan_summary?.trim() ?? null,
          managerComments: null,
          submittedAt: null,
          approvedAt: null,
          approvedByCompanyUserId: null,
          completedAt: null,
          clientRequestId: dto.client_request_id ?? null,
        }),
      );

      await this.replacePlanItemsAndVisits(manager, plan, dto.items);
      await this.auditService.log({
        action: 'FIELD_VISIT_PLAN_CREATED',
        actor,
        companyId,
        employeeId,
        entityType: 'FIELD_VISIT_PLAN',
        entityId: plan.id,
        afterValues: { visit_date: plan.visitDate, item_count: dto.items.length },
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

  async updateMyPlan(actor: AuthenticatedUser, id: number, dto: UpdateFieldVisitPlanDto) {
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
        ![FieldVisitPlanStatusEnum.DRAFT, FieldVisitPlanStatusEnum.RETURNED].includes(
          plan.status,
        )
      ) {
        throw new ConflictException('This visit plan can no longer be edited.');
      }

      if (dto.visit_date !== undefined) {
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

  async submitMyPlan(actor: AuthenticatedUser, id: number, dto: SubmitFieldVisitPlanDto) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const plan = await this.planRepository.findOne({
      where: { id, companyId, employeeId },
    });

    if (!plan) {
      throw new NotFoundException('Visit plan not found.');
    }
    if (![FieldVisitPlanStatusEnum.DRAFT, FieldVisitPlanStatusEnum.RETURNED].includes(plan.status)) {
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
        actionUrl: `/manager/field-visits/plans/${saved.id}`,
      });
    }

    return this.getPlanResponse(saved);
  }

  async listMyVisits(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const qb = this.visitRepository
      .createQueryBuilder('visit')
      .where('visit.companyId = :companyId', { companyId: this.getCompanyId(actor) })
      .andWhere('visit.employeeId = :employeeId', { employeeId: this.getEmployeeId(actor) })
      .orderBy('visit.visitDate', 'DESC')
      .addOrderBy('visit.id', 'DESC');

    if (query.date_from) {
      qb.andWhere('visit.visitDate >= :dateFrom', { dateFrom: query.date_from });
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

  async createUnplannedVisit(actor: AuthenticatedUser, dto: CreateUnplannedFieldVisitDto) {
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
        visitNo: await this.generateVisitNo(companyId),
        visitDate: dto.visit_date,
        visitType: dto.visit_type,
        status: FieldVisitStatusEnum.PLANNED,
        isUnplanned: true,
        unplannedReason: dto.unplanned_reason.trim(),
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
        policySnapshot: this.buildPolicySnapshot(policy as Record<string, unknown>),
        clientRequestId: dto.client_request_id ?? null,
      }),
    );

    return this.getVisitResponse(visit.id);
  }

  async checkIn(actor: AuthenticatedUser, visitId: number, dto: FieldVisitCheckInDto) {
    return this.dataSource.transaction(async (manager) => {
      const companyId = this.getCompanyId(actor);
      const employeeId = this.getEmployeeId(actor);

      const duplicate = await manager.getRepository(FieldVisitLocationEvent).findOne({
        where: { companyId, employeeId, clientRequestId: dto.client_request_id },
      });
      if (duplicate) {
        return this.getVisitResponse(duplicate.fieldVisitId, manager);
      }

      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id: visitId, companyId, employeeId },
      });

      if (!visit) {
        throw new NotFoundException('Field visit not found.');
      }
      if (visit.status !== FieldVisitStatusEnum.PLANNED) {
        throw new ConflictException('The visit is not available for check-in.');
      }

      const capturedAt = new Date(dto.captured_at);
      this.assertOfflineEventAllowed(capturedAt, new Date());
      this.assertVisitAccuracy(dto.accuracy_meters ?? null);

      const locationEvent = await manager.getRepository(FieldVisitLocationEvent).save(
        manager.getRepository(FieldVisitLocationEvent).create({
          companyId,
          fieldVisitId: visit.id,
          employeeId,
          eventType: 'CHECK_IN',
          latitude: String(dto.latitude),
          longitude: String(dto.longitude),
          accuracyMeters:
            dto.accuracy_meters !== undefined ? String(dto.accuracy_meters) : null,
          capturedAt,
          receivedAt: new Date(),
          timezoneOffsetMinutes: null,
          deviceIdentifier: dto.device_identifier ?? null,
          deviceInfo: dto.device_info ?? null,
          address: null,
          addressStatus: 'PENDING',
          distanceFromPlannedLocationMeters: null,
          locationValidationStatus: 'CAPTURED',
          locationValidationResult: {
            status: 'CAPTURED',
            maximum_accuracy_meters: this.configService.get<number>(
              'FIELD_VISIT_MAX_GPS_ACCURACY_METERS',
              100,
            ),
          },
          isOfflineCapture: this.isOfflineCapture(capturedAt),
          clientRequestId: dto.client_request_id,
          selfieDocumentId: dto.selfie_document_id ?? null,
          attendanceMobilePunchId: dto.attendance_mobile_punch_id ?? null,
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
  }

  async checkOut(actor: AuthenticatedUser, visitId: number, dto: FieldVisitCheckOutDto) {
    return this.dataSource.transaction(async (manager) => {
      const companyId = this.getCompanyId(actor);
      const employeeId = this.getEmployeeId(actor);
      const duplicate = await manager.getRepository(FieldVisitLocationEvent).findOne({
        where: { companyId, employeeId, clientRequestId: dto.client_request_id },
      });
      if (duplicate) {
        return this.getVisitResponse(duplicate.fieldVisitId, manager);
      }

      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id: visitId, companyId, employeeId },
      });
      if (!visit) {
        throw new NotFoundException('Field visit not found.');
      }
      if (visit.status !== FieldVisitStatusEnum.CHECKED_IN || !visit.checkInAt) {
        throw new ConflictException('The visit has not been checked in.');
      }

      const capturedAt = new Date(dto.captured_at);
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

      const locationEvent = await manager.getRepository(FieldVisitLocationEvent).save(
        manager.getRepository(FieldVisitLocationEvent).create({
          companyId,
          fieldVisitId: visit.id,
          employeeId,
          eventType: 'CHECK_OUT',
          latitude: String(dto.latitude),
          longitude: String(dto.longitude),
          accuracyMeters:
            dto.accuracy_meters !== undefined ? String(dto.accuracy_meters) : null,
          capturedAt,
          receivedAt: new Date(),
          timezoneOffsetMinutes: null,
          deviceIdentifier: dto.device_identifier ?? null,
          deviceInfo: dto.device_info ?? null,
          address: null,
          addressStatus: 'PENDING',
          distanceFromPlannedLocationMeters: null,
          locationValidationStatus: 'CAPTURED',
          locationValidationResult: { status: 'CAPTURED' },
          isOfflineCapture: this.isOfflineCapture(capturedAt),
          clientRequestId: dto.client_request_id,
          selfieDocumentId: dto.selfie_document_id ?? null,
          attendanceMobilePunchId: dto.attendance_mobile_punch_id ?? null,
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
      visit.status = this.configService.get<boolean>(
        'FIELD_VISIT_REQUIRE_MANAGER_APPROVAL',
        false,
      )
        ? FieldVisitStatusEnum.MANAGER_REVIEW_PENDING
        : FieldVisitStatusEnum.REVIEWED;
      visit.managerReviewStatus =
        visit.status === FieldVisitStatusEnum.REVIEWED ? 'APPROVED' : 'PENDING';

      const savedVisit = await manager.getRepository(FieldVisit).save(visit);

      for (const opportunity of dto.opportunities ?? []) {
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
  }

  async addEvidence(actor: AuthenticatedUser, visitId: number, dto: AddFieldVisitEvidenceDto) {
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

  async addOpportunity(actor: AuthenticatedUser, visitId: number, dto: CreateFieldOpportunityDto) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    await this.createOpportunityFromDto(this.dataSource.manager, visit, dto);
    return this.getVisitResponse(visit.id);
  }

  async addExpense(actor: AuthenticatedUser, visitId: number, dto: CreateFieldVisitExpenseDto) {
    const visit = await this.findMyVisitEntity(actor, visitId);
    await this.createExpenseFromDto(this.dataSource.manager, visit, dto);
    return this.getVisitResponse(visit.id);
  }

  async listMyFollowUps(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const qb = this.followUpRepository
      .createQueryBuilder('followUp')
      .where('followUp.companyId = :companyId', { companyId: this.getCompanyId(actor) })
      .andWhere('followUp.assignedToEmployeeId = :employeeId', {
        employeeId: this.getEmployeeId(actor),
      })
      .orderBy('followUp.dueDate', 'ASC')
      .addOrderBy('followUp.id', 'DESC');
    if (query.status) {
      qb.andWhere('followUp.status = :status', { status: query.status });
    }
    return qb.getMany();
  }

  async listManagerFollowUps(
    actor: AuthenticatedUser,
    query: WorkActivityQueryDto,
  ) {
    const companyId = this.getCompanyId(actor);
    const employeeIds = await this.hrAccessService.getAccessibleEmployeeIds(actor);

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
      qb.andWhere('followUp.dueDate >= :dateFrom', { dateFrom: query.date_from });
    }
    if (query.date_to) {
      qb.andWhere('followUp.dueDate <= :dateTo', { dateTo: query.date_to });
    }

    return qb.getMany();
  }

  async completeMyFollowUp(
    actor: AuthenticatedUser,
    id: number,
    dto: CompleteFieldFollowUpDto,
  ) {
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

    followUp.status = FieldFollowUpStatusEnum.COMPLETED;
    followUp.completedAt = new Date();
    followUp.completionNote = dto.completion_note?.trim() ?? null;
    return this.followUpRepository.save(followUp);
  }

  async listManagerPlans(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const qb = this.planRepository
      .createQueryBuilder('plan')
      .where('plan.companyId = :companyId', { companyId: this.getCompanyId(actor) })
      .orderBy('plan.visitDate', 'DESC');
    const employeeIds = await this.hrAccessService.getAccessibleEmployeeIds(actor);
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

  async reviewPlan(actor: AuthenticatedUser, id: number, dto: ReviewFieldVisitDto) {
    const plan = await this.planRepository.findOne({
      where: { id, companyId: this.getCompanyId(actor) },
    });
    if (!plan) {
      throw new NotFoundException('Visit plan not found.');
    }
    await this.assertManagerCanAccess(actor, plan.employeeId, plan.managerEmployeeId);

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
    const saved = await this.planRepository.save(plan);
    await this.actionItemsService.completeAllOpenForEntity(
      saved.companyId,
      'WORK_ACTIVITIES',
      'FIELD_VISIT_PLAN',
      saved.id,
    );
    return this.getPlanResponse(saved);
  }

  async listManagerVisits(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    return this.listScopedVisits(actor, query, false);
  }

  async getForManager(actor: AuthenticatedUser, id: number) {
    const visit = await this.visitRepository.findOne({
      where: { id, companyId: this.getCompanyId(actor) },
    });
    if (!visit) {
      throw new NotFoundException('Field visit not found.');
    }
    await this.assertManagerCanAccess(actor, visit.employeeId, visit.managerEmployeeId);
    return this.getVisitResponse(visit.id);
  }

  async reviewVisit(actor: AuthenticatedUser, id: number, dto: ReviewFieldVisitDto) {
    return this.dataSource.transaction(async (manager) => {
      const visit = await manager.getRepository(FieldVisit).findOne({
        where: { id, companyId: this.getCompanyId(actor) },
      });
      if (!visit) {
        throw new NotFoundException('Field visit not found.');
      }
      await this.assertManagerCanAccess(actor, visit.employeeId, visit.managerEmployeeId);

      const opportunities = await manager.getRepository(FieldOpportunity).find({
        where: { companyId: visit.companyId, fieldVisitId: visit.id },
      });
      const expenses = await manager.getRepository(FieldVisitExpense).find({
        where: { companyId: visit.companyId, fieldVisitId: visit.id },
      });

      if (dto.validate_opportunities) {
        for (const opportunity of opportunities) {
          const validation = dto.opportunity_validations?.find(
            (item) => item.opportunity_id === opportunity.id,
          );
          opportunity.validatedByManager = validation?.validated ?? true;
          opportunity.validatedAt = opportunity.validatedByManager
            ? new Date()
            : null;
          await manager.getRepository(FieldOpportunity).save(opportunity);
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

      await this.actionItemsService.completeAllOpenForEntity(
        saved.companyId,
        'WORK_ACTIVITIES',
        'FIELD_VISIT',
        saved.id,
      );

      const employee = await this.getEmployee(saved.companyId, saved.employeeId);
      await this.exceptionService.reconcileForEmployeeDate(
        employee,
        saved.visitDate,
        { dailySubmissionRequired: true, fieldVisitPlanRequired: true },
      );

      return this.getVisitResponse(saved.id, manager);
    });
  }

  async getMapPoints(actor: AuthenticatedUser, query: FieldLocationMapQueryDto) {
    const companyId = this.getCompanyId(actor);
    const accessibleEmployeeIds = await this.hrAccessService.getAccessibleEmployeeIds(actor);
    const qb = this.locationEventRepository
      .createQueryBuilder('event')
      .innerJoin(FieldVisit, 'visit', 'visit.id = event.fieldVisitId')
      .where('event.companyId = :companyId', { companyId })
      .andWhere('visit.status = :status', { status: FieldVisitStatusEnum.REVIEWED })
      .andWhere('visit.managerReviewStatus = :reviewStatus', { reviewStatus: 'APPROVED' })
      .orderBy('event.capturedAt', 'DESC');

    if (query.date_from) {
      qb.andWhere('event.capturedAt >= :dateFrom', { dateFrom: `${query.date_from}T00:00:00.000Z` });
    }
    if (query.date_to) {
      qb.andWhere('event.capturedAt <= :dateTo', { dateTo: `${query.date_to}T23:59:59.999Z` });
    }
    if (query.employee_id) {
      qb.andWhere('event.employeeId = :employeeId', { employeeId: query.employee_id });
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
        requestId: null,
        ipAddress: null,
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

  async getPlannedVsActual(actor: AuthenticatedUser, query: WorkActivityQueryDto) {
    const visits = await this.listManagerVisits(actor, query);
    const planned = visits.length;
    const completed = visits.filter((visit) => visit.status === FieldVisitStatusEnum.REVIEWED).length;
    const unplanned = visits.filter((visit) => visit.isUnplanned).length;
    return {
      planned,
      completed,
      unplanned,
      completion_rate: planned > 0 ? Number(((completed / planned) * 100).toFixed(2)) : 0,
    };
  }

  async listExceptions(actor: AuthenticatedUser) {
    const visits = await this.visitRepository.count({
      where: {
        companyId: this.getCompanyId(actor),
        status: FieldVisitStatusEnum.RETURNED,
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
    const employeeIds = await this.hrAccessService.getAccessibleEmployeeIds(actor);
    if (!allowCompanyScope && employeeIds !== null && employeeIds.length === 0) {
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
    if (query.status) qb.andWhere('visit.status = :status', { status: query.status });
    if (query.date_from) {
      qb.andWhere('visit.visitDate >= :dateFrom', { dateFrom: query.date_from });
    }
    if (query.date_to) {
      qb.andWhere('visit.visitDate <= :dateTo', { dateTo: query.date_to });
    }
    const visits = await qb.getMany();
    return Promise.all(visits.map((visit) => this.getVisitResponse(visit.id)));
  }

  private async replacePlanItemsAndVisits(
    manager: DataSource['manager'],
    plan: FieldVisitPlan,
    items: CreateFieldVisitPlanDto['items'],
  ) {
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

    if (existingVisits.length > 0) {
      await manager.getRepository(FieldVisit).remove(existingVisits);
    }
    const existingItems = await manager.getRepository(FieldVisitPlanItem).find({
      where: { companyId: plan.companyId, visitPlanId: plan.id },
    });
    if (existingItems.length > 0) {
      await manager.getRepository(FieldVisitPlanItem).remove(existingItems);
    }

    for (const item of items) {
      const party = item.field_party_id
        ? await this.partyRepository.findOne({
            where: { id: item.field_party_id, companyId: plan.companyId },
          })
        : null;

      const savedItem = await manager.getRepository(FieldVisitPlanItem).save(
        manager.getRepository(FieldVisitPlanItem).create({
          companyId: plan.companyId,
          visitPlanId: plan.id,
          fieldPartyId: item.field_party_id ?? null,
          visitType: item.visit_type,
          plannedStartTime: item.planned_start_time
            ? new Date(item.planned_start_time)
            : null,
          plannedEndTime: item.planned_end_time ? new Date(item.planned_end_time) : null,
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

      await manager.getRepository(FieldVisit).save(
        manager.getRepository(FieldVisit).create({
          companyId: plan.companyId,
          employeeId: plan.employeeId,
          visitPlanId: plan.id,
          visitPlanItemId: savedItem.id,
          businessTripId: plan.businessTripId ?? null,
          fieldPartyId: item.field_party_id ?? null,
          visitNo: await this.generateVisitNo(plan.companyId),
          visitDate: plan.visitDate,
          visitType: item.visit_type,
          status: FieldVisitStatusEnum.PLANNED,
          isUnplanned: false,
          unplannedReason: null,
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
      field_visit_plan_required: Boolean(policyRecord.fieldVisitPlanRequired ?? false),
      allow_unplanned_visits: policyRecord.allowUnplannedVisits !== false,
      require_visit_selfie: Boolean(policyRecord.requireVisitSelfie ?? false),
      require_device_binding: policyRecord.requireDeviceBinding !== false,
      require_gps: this.configService.get<boolean>('FIELD_VISIT_REQUIRE_GPS', true),
      maximum_accuracy_meters: this.configService.get<number>(
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

  private async generateVisitNo(companyId: number) {
    const count = await this.visitRepository.count({ where: { companyId } });
    return `FV-${companyId}-${String(count + 1).padStart(6, '0')}`;
  }

  private async resolveManagerCompanyUserId(managerEmployeeId: number | null) {
    if (!managerEmployeeId) {
      return null;
    }

    const manager = await this.employeeRepository.findOne({
      where: { id: managerEmployeeId },
      select: ['id', 'company_user_id'],
    });

    return manager?.company_user_id ?? null;
  }

  private assertVisitAccuracy(accuracy: number | null) {
    if (accuracy === null) {
      return;
    }
    const maxAccuracy = this.configService.get<number>(
      'FIELD_VISIT_MAX_GPS_ACCURACY_METERS',
      100,
    );
    if (accuracy > maxAccuracy) {
      throw new BadRequestException(
        `GPS accuracy must be within ${maxAccuracy} meters.`,
      );
    }
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
    return Buffer.from(JSON.stringify(payload)).toString('base64url').slice(0, 120);
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
          dto.potential_value !== undefined ? String(dto.potential_value) : null,
        currency: dto.currency?.trim() ?? null,
        expectedCloseDate: dto.expected_close_date ?? null,
        actualValue:
          dto.actual_value !== undefined ? String(dto.actual_value) : null,
        status: dto.status ?? FieldOpportunityStatusEnum.IDENTIFIED,
        sourceSystem: dto.source_system?.trim() ?? null,
        externalReference: dto.external_reference?.trim() ?? null,
        validatedByManager: false,
        validatedAt: null,
      }),
    );
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
      actionUrl: `/manager/field-visits/${visit.id}`,
    });
  }

  private async assertManagerCanAccess(
    actor: AuthenticatedUser,
    employeeId: number,
    managerEmployeeId: number | null,
  ) {
    if (actor.employeeId && managerEmployeeId && actor.employeeId === managerEmployeeId) {
      return;
    }
    const employeeIds = await this.hrAccessService.getAccessibleEmployeeIds(actor);
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

  private async getPlanResponse(plan: FieldVisitPlan, manager = this.dataSource.manager) {
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
    const [locationEvents, evidence, opportunities, followUps, expenses] =
      await Promise.all([
        manager.getRepository(FieldVisitLocationEvent).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { capturedAt: 'ASC', id: 'ASC' },
        }),
        manager.getRepository(FieldVisitEvidence).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
        manager.getRepository(FieldOpportunity).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
        manager.getRepository(FieldFollowUp).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { dueDate: 'ASC', id: 'ASC' },
        }),
        manager.getRepository(FieldVisitExpense).find({
          where: { companyId: visit.companyId, fieldVisitId: visit.id },
          order: { createdAt: 'ASC', id: 'ASC' },
        }),
      ]);

    return {
      ...visit,
      location_events: locationEvents,
      evidence,
      opportunities,
      follow_ups: followUps,
      expenses,
    };
  }
}
