import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Company } from '../../companies/entities/company.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Department } from '../departments/entities/department.entity';
import { Branch } from '../branches/entities/branch.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { CreateManagerRecommendationDto } from './dtos/create-manager-recommendation.dto';
import {
  DecideManagerRecommendationDto,
  ManagerRecommendationDecision,
} from './dtos/decide-manager-recommendation.dto';
import {
  ManagerRecommendation,
  ManagerRecommendationStatus,
  ManagerRecommendationType,
} from './entities/manager-recommendation.entity';

const DEMO_POLICY_VERSION = 'DEMO-1';

@Injectable()
export class ManagerRecommendationsService {
  constructor(
    @InjectRepository(ManagerRecommendation)
    private readonly recommendationRepository: Repository<ManagerRecommendation>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    private readonly hrAccess: HrAccessService,
  ) {}

  private async assertDemoPolicyEnabled(companyId: number): Promise<void> {
    const runtimeEnvironments = [process.env.APP_ENV, process.env.NODE_ENV]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.trim().toLowerCase());
    if (
      runtimeEnvironments.some((value) =>
        ['production', 'prod'].includes(value),
      )
    ) {
      throw new NotFoundException('Recommendation workflow not found');
    }
    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      select: ['id', 'metadata'],
    });
    if (
      company?.metadata?.demo !== true ||
      company.metadata?.demo_recommendations_enabled !== true
    ) {
      throw new NotFoundException('Recommendation workflow not found');
    }
  }

  private ensureActorContext(actor: AuthenticatedUser) {
    if (!actor.companyId || !actor.companyMembershipId) {
      throw new ForbiddenException('Active company context is required');
    }
    return {
      companyId: actor.companyId,
      membershipId: actor.companyMembershipId,
    };
  }

  private async validateDemoProposal(
    companyId: number,
    dto: CreateManagerRecommendationDto,
  ): Promise<Record<string, unknown>> {
    const proposal = dto.proposal ?? {};
    if (dto.recommendation_type === ManagerRecommendationType.PROMOTION) {
      const title = proposal.proposed_position_title;
      if (typeof title !== 'string' || !title.trim()) {
        throw new BadRequestException(
          'Demo promotion recommendations require proposed_position_title.',
        );
      }
    } else if (dto.recommendation_type === ManagerRecommendationType.TRANSFER) {
      const departmentId = Number(proposal.proposed_department_id);
      const branchId = Number(proposal.proposed_branch_id);
      const hasDepartment =
        Number.isSafeInteger(departmentId) && departmentId > 0;
      const hasBranch = Number.isSafeInteger(branchId) && branchId > 0;
      if (!hasDepartment && !hasBranch) {
        throw new BadRequestException(
          'Demo transfer recommendations require a proposed department or branch.',
        );
      }
      if (hasDepartment) {
        const department = await this.departmentRepository.findOne({
          where: { id: departmentId, company_id: companyId },
          select: ['id'],
        });
        if (!department)
          throw new BadRequestException('Proposed department is invalid.');
      }
      if (hasBranch) {
        const branch = await this.branchRepository.findOne({
          where: { id: branchId, company_id: companyId },
          select: ['id'],
        });
        if (!branch)
          throw new BadRequestException('Proposed branch is invalid.');
      }
    } else if (Object.keys(proposal).length) {
      throw new BadRequestException(
        'Demo disciplinary recommendations do not accept proposed master-data changes.',
      );
    }
    return proposal;
  }

  async create(actor: AuthenticatedUser, dto: CreateManagerRecommendationDto) {
    const { companyId, membershipId } = this.ensureActorContext(actor);
    await this.assertDemoPolicyEnabled(companyId);
    const employee = await this.employeeRepository.findOne({
      where: { id: dto.employee_id, company_id: companyId },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    await this.hrAccess.assertCanAccessEmployee(actor, employee);
    if (employee.id === actor.employeeId) {
      throw new BadRequestException('Managers cannot recommend themselves.');
    }
    if (String(employee.employment_status).toUpperCase() !== 'ACTIVE') {
      throw new BadRequestException(
        'Demo recommendations are limited to active employees.',
      );
    }

    const proposal = await this.validateDemoProposal(companyId, dto);
    const request = this.recommendationRepository.create({
      companyId,
      employeeId: employee.id,
      submittedByCompanyUserId: membershipId,
      recommendationType: dto.recommendation_type,
      rationale: dto.rationale.trim(),
      proposal,
      proposedEffectiveDate: dto.proposed_effective_date ?? null,
      status: ManagerRecommendationStatus.SUBMITTED,
      reviewedByCompanyUserId: null,
      reviewedAt: null,
      reviewerComment: null,
      demoPolicyVersion: DEMO_POLICY_VERSION,
      metadata: { synthetic_demo: true, source: 'manager-self-service' },
    });
    const saved = await this.recommendationRepository.save(request);
    return this.serialize(saved, false);
  }

  async findMine(actor: AuthenticatedUser) {
    const { companyId, membershipId } = this.ensureActorContext(actor);
    await this.assertDemoPolicyEnabled(companyId);
    const rows = await this.recommendationRepository.find({
      where: { companyId, submittedByCompanyUserId: membershipId },
      order: { createdAt: 'DESC' },
    });
    return { data: rows.map((row) => this.serialize(row, false)) };
  }

  async findPending(actor: AuthenticatedUser) {
    const { companyId } = this.ensureActorContext(actor);
    await this.assertDemoPolicyEnabled(companyId);
    const rows = await this.recommendationRepository.find({
      where: { companyId, status: ManagerRecommendationStatus.SUBMITTED },
      order: { createdAt: 'ASC' },
    });
    return { data: rows.map((row) => this.serialize(row, true)) };
  }

  async decide(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideManagerRecommendationDto,
  ) {
    const { companyId, membershipId } = this.ensureActorContext(actor);
    await this.assertDemoPolicyEnabled(companyId);
    const request = await this.recommendationRepository.findOne({
      where: { id, companyId },
    });
    if (!request) throw new NotFoundException('Recommendation not found');
    if (request.status !== ManagerRecommendationStatus.SUBMITTED) {
      throw new BadRequestException(
        'Only submitted recommendations can be reviewed.',
      );
    }
    if (
      dto.decision !== ManagerRecommendationDecision.APPROVE &&
      !dto.comment?.trim()
    ) {
      throw new BadRequestException(
        'A reviewer comment is required for this decision.',
      );
    }

    const status = {
      [ManagerRecommendationDecision.APPROVE]:
        ManagerRecommendationStatus.APPROVED,
      [ManagerRecommendationDecision.REJECT]:
        ManagerRecommendationStatus.REJECTED,
      [ManagerRecommendationDecision.RETURN]:
        ManagerRecommendationStatus.RETURNED,
    }[dto.decision];
    const reviewedAt = new Date();
    const updateResult = await this.recommendationRepository.update(
      {
        id,
        companyId,
        status: ManagerRecommendationStatus.SUBMITTED,
      },
      {
        status,
        reviewedByCompanyUserId: membershipId,
        reviewedAt,
        reviewerComment: dto.comment?.trim() || null,
      },
    );
    if (updateResult.affected !== 1) {
      throw new ConflictException(
        'This recommendation was already reviewed. Refresh the queue.',
      );
    }
    const saved = {
      ...request,
      status,
      reviewedByCompanyUserId: membershipId,
      reviewedAt,
      reviewerComment: dto.comment?.trim() || null,
    };
    // The manager sees the decision state but not HR's internal review notes.
    return this.serialize(saved, false);
  }

  private serialize(
    row: ManagerRecommendation,
    includeReviewerComment: boolean,
  ) {
    return {
      id: row.id,
      employee_id: row.employeeId,
      recommendation_type: row.recommendationType,
      rationale: row.rationale,
      proposal: row.proposal,
      proposed_effective_date: row.proposedEffectiveDate,
      status: row.status,
      submitted_at: row.createdAt,
      reviewed_at: row.reviewedAt,
      demo_policy_version: row.demoPolicyVersion,
      synthetic_demo: row.metadata?.synthetic_demo === true,
      ...(includeReviewerComment
        ? { reviewer_comment: row.reviewerComment }
        : {}),
    };
  }
}
