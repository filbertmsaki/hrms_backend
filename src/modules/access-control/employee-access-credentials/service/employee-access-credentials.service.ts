import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { CredentialStatusActionDto } from '../dto/credential-status-action.dto';
import {
  CredentialSortDirection,
  QueryEmployeeAccessCredentialDto,
} from '../dto/query-employee-access-credential.dto';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { AttendanceDevice } from '../../../access-control/attendance-devices/entities/attendance-device.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { HikvisionUserManagementService } from '../../../hikvision/hikvision-user-management.service';
import { EmployeeDeviceAssignment } from '../../employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeAccessCredential } from '../entity/employee-access-credential.entity';
import { EmployeeAccessCredentialStatusEnum } from '../enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialTypeEnum } from '../enum/employee-access-credential-type.enum';

type EmployeeAccessCredentialInput = {
  credential_type?: EmployeeAccessCredentialTypeEnum;
  credential_no?: string | null;
  device_id?: number | null;
  card_no?: string | null;
  pin_password?: string | null;
  fingerprint_count?: number;
  face_count?: number;
  has_fingerprint?: boolean;
  has_face?: boolean;
  credential_status?: EmployeeAccessCredentialStatusEnum;
  metadata?: Record<string, unknown>;
  user_verify_mode?: string;
};

