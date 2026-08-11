import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProbationPolicy } from '../entities/probation-policy.entity';
import { Employee } from '../../employees/entities/employee.entity';

interface PolicyMatchDimension {
  configured: boolean;
  matches: boolean;
  weight: number;
}

@Injectable()
export class ProbationPolicyResolverService {
  constructor(
    @InjectRepository(ProbationPolicy)
    private readonly repository: Repository<ProbationPolicy>,
  ) {}

  async resolve(
    companyId: number,
    employee: Employee,
    effectiveDate: string,
  ): Promise<ProbationPolicy | null> {
    const policies = await this.repository
      .createQueryBuilder('policy')
      .leftJoinAndSelect('policy.criteria', 'criteria')
      .where('policy.company_id = :companyId', { companyId })
      .andWhere('policy.status = :status', { status: 'ACTIVE' })
      .andWhere('policy.effective_from <= :effectiveDate', { effectiveDate })
      .andWhere(
        `(policy.effective_to IS NULL OR policy.effective_to >= :effectiveDate)`,
        { effectiveDate },
      )
      .orderBy('policy.priority', 'DESC')
      .addOrderBy('policy.id', 'DESC')
      .getMany();

    const candidates = policies
      .map((policy) => ({ policy, score: this.matchScore(policy, employee) }))
      .filter((result) => result.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score ||
          right.policy.priority - left.policy.priority ||
          right.policy.id - left.policy.id,
      );

    return candidates[0]?.policy ?? null;
  }

  private matchScore(policy: ProbationPolicy, employee: Employee): number {
    const dimensions: PolicyMatchDimension[] = [
      {
        configured: policy.branchId !== null,
        matches: policy.branchId === employee.primary_branch_id,
        weight: 16,
      },
      {
        configured: policy.departmentId !== null,
        matches: policy.departmentId === employee.primary_department_id,
        weight: 8,
      },
      {
        configured: policy.positionId !== null,
        matches: policy.positionId === employee.primary_position_id,
        weight: 4,
      },
      {
        configured: policy.gradeId !== null,
        matches: policy.gradeId === employee.grade_id,
        weight: 2,
      },
      {
        configured: policy.employmentType !== null,
        matches: policy.employmentType === employee.employment_type,
        weight: 1,
      },
    ];

    if (dimensions.some((d) => d.configured && !d.matches)) {
      return 0;
    }

    return (
      1 +
      dimensions.reduce(
        (total, d) => total + (d.configured && d.matches ? d.weight : 0),
        0,
      )
    );
  }
}
