import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AttendancePolicy } from '../policies/entities/attendance-policy.entity';

@Injectable()
export class AttendanceCompanyConfigService {
  constructor(
    @InjectRepository(AttendancePolicy)
    private readonly attendancePolicyRepository: Repository<AttendancePolicy>,
  ) {}

  async findActivePolicy(companyId: number): Promise<AttendancePolicy | null> {
    return this.attendancePolicyRepository.findOne({
      where: { company_id: companyId, is_active: true },
      order: { id: 'ASC' },
    });
  }

  async resolvePolicyForCompany(
    companyId: number,
    policyId?: number | null,
  ): Promise<AttendancePolicy | null> {
    if (!policyId) {
      return this.findActivePolicy(companyId);
    }

    const policy = await this.attendancePolicyRepository.findOne({
      where: {
        id: policyId,
        company_id: companyId,
      },
    });

    if (!policy) {
      throw new BadRequestException(
        'Configured attendance policy does not belong to the active company.',
      );
    }

    return policy;
  }

  async resolveRuntimeDefaults(
    companyId: number,
  ): Promise<AttendancePolicy | null> {
    return this.findActivePolicy(companyId);
  }
}
