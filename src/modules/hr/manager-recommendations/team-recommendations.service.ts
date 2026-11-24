import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, QueryFailedError, Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { HrAccessService } from '../shared/hr-access.service';
import { CreateTeamRecommendationDto } from './dtos/create-manager-recommendation.dto';
import {
  DecideManagerRecommendationDto,
  ManagerRecommendationDecision,
} from './dtos/decide-manager-recommendation.dto';
import { ManagerRecommendationStatus as Status } from './entities/manager-recommendation.entity';
import { TeamRecommendation } from './entities/team-recommendation.entity';
import { validateRecommendationProposal } from './recommendation-proposal';

@Injectable()
export class TeamRecommendationsService {
  constructor(
    @InjectRepository(TeamRecommendation)
    private readonly recommendations: Repository<TeamRecommendation>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departments: Repository<Department>,
    @InjectRepository(Branch) private readonly branches: Repository<Branch>,
    private readonly access: HrAccessService,
  ) {}

  private context(actor: AuthenticatedUser) {
    if (!actor.companyId || !actor.companyMembershipId)
      throw new ForbiddenException('Active company membership is required.');
    return {
      companyId: actor.companyId,
      membershipId: actor.companyMembershipId,
    };
  }

  private async teamIds(actor: AuthenticatedUser) {
    const [reports, accessible] = await Promise.all([
      this.access.getReportingEmployeeIds(actor),
      this.access.getAccessibleEmployeeIds(actor),
    ]);
    const allowed = accessible && new Set(accessible);
    return reports.filter(
      (id) => id !== actor.employeeId && (!allowed || allowed.has(id)),
    );
  }

  async options(actor: AuthenticatedUser) {
    const { companyId } = this.context(actor);
    const ids = await this.teamIds(actor);
    if (!ids.length) return { employees: [], departments: [], branches: [] };
    const [employees, departments, branches] = await Promise.all([
      this.employees.find({
        where: {
          company_id: companyId,
          id: In(ids),
          employment_status: EmploymentStatusEnum.ACTIVE,
        },
        select: ['id', 'employee_no', 'first_name', 'last_name'],
        order: { first_name: 'ASC', last_name: 'ASC', id: 'ASC' },
      }),
      this.departments.find({
        where: { company_id: companyId, status: 'active' },
        select: ['id', 'name', 'branch_id'],
        order: { name: 'ASC' },
      }),
      this.branches.find({
        where: { company_id: companyId, status: 'active' },
        select: ['id', 'name'],
        order: { name: 'ASC' },
      }),
    ]);
    return {
      employees: employees.map((e) => ({
        id: e.id,
        name: this.employeeLabel(e),
      })),
      departments,
      branches,
    };
  }

  async create(actor: AuthenticatedUser, dto: CreateTeamRecommendationDto) {
    const { companyId, membershipId } = this.context(actor);
    if (!(await this.teamIds(actor)).includes(dto.employee_id))
      throw new ForbiddenException(
        'Select an employee in your reporting team and assigned scope.',
      );
    const active = await this.employees.existsBy({
      company_id: companyId,
      id: dto.employee_id,
      employment_status: EmploymentStatusEnum.ACTIVE,
    });
    if (!active) throw new BadRequestException('Select an active employee.');
    const rationale = dto.rationale.trim();
    if (rationale.length < 20)
      throw new BadRequestException(
        'Enter at least 20 characters of rationale.',
      );
    if (dto.revises_id !== undefined) {
      const previous = await this.recommendations.findOneBy({
        id: dto.revises_id,
        companyId,
        submittedByCompanyUserId: membershipId,
        employeeId: dto.employee_id,
        recommendationType: dto.recommendation_type,
        status: Status.RETURNED,
      });
      if (!previous)
        throw new BadRequestException(
          'Select your returned recommendation for the same employee and type.',
        );
    }
    const proposal = await validateRecommendationProposal(
      companyId,
      dto,
      this.departments,
      this.branches,
      true,
    );
    const row = this.recommendations.create({
      companyId,
      employeeId: dto.employee_id,
      submittedByCompanyUserId: membershipId,
      recommendationType: dto.recommendation_type,
      rationale,
      proposal,
      proposedEffectiveDate: dto.proposed_effective_date ?? null,
      status: Status.SUBMITTED,
      revisesId: dto.revises_id ?? null,
    });
    try {
      const saved = await this.recommendations.save(row);
      return { id: saved.id, status: saved.status };
    } catch (error) {
      if (
        dto.revises_id &&
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'A revised recommendation has already been submitted.',
        );
      throw error;
    }
  }

