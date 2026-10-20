import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { HikvisionAttendanceLog } from '../../../hikvision/entities/hikvision-attendance-log.entity';
import { AttendanceMobilePunch } from '../mobile-punches/entities/attendance-mobile-punch.entity';
import {
  AttendanceDataRetentionHold,
  AttendanceRetentionCategory,
} from './entities/attendance-data-retention-hold.entity';
import { AttendanceRetentionPurgeApproval } from './entities/attendance-retention-purge-approval.entity';
import { CreateAttendanceRetentionHoldDto } from './dtos/create-attendance-retention-hold.dto';
import { ReleaseAttendanceRetentionHoldDto } from './dtos/release-attendance-retention-hold.dto';
import { CreateAttendanceRetentionPurgeApprovalDto } from './dtos/create-attendance-retention-purge-approval.dto';
import { ReviewAttendanceRetentionPurgeApprovalDto } from './dtos/review-attendance-retention-purge-approval.dto';
import { FieldVisitLocationEvent } from '../../work-activities/entities/field-visit.entities';

@Injectable()
export class AttendanceRetentionGovernanceService {
  constructor(
    @InjectRepository(AttendanceDataRetentionHold)
    private readonly holdRepository: Repository<AttendanceDataRetentionHold>,
    @InjectRepository(AttendanceRetentionPurgeApproval)
    private readonly approvalRepository: Repository<AttendanceRetentionPurgeApproval>,
    @InjectRepository(HikvisionAttendanceLog)
    private readonly rawLogRepository: Repository<HikvisionAttendanceLog>,
    @InjectRepository(AttendanceMobilePunch)
    private readonly punchRepository: Repository<AttendanceMobilePunch>,
    @InjectRepository(FieldVisitLocationEvent)
    private readonly fieldLocationRepository: Repository<FieldVisitLocationEvent>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  getReadiness() {
    return {
      raw_log_retention_days:
        this.configuredRetentionDays('RAW_HIKVISION_LOG') ?? null,
      raw_log_purge_enabled:
        this.configService.get<boolean>(
          'ATTENDANCE_RAW_LOG_RETENTION_PURGE_ENABLED',
        ) ?? false,
      selfie_retention_days:
        this.configuredRetentionDays('MOBILE_SELFIE') ?? null,
      selfie_purge_enabled:
        this.configService.get<boolean>(
          'ATTENDANCE_SELFIE_RETENTION_PURGE_ENABLED',
        ) ?? false,
      location_retention_days:
        this.configuredRetentionDays('ATTENDANCE_LOCATION') ?? null,
      location_purge_enabled:
        this.configService.get<boolean>(
          'ATTENDANCE_LOCATION_RETENTION_PURGE_ENABLED',
        ) ?? false,
      field_location_retention_days:
        this.configService.get<number>('FIELD_LOCATION_RETENTION_DAYS') ?? null,
      field_location_purge_enabled:
        this.configService.get<boolean>(
          'FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION',
        ) ?? false,
      require_separate_reviewer: true,
      purge_approval_is_one_time: true,
    };
  }

  listHolds(companyId: number) {
    return this.holdRepository.find({
      where: { companyId },
      order: { active: 'DESC', createdAt: 'DESC', id: 'DESC' },
      take: 500,
    });
  }

  async createHold(
    companyId: number,
    actorId: number,
    dto: CreateAttendanceRetentionHoldDto,
  ) {
    await this.assertRecordExists(companyId, dto.category, dto.recordId);
    const active = await this.holdRepository.findOne({
      where: {
        companyId,
        category: dto.category,
        recordId: dto.recordId,
        active: true,
      },
    });
    if (active)
      throw new ConflictException(
        'This attendance record already has an active legal hold.',
      );
    return this.holdRepository.save(
      this.holdRepository.create({
        companyId,
        category: dto.category,
        recordId: dto.recordId,
        active: true,
        reason: dto.reason.trim(),
        createdByCompanyUserId: actorId,
        releasedByCompanyUserId: null,
        releasedAt: null,
        releaseReason: null,
      }),
    );
  }

  async releaseHold(
    companyId: number,
    id: number,
    actorId: number,
    dto: ReleaseAttendanceRetentionHoldDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AttendanceDataRetentionHold);
      const hold = await repository.findOne({
        where: { companyId, id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!hold)
        throw new NotFoundException('Attendance retention hold not found.');
      if (!hold.active)
        throw new ConflictException('This retention hold is already released.');
      hold.active = false;
      hold.releasedByCompanyUserId = actorId;
      hold.releasedAt = new Date();
      hold.releaseReason = dto.reason.trim();
      return repository.save(hold);
    });
  }

  listPurgeApprovals(companyId: number) {
    return this.approvalRepository.find({
      where: { companyId },
      order: { requestedAt: 'DESC', id: 'DESC' },
      take: 250,
    });
  }

