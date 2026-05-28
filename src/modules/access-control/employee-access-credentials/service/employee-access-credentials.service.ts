import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';
import { CreateEmployeeAccessCredentialDto } from '../dto/create-employee-access-credential.dto';
import { UpdateEmployeeAccessCredentialDto } from '../dto/update-employee-access-credential.dto';
import { EmployeeAccessCredential } from '../entity/employee-access-credential.entity';

@Injectable()
export class EmployeeAccessCredentialsService {
  constructor(
    @InjectRepository(EmployeeAccessCredential)
    private readonly credentialRepository: Repository<EmployeeAccessCredential>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  async createOrReplace(
    companyId: number,
    employeeId: number,
    dto: CreateEmployeeAccessCredentialDto,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);

    let item = await this.credentialRepository.findOne({
      where: { companyId, employeeId },
    });

    if (!item) {
      item = this.credentialRepository.create({ companyId, employeeId });
    }

    item.employeeNo = employee.employee_no;
    item.deviceId = dto.device_id ?? item.deviceId ?? null;
    item.credentialType = dto.credential_type ?? item.credentialType ?? 'CARD';
    item.credentialNo = dto.credential_no ?? item.credentialNo ?? null;
    item.credentialStatus = dto.credential_status ?? item.credentialStatus ?? 'ACTIVE';
    item.cardNo = dto.card_no?.trim() || null;
    item.pinPassword = dto.pin_password?.trim() || null;
    item.fingerprintCount = dto.fingerprint_count ?? 0;
    item.faceCount = dto.face_count ?? 0;
    item.hasFingerprint = dto.has_fingerprint ?? (item.fingerprintCount > 0);
    item.hasFace = dto.has_face ?? (item.faceCount > 0);
    item.metadata = dto.metadata ?? item.metadata ?? null;

    return this.map(await this.credentialRepository.save(item));
  }

  async update(companyId: number, employeeId: number, dto: UpdateEmployeeAccessCredentialDto) {
    const employee = await this.findEmployeeOrFail(companyId, employeeId);
    const item = await this.credentialRepository.findOne({
      where: { companyId, employeeId },
    });

    if (!item) {
      throw new NotFoundException('Employee access credentials not found');
    }

    item.employeeNo = employee.employee_no;
    if (dto.device_id !== undefined) item.deviceId = dto.device_id ?? null;
    if (dto.credential_type !== undefined) item.credentialType = dto.credential_type;
    if (dto.credential_no !== undefined) item.credentialNo = dto.credential_no ?? null;
    if (dto.credential_status !== undefined) item.credentialStatus = dto.credential_status;
    if (dto.card_no !== undefined) item.cardNo = dto.card_no?.trim() || null;
    if (dto.pin_password !== undefined) item.pinPassword = dto.pin_password?.trim() || null;
    if (dto.fingerprint_count !== undefined) item.fingerprintCount = dto.fingerprint_count;
    if (dto.face_count !== undefined) item.faceCount = dto.face_count;
    if (dto.has_fingerprint !== undefined) item.hasFingerprint = dto.has_fingerprint;
    if (dto.has_face !== undefined) item.hasFace = dto.has_face;
    if (dto.metadata !== undefined) item.metadata = dto.metadata;

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
      pin_password: item.pinPassword,
      fingerprint_count: item.fingerprintCount,
      face_count: item.faceCount,
      has_fingerprint: item.hasFingerprint,
      has_face: item.hasFace,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }
}