@Injectable()
export class EmployeeAccessCredentialsService {
  constructor(
    @InjectRepository(EmployeeAccessCredential)
    private readonly credentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceDevice)
    private readonly attendanceDeviceRepository: Repository<AttendanceDevice>,
    @InjectRepository(EmployeeDeviceAssignment)
    private readonly employeeDeviceAssignmentRepository: Repository<EmployeeDeviceAssignment>,
    private readonly hikvisionUserManagementService: HikvisionUserManagementService,
  ) {}

  async createOrReplace(
    companyId: number,
    employeeId: number,
    dto: EmployeeAccessCredentialInput,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);

    const resolvedDeviceId = await this.resolveAndValidateDeviceId(
      companyId,
      employee.id,
      dto.device_id ?? null,
    );
    const credentialType =
      dto.credential_type ?? EmployeeAccessCredentialTypeEnum.CARD;

    let item = await this.credentialRepository.findOne({
      where: {
        companyId,
        employeeId,
        deviceId: resolvedDeviceId ?? IsNull(),
        credentialType,
      },
    });

    if (!item) {
      item = this.credentialRepository.create({
        companyId,
        employeeId,
        deviceId: resolvedDeviceId,
        credentialType,
      });
    }

    item.employeeNo = await this.resolveCredentialEmployeeNo(
      companyId,
      employee.id,
      resolvedDeviceId,
      item.employeeNo,
      employee.employee_no,
    );
    item.deviceId = resolvedDeviceId;
    item.credentialType = credentialType;
    item.credentialNo = dto.credential_no ?? item.credentialNo ?? null;
    item.credentialStatus =
      dto.credential_status ?? item.credentialStatus ?? 'ACTIVE';
    item.cardNo = dto.card_no?.trim() || null;
    if (dto.pin_password !== undefined) {
      item.passwordSet = Boolean(dto.pin_password?.trim());
      item.pinPassword = dto.pin_password?.trim() || null;
    }
    item.fingerprintCount = dto.fingerprint_count ?? 0;
    item.faceCount = dto.face_count ?? 0;
    item.hasFingerprint = dto.has_fingerprint ?? item.fingerprintCount > 0;
    item.hasFace = dto.has_face ?? item.faceCount > 0;
    item.metadata = await this.resolveCredentialMetadata(
      companyId,
      resolvedDeviceId,
      credentialType,
      dto.user_verify_mode,
      dto.metadata ?? item.metadata ?? null,
    );

    return this.map(await this.credentialRepository.save(item));
  }

  async update(
    companyId: number,
    employeeId: number,
    dto: Partial<EmployeeAccessCredentialInput>,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const item = await this.credentialRepository.findOne({
      where: { companyId, employeeId },
    });

    if (!item) {
      throw new NotFoundException('Employee access credentials not found');
    }

    const resolvedDeviceId = await this.resolveAndValidateDeviceId(
      companyId,
      employee.id,
      dto.device_id ?? item.deviceId ?? null,
    );

    item.employeeNo = await this.resolveCredentialEmployeeNo(
      companyId,
      employee.id,
      resolvedDeviceId,
      item.employeeNo,
      employee.employee_no,
    );
    item.deviceId = resolvedDeviceId;
    if (dto.credential_type !== undefined)
      item.credentialType = dto.credential_type;
    if (dto.credential_no !== undefined)
      item.credentialNo = dto.credential_no ?? null;
    if (dto.credential_status !== undefined)
      item.credentialStatus = dto.credential_status;
    if (dto.card_no !== undefined) item.cardNo = dto.card_no?.trim() || null;
    if (dto.pin_password !== undefined) {
      item.passwordSet = Boolean(dto.pin_password?.trim());
      item.pinPassword = dto.pin_password?.trim() || null;
    }
    if (dto.fingerprint_count !== undefined)
      item.fingerprintCount = dto.fingerprint_count;
    if (dto.face_count !== undefined) item.faceCount = dto.face_count;
    if (dto.has_fingerprint !== undefined)
      item.hasFingerprint = dto.has_fingerprint;
    if (dto.has_face !== undefined) item.hasFace = dto.has_face;
    item.metadata = await this.resolveCredentialMetadata(
      companyId,
      resolvedDeviceId,
      item.credentialType,
      dto.user_verify_mode,
      dto.metadata !== undefined ? dto.metadata : item.metadata,
    );

    if (
      dto.has_fingerprint === undefined &&
      dto.fingerprint_count !== undefined
    ) {
      item.hasFingerprint = dto.fingerprint_count > 0;
    }

    if (dto.has_face === undefined && dto.face_count !== undefined) {
      item.hasFace = dto.face_count > 0;
    }

    return this.map(await this.credentialRepository.save(item));
  }

  async findOne(companyId: number, employeeId: number) {
    await this.findEmployeeOrFail(companyId, employeeId);
    const item = await this.credentialRepository.findOne({
      where: { companyId, employeeId },
    });

    if (!item) {
      throw new NotFoundException('Employee access credentials not found');
    }

    return this.map(item);
  }

  async findAll(companyId: number, query: QueryEmployeeAccessCredentialDto) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    const sortOrder = query.sort_order ?? CredentialSortDirection.DESC;

    const qb = this.credentialRepository
      .createQueryBuilder('credential')
      .leftJoinAndSelect('credential.employee', 'employee')
      .leftJoinAndSelect('credential.device', 'device')
      .where('credential.company_id = :companyId', { companyId });

    if (query.employee_id) {
      qb.andWhere('credential.employee_id = :employeeId', {
        employeeId: query.employee_id,
      });
    }

    if (query.device_id) {
      qb.andWhere('credential.device_id = :deviceId', {
        deviceId: query.device_id,
      });
    }

    if (query.credential_type) {
      qb.andWhere('credential.credential_type = :credentialType', {
        credentialType: query.credential_type,
      });
    }

    if (query.credential_status) {
      qb.andWhere('credential.credential_status = :credentialStatus', {
        credentialStatus: query.credential_status,
      });
    }

    if (query.employee_no?.trim()) {
      qb.andWhere('credential.employee_no = :employeeNo', {
        employeeNo: query.employee_no.trim(),
      });
    }

    if (query.card_no?.trim()) {
      qb.andWhere('credential.card_no = :cardNo', {
        cardNo: query.card_no.trim(),
      });
    }

    if (query.fingerprint_id?.trim()) {
      qb.andWhere('credential.fingerprint_id = :fingerprintId', {
        fingerprintId: query.fingerprint_id.trim(),
      });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim().toLowerCase()}%`;

      qb.andWhere(
        new Brackets((where) => {
          where
            .where("LOWER(COALESCE(credential.employee_no, '')) LIKE :search", {
              search,
            })
            .orWhere(
              "LOWER(COALESCE(credential.credential_no, '')) LIKE :search",
              { search },
            )
            .orWhere("LOWER(COALESCE(credential.card_no, '')) LIKE :search", {
              search,
            })
            .orWhere(
              "LOWER(COALESCE(credential.fingerprint_id, '')) LIKE :search",
              { search },
            )
            .orWhere("LOWER(COALESCE(credential.face_id, '')) LIKE :search", {
              search,
            });
        }),
      );
    }

    const [items, total] = await qb
      .orderBy('credential.createdAt', sortOrder)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapSafeCredential(item)),
      meta: this.buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findAllForEmployee(
    companyId: number,
    employeeId: number,
    query: QueryEmployeeAccessCredentialDto,
  ) {
    return this.findAll(companyId, { ...query, employee_id: employeeId });
  }

  async findById(companyId: number, credentialId: number) {
    const credential = await this.findCredentialOrFail(companyId, credentialId);

    return this.mapSafeCredential(credential);
  }

  async enable(
    companyId: number,
    credentialId: number,
    dto: CredentialStatusActionDto = {},
  ) {
    return this.updateBackendCredentialLifecycle(companyId, credentialId, {
      backendLifecycleStatus: 'ACTIVE',
      credentialStatus: EmployeeAccessCredentialStatusEnum.ACTIVE,
      reason: dto.reason,
      metadata: dto.metadata,
    });
  }

  async disable(
    companyId: number,
    credentialId: number,
    dto: CredentialStatusActionDto = {},
  ) {
    return this.updateBackendCredentialLifecycle(companyId, credentialId, {
      backendLifecycleStatus: 'DISABLED',
      credentialStatus: EmployeeAccessCredentialStatusEnum.INACTIVE,
      reason: dto.reason,
      metadata: dto.metadata,
    });
  }

  async markLost(
    companyId: number,
    credentialId: number,
    dto: CredentialStatusActionDto = {},
  ) {
    return this.updateBackendCredentialLifecycle(companyId, credentialId, {
      backendLifecycleStatus: 'LOST',
      credentialStatus: EmployeeAccessCredentialStatusEnum.INACTIVE,
      reason: dto.reason ?? 'Credential marked as lost.',
      metadata: dto.metadata,
    });
  }

  async block(
    companyId: number,
    credentialId: number,
    dto: CredentialStatusActionDto = {},
  ) {
    return this.updateBackendCredentialLifecycle(companyId, credentialId, {
      backendLifecycleStatus: 'BLOCKED',
      credentialStatus: EmployeeAccessCredentialStatusEnum.INACTIVE,
      reason: dto.reason ?? 'Credential blocked.',
      metadata: dto.metadata,
    });
  }

  async revoke(
    companyId: number,
    credentialId: number,
    dto: CredentialStatusActionDto = {},
  ) {
    return this.updateBackendCredentialLifecycle(companyId, credentialId, {
      backendLifecycleStatus: 'REVOKED',
      credentialStatus: EmployeeAccessCredentialStatusEnum.INACTIVE,
      reason:
        dto.reason ??
        'Credential revoked in backend. Remove it from the device using the device-specific API.',
      metadata: dto.metadata,
    });
  }

  async getDeviceActionRoutes(companyId: number, credentialId: number) {
    const credential = await this.findCredentialOrFail(companyId, credentialId);

    const employeeId = credential.employeeId;
    const deviceId = credential.deviceId;
    const fingerprintId = credential.fingerprintId;
    const credentialType = credential.credentialType;

    if (!employeeId || !deviceId) {
      return {
        credential: this.mapSafeCredential(credential),
        message:
          'This credential is not linked to both an employee and a device, so device action routes cannot be generated.',
        routes: null,
      };
    }

    return {
      credential: this.mapSafeCredential(credential),
      message:
        'Use these existing device-specific APIs for device operations. Generic credential APIs only manage backend lifecycle/status.',
      routes: {
        fingerprints:
          credentialType === EmployeeAccessCredentialTypeEnum.FINGERPRINT
            ? {
                list: `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/fingerprints`,
                create: `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/fingerprints`,
                capture: `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/fingerprints/capture`,
                update: fingerprintId
                  ? `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/fingerprints/${fingerprintId}`
                  : null,
                delete: fingerprintId
                  ? `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/fingerprints/${fingerprintId}`
                  : null,
              }
            : null,
        password:
          credentialType === EmployeeAccessCredentialTypeEnum.PASSWORD ||
          credentialType === EmployeeAccessCredentialTypeEnum.PIN
            ? {
                create: `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/password`,
                update: `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/password`,
                delete: `/api/access-control/employees/${employeeId}/devices/${deviceId}/users/password`,
              }
            : null,
        card:
          credentialType === EmployeeAccessCredentialTypeEnum.CARD
            ? {
                message:
                  'Use existing card-specific employee-device API if implemented.',
              }
            : null,
      },
    };
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
  ): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(
        CompanyUser,
        'companyUser',
        'companyUser.id = employee.company_user_id',
      )
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .select(['employee.id', 'employee.employee_no'])
      .getOne();

    if (!employee) {
      throw new NotFoundException('Employee not found for active company');
    }

    return employee;
  }

  private map(item: EmployeeAccessCredential) {
    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      device_id: item.deviceId,
      credential_type: item.credentialType,
      credential_no: item.credentialNo,
      credential_status: item.credentialStatus,
      card_no: item.cardNo,
      pin_password: null,
      password_set: item.passwordSet,
      fingerprint_count: item.fingerprintCount,
      face_count: item.faceCount,
      has_fingerprint: item.hasFingerprint,
      has_face: item.hasFace,
      user_verify_mode: this.extractCredentialUserVerifyMode(item),
      metadata: this.maskSensitivePayload(item.metadata),
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private maskSensitivePayload<T>(payload: T): T {
    if (payload === null || payload === undefined) {
      return payload;
    }

    const sensitiveKeys = new Set([
      'api_password',
      'password',
      'pin_password',
      'encrypted_fingerprint_template',
      'fingerprintdata',
      'fingerdata',
      'finger_data',
      'biometricdata',
      'face_data',
      'raw_biometric_data',
      'fingertemplate',
    ]);

    const recurse = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map((item) => recurse(item));
      if (!value || typeof value !== 'object') return value;

      const output: Record<string, unknown> = {};
      for (const [key, raw] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (sensitiveKeys.has(key.toLowerCase())) {
          output[key] = '***MASKED***';
          continue;
        }
        output[key] = recurse(raw);
      }
      return output;
    };

    return recurse(payload) as T;
  }

  private async resolveAndValidateDeviceId(
    companyId: number,
    employeeId: number,
    requestedDeviceId: number | null,
  ): Promise<number | null> {
    let deviceId = requestedDeviceId;

    if (!deviceId) {
      const assignment = await this.employeeDeviceAssignmentRepository.findOne({
        where: { companyId, employeeId },
        select: ['deviceId'],
      });
      deviceId = assignment?.deviceId ?? null;
    }

    if (!deviceId) {
      return null;
    }

    const device = await this.attendanceDeviceRepository.findOne({
      where: { id: deviceId, companyId },
      select: ['id'],
    });

    if (!device) {
      throw new BadRequestException(
        `device_id ${deviceId} does not exist for this company. Assign employee to a valid device first.`,
      );
    }

    return deviceId;
  }

  private async resolveCredentialEmployeeNo(
    companyId: number,
    employeeId: number,
    deviceId: number | null,
    currentEmployeeNo: string | null | undefined,
    fallbackEmployeeNo: string,
  ): Promise<string> {
    if (deviceId !== null) {
      const assignment = await this.employeeDeviceAssignmentRepository.findOne({
        where: { companyId, employeeId, deviceId },
        select: ['employeeNo'],
      });
      if (assignment?.employeeNo?.trim()) {
        return assignment.employeeNo.trim();
      }
    }

    const current = currentEmployeeNo?.trim();
    if (current) {
      return current;
    }

    return fallbackEmployeeNo.trim();
  }

  private async resolveCredentialMetadata(
    companyId: number,
    deviceId: number | null,
    credentialType: EmployeeAccessCredentialTypeEnum,
    explicitUserVerifyMode: string | null | undefined,
    metadata: Record<string, unknown> | null,
  ) {
    const baseMetadata = this.toObject(metadata);
    const hikvisionMetadata = this.toObject(baseMetadata.hikvision);
    const currentUserVerifyMode = this.toNullableString(
      explicitUserVerifyMode ?? hikvisionMetadata.user_verify_mode,
    );

    if (!deviceId && currentUserVerifyMode) {
      throw new BadRequestException(
        'device_id or an existing employee-device assignment is required to validate user_verify_mode',
      );
    }

    let resolvedUserVerifyMode = currentUserVerifyMode;
    if (deviceId) {
      resolvedUserVerifyMode =
        await this.hikvisionUserManagementService.resolveSupportedUserVerifyMode(
          companyId,
          deviceId,
          currentUserVerifyMode,
          this.buildCredentialUserVerifyModeCandidates(credentialType),
          'employee access credential',
        );
    }

    return {
      ...baseMetadata,
      hikvision: {
        ...hikvisionMetadata,
        user_verify_mode: resolvedUserVerifyMode,
      },
    };
  }

  private buildCredentialUserVerifyModeCandidates(
    credentialType: EmployeeAccessCredentialTypeEnum,
  ): string[] {
    switch (credentialType) {
      case EmployeeAccessCredentialTypeEnum.PASSWORD:
      case EmployeeAccessCredentialTypeEnum.PIN:
        return ['cardOrFpOrPw', 'cardAndPw', 'fpAndPw', 'fpAndCardAndPw'];
      case EmployeeAccessCredentialTypeEnum.CARD:
        return [
          'cardOrFpOrPw',
          'cardAndPw',
          'fpAndCard',
          'fpAndCardAndPw',
          'fpOrCard',
          'card',
        ];
      case EmployeeAccessCredentialTypeEnum.FINGERPRINT:
        return [
          'cardOrFpOrPw',
          'fpAndPw',
          'fpAndCard',
          'fpAndCardAndPw',
          'fpOrCard',
          'fp',
        ];
      default:
        return ['cardOrFpOrPw'];
    }
  }

  private extractCredentialUserVerifyMode(
    item: EmployeeAccessCredential,
  ): string | null {
    return this.toNullableString(
      this.toObject(this.toObject(item.metadata).hikvision).user_verify_mode,
    );
  }

  private toObject(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private toNullableString(value: unknown): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    const normalized =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value).trim()
        : '';
    return normalized ? normalized : null;
  }

  private async findCredentialOrFail(companyId: number, credentialId: number) {
    const credential = await this.credentialRepository.findOne({
      where: { id: credentialId, companyId },
      relations: { employee: true, device: true },
    });

    if (!credential) {
      throw new NotFoundException('Employee access credential not found.');
    }

    return credential;
  }

  private async updateBackendCredentialLifecycle(
    companyId: number,
    credentialId: number,
    params: {
      backendLifecycleStatus: string;
      credentialStatus: EmployeeAccessCredentialStatusEnum;
      reason?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const credential = await this.findCredentialOrFail(companyId, credentialId);

    credential.credentialStatus = params.credentialStatus;
    credential.metadata = {
      ...this.toObject(credential.metadata),
      lifecycle: {
        ...this.toObject(this.toObject(credential.metadata).lifecycle),
        backend_lifecycle_status: params.backendLifecycleStatus,
        reason: params.reason ?? null,
        changed_at: new Date().toISOString(),
        note: 'Backend lifecycle/status updated only. Device operation must be done using employee-device credential APIs.',
      },
      lifecycle_metadata: {
        ...this.toObject(this.toObject(credential.metadata).lifecycle_metadata),
        ...(params.metadata ?? {}),
      },
    };

    const saved = await this.credentialRepository.save(credential);

    return {
      message: `Credential marked as ${params.backendLifecycleStatus}.`,
      warning:
        'This action updated backend lifecycle/status only. If the credential also exists on a device, use the device-specific API to sync, disable, or remove it from the device.',
      data: this.mapSafeCredential(saved),
      device_action_routes:
        saved.employeeId && saved.deviceId
          ? {
              routes_endpoint: `/api/access-control/access-credentials/${saved.id}/device-action-routes`,
            }
          : null,
    };
  }

  private mapSafeCredential(item: EmployeeAccessCredential) {
    const metadata = this.toObject(item.metadata);
    const lifecycle = this.toObject(metadata.lifecycle);

    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      employee_no: item.employeeNo,
      device_id: item.deviceId,

      credential_type: item.credentialType,
      credential_no: item.credentialNo,
      credential_status: item.credentialStatus,

      card_no: item.cardNo ? this.maskCardNo(item.cardNo) : null,
      card_reader_no: item.cardReaderNo,

      fingerprint_id: item.fingerprintId,
      fingerprint_count: item.fingerprintCount,
      has_fingerprint: item.hasFingerprint,

      face_id: item.faceId,
      face_count: item.faceCount,
      has_face: item.hasFace,

      password_set: item.passwordSet,
      pin_password: null,

      issue_date: item.issueDate,
      expiry_date: item.expiryDate,
      is_primary: item.isPrimary,
      source: item.source,

      last_synced_at: item.lastSyncedAt,

      backend_lifecycle_status:
        lifecycle.backend_lifecycle_status ?? item.credentialStatus,
      lifecycle_reason: lifecycle.reason ?? null,
      lifecycle_changed_at: lifecycle.changed_at ?? null,

      device_action_routes:
        item.employeeId && item.deviceId
          ? `/api/access-control/access-credentials/${item.id}/device-action-routes`
          : null,

      metadata: this.maskSensitivePayload(item.metadata),

      created_at: item.createdAt,
      updated_at: item.updatedAt,
      deleted_at: item.deletedAt,
    };
  }

  private maskCardNo(value: string): string {
    const normalized = String(value).trim();
    if (!normalized) return '****';
    if (normalized.length <= 4) return '****';
    return `****${normalized.slice(-4)}`;
  }

  private buildPaginationMeta(
    total: number,
    count: number,
    limit: number,
    page: number,
  ) {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      total,
      count,
      limit,
      page,
      total_pages: totalPages,
      has_next_page: page < totalPages,
      has_previous_page: page > 1,
    };
  }
}
