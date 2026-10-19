import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import {
  CreateDailyActivityEntryDto,
  SubmitDailyActivityReportDto,
} from '../dto/activity.dto';
import {
  AddFieldVisitEvidenceDto,
  CompleteFieldFollowUpDto,
  CreateFieldOpportunityDto,
  CreateFieldVisitPlanDto,
  CreateUnplannedFieldVisitDto,
  FieldVisitCheckInDto,
  FieldVisitCheckOutDto,
  UpdateFieldVisitPlanDto,
} from '../dto/field-visit.dto';
import { HrAccessService } from '../../shared/hr-access.service';
import { FieldMobileSyncDto, FieldMobileSyncItemDto } from '../dto/sync.dto';
import { DailyActivityService } from './daily-activity.service';
import { FieldVisitService } from './field-visit.service';
import { FieldMobileSyncRequest } from '../entities/field-visit.entities';
import {
  FieldMobileSyncOperationEnum,
  FieldMobileSyncStatusEnum,
} from '../enums/work-activity.enums';
import { DailyActivitySourceEnum } from '../enums/work-activity.enums';

@Injectable()
export class FieldMobileSyncService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    private readonly dailyActivityService: DailyActivityService,
    private readonly fieldVisitService: FieldVisitService,
    @InjectRepository(FieldMobileSyncRequest)
    private readonly repository: Repository<FieldMobileSyncRequest>,
  ) {}

  private getCompanyId(actor: AuthenticatedUser) {
    return this.hrAccessService.ensureActorCompanyId(actor);
  }

  private getEmployeeId(actor: AuthenticatedUser) {
    if (!actor.employeeId) {
      throw new Error('Employee profile is required.');
    }
    return actor.employeeId;
  }

  private asPayload<T extends object>(payload: Record<string, unknown>): T {
    return payload as T;
  }

  private withClientRequestId<
    T extends object & { client_request_id?: string },
  >(payload: Record<string, unknown>, clientRequestId: string): T {
    return {
      ...payload,
      client_request_id: clientRequestId,
    } as T;
  }

  async sync(actor: AuthenticatedUser, dto: FieldMobileSyncDto) {
    const companyId = this.getCompanyId(actor);
    const employeeId = this.getEmployeeId(actor);
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          device_identifier: dto.device_identifier,
          items: dto.items,
        }),
      )
      .digest('hex');

    const existing = await this.repository.findOne({
      where: { companyId, employeeId, syncRequestId: dto.sync_request_id },
    });

    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw new ConflictException(
          'This sync request ID was already used for a different payload.',
        );
      }
      if (existing.result) return existing.result;
      throw new ConflictException(
        'This sync request is already being processed. Check its status before retrying.',
      );
    }

    const syncRequest =
      existing ??
      (await this.repository.save(
        this.repository.create({
          companyId,
          employeeId,
          syncRequestId: dto.sync_request_id,
          deviceIdentifier: dto.device_identifier,
          payloadHash,
          status: FieldMobileSyncStatusEnum.PROCESSING,
          itemCount: dto.items.length,
          processedCount: 0,
          failedCount: 0,
          result: null,
        }),
      ));

    const items: Record<string, unknown>[] = [];
    let processedCount = 0;
    let failedCount = 0;

    for (const item of dto.items) {
      try {
        const result = await this.processItem(actor, item);
        processedCount += 1;
        items.push({
          client_request_id: item.client_request_id,
          status: 'COMPLETED',
          ...result,
        });
      } catch (error) {
        failedCount += 1;
        items.push({
          client_request_id: item.client_request_id,
          status: 'FAILED',
          error_code: (error as Error).name ?? 'SYNC_ERROR',
          message: (error as Error).message,
        });
      }
    }

    const result = {
      sync_request_id: dto.sync_request_id,
      status:
        failedCount === 0
          ? FieldMobileSyncStatusEnum.COMPLETED
          : processedCount === 0
            ? FieldMobileSyncStatusEnum.FAILED
            : FieldMobileSyncStatusEnum.PARTIALLY_PROCESSED,
      items,
    };

    syncRequest.status = result.status;
    syncRequest.processedCount = processedCount;
    syncRequest.failedCount = failedCount;
    syncRequest.result = result;
    await this.repository.save(syncRequest);

    return result;
  }

  async getStatus(actor: AuthenticatedUser, syncRequestId: string) {
    return this.repository.findOne({
      where: {
        companyId: this.getCompanyId(actor),
        employeeId: this.getEmployeeId(actor),
        syncRequestId,
      },
    });
  }

  private async processItem(
    actor: AuthenticatedUser,
    item: FieldMobileSyncItemDto,
  ) {
    switch (item.operation) {
      case FieldMobileSyncOperationEnum.UPSERT_DAILY_REPORT: {
        const payload = item.payload as { activity_date: string };
        const report = await this.dailyActivityService.getOrCreateMyDailyReport(
          actor,
          payload.activity_date,
          item.client_request_id,
          DailyActivitySourceEnum.MOBILE,
        );
        return { server_entity_id: report.id };
      }
      case FieldMobileSyncOperationEnum.UPSERT_ACTIVITY_ENTRY: {
        const payload = item.payload as { report_id: number };
        const report = await this.dailyActivityService.addMyEntry(
          actor,
          payload.report_id,
          this.withClientRequestId<CreateDailyActivityEntryDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: report.id };
      }
      case FieldMobileSyncOperationEnum.SUBMIT_DAILY_REPORT: {
        const payload = item.payload as { report_id: number };
        const report = await this.dailyActivityService.submitMyDailyReport(
          actor,
          payload.report_id,
          this.withClientRequestId<SubmitDailyActivityReportDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: report.id };
      }
      case FieldMobileSyncOperationEnum.UPSERT_VISIT_PLAN: {
        const payload = item.payload as { plan_id?: number };
        const plan = payload.plan_id
          ? await this.fieldVisitService.updateMyPlan(
              actor,
              payload.plan_id,
              this.asPayload<UpdateFieldVisitPlanDto>(item.payload),
            )
          : await this.fieldVisitService.createMyPlan(
              actor,
              this.withClientRequestId<CreateFieldVisitPlanDto>(
                item.payload,
                item.client_request_id,
              ),
            );
        return { server_entity_id: plan.id };
      }
      case FieldMobileSyncOperationEnum.UPSERT_VISIT: {
        const visit = await this.fieldVisitService.createUnplannedVisit(
          actor,
          this.withClientRequestId<CreateUnplannedFieldVisitDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: visit.id };
      }
      case FieldMobileSyncOperationEnum.VISIT_CHECK_IN: {
        const payload = item.payload as { visit_id: number };
        const visit = await this.fieldVisitService.checkIn(
          actor,
          payload.visit_id,
          this.withClientRequestId<FieldVisitCheckInDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: visit.id };
      }
      case FieldMobileSyncOperationEnum.VISIT_CHECK_OUT: {
        const payload = item.payload as { visit_id: number };
        const visit = await this.fieldVisitService.checkOut(
          actor,
          payload.visit_id,
          this.withClientRequestId<FieldVisitCheckOutDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: visit.id };
      }
      case FieldMobileSyncOperationEnum.ADD_VISIT_EVIDENCE: {
        const payload = item.payload as { visit_id: number };
        const visit = await this.fieldVisitService.addEvidence(
          actor,
          payload.visit_id,
          this.withClientRequestId<AddFieldVisitEvidenceDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: visit.id };
      }
      case FieldMobileSyncOperationEnum.ADD_OPPORTUNITY: {
        const payload = item.payload as { visit_id: number };
        const visit = await this.fieldVisitService.addOpportunity(
          actor,
          payload.visit_id,
          this.withClientRequestId<CreateFieldOpportunityDto>(
            item.payload,
            item.client_request_id,
          ),
        );
        return { server_entity_id: visit.id };
      }
      case FieldMobileSyncOperationEnum.COMPLETE_FOLLOW_UP: {
        const payload = item.payload as { follow_up_id: number };
        const followUp = await this.fieldVisitService.completeMyFollowUp(
          actor,
          payload.follow_up_id,
          this.asPayload<CompleteFieldFollowUpDto>(item.payload),
        );
        return { server_entity_id: followUp.id };
      }
      default:
        throw new Error(
          `Unsupported sync operation: ${String(item.operation)}`,
        );
    }
  }
}
