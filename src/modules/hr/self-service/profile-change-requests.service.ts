import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Not, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { normalizeTanzaniaOrUgandaPhone } from '../../../common/utils/tanzania-phone.util';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { FilesService } from '../../files/files.service';
import { ImageProcessingService } from '../../files/image-processing.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { NotificationCategoryEnum } from '../../notifications/enums/notification-category.enum';
import { NotificationPriorityEnum } from '../../notifications/enums/notification-priority.enum';
import { NotificationTypeEnum } from '../../notifications/enums/notification-type.enum';
import { User } from '../../users/entities/user.entity';
import { DefaultAvatarsService } from '../default-avatars/default-avatars.service';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { EmployeeAddress } from '../employees/entities/employee-address.entity';
import { EmployeeContact } from '../employees/entities/employee-contact.entity';
import { EmployeeRelative } from '../employees/entities/employee-relative.entity';
import { Employee } from '../employees/entities/employee.entity';
import { ProfileImageSourceEnum } from '../employees/enums/profile-image-source.enum';
import { HrAccessService } from '../shared/hr-access.service';
import { ApproveProfileChangeRequestDto } from './dtos/approve-profile-change-request.dto';
import { CreateProfileChangeRequestDto } from './dtos/create-profile-change-request.dto';
import { ProfileChangeRequestQueryDto } from './dtos/profile-change-request-query.dto';
import { RejectProfileChangeRequestDto } from './dtos/reject-profile-change-request.dto';
import { RequestProfileChangeCorrectionDto } from './dtos/request-profile-change-correction.dto';
import { StartProfileChangeReviewDto } from './dtos/start-profile-change-review.dto';
import { UpdateProfileChangeRequestDto } from './dtos/update-profile-change-request.dto';
import { ValidateProfileChangeRequestDto } from './dtos/validate-profile-change-request.dto';
import { ProfileChangeRequestAuditActionEnum } from './enums/profile-change-request-audit-action.enum';
import { ProfileChangeFieldSourceEntityEnum } from './enums/profile-change-field-source-entity.enum';
import { ProfileChangeRequestFilePurposeEnum } from './enums/profile-change-request-file-purpose.enum';
import { ProfileChangeRequestFileStatusEnum } from './enums/profile-change-request-file-status.enum';
import { ProfileChangeRequestItemStatusEnum } from './enums/profile-change-request-item-status.enum';
import { ProfileChangeRequestItemValidationStatusEnum } from './enums/profile-change-request-item-validation-status.enum';
import { ProfileChangeRequestStatusEnum } from './enums/profile-change-request-status.enum';
import { ProfileChangeRequestTypeEnum } from './enums/profile-change-request-type.enum';
import { ProfileChangeRequestAudit } from './entities/profile-change-request-audit.entity';
import { ProfileChangeRequestFile } from './entities/profile-change-request-file.entity';
import { ProfileChangeRequestItem } from './entities/profile-change-request-item.entity';
import { ProfileChangeRequest } from './entities/profile-change-request.entity';
import {
  ProfileChangeFieldPolicyService,
  ProfileFieldPolicy,
} from './profile-change-field-policy.service';

type RequestActorContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestIdHeader?: string | null;
};

type ManagedProfilePhotoUpload = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type FieldValidationIssue = {
  field: string;
  code: string;
  message: string;
};

type ProfileSnapshot = {
  employee: Employee;
  membership: CompanyUser;
  user: User;
  primaryPersonalContact: EmployeeContact | null;
  primaryAddress: EmployeeAddress | null;
  primaryEmergencyContact: EmployeeRelative | null;
};

type ChangeItemDraft = {
  fieldName: string;
  policy: ProfileFieldPolicy;
  oldValue: string | null;
  newValue: string | null;
  parsedNewValue: unknown;
};

const ACTIVE_REQUEST_STATUSES = [
  ProfileChangeRequestStatusEnum.DRAFT,
  ProfileChangeRequestStatusEnum.PENDING_REVIEW,
  ProfileChangeRequestStatusEnum.UNDER_REVIEW,
  ProfileChangeRequestStatusEnum.CORRECTION_REQUIRED,
];