  async requestPurgeApproval(
    companyId: number,
    actorId: number,
    dto: CreateAttendanceRetentionPurgeApprovalDto,
  ) {
    const configuredDays = this.configuredRetentionDays(dto.category);
    if (!configuredDays || configuredDays !== dto.retentionDays) {
      throw new BadRequestException(
        `The requested retention period must match the configured ${dto.category} retention period (${configuredDays ?? 'not configured'} days).`,
      );
    }
    const pending = await this.approvalRepository.findOne({
      where: { companyId, category: dto.category, status: 'PENDING' },
    });
    if (pending)
      throw new ConflictException(
        'A purge approval request is already pending for this category.',
      );
    return this.approvalRepository.save(
      this.approvalRepository.create({
        companyId,
        category: dto.category,
        retentionDays: dto.retentionDays,
        status: 'PENDING',
        reason: dto.reason.trim(),
        requestedByCompanyUserId: actorId,
        reviewedByCompanyUserId: null,
        reviewNote: null,
        reviewedAt: null,
        executedAt: null,
      }),
    );
  }

  async reviewPurgeApproval(
    companyId: number,
    id: number,
    actorId: number,
    dto: ReviewAttendanceRetentionPurgeApprovalDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(
        AttendanceRetentionPurgeApproval,
      );
      const approval = await repository.findOne({
        where: { companyId, id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!approval)
        throw new NotFoundException(
          'Attendance purge approval request not found.',
        );
      if (approval.status !== 'PENDING')
        throw new ConflictException(
          'Only pending purge approval requests can be reviewed.',
        );
      if (approval.requestedByCompanyUserId === actorId) {
        throw new ForbiddenException(
          'The requester cannot approve their own attendance purge request.',
        );
      }
      if (
        dto.decision === 'APPROVE' &&
        this.configuredRetentionDays(approval.category) !==
          approval.retentionDays
      ) {
        throw new BadRequestException(
          'The configured retention period changed; create a new approval request.',
        );
      }
      approval.status = dto.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      approval.reviewedByCompanyUserId = actorId;
      approval.reviewedAt = new Date();
      approval.reviewNote = dto.note.trim();
      return repository.save(approval);
    });
  }

  async getApprovedPurgeTargets(
    category: AttendanceRetentionCategory,
    retentionDays: number,
  ) {
    return this.approvalRepository.find({
      where: { category, retentionDays, status: 'APPROVED' },
      order: { requestedAt: 'ASC' },
    });
  }

  async markPurgeExecuted(id: number) {
    await this.approvalRepository.update(
      { id, status: 'APPROVED' },
      { status: 'EXECUTED', executedAt: new Date() },
    );
  }

  configuredRetentionDays(
    category: AttendanceRetentionCategory,
  ): number | undefined {
    return this.configService.get<number>(
      category === 'RAW_HIKVISION_LOG'
        ? 'ATTENDANCE_RAW_LOG_RETENTION_DAYS'
        : category === 'MOBILE_SELFIE'
          ? 'ATTENDANCE_SELFIE_RETENTION_DAYS'
          : category === 'ATTENDANCE_LOCATION'
            ? 'ATTENDANCE_LOCATION_RETENTION_DAYS'
            : 'FIELD_LOCATION_RETENTION_DAYS',
    );
  }

  private async assertRecordExists(
    companyId: number,
    category: AttendanceRetentionCategory,
    recordId: number,
  ) {
    const exists =
      category === 'RAW_HIKVISION_LOG'
        ? await this.rawLogRepository.exist({
            where: { companyId, id: recordId },
          })
        : category === 'ATTENDANCE_LOCATION'
          ? Boolean(
              await this.punchRepository
                .createQueryBuilder('punch')
                .where('punch.company_id = :companyId', { companyId })
                .andWhere('punch.id = :recordId', { recordId })
                .andWhere(
                  "(punch.latitude IS NOT NULL OR punch.longitude IS NOT NULL OR punch.accuracy_meters IS NOT NULL OR punch.distance_from_geofence_meters IS NOT NULL OR punch.wifi_ssid IS NOT NULL OR punch.wifi_bssid IS NOT NULL OR punch.ip_address IS NOT NULL OR punch.raw_payload ?| ARRAY['latitude', 'longitude', 'gps', 'location'])",
                )
                .getOne(),
            )
          : category === 'FIELD_VISIT_LOCATION'
            ? await this.fieldLocationRepository.exist({
                where: { companyId, id: recordId },
              })
            : Boolean(
                (
                  await this.punchRepository.findOne({
                    where: { companyId, id: recordId },
                    select: { id: true, rawPayload: true },
                  })
                )?.rawPayload?.selfiePath,
              );
    if (!exists)
      throw new NotFoundException(
        'Attendance retention target not found in this company.',
      );
  }
}
