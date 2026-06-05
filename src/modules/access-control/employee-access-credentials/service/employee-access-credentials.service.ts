import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
    const credentialType = dto.credential_type ?? EmployeeAccessCredentialTypeEnum.CARD;

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

    item.employeeNo = employee.employee_no;
    item.deviceId = resolvedDeviceId;
    item.credentialType = credentialType;
    item.credentialNo = dto.credential_no ?? item.credentialNo ?? null;
    item.credentialStatus = dto.credential_status ?? item.credentialStatus ?? 'ACTIVE';
    item.cardNo = dto.card_no?.trim() || null;
    if (dto.pin_password !== undefined) {
      item.passwordSet = Boolean(dto.pin_password?.trim());
      item.pinPassword = dto.pin_password?.trim() || null;
    }
    item.fingerprintCount = dto.fingerprint_count ?? 0;
    item.faceCount = dto.face_count ?? 0;
    item.hasFingerprint = dto.has_fingerprint ?? (item.fingerprintCount > 0);
    item.hasFace = dto.has_face ?? (item.faceCount > 0);
    item.metadata = await this.resolveCredentialMetadata(
      companyId,
      resolvedDeviceId,
      credentialType,
      dto.user_verify_mode,
      dto.metadata ?? item.metadata ?? null,
    );

    return this.map(await this.credentialRepository.save(item));
  }

  async update(companyId: number, employeeId: number, dto: Partial<EmployeeAccessCredentialInput>) {
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

    item.employeeNo = employee.employee_no;
    item.deviceId = resolvedDeviceId;
    if (dto.credential_type !== undefined) item.credentialType = dto.credential_type;
    if (dto.credential_no !== undefined) item.credentialNo = dto.credential_no ?? null;
    if (dto.credential_status !== undefined) item.credentialStatus = dto.credential_status;
    if (dto.card_no !== undefined) item.cardNo = dto.card_no?.trim() || null;
    if (dto.pin_password !== undefined) {
      item.passwordSet = Boolean(dto.pin_password?.trim());
      item.pinPassword = dto.pin_password?.trim() || null;
    }
    if (dto.fingerprint_count !== undefined) item.fingerprintCount = dto.fingerprint_count;
    if (dto.face_count !== undefined) item.faceCount = dto.face_count;
    if (dto.has_fingerprint !== undefined) item.hasFingerprint = dto.has_fingerprint;
    if (dto.has_face !== undefined) item.hasFace = dto.has_face;
    item.metadata = await this.resolveCredentialMetadata(
      companyId,
      resolvedDeviceId,
      item.credentialType,
      dto.user_verify_mode,
      dto.metadata !== undefined ? dto.metadata : item.metadata,
    );

    if (dto.has_fingerprint === undefined && dto.fingerprint_count !== undefined) {
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

  private async findEmployeeOrFail(companyId: number, employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin(CompanyUser, 'companyUser', 'companyUser.id = employee.company_user_id')
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
      for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
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
      resolvedUserVerifyMode = await this.hikvisionUserManagementService.resolveSupportedUserVerifyMode(
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
        return ['cardOrFpOrPw', 'cardAndPw', 'fpAndCard', 'fpAndCardAndPw', 'fpOrCard', 'card'];
      case EmployeeAccessCredentialTypeEnum.FINGERPRINT:
        return ['cardOrFpOrPw', 'fpAndPw', 'fpAndCard', 'fpAndCardAndPw', 'fpOrCard', 'fp'];
      default:
        return ['cardOrFpOrPw'];
    }
  }

  private extractCredentialUserVerifyMode(item: EmployeeAccessCredential): string | null {
    return this.toNullableString(this.toObject(this.toObject(item.metadata).hikvision).user_verify_mode);
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

    const normalized = String(value).trim();
    return normalized ? normalized : null;
  }
}