  async mine(actor: AuthenticatedUser) {
    const { companyId, membershipId } = this.context(actor);
    const ids = await this.teamIds(actor);
    const rows = ids.length
      ? await this.recommendations.find({
          where: {
            companyId,
            submittedByCompanyUserId: membershipId,
            employeeId: In(ids),
          },
          order: { createdAt: 'DESC', id: 'DESC' },
        })
      : [];
    return this.describe(rows, companyId);
  }

  private async reviewScope(actor: AuthenticatedUser) {
    const { companyId, membershipId } = this.context(actor);
    const ids = await this.access.getAccessibleEmployeeIds(actor);
    const employeeScope = ids
      ? { employeeId: In(ids.filter((id) => id !== actor.employeeId)) }
      : actor.employeeId
        ? { employeeId: Not(actor.employeeId) }
        : {};
    return {
      companyId,
      submittedByCompanyUserId: Not(membershipId),
      ...employeeScope,
    };
  }

  async pending(actor: AuthenticatedUser) {
    const scope = await this.reviewScope(actor);
    const rows = await this.recommendations.find({
      where: { ...scope, status: Status.SUBMITTED },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return this.describe(rows, scope.companyId);
  }

  async decide(
    actor: AuthenticatedUser,
    id: number,
    dto: DecideManagerRecommendationDto,
  ) {
    const { membershipId } = this.context(actor);
    const scope = await this.reviewScope(actor);
    const found = await this.recommendations.findOne({
      where: { ...scope, id },
      select: ['id'],
    });
    if (!found) throw new NotFoundException('Recommendation not found.');
    const comment = dto.comment?.trim() || null;
    if (
      (comment || dto.decision !== ManagerRecommendationDecision.APPROVE) &&
      (comment?.length ?? 0) < 5
    )
      throw new BadRequestException(
        'Enter at least five characters of feedback for the manager.',
      );
    const status = {
      [ManagerRecommendationDecision.APPROVE]: Status.APPROVED,
      [ManagerRecommendationDecision.RETURN]: Status.RETURNED,
      [ManagerRecommendationDecision.REJECT]: Status.REJECTED,
    }[dto.decision];
    const result = await this.recommendations.update(
      { ...scope, id, status: Status.SUBMITTED },
      {
        status,
        reviewedByCompanyUserId: membershipId,
        reviewedAt: new Date(),
        reviewerComment: comment,
      },
    );
    if (result.affected !== 1)
      throw new ConflictException(
        'This recommendation was already reviewed. Refresh the queue.',
      );
    return { id, status };
  }

  private employeeLabel(e: Employee) {
    return `${e.first_name} ${e.last_name} (${e.employee_no})`;
  }

  private async describe(rows: TeamRecommendation[], companyId: number) {
    if (!rows.length) return { data: [] };
    const people = await this.employees.find({
      where: [
        {
          company_id: companyId,
          id: In([...new Set(rows.map((r) => r.employeeId))]),
        },
        {
          company_id: companyId,
          company_user_id: In([
            ...new Set(rows.map((r) => r.submittedByCompanyUserId)),
          ]),
        },
      ],
      select: [
        'id',
        'company_user_id',
        'employee_no',
        'first_name',
        'last_name',
      ],
    });
    const targets = new Map(people.map((e) => [e.id, this.employeeLabel(e)]));
    const managers = new Map(
      people.map((e) => [e.company_user_id, this.employeeLabel(e)]),
    );
    return {
      data: rows.map((r) => ({
        id: r.id,
        employee_id: r.employeeId,
        employee: targets.get(r.employeeId) ?? null,
        submitted_by: managers.get(r.submittedByCompanyUserId) ?? null,
        recommendation_type: r.recommendationType,
        rationale: r.rationale,
        proposal: r.proposal,
        proposed_effective_date: r.proposedEffectiveDate,
        status: r.status,
        submitted_at: r.createdAt,
        reviewed_at: r.reviewedAt,
        feedback: r.reviewerComment,
        revises_id: r.revisesId,
      })),
    };
  }
}