@Injectable()
export class ProfileChangeRequestsService {
  private readonly profilePhotoAllowedMimeTypes = [
    'image/svg+xml',
    'image/jpeg',
    'image/png',
    'image/webp',
  ];
  private readonly profilePhotoAllowedExtensions = [
    '.svg',
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
  ];
  private readonly profilePhotoMaxFileSizeBytes = 5 * 1024 * 1024;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProfileChangeRequest)
    private readonly requestRepository: Repository<ProfileChangeRequest>,
    @InjectRepository(ProfileChangeRequestItem)
    private readonly itemRepository: Repository<ProfileChangeRequestItem>,
    @InjectRepository(ProfileChangeRequestFile)
    private readonly fileRepository: Repository<ProfileChangeRequestFile>,
    @InjectRepository(ProfileChangeRequestAudit)
    private readonly auditRepository: Repository<ProfileChangeRequestAudit>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmployeeContact)
    private readonly employeeContactRepository: Repository<EmployeeContact>,
    @InjectRepository(EmployeeAddress)
    private readonly employeeAddressRepository: Repository<EmployeeAddress>,
    @InjectRepository(EmployeeRelative)
    private readonly employeeRelativeRepository: Repository<EmployeeRelative>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    private readonly policyService: ProfileChangeFieldPolicyService,
    private readonly hrAccessService: HrAccessService,
    private readonly filesService: FilesService,
    private readonly imageProcessingService: ImageProcessingService,
    private readonly defaultAvatarsService: DefaultAvatarsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async getPendingSummary(companyId: number, employeeId: number) {
    const count = await this.requestRepository.count({
      where: {
        company_id: companyId,
        employee_id: employeeId,
        status: In(ACTIVE_REQUEST_STATUSES),
        deleted_at: IsNull(),
      },
    });

    return {
      has_pending_profile_change: count > 0,
      pending_request_count: count,
    };
  }

  async listMine(
    actor: AuthenticatedUser,
    query: ProfileChangeRequestQueryDto,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.items', 'items')
      .leftJoinAndSelect('request.files', 'files')
      .where('request.company_id = :companyId', {
        companyId: snapshot.membership.company_id,
      })
      .andWhere('request.employee_id = :employeeId', {
        employeeId: snapshot.employee.id,
      })
      .andWhere('request.deleted_at IS NULL');

    if (query.status) {
      qb.andWhere('request.status = :status', { status: query.status });
    }

    if (query.request_type) {
      qb.andWhere('request.request_type = :requestType', {
        requestType: query.request_type,
      });
    }

    const [items, total] = await qb
      .orderBy('request.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((request) => this.mapRequest(request)),
      meta: this.buildPaginationMeta(page, limit, total),
    };
  }

  async getMine(actor: AuthenticatedUser, id: number) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      id,
      snapshot.membership.company_id,
    );

    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    return this.mapRequest(request);
  }

  async validateMine(
    actor: AuthenticatedUser,
    dto: ValidateProfileChangeRequestDto,
    existingRequestId?: number,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const requestType =
      dto.request_type ??
      ProfileChangeRequestTypeEnum.OTHER_PROFILE_INFORMATION;
    const validation = await this.validateChangeSet(
      snapshot,
      requestType,
      dto.changes ?? {},
      existingRequestId ?? null,
    );

    return {
      valid: validation.errors.length === 0,
      request_type: requestType,
      errors: validation.errors,
      warnings: validation.warnings,
      required_actions: validation.required_actions,
      changed_fields: validation.items.map((item) => ({
        field_name: item.fieldName,
        field_label: item.policy.display_label,
        current_value: item.oldValue,
        proposed_value: item.newValue,
        source_entity: item.policy.source_entity,
        requires_approval: item.policy.requires_approval,
        sensitive: item.policy.sensitive,
      })),
    };
  }

  async createDraft(
    actor: AuthenticatedUser,
    dto: CreateProfileChangeRequestDto,
    context?: RequestActorContext,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const requestType = dto.request_type;
    const validation = await this.validateChangeSet(
      snapshot,
      requestType,
      dto.changes ?? {},
      null,
    );

    if (validation.errors.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Profile change request validation failed.',
        ...validation,
        valid: false,
      });
    }

    const request = this.requestRepository.create({
      reference_number: this.buildReferenceNumber(),
      company_id: snapshot.membership.company_id,
      employee_id: snapshot.employee.id,
      requested_by_user_id: actor.id,
      request_type: requestType,
      reason: dto.reason?.trim() || null,
      status: ProfileChangeRequestStatusEnum.DRAFT,
      metadata: {
        warnings: validation.warnings,
      },
      items: validation.items.map((item) =>
        this.itemRepository.create({
          field_name: item.fieldName,
          field_label: item.policy.display_label,
          source_entity: item.policy.source_entity,
          old_value: item.oldValue,
          new_value: item.newValue,
          value_type: item.policy.value_type,
          status: ProfileChangeRequestItemStatusEnum.PENDING,
          validation_status: ProfileChangeRequestItemValidationStatusEnum.VALID,
          validation_errors: null,
          sensitive: item.policy.sensitive,
        }),
      ),
    });

    const saved = await this.requestRepository.save(request);
    await this.createAudit(
      saved,
      ProfileChangeRequestAuditActionEnum.REQUEST_CREATED,
      actor,
      context,
      {
        request_type: requestType,
        field_names: validation.items.map((item) => item.fieldName),
      },
    );

    return this.getMine(actor, saved.id);
  }

  async updateDraft(
    actor: AuthenticatedUser,
    id: number,
    dto: UpdateProfileChangeRequestDto,
    context?: RequestActorContext,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      id,
      snapshot.membership.company_id,
    );

    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    if (
      ![
        ProfileChangeRequestStatusEnum.DRAFT,
        ProfileChangeRequestStatusEnum.CORRECTION_REQUIRED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        `Cannot update a request in status '${request.status}'.`,
      );
    }

    const requestType = dto.request_type ?? request.request_type;
    const changes =
      dto.changes ?? this.rehydrateChangesFromItems(request.items ?? []);
    const validation = await this.validateChangeSet(
      snapshot,
      requestType,
      changes,
      request.id,
    );

    if (validation.errors.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Profile change request validation failed.',
        ...validation,
        valid: false,
      });
    }

    request.request_type = requestType;
    request.reason =
      dto.reason !== undefined ? dto.reason?.trim() || null : request.reason;
    request.metadata = {
      ...this.toObject(request.metadata),
      warnings: validation.warnings,
    };
    request.version += 1;
    request.items = validation.items.map((item) =>
      this.itemRepository.create({
        id:
          request.items?.find(
            (existing) => existing.field_name === item.fieldName,
          )?.id ?? undefined,
        request_id: request.id,
        field_name: item.fieldName,
        field_label: item.policy.display_label,
        source_entity: item.policy.source_entity,
        old_value: item.oldValue,
        new_value: item.newValue,
        value_type: item.policy.value_type,
        status: ProfileChangeRequestItemStatusEnum.PENDING,
        validation_status: ProfileChangeRequestItemValidationStatusEnum.VALID,
        validation_errors: null,
        sensitive: item.policy.sensitive,
        review_comment: null,
        reviewed_by_user_id: null,
        reviewed_at: null,
      }),
    );

    const existingFieldNames = new Set(
      validation.items.map((item) => item.fieldName),
    );
    const staleItems =
      request.items?.filter(
        (item) => !existingFieldNames.has(item.field_name),
      ) ?? [];
    if (staleItems.length > 0) {
      await this.itemRepository.remove(staleItems);
    }

    await this.requestRepository.save(request);
    await this.createAudit(
      request,
      ProfileChangeRequestAuditActionEnum.DRAFT_UPDATED,
      actor,
      context,
      {
        request_type: requestType,
        field_names: validation.items.map((item) => item.fieldName),
      },
    );

    return this.getMine(actor, request.id);
  }

  async submit(
    actor: AuthenticatedUser,
    id: number,
    context?: RequestActorContext,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      id,
      snapshot.membership.company_id,
    );

    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    if (
      ![
        ProfileChangeRequestStatusEnum.DRAFT,
        ProfileChangeRequestStatusEnum.CORRECTION_REQUIRED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        `Cannot submit a request in status '${request.status}'.`,
      );
    }

    if (
      request.request_type === ProfileChangeRequestTypeEnum.PROFILE_PHOTO &&
      (!request.files ||
        request.files.every(
          (file) => file.status !== ProfileChangeRequestFileStatusEnum.PENDING,
        )) &&
      (!request.items || request.items.length === 0)
    ) {
      throw new BadRequestException(
        'A profile photo request requires a pending uploaded photo.',
      );
    }

    const changes = request.items?.length
      ? this.rehydrateChangesFromItems(request.items)
      : {};
    const validation = await this.validateChangeSet(
      snapshot,
      request.request_type,
      changes,
      request.id,
      request.files ?? [],
    );

    if (validation.errors.length > 0) {
      throw new UnprocessableEntityException({
        message: 'Profile change request validation failed.',
        ...validation,
        valid: false,
      });
    }

    const previousStatus = request.status;
    request.status = ProfileChangeRequestStatusEnum.PENDING_REVIEW;
    request.submitted_at = new Date();
    request.review_started_at = null;
    request.reviewed_by_user_id = null;
    request.reviewed_at = null;
    request.review_comment = null;
    request.rejection_reason = null;
    request.correction_instructions = null;
    request.correction_requested_at = null;
    request.metadata = {
      ...this.toObject(request.metadata),
      warnings: validation.warnings,
    };

    await this.requestRepository.save(request);

    await this.createAudit(
      request,
      previousStatus === ProfileChangeRequestStatusEnum.CORRECTION_REQUIRED
        ? ProfileChangeRequestAuditActionEnum.REQUEST_RESUBMITTED
        : ProfileChangeRequestAuditActionEnum.REQUEST_SUBMITTED,
      actor,
      context,
      {
        field_names: request.items?.map((item) => item.field_name) ?? [],
      },
      previousStatus,
      request.status,
    );

    await this.notifyReviewersOfSubmission(request, actor, context);

    return this.getMine(actor, request.id);
  }

  async cancel(
    actor: AuthenticatedUser,
    id: number,
    context?: RequestActorContext,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      id,
      snapshot.membership.company_id,
    );

    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    if (
      ![
        ProfileChangeRequestStatusEnum.DRAFT,
        ProfileChangeRequestStatusEnum.PENDING_REVIEW,
        ProfileChangeRequestStatusEnum.CORRECTION_REQUIRED,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        `Cannot cancel a request in status '${request.status}'.`,
      );
    }

    const previousStatus = request.status;
    request.status = ProfileChangeRequestStatusEnum.CANCELLED;
    request.cancelled_at = new Date();
    await this.requestRepository.save(request);
    await this.createAudit(
      request,
      ProfileChangeRequestAuditActionEnum.REQUEST_CANCELLED,
      actor,
      context,
      null,
      previousStatus,
      request.status,
    );

    await this.notifyRequester(
      request,
      actor,
      {
        title: 'Profile Change Request Cancelled',
        message: `Your profile change request ${request.reference_number} was cancelled.`,
        type: NotificationTypeEnum.GENERAL,
      },
      context,
    );

    return this.getMine(actor, request.id);
  }

  async removeDraft(
    actor: AuthenticatedUser,
    id: number,
    context?: RequestActorContext,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      id,
      snapshot.membership.company_id,
    );

    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    if (request.status !== ProfileChangeRequestStatusEnum.DRAFT) {
      throw new BadRequestException('Only draft requests can be deleted.');
    }

    await this.requestRepository.softDelete(request.id);
    await this.createAudit(
      request,
      ProfileChangeRequestAuditActionEnum.REQUEST_CANCELLED,
      actor,
      context,
      { soft_deleted: true },
      request.status,
      request.status,
    );

    return {
      message: 'Draft profile change request deleted successfully.',
    };
  }

  async createProfilePhotoRequest(
    actor: AuthenticatedUser,
    file: ManagedProfilePhotoUpload,
    context?: RequestActorContext,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const processedPhoto =
      this.imageProcessingService.processProfilePhotoBuffer(
        {
          buffer: file.buffer,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        },
        {
          allowedMimeTypes: this.profilePhotoAllowedMimeTypes,
          allowedExtensions: this.profilePhotoAllowedExtensions,
          maxFileSizeBytes: this.profilePhotoMaxFileSizeBytes,
        },
      );

    const storedFile = await this.filesService.savePrivateBufferFile({
      buffer: processedPhoto.buffer,
      fileName: processedPhoto.originalFileName,
      fileSize: processedPhoto.fileSize,
      mimeType: processedPhoto.mimeType,
      directorySegments: [
        'profile-change-requests',
        `company-${snapshot.membership.company_id}`,
      ],
      fileNamePrefix: `employee-${snapshot.employee.id}-pending-profile-photo`,
      allowedMimeTypes: this.profilePhotoAllowedMimeTypes,
    });

    let saved: ProfileChangeRequest;
    try {
      saved = await this.dataSource.transaction(async (manager) => {
        const request = manager.getRepository(ProfileChangeRequest).create({
          reference_number: this.buildReferenceNumber(),
          company_id: snapshot.membership.company_id,
          employee_id: snapshot.employee.id,
          requested_by_user_id: actor.id,
          request_type: ProfileChangeRequestTypeEnum.PROFILE_PHOTO,
          status: ProfileChangeRequestStatusEnum.DRAFT,
          reason: 'Profile photo update',
          items: [
            manager.getRepository(ProfileChangeRequestItem).create({
              field_name: 'profile_photo_file',
              field_label: 'Profile Photo',
              source_entity: ProfileChangeFieldSourceEntityEnum.EMPLOYEE,
              old_value: snapshot.employee.profile_photo_url,
              new_value: storedFile.publicPath,
              value_type: 'string',
              status: ProfileChangeRequestItemStatusEnum.PENDING,
              validation_status:
                ProfileChangeRequestItemValidationStatusEnum.VALID,
              validation_errors: null,
              sensitive: false,
            }),
          ],
          files: [
            manager.getRepository(ProfileChangeRequestFile).create({
              file_purpose:
                ProfileChangeRequestFilePurposeEnum.PROPOSED_PROFILE_PHOTO,
              status: ProfileChangeRequestFileStatusEnum.PENDING,
              storage_visibility: 'private',
              file_path: storedFile.publicPath,
              original_file_name: storedFile.originalFileName,
              stored_file_name: storedFile.storedFileName,
              file_extension: storedFile.fileExtension,
              mime_type: storedFile.mimeType,
              file_size: storedFile.fileSize,
              width: processedPhoto.width,
              height: processedPhoto.height,
              uploaded_by_user_id: actor.id,
            }),
          ],
        });

        const created = await manager
          .getRepository(ProfileChangeRequest)
          .save(request);

        await this.supersedeActiveProfilePhotoRequestsWithManager(
          manager,
          snapshot,
          created,
          actor,
          context,
        );

        await this.createAuditWithManager(
          manager,
          created,
          ProfileChangeRequestAuditActionEnum.REQUEST_CREATED,
          actor,
          context,
          {
            request_type: ProfileChangeRequestTypeEnum.PROFILE_PHOTO,
            upload_file_name: storedFile.originalFileName,
          },
        );
        await this.createAuditWithManager(
          manager,
          created,
          ProfileChangeRequestAuditActionEnum.FILE_UPLOADED,
          actor,
          context,
          {
            file_name: storedFile.originalFileName,
            mime_type: storedFile.mimeType,
            file_size: storedFile.fileSize,
          },
        );

        return created;
      });
    } catch (error) {
      await this.filesService.removeManagedFile(storedFile.publicPath);
      throw error;
    }

    return this.submit(actor, saved.id, context);
  }

  submitAvatarSelectionRequest(
    actor: AuthenticatedUser,
    defaultAvatarId: number | null,
    context?: RequestActorContext,
  ) {
    void actor;
    void defaultAvatarId;
    void context;

    throw new BadRequestException(
      'Default avatar changes are applied immediately and do not create approval requests.',
    );
  }

  async listForReview(
    actor: AuthenticatedUser,
    query: ProfileChangeRequestQueryDto,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);

    const qb = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.items', 'items')
      .leftJoinAndSelect('request.files', 'files')
      .innerJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('employee.company_user', 'membership')
      .leftJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('employee.primary_branch', 'branch')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.deleted_at IS NULL');

    if (accessibleBranchIds !== null && accessibleBranchIds.length) {
      qb.andWhere('employee.primary_branch_id IN (:...branchIds)', {
        branchIds: accessibleBranchIds,
      });
    } else if (accessibleBranchIds !== null) {
      qb.andWhere('1 = 0');
    }

    if (query.status) {
      qb.andWhere('request.status = :status', { status: query.status });
    }

    if (query.request_type) {
      qb.andWhere('request.request_type = :requestType', {
        requestType: query.request_type,
      });
    }

    if (query.employee_id) {
      qb.andWhere('request.employee_id = :employeeId', {
        employeeId: query.employee_id,
      });
    }

    if (query.branch_id) {
      qb.andWhere('employee.primary_branch_id = :branchId', {
        branchId: query.branch_id,
      });
    }

    if (query.department_id) {
      qb.andWhere('employee.primary_department_id = :departmentId', {
        departmentId: query.department_id,
      });
    }

    if (query.from_date) {
      qb.andWhere('request.created_at >= :fromDate', {
        fromDate: `${query.from_date} 00:00:00`,
      });
    }

    if (query.to_date) {
      qb.andWhere('request.created_at <= :toDate', {
        toDate: `${query.to_date} 23:59:59`,
      });
    }

    const [items, total] = await qb
      .orderBy('request.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((request) => this.mapRequest(request, true)),
      meta: this.buildPaginationMeta(page, limit, total),
    };
  }

  async getForReview(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequestOrFail(id, companyId);
    await this.assertReviewerCanAccessRequest(actor, request);
    return this.mapRequest(request, true);
  }

  async getHistoryForEmployee(actor: AuthenticatedUser, id: number) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      id,
      snapshot.membership.company_id,
    );
    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    return this.mapAuditHistory(request.audits ?? []);
  }

  async getHistoryForReviewer(actor: AuthenticatedUser, id: number) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequestOrFail(id, companyId);
    await this.assertReviewerCanAccessRequest(actor, request);
    return this.mapAuditHistory(request.audits ?? []);
  }

  async startReview(
    actor: AuthenticatedUser,
    id: number,
    dto: StartProfileChangeReviewDto,
    context?: RequestActorContext,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequestOrFail(id, companyId);
    await this.assertReviewerCanAccessRequest(actor, request);

    if (request.requested_by_user_id === actor.id) {
      throw new ForbiddenException(
        'You cannot review your own profile change request.',
      );
    }

    if (request.status === ProfileChangeRequestStatusEnum.UNDER_REVIEW) {
      return this.getForReview(actor, id);
    }

    if (request.status !== ProfileChangeRequestStatusEnum.PENDING_REVIEW) {
      throw new BadRequestException(
        `Cannot start review for a request in status '${request.status}'.`,
      );
    }

    const previousStatus = request.status;
    request.status = ProfileChangeRequestStatusEnum.UNDER_REVIEW;
    request.review_started_at = new Date();
    request.reviewed_by_user_id = actor.id;
    request.review_comment = dto.comment?.trim() || null;
    await this.requestRepository.save(request);
    await this.createAudit(
      request,
      ProfileChangeRequestAuditActionEnum.REVIEW_STARTED,
      actor,
      context,
      { comment: dto.comment?.trim() || null },
      previousStatus,
      request.status,
    );

    await this.notifyRequester(
      request,
      actor,
      {
        title: 'Profile Change Review Started',
        message: `Your profile change request ${request.reference_number} is now under review.`,
        type: NotificationTypeEnum.GENERAL,
      },
      context,
    );

    return this.getForReview(actor, id);
  }

  async approve(
    actor: AuthenticatedUser,
    id: number,
    dto: ApproveProfileChangeRequestDto,
    context?: RequestActorContext,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const notificationPayloads: Array<() => Promise<void>> = [];

    const result = await this.dataSource.transaction(async (manager) => {
      const request = await manager
        .getRepository(ProfileChangeRequest)
        .findOne({
          where: {
            id,
            company_id: companyId,
          },
          relations: {
            items: true,
            files: true,
            employee: {
              company_user: { user: true },
              default_avatar: true,
              contacts: true,
              addresses: true,
              relatives: true,
              primary_branch: true,
              primary_department: true,
            },
            audits: true,
          },
          lock: {
            mode: 'pessimistic_write',
          },
        });

      if (!request || request.deleted_at) {
        throw new NotFoundException('Profile change request not found.');
      }

      await this.assertReviewerCanAccessRequest(actor, request);

      if (request.requested_by_user_id === actor.id) {
        throw new ForbiddenException('You cannot approve your own request.');
      }

      if (request.status === ProfileChangeRequestStatusEnum.APPROVED) {
        return request;
      }

      if (
        ![
          ProfileChangeRequestStatusEnum.PENDING_REVIEW,
          ProfileChangeRequestStatusEnum.UNDER_REVIEW,
        ].includes(request.status)
      ) {
        throw new BadRequestException(
          `Cannot approve a request in status '${request.status}'.`,
        );
      }

      const user = await manager.getRepository(User).findOneOrFail({
        where: { id: request.requested_by_user_id },
      });
      const companyUser = request.employee.company_user;
      if (!companyUser) {
        throw new BadRequestException(
          'The employee no longer has a linked company account.',
        );
      }
      companyUser.user = user;
      const snapshot = this.buildSnapshotFromLoadedEmployee(
        request.employee,
        companyUser,
        user,
      );

      const staleConflicts = this.detectStaleConflicts(
        snapshot,
        request.items ?? [],
      );
      if (staleConflicts.length > 0) {
        for (const conflict of staleConflicts) {
          const item = request.items.find(
            (entry) => entry.field_name === conflict.field,
          );
          if (item) {
            item.status = ProfileChangeRequestItemStatusEnum.CONFLICTED;
            item.validation_status =
              ProfileChangeRequestItemValidationStatusEnum.CONFLICTED;
            item.validation_errors = [
              {
                code: 'STALE_CONFLICT',
                message: conflict.message,
                current_value: conflict.currentValue,
                original_value: conflict.originalValue,
              },
            ];
            item.reviewed_by_user_id = actor.id;
            item.reviewed_at = new Date();
            await manager.getRepository(ProfileChangeRequestItem).save(item);
          }
        }

        await this.createAuditWithManager(
          manager,
          request,
          ProfileChangeRequestAuditActionEnum.CONFLICT_DETECTED,
          actor,
          context,
          {
            conflicts: staleConflicts,
          },
          request.status,
          request.status,
        );

        throw new ConflictException({
          message:
            'The request contains stale profile data and cannot be approved yet.',
          conflicts: staleConflicts,
        });
      }

      const changes = request.items?.length
        ? this.rehydrateChangesFromItems(request.items)
        : {};
      const validation = await this.validateChangeSet(
        snapshot,
        request.request_type,
        changes,
        request.id,
        request.files ?? [],
      );
      if (validation.errors.length > 0) {
        throw new UnprocessableEntityException({
          message: 'Profile change request validation failed during approval.',
          valid: false,
          ...validation,
        });
      }

      await this.applyValidatedChanges(manager, snapshot, validation.items);
      await this.promoteApprovedPendingFiles(
        manager,
        snapshot,
        request,
        actor,
        context,
      );

      for (const item of request.items ?? []) {
        item.status = ProfileChangeRequestItemStatusEnum.APPLIED;
        item.validation_status =
          ProfileChangeRequestItemValidationStatusEnum.VALID;
        item.reviewed_by_user_id = actor.id;
        item.reviewed_at = new Date();
        item.review_comment = dto.comment?.trim() || null;
        await manager.getRepository(ProfileChangeRequestItem).save(item);
      }

      const previousStatus = request.status;
      request.status = ProfileChangeRequestStatusEnum.APPROVED;
      request.reviewed_by_user_id = actor.id;
      request.reviewed_at = new Date();
      request.approved_at = new Date();
      request.review_comment = dto.comment?.trim() || null;
      await manager.getRepository(ProfileChangeRequest).save(request);

      await this.createAuditWithManager(
        manager,
        request,
        ProfileChangeRequestAuditActionEnum.REQUEST_APPROVED,
        actor,
        context,
        {
          comment: dto.comment?.trim() || null,
          field_names: request.items?.map((item) => item.field_name) ?? [],
        },
        previousStatus,
        request.status,
      );
      await this.createAuditWithManager(
        manager,
        request,
        ProfileChangeRequestAuditActionEnum.PROFILE_PUBLISHED,
        actor,
        context,
        {
          field_names: request.items?.map((item) => item.field_name) ?? [],
        },
      );

      notificationPayloads.push(async () => {
        await this.notifyRequester(
          request,
          actor,
          {
            title: 'Profile Change Request Approved',
            message: `Your profile change request ${request.reference_number} has been approved.`,
            type: NotificationTypeEnum.GENERAL,
          },
          context,
        );
      });

      return request;
    });

    for (const task of notificationPayloads) {
      await task();
    }

    return this.getForReview(actor, result.id);
  }

  async reject(
    actor: AuthenticatedUser,
    id: number,
    dto: RejectProfileChangeRequestDto,
    context?: RequestActorContext,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequestOrFail(id, companyId);
    await this.assertReviewerCanAccessRequest(actor, request);

    if (request.requested_by_user_id === actor.id) {
      throw new ForbiddenException('You cannot reject your own request.');
    }

    if (
      ![
        ProfileChangeRequestStatusEnum.PENDING_REVIEW,
        ProfileChangeRequestStatusEnum.UNDER_REVIEW,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        `Cannot reject a request in status '${request.status}'.`,
      );
    }

    const previousStatus = request.status;
    request.status = ProfileChangeRequestStatusEnum.REJECTED;
    request.reviewed_by_user_id = actor.id;
    request.reviewed_at = new Date();
    request.rejected_at = new Date();
    request.review_comment = dto.comment?.trim() || null;
    request.rejection_reason = dto.rejection_reason.trim();
    await this.requestRepository.save(request);

    for (const file of request.files ?? []) {
      if (file.status === ProfileChangeRequestFileStatusEnum.PENDING) {
        file.status = ProfileChangeRequestFileStatusEnum.REJECTED;
        await this.fileRepository.save(file);
      }
    }

    await this.createAudit(
      request,
      ProfileChangeRequestAuditActionEnum.REQUEST_REJECTED,
      actor,
      context,
      {
        rejection_reason: dto.rejection_reason.trim(),
        comment: dto.comment?.trim() || null,
      },
      previousStatus,
      request.status,
    );

    await this.notifyRequester(
      request,
      actor,
      {
        title: 'Profile Change Request Rejected',
        message: `Your profile change request ${request.reference_number} was rejected. Reason: ${request.rejection_reason}.`,
        type: NotificationTypeEnum.GENERAL,
      },
      context,
    );

    return this.getForReview(actor, id);
  }

  async requestCorrection(
    actor: AuthenticatedUser,
    id: number,
    dto: RequestProfileChangeCorrectionDto,
    context?: RequestActorContext,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequestOrFail(id, companyId);
    await this.assertReviewerCanAccessRequest(actor, request);

    if (request.requested_by_user_id === actor.id) {
      throw new ForbiddenException(
        'You cannot request correction on your own request.',
      );
    }

    if (
      ![
        ProfileChangeRequestStatusEnum.PENDING_REVIEW,
        ProfileChangeRequestStatusEnum.UNDER_REVIEW,
      ].includes(request.status)
    ) {
      throw new BadRequestException(
        `Cannot request correction for a request in status '${request.status}'.`,
      );
    }

    const previousStatus = request.status;
    request.status = ProfileChangeRequestStatusEnum.CORRECTION_REQUIRED;
    request.reviewed_by_user_id = actor.id;
    request.reviewed_at = new Date();
    request.correction_requested_at = new Date();
    request.review_comment = dto.comment?.trim() || null;
    request.correction_instructions = dto.correction_instructions.trim();
    await this.requestRepository.save(request);

    await this.createAudit(
      request,
      ProfileChangeRequestAuditActionEnum.CORRECTION_REQUESTED,
      actor,
      context,
      {
        correction_instructions: dto.correction_instructions.trim(),
        comment: dto.comment?.trim() || null,
      },
      previousStatus,
      request.status,
    );

    await this.notifyRequester(
      request,
      actor,
      {
        title: 'Profile Change Correction Required',
        message: `Your profile change request ${request.reference_number} needs correction before approval. Instructions: ${request.correction_instructions}.`,
        type: NotificationTypeEnum.GENERAL,
      },
      context,
    );

    return this.getForReview(actor, id);
  }

  async getPendingFileForEmployee(
    actor: AuthenticatedUser,
    requestId: number,
    fileId: number,
  ) {
    const snapshot = await this.requireOwnSnapshot(actor);
    const request = await this.findRequestOrFail(
      requestId,
      snapshot.membership.company_id,
    );
    if (request.employee_id !== snapshot.employee.id || request.deleted_at) {
      throw new NotFoundException('Profile change request not found.');
    }

    const file = request.files?.find((entry) => entry.id === fileId);
    if (!file) {
      throw new NotFoundException('Pending file not found.');
    }

    const buffer = await this.filesService.readManagedFile(file.file_path);
    if (!buffer) {
      throw new NotFoundException('Pending file content not found.');
    }

    return {
      buffer,
      mimeType: file.mime_type,
      originalFileName: file.original_file_name,
    };
  }

  async getPendingFileForReviewer(
    actor: AuthenticatedUser,
    requestId: number,
    fileId: number,
  ) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const request = await this.findRequestOrFail(requestId, companyId);
    await this.assertReviewerCanAccessRequest(actor, request);

    const file = request.files?.find((entry) => entry.id === fileId);
    if (!file) {
      throw new NotFoundException('Pending file not found.');
    }

    const buffer = await this.filesService.readManagedFile(file.file_path);
    if (!buffer) {
      throw new NotFoundException('Pending file content not found.');
    }

    return {
      buffer,
      mimeType: file.mime_type,
      originalFileName: file.original_file_name,
    };
  }

  private async validateChangeSet(
    snapshot: ProfileSnapshot,
    requestType: ProfileChangeRequestTypeEnum,
    changes: Record<string, unknown>,
    existingRequestId: number | null,
    requestFiles: ProfileChangeRequestFile[] = [],
  ) {
    const errors: FieldValidationIssue[] = [];
    const warnings: FieldValidationIssue[] = [];
    const required_actions: string[] = [];
    const items: ChangeItemDraft[] = [];
    const changedFieldNames = Object.keys(changes);

    if (
      requestType !== ProfileChangeRequestTypeEnum.PROFILE_PHOTO &&
      changedFieldNames.length === 0
    ) {
      errors.push({
        field: 'changes',
        code: 'NO_CHANGES',
        message: 'At least one profile field change is required.',
      });
      return { errors, warnings, required_actions, items };
    }

    for (const fieldName of changedFieldNames) {
      const policy = this.policyService.getPolicy(fieldName);
      if (!policy.editable_by_employee) {
        errors.push({
          field: fieldName,
          code: 'FIELD_NOT_EDITABLE',
          message: `${policy.display_label} cannot be edited by the employee.`,
        });
        continue;
      }

      if (!policy.requires_approval) {
        errors.push({
          field: fieldName,
          code: 'FIELD_DOES_NOT_REQUIRE_APPROVAL',
          message: `${policy.display_label} is updated directly and does not belong in a profile change approval request.`,
        });
        continue;
      }
      if (
        !this.policyService.isFieldAllowedForRequestType(fieldName, requestType)
      ) {
        errors.push({
          field: fieldName,
          code: 'FIELD_NOT_ALLOWED_FOR_REQUEST_TYPE',
          message: `${policy.display_label} is not valid for ${requestType}.`,
        });
        continue;
      }

      const normalizedValue = this.normalizeIncomingFieldValue(
        policy,
        changes[fieldName],
      );
      const fieldErrors = await this.validateFieldValue(
        snapshot,
        policy,
        normalizedValue,
      );
      if (fieldErrors.length) {
        errors.push(
          ...fieldErrors.map((message) => ({
            field: fieldName,
            code: message.code,
            message: message.message,
          })),
        );
        continue;
      }

      const currentValue = this.getCurrentFieldValue(snapshot, fieldName);
      const oldValue = this.serializeValue(currentValue);
      const newValue = this.serializeValue(normalizedValue);

      if (oldValue === newValue) {
        warnings.push({
          field: fieldName,
          code: 'UNCHANGED_VALUE',
          message: `${policy.display_label} is unchanged and will be ignored.`,
        });
        continue;
      }

      items.push({
        fieldName,
        policy,
        oldValue,
        newValue,
        parsedNewValue: normalizedValue,
      });
    }

    if (requestType === ProfileChangeRequestTypeEnum.PROFILE_PHOTO) {
      if (
        items.length === 0 &&
        requestFiles.filter(
          (file) => file.status === ProfileChangeRequestFileStatusEnum.PENDING,
        ).length === 0
      ) {
        errors.push({
          field: 'profile_photo',
          code: 'PROFILE_PHOTO_REQUIRED',
          message:
            'A profile photo request must include a pending uploaded photo.',
        });
      }
    }

    if (items.length > 0) {
      const conflicts = await this.findActiveFieldConflicts(
        snapshot.membership.company_id,
        snapshot.employee.id,
        items.map((item) => item.fieldName),
        existingRequestId,
      );

      if (conflicts.length > 0) {
        conflicts.forEach((conflict) => {
          errors.push({
            field: conflict.fieldName,
            code: 'ACTIVE_REQUEST_CONFLICT',
            message: `${conflict.fieldName} is already part of active request ${conflict.referenceNumber}.`,
          });
        });
      }
    }

    return { errors, warnings, required_actions, items };
  }

  private async validateFieldValue(
    snapshot: ProfileSnapshot,
    policy: ProfileFieldPolicy,
    value: unknown,
  ): Promise<Array<{ code: string; message: string }>> {
    const issues: Array<{ code: string; message: string }> = [];

    for (const rule of policy.validation_rules) {
      if (
        rule === 'nullable' &&
        (value === null || value === undefined || value === '')
      ) {
        return issues;
      }

      if (
        rule === 'required' &&
        (value === null || value === undefined || value === '')
      ) {
        issues.push({
          code: 'REQUIRED',
          message: `${policy.display_label} is required.`,
        });
      }

      if (
        rule === 'string' &&
        value !== null &&
        value !== undefined &&
        typeof value !== 'string'
      ) {
        issues.push({
          code: 'INVALID_STRING',
          message: `${policy.display_label} must be a string.`,
        });
      }

      if (rule === 'phone' && value) {
        const phoneValue = this.serializeValue(value)?.trim() ?? '';
        if (!normalizeTanzaniaOrUgandaPhone(phoneValue)) {
          issues.push({
            code: 'INVALID_PHONE_NUMBER',
            message: `${policy.display_label} must be a valid Tanzanian (+255) or Ugandan (+256) phone number.`,
          });
        }
      }

      if (rule === 'email' && value) {
        const emailValue = this.serializeValue(value)?.trim() ?? '';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
          issues.push({
            code: 'INVALID_EMAIL',
            message: `${policy.display_label} has an invalid email format.`,
          });
        }
      }

      if (rule === 'date' && value) {
        const dateValue = this.serializeValue(value)?.trim() ?? '';
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(dateValue) ||
          Number.isNaN(Date.parse(dateValue))
        ) {
          issues.push({
            code: 'INVALID_DATE',
            message: `${policy.display_label} must be a valid date.`,
          });
        }
      }

      if (rule === 'past_or_today' && value) {
        const dateInput = this.serializeValue(value);
        const dateValue = new Date(dateInput ?? '');
        if (dateValue.getTime() > Date.now()) {
          issues.push({
            code: 'DATE_IN_FUTURE',
            message: `${policy.display_label} cannot be in the future.`,
          });
        }
      }

      if (rule.startsWith('max:') && value !== null && value !== undefined) {
        const maxLength = Number(rule.split(':')[1]);
        if ((this.serializeValue(value)?.length ?? 0) > maxLength) {
          issues.push({
            code: 'MAX_LENGTH_EXCEEDED',
            message: `${policy.display_label} exceeds the maximum allowed length of ${maxLength}.`,
          });
        }
      }

      if (
        rule === 'number' &&
        value !== null &&
        value !== undefined &&
        value !== ''
      ) {
        if (!Number.isInteger(Number(value))) {
          issues.push({
            code: 'INVALID_NUMBER',
            message: `${policy.display_label} must be a valid number.`,
          });
        }
      }

      if (rule.startsWith('enum:') && value) {
        const allowed = rule
          .split(':')[1]
          .split(',')
          .map((entry) => entry.trim().toLowerCase());
        const normalizedValue =
          this.serializeValue(value)?.trim().toLowerCase() ?? '';
        if (!allowed.includes(normalizedValue)) {
          issues.push({
            code: 'INVALID_ENUM_VALUE',
            message: `${policy.display_label} contains an unsupported value.`,
          });
        }
      }
    }

    if (
      policy.field_name === 'default_avatar_id' &&
      value !== null &&
      value !== undefined
    ) {
      try {
        await this.defaultAvatarsService.assertAvatarAvailableForEmployee(
          snapshot.membership.company_id,
          Number(value),
          snapshot.employee.gender,
        );
      } catch (error) {
        issues.push({
          code: 'INVALID_AVATAR',
          message:
            error instanceof Error
              ? error.message
              : 'The selected avatar is invalid for this employee.',
        });
      }
    }

    return issues;
  }

  private normalizeIncomingFieldValue(
    policy: ProfileFieldPolicy,
    value: unknown,
  ): unknown {
    if (value === undefined) {
      return value;
    }

    if (value === null) {
      return null;
    }

    if (policy.value_type === 'number') {
      if (value === '') {
        return null;
      }
      return Number(value);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed.length) {
        return null;
      }
      return trimmed;
    }

    return value;
  }

  private getCurrentFieldValue(
    snapshot: ProfileSnapshot,
    fieldName: string,
  ): unknown {
    switch (fieldName) {
      case 'first_name':
        return snapshot.user.first_name;
      case 'middle_name':
        return snapshot.employee.middle_name;
      case 'last_name':
        return snapshot.user.last_name;
      case 'preferred_name':
        return snapshot.employee.preferred_name;
      case 'gender':
        return snapshot.employee.gender;
      case 'date_of_birth':
        return snapshot.employee.date_of_birth;
      case 'marital_status':
        return snapshot.employee.marital_status;
      case 'nationality':
        return snapshot.employee.nationality;
      case 'phone':
        return snapshot.user.phone;
      case 'email':
        return snapshot.user.email;
      case 'personal_phone_number':
        return snapshot.primaryPersonalContact?.phone_number ?? null;
      case 'personal_email':
        return snapshot.primaryPersonalContact?.email ?? null;
      case 'address_line_1':
        return snapshot.primaryAddress?.address_line_1 ?? null;
      case 'address_line_2':
        return snapshot.primaryAddress?.address_line_2 ?? null;
      case 'city':
        return snapshot.primaryAddress?.city ?? null;
      case 'state':
        return snapshot.primaryAddress?.state ?? null;
      case 'country':
        return snapshot.primaryAddress?.country ?? null;
      case 'postal_code':
        return snapshot.primaryAddress?.postal_code ?? null;
      case 'emergency_contact_name':
        return snapshot.primaryEmergencyContact?.full_name ?? null;
      case 'emergency_contact_relationship':
        return snapshot.primaryEmergencyContact?.relationship ?? null;
      case 'emergency_contact_phone':
        return snapshot.primaryEmergencyContact?.phone ?? null;
      case 'emergency_contact_email':
        return snapshot.primaryEmergencyContact?.email ?? null;
      case 'emergency_contact_address':
        return snapshot.primaryEmergencyContact?.address ?? null;
      case 'emergency_contact_occupation':
        return snapshot.primaryEmergencyContact?.occupation ?? null;
      case 'default_avatar_id':
        return snapshot.employee.default_avatar_id;
      default:
        return null;
    }
  }

  private detectStaleConflicts(
    snapshot: ProfileSnapshot,
    items: ProfileChangeRequestItem[],
  ) {
    return items
      .map((item) => {
        const currentValue = this.serializeValue(
          this.getCurrentFieldValue(snapshot, item.field_name),
        );

        if (currentValue !== item.old_value) {
          return {
            field: item.field_name,
            currentValue,
            originalValue: item.old_value,
            proposedValue: item.new_value,
            message: `Current published value for ${item.field_label} has changed since this request was created.`,
          };
        }

        return null;
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }

  private async findActiveFieldConflicts(
    companyId: number,
    employeeId: number,
    fieldNames: string[],
    excludeRequestId: number | null,
  ) {
    if (!fieldNames.length) {
      return [];
    }

    const qb = this.itemRepository
      .createQueryBuilder('item')
      .innerJoin('item.request', 'request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', { employeeId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: ACTIVE_REQUEST_STATUSES,
      })
      .andWhere('request.deleted_at IS NULL')
      .andWhere('item.field_name IN (:...fieldNames)', { fieldNames });

    if (excludeRequestId) {
      qb.andWhere('request.id != :excludeRequestId', { excludeRequestId });
    }

    const conflicts = await qb
      .select([
        'item.field_name AS "fieldName"',
        'request.id AS "requestId"',
        'request.reference_number AS "referenceNumber"',
        'request.status AS "status"',
      ])
      .getRawMany<{
        fieldName: string;
        requestId: number;
        referenceNumber: string;
        status: ProfileChangeRequestStatusEnum;
      }>();

    return conflicts;
  }

  private async applyValidatedChanges(
    manager: DataSource['manager'],
    snapshot: ProfileSnapshot,
    items: ChangeItemDraft[],
  ) {
    const employee = snapshot.employee;
    const user = snapshot.user;
    const membership = snapshot.membership;
    let personalContact = snapshot.primaryPersonalContact;
    let primaryAddress = snapshot.primaryAddress;
    let primaryEmergencyContact = snapshot.primaryEmergencyContact;

    for (const item of items) {
      switch (item.fieldName) {
        case 'first_name':
          user.first_name =
            this.readNullableString(item.parsedNewValue) ?? user.first_name;
          employee.first_name = user.first_name;
          break;
        case 'middle_name':
          employee.middle_name = this.readNullableString(item.parsedNewValue);
          break;
        case 'last_name':
          user.last_name =
            this.readNullableString(item.parsedNewValue) ?? user.last_name;
          employee.last_name = user.last_name;
          break;
        case 'preferred_name':
          employee.preferred_name = this.readNullableString(
            item.parsedNewValue,
          );
          break;
        case 'gender':
          employee.gender =
            this.readNullableString(item.parsedNewValue) ?? employee.gender;
          break;
        case 'date_of_birth':
          employee.date_of_birth = this.readNullableString(item.parsedNewValue);
          break;
        case 'marital_status':
          employee.marital_status = this.readNullableString(
            item.parsedNewValue,
          );
          break;
        case 'nationality':
          employee.nationality = this.readNullableString(item.parsedNewValue);
          break;
        case 'phone':
          user.phone =
            this.readNullableString(item.parsedNewValue) ?? user.phone;
          break;
        case 'email':
          user.email =
            this.readNullableString(item.parsedNewValue) ?? user.email;
          break;
        case 'personal_phone_number':
        case 'personal_email':
          if (!personalContact) {
            personalContact = manager.getRepository(EmployeeContact).create({
              employee_id: employee.id,
              contact_type:
                snapshot.primaryPersonalContact?.contact_type ?? 'PERSONAL',
              is_primary: true,
              is_verified: false,
            } as Partial<EmployeeContact>);
          }
          if (item.fieldName === 'personal_phone_number') {
            personalContact.phone_number = this.readNullableString(
              item.parsedNewValue,
            );
          } else {
            personalContact.email = this.readNullableString(
              item.parsedNewValue,
            );
          }
          break;
        case 'address_line_1':
        case 'address_line_2':
        case 'city':
        case 'state':
        case 'country':
        case 'postal_code':
          if (!primaryAddress) {
            primaryAddress = manager.getRepository(EmployeeAddress).create({
              employee_id: employee.id,
              address_type: snapshot.primaryAddress?.address_type ?? 'HOME',
              is_primary: true,
            } as Partial<EmployeeAddress>);
          }
          (primaryAddress as unknown as Record<string, unknown>)[
            item.fieldName
          ] = this.readNullableString(item.parsedNewValue);
          break;
        case 'emergency_contact_name':
        case 'emergency_contact_relationship':
        case 'emergency_contact_phone':
        case 'emergency_contact_email':
        case 'emergency_contact_address':
        case 'emergency_contact_occupation':
          if (!primaryEmergencyContact) {
            primaryEmergencyContact = manager
              .getRepository(EmployeeRelative)
              .create({
                employee_id: employee.id,
                full_name: 'Emergency Contact',
                relationship: 'Emergency Contact',
                is_emergency_contact: true,
                is_primary: true,
              } as Partial<EmployeeRelative>);
          }
          switch (item.fieldName) {
            case 'emergency_contact_name':
              primaryEmergencyContact.full_name =
                this.readNullableString(item.parsedNewValue) ??
                primaryEmergencyContact.full_name;
              break;
            case 'emergency_contact_relationship':
              primaryEmergencyContact.relationship =
                this.readNullableString(item.parsedNewValue) ??
                primaryEmergencyContact.relationship;
              break;
            case 'emergency_contact_phone':
              primaryEmergencyContact.phone = this.readNullableString(
                item.parsedNewValue,
              );
              break;
            case 'emergency_contact_email':
              primaryEmergencyContact.email = this.readNullableString(
                item.parsedNewValue,
              );
              break;
            case 'emergency_contact_address':
              primaryEmergencyContact.address = this.readNullableString(
                item.parsedNewValue,
              );
              break;
            case 'emergency_contact_occupation':
              primaryEmergencyContact.occupation = this.readNullableString(
                item.parsedNewValue,
              );
              break;
          }
          break;
        case 'default_avatar_id': {
          const nextAvatarId =
            item.parsedNewValue === null || item.parsedNewValue === undefined
              ? null
              : Number(item.parsedNewValue);
          if (nextAvatarId === null) {
            employee.default_avatar_id = null;
            employee.default_avatar = null;
            employee.profile_image_source = employee.profile_photo_url
              ? ProfileImageSourceEnum.UPLOADED
              : null;
          } else {
            const selectedAvatar =
              await this.defaultAvatarsService.assertAvatarAvailableForEmployee(
                membership.company_id,
                nextAvatarId,
                employee.gender,
              );
            employee.default_avatar_id = selectedAvatar.id;
            employee.default_avatar = selectedAvatar;
            employee.profile_image_source =
              ProfileImageSourceEnum.DEFAULT_AVATAR;
          }
          break;
        }
      }
    }

    await manager.getRepository(User).save(user);
    await manager.getRepository(Employee).save(employee);

    if (personalContact) {
      personalContact.employee_id = employee.id;
      await manager.getRepository(EmployeeContact).save(personalContact);
    }

    if (primaryAddress) {
      primaryAddress.employee_id = employee.id;
      await manager.getRepository(EmployeeAddress).save(primaryAddress);
    }

    if (primaryEmergencyContact) {
      primaryEmergencyContact.employee_id = employee.id;
      await manager
        .getRepository(EmployeeRelative)
        .save(primaryEmergencyContact);
    }
  }

  private async promoteApprovedPendingFiles(
    manager: DataSource['manager'],
    snapshot: ProfileSnapshot,
    request: ProfileChangeRequest,
    actor: AuthenticatedUser,
    context?: RequestActorContext,
  ) {
    for (const file of request.files ?? []) {
      if (
        file.file_purpose !==
          ProfileChangeRequestFilePurposeEnum.PROPOSED_PROFILE_PHOTO ||
        file.status !== ProfileChangeRequestFileStatusEnum.PENDING
      ) {
        continue;
      }

      const buffer = await this.filesService.readManagedFile(file.file_path);
      if (!buffer) {
        throw new NotFoundException(
          `Pending file '${file.original_file_name}' could not be read.`,
        );
      }

      const storedPublicFile = await this.filesService.saveBufferFile({
        buffer,
        fileName: file.original_file_name,
        fileSize: file.file_size,
        mimeType: file.mime_type,
        directorySegments: [
          'profile-photos',
          `company-${snapshot.membership.company_id}`,
        ],
        fileNamePrefix: `employee-${snapshot.employee.id}`,
        allowedMimeTypes: this.profilePhotoAllowedMimeTypes,
      });

      snapshot.employee.profile_photo_url = storedPublicFile.publicPath;
      snapshot.employee.profile_image_source = snapshot.employee
        .default_avatar_id
        ? ProfileImageSourceEnum.DEFAULT_AVATAR
        : ProfileImageSourceEnum.UPLOADED;
      await manager.getRepository(Employee).save(snapshot.employee);

      await this.filesService.removeManagedFile(file.file_path);
      file.status = ProfileChangeRequestFileStatusEnum.APPROVED;
      file.storage_visibility = 'public';
      file.file_path = storedPublicFile.publicPath;
      file.stored_file_name = storedPublicFile.storedFileName;
      file.file_extension = storedPublicFile.fileExtension;
      file.file_size = storedPublicFile.fileSize;
      await manager.getRepository(ProfileChangeRequestFile).save(file);

      await this.createAuditWithManager(
        manager,
        request,
        ProfileChangeRequestAuditActionEnum.FILE_PROMOTED,
        actor,
        context,
        {
          original_file_name: file.original_file_name,
          promoted_file_path: storedPublicFile.publicPath,
        },
      );
    }
  }

  private async notifyReviewersOfSubmission(
    request: ProfileChangeRequest,
    actor: AuthenticatedUser,
    context?: RequestActorContext,
  ) {
    const reviewers = await this.findReviewerMemberships(
      request.company_id,
      request.employee_id,
      request.requested_by_user_id,
    );
    const employeeName = this.resolveRequestEmployeeName(request);
    const pendingPhotoFile = request.files?.find(
      (file) =>
        file.file_purpose ===
          ProfileChangeRequestFilePurposeEnum.PROPOSED_PROFILE_PHOTO &&
        file.status === ProfileChangeRequestFileStatusEnum.PENDING,
    );
    const isProfilePhotoRequest =
      request.request_type === ProfileChangeRequestTypeEnum.PROFILE_PHOTO;
    const title = isProfilePhotoRequest
      ? 'Profile Picture Approval Required'
      : 'Profile Change Review Required';
    const message = isProfilePhotoRequest
      ? `${employeeName} submitted a new profile picture for approval on ${this.formatNotificationDate(request.submitted_at ?? request.created_at)}.`
      : `${employeeName} submitted profile changes that need review.`;

    const tasks = reviewers.map(async (reviewer) => {
      try {
        await this.notificationsService.createAndPush({
          company_id: request.company_id,
          sender_company_user_id: actor.companyMembershipId ?? null,
          receiver_company_user_id: reviewer.id,
          type: NotificationTypeEnum.GENERAL,
          category: NotificationCategoryEnum.HR,
          priority: NotificationPriorityEnum.HIGH,
          title,
          message,
          related_module: 'profile_change_requests',
          entity_type: 'PROFILE_CHANGE_REQUEST',
          entity_id: request.id,
          branch_id: request.employee?.primary_branch_id ?? null,
          department_id: request.employee?.primary_department_id ?? null,
          action_url: `/hr/profile-change-requests/${request.id}`,
          metadata: {
            reference_number: request.reference_number,
            request_type: request.request_type,
            status: request.status,
            employee_id: request.employee_id,
            employee_no: request.employee?.employee_no ?? null,
            employee_name: employeeName,
            submitted_at: request.submitted_at ?? request.created_at,
            pending_profile_photo_file_id: pendingPhotoFile?.id ?? null,
          },
          dedupe_key: `profile-change-review:${request.id}:${reviewer.id}`,
        });
        await this.createAudit(
          request,
          ProfileChangeRequestAuditActionEnum.NOTIFICATION_CREATED,
          actor,
          context,
          {
            receiver_company_user_id: reviewer.id,
            notification_type: 'submission_review_required',
          },
        );
      } catch (error) {
        await this.createAudit(
          request,
          ProfileChangeRequestAuditActionEnum.NOTIFICATION_FAILED,
          actor,
          context,
          {
            receiver_company_user_id: reviewer.id,
            notification_type: 'submission_review_required',
            error:
              error instanceof Error
                ? error.message
                : 'Unknown notification error',
          },
        );
      }
    });

    await Promise.all(tasks);

    await this.notifyRequester(
      request,
      actor,
      {
        title: 'Profile Change Request Submitted',
        message: `Your profile change request ${request.reference_number} has been submitted for review.`,
        type: NotificationTypeEnum.GENERAL,
      },
      context,
    );
  }

  private async notifyRequester(
    request: ProfileChangeRequest,
    actor: AuthenticatedUser,
    notification: {
      title: string;
      message: string;
      type: NotificationTypeEnum;
    },
    context?: RequestActorContext,
  ) {
    const requesterMembership = await this.companyUserRepository.findOne({
      where: {
        company_id: request.company_id,
        user_id: request.requested_by_user_id,
      },
    });

    if (!requesterMembership) {
      return;
    }

    try {
      await this.notificationsService.createAndPush({
        company_id: request.company_id,
        sender_company_user_id: actor.companyMembershipId ?? null,
        receiver_company_user_id: requesterMembership.id,
        type: notification.type,
        category: NotificationCategoryEnum.HR,
        priority: NotificationPriorityEnum.MEDIUM,
        title: notification.title,
        message: notification.message,
        related_module: 'profile_change_requests',
        entity_type: 'PROFILE_CHANGE_REQUEST',
        entity_id: request.id,
        action_url: `/me/profile-change-requests/${request.id}`,
        metadata: {
          reference_number: request.reference_number,
          request_type: request.request_type,
          status: request.status,
          rejection_reason: request.rejection_reason ?? null,
          correction_instructions: request.correction_instructions ?? null,
        },
        dedupe_key: `profile-change-requester:${request.id}:${requesterMembership.id}:${request.status}`,
      });
      await this.createAudit(
        request,
        ProfileChangeRequestAuditActionEnum.NOTIFICATION_CREATED,
        actor,
        context,
        {
          receiver_company_user_id: requesterMembership.id,
          notification_type: notification.title,
        },
      );
    } catch (error) {
      await this.createAudit(
        request,
        ProfileChangeRequestAuditActionEnum.NOTIFICATION_FAILED,
        actor,
        context,
        {
          receiver_company_user_id: requesterMembership.id,
          notification_type: notification.title,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown notification error',
        },
      );
    }
  }

  private async findReviewerMemberships(
    companyId: number,
    employeeId: number,
    excludeUserId: number,
  ) {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      select: ['primary_branch_id'],
    });

    const memberships = await this.companyUserRepository.find({
      where: {
        company_id: companyId,
        status: 'active',
        user_id: Not(excludeUserId),
      },
      relations: {
        user: true,
        role_assignments: {
          role: {
            permissions: true,
          },
        },
        permission_assignments: {
          permission: true,
        },
        branch_accesses: true,
      },
    });

    const requiredPermissions = [
      'profile_change_request.review',
      'profile_change_request.approve',
      'profile_change_request.reject',
      'profile_change_request.request_correction',
    ];

    return memberships.filter((membership) => {
      const permissionNames = new Set<string>();
      membership.permission_assignments?.forEach((assignment) => {
        if (assignment.permission?.name) {
          permissionNames.add(assignment.permission.name);
        }
      });
      membership.role_assignments?.forEach((assignment) => {
        assignment.role?.permissions?.forEach((permission) => {
          if (permission?.name) {
            permissionNames.add(permission.name);
          }
        });
      });

      const hasReviewerAccess = requiredPermissions.some((permission) =>
        hasPermission(Array.from(permissionNames), permission),
      );

      if (!hasReviewerAccess) {
        return false;
      }

      if (
        !employee?.primary_branch_id ||
        membership.branch_accesses.length === 0
      ) {
        return true;
      }

      return membership.branch_accesses.some(
        (assignment) => assignment.branch_id === employee.primary_branch_id,
      );
    });
  }

  private async assertReviewerCanAccessRequest(
    actor: AuthenticatedUser,
    request: ProfileChangeRequest,
  ) {
    const permissions = actor.permissions ?? [];
    const required =
      hasPermission(permissions, 'profile_change_request.review') ||
      hasPermission(permissions, 'profile_change_request.approve') ||
      hasPermission(permissions, 'profile_change_request.reject') ||
      hasPermission(permissions, 'profile_change_request.request_correction') ||
      actor.roles.includes('COMPANY_ADMIN');

    if (!required) {
      throw new ForbiddenException(
        'You do not have permission to review profile change requests.',
      );
    }

    if (request.company_id !== actor.companyId) {
      throw new ForbiddenException(
        'You cannot access profile change requests outside your active company.',
      );
    }

    if (!request.employee) {
      const employee = await this.employeeRepository.findOne({
        where: { id: request.employee_id },
        relations: {
          primary_department: true,
          primary_position: true,
          department_assignments: {
            department: true,
          },
        },
      });
      if (!employee) {
        throw new NotFoundException('Employee not found.');
      }
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
      return;
    }

    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);
  }

  private async requireOwnSnapshot(
    actor: AuthenticatedUser,
  ): Promise<ProfileSnapshot> {
    if (!actor.companyId || !actor.companyMembershipId) {
      throw new ForbiddenException('Active company context is required.');
    }

    const membership = await this.companyUserRepository.findOne({
      where: {
        id: actor.companyMembershipId,
        company_id: actor.companyId,
        user_id: actor.id,
        status: 'active',
      },
      relations: {
        user: true,
        employee: {
          default_avatar: true,
          contacts: true,
          addresses: true,
          relatives: true,
          primary_branch: true,
          primary_department: true,
        },
      },
    });

    if (!membership?.employee || !membership.user) {
      throw new NotFoundException('Employee profile not found.');
    }

    return this.buildSnapshotFromLoadedEmployee(
      membership.employee,
      membership,
      membership.user,
    );
  }

  private buildSnapshotFromLoadedEmployee(
    employee: Employee,
    membership: CompanyUser,
    user: User,
  ): ProfileSnapshot {
    const primaryPersonalContact =
      [...(employee.contacts ?? [])]
        .filter(
          (contact) =>
            String(contact.contact_type).toUpperCase() === 'PERSONAL',
        )
        .sort(
          (left, right) => Number(right.is_primary) - Number(left.is_primary),
        )[0] ?? null;
    const primaryAddress =
      [...(employee.addresses ?? [])].sort(
        (left, right) => Number(right.is_primary) - Number(left.is_primary),
      )[0] ?? null;
    const primaryEmergencyContact =
      [...(employee.relatives ?? [])]
        .filter((relative) => relative.is_emergency_contact)
        .sort(
          (left, right) => Number(right.is_primary) - Number(left.is_primary),
        )[0] ?? null;

    return {
      employee,
      membership,
      user,
      primaryPersonalContact,
      primaryAddress,
      primaryEmergencyContact,
    };
  }

  private async findRequestOrFail(id: number, companyId: number) {
    const request = await this.requestRepository.findOne({
      where: {
        id,
        company_id: companyId,
      },
      relations: {
        items: true,
        files: true,
        audits: true,
        employee: {
          company_user: { user: true },
          contacts: true,
          addresses: true,
          relatives: true,
          primary_branch: true,
          primary_department: true,
          primary_position: true,
          department_assignments: {
            department: true,
          },
        },
      },
    });

    if (!request) {
      throw new NotFoundException('Profile change request not found.');
    }

    return request;
  }

  private rehydrateChangesFromItems(items: ProfileChangeRequestItem[]) {
    return items.reduce<Record<string, unknown>>((acc, item) => {
      acc[item.field_name] = this.deserializeValue(
        item.new_value,
        item.value_type,
      );
      return acc;
    }, {});
  }

  private deserializeValue(value: string | null, valueType: string): unknown {
    if (value === null) {
      return null;
    }

    switch (valueType) {
      case 'number':
        return Number(value);
      default:
        return value;
    }
  }

  private serializeValue(value: unknown): string | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    return JSON.stringify(value);
  }

  private readNullableString(value: unknown): string | null {
    const normalized = this.serializeValue(value)?.trim() ?? '';
    return normalized.length ? normalized : null;
  }

  private readScalarString(value: unknown): string {
    if (value instanceof Date) {
      return value.toISOString().trim();
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value).trim();
    }

    return '';
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    return value as Record<string, unknown>;
  }

  private buildReferenceNumber() {
    return `PCR-${new Date().getUTCFullYear()}-${Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase()}`;
  }

  private async supersedeActiveProfilePhotoRequestsWithManager(
    manager: DataSource['manager'],
    snapshot: ProfileSnapshot,
    replacementRequest: ProfileChangeRequest,
    actor: AuthenticatedUser,
    context?: RequestActorContext,
  ) {
    const activeRequests = await manager
      .getRepository(ProfileChangeRequest)
      .find({
        where: {
          company_id: snapshot.membership.company_id,
          employee_id: snapshot.employee.id,
          request_type: ProfileChangeRequestTypeEnum.PROFILE_PHOTO,
          status: In(ACTIVE_REQUEST_STATUSES),
          deleted_at: IsNull(),
        },
        relations: {
          files: true,
          employee: true,
        },
      });

    for (const request of activeRequests) {
      if (request.id === replacementRequest.id) {
        continue;
      }

      const previousStatus = request.status;
      request.status = ProfileChangeRequestStatusEnum.SUPERSEDED;
      request.review_comment =
        'Superseded by a newer profile picture submission.';
      request.metadata = {
        ...this.toObject(request.metadata),
        superseded_by_request_id: replacementRequest.id,
        superseded_by_reference_number: replacementRequest.reference_number,
      };
      await manager.getRepository(ProfileChangeRequest).save(request);

      await this.createAuditWithManager(
        manager,
        request,
        ProfileChangeRequestAuditActionEnum.REQUEST_SUPERSEDED,
        actor,
        context,
        {
          superseded_by_request_id: replacementRequest.id,
          superseded_by_reference_number: replacementRequest.reference_number,
        },
        previousStatus,
        request.status,
      );

      for (const file of request.files ?? []) {
        if (file.status !== ProfileChangeRequestFileStatusEnum.PENDING) {
          continue;
        }

        await this.filesService.removeManagedFile(file.file_path);
        file.status = ProfileChangeRequestFileStatusEnum.REMOVED;
        await manager.getRepository(ProfileChangeRequestFile).save(file);
        await this.createAuditWithManager(
          manager,
          request,
          ProfileChangeRequestAuditActionEnum.PENDING_FILE_REMOVED,
          actor,
          context,
          {
            file_id: file.id,
            original_file_name: file.original_file_name,
            reason: 'Superseded by a newer profile picture submission.',
          },
          request.status,
          request.status,
        );
      }
    }
  }

  private resolveRequestEmployeeName(request: ProfileChangeRequest) {
    const firstName =
      request.employee?.company_user?.user?.first_name ??
      request.employee?.first_name;
    const lastName =
      request.employee?.company_user?.user?.last_name ??
      request.employee?.last_name;
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();

    return fullName || request.employee?.employee_no || 'An employee';
  }

  private formatNotificationDate(value: Date | null | undefined) {
    if (!value) {
      return 'an unknown date';
    }

    try {
      return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(value);
    } catch {
      return value.toISOString();
    }
  }

  private async createAudit(
    request: ProfileChangeRequest,
    action: ProfileChangeRequestAuditActionEnum,
    actor: AuthenticatedUser,
    context?: RequestActorContext,
    metadata?: Record<string, unknown> | null,
    previousStatus?: ProfileChangeRequestStatusEnum | null,
    newStatus?: ProfileChangeRequestStatusEnum | null,
  ) {
    await this.createAuditWithManager(
      this.dataSource.manager,
      request,
      action,
      actor,
      context,
      metadata,
      previousStatus,
      newStatus,
    );
  }

  private async createAuditWithManager(
    manager: DataSource['manager'],
    request: ProfileChangeRequest,
    action: ProfileChangeRequestAuditActionEnum,
    actor: AuthenticatedUser,
    context?: RequestActorContext,
    metadata?: Record<string, unknown> | null,
    previousStatus?: ProfileChangeRequestStatusEnum | null,
    newStatus?: ProfileChangeRequestStatusEnum | null,
  ) {
    await manager.getRepository(ProfileChangeRequestAudit).save(
      manager.getRepository(ProfileChangeRequestAudit).create({
        request_id: request.id,
        employee_id: request.employee_id,
        company_id: request.company_id,
        branch_id: request.employee?.primary_branch_id ?? null,
        action,
        previous_status: previousStatus ?? null,
        new_status: newStatus ?? null,
        actor_user_id: actor.id,
        actor_employee_id: actor.employeeId ?? null,
        actor_role: actor.roles[0] ?? null,
        ip_address: context?.ipAddress ?? null,
        user_agent: context?.userAgent ?? null,
        request_id_header: context?.requestIdHeader ?? null,
        metadata: metadata ?? null,
      }),
    );
  }

  private mapRequest(
    request: ProfileChangeRequest,
    includeReviewerView = false,
  ) {
    return {
      id: request.id,
      reference_number: request.reference_number,
      company_id: request.company_id,
      employee_id: request.employee_id,
      requested_by_user_id: request.requested_by_user_id,
      request_type: request.request_type,
      status: request.status,
      reason: request.reason,
      review_comment: request.review_comment,
      rejection_reason: request.rejection_reason,
      correction_instructions: request.correction_instructions,
      submitted_at: request.submitted_at,
      review_started_at: request.review_started_at,
      reviewed_by_user_id: request.reviewed_by_user_id,
      reviewed_at: request.reviewed_at,
      approved_at: request.approved_at,
      rejected_at: request.rejected_at,
      cancelled_at: request.cancelled_at,
      correction_requested_at: request.correction_requested_at,
      version: request.version,
      metadata: request.metadata,
      created_at: request.created_at,
      updated_at: request.updated_at,
      employee: request.employee
        ? {
            id: request.employee.id,
            employee_no: request.employee.employee_no,
            first_name: request.employee.first_name,
            last_name: request.employee.last_name,
            primary_branch_id: request.employee.primary_branch_id,
            primary_department_id: request.employee.primary_department_id,
            branch: request.employee.primary_branch
              ? {
                  id: request.employee.primary_branch.id,
                  name: request.employee.primary_branch.name,
                }
              : null,
            department: request.employee.primary_department
              ? {
                  id: request.employee.primary_department.id,
                  name: request.employee.primary_department.name,
                }
              : null,
            user: includeReviewerView
              ? {
                  id: request.employee.company_user?.user?.id ?? null,
                  email: request.employee.company_user?.user?.email ?? null,
                }
              : undefined,
          }
        : null,
      items: (request.items ?? []).map((item) => ({
        id: item.id,
        field_name: item.field_name,
        field_label: item.field_label,
        source_entity: item.source_entity,
        old_value: item.old_value,
        new_value: item.new_value,
        value_type: item.value_type,
        status: item.status,
        validation_status: item.validation_status,
        validation_errors: item.validation_errors,
        review_comment: item.review_comment,
        reviewed_by_user_id: item.reviewed_by_user_id,
        reviewed_at: item.reviewed_at,
        sensitive: item.sensitive,
      })),
      files: (request.files ?? []).map((file) => ({
        id: file.id,
        file_purpose: file.file_purpose,
        status: file.status,
        original_file_name: file.original_file_name,
        mime_type: file.mime_type,
        file_size: file.file_size,
        width: file.width,
        height: file.height,
        preview_url:
          file.storage_visibility === 'private' ? null : file.file_path,
      })),
      history_count: request.audits?.length ?? 0,
    };
  }

  private mapAuditHistory(audits: ProfileChangeRequestAudit[]) {
    return audits
      .slice()
      .sort(
        (left, right) => left.created_at.getTime() - right.created_at.getTime(),
      )
      .map((audit) => ({
        id: audit.id,
        action: audit.action,
        previous_status: audit.previous_status,
        new_status: audit.new_status,
        actor_user_id: audit.actor_user_id,
        actor_employee_id: audit.actor_employee_id,
        actor_role: audit.actor_role,
        ip_address: audit.ip_address,
        user_agent: audit.user_agent,
        request_id_header: audit.request_id_header,
        metadata: audit.metadata,
        created_at: audit.created_at,
      }));
  }

  private buildPaginationMeta(page: number, limit: number, total: number) {
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_previous_page: page > 1,
    };
  }
}
