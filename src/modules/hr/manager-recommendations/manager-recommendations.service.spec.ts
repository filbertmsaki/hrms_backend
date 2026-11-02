import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { ManagerRecommendation } from './entities/manager-recommendation.entity';
import {
  DecideManagerRecommendationDto,
  ManagerRecommendationDecision,
} from './dtos/decide-manager-recommendation.dto';
import { ManagerRecommendationType } from './entities/manager-recommendation.entity';
import { ManagerRecommendationsService } from './manager-recommendations.service';

describe('ManagerRecommendationsService (demo policy)', () => {
  const actor: AuthenticatedUser = {
    id: 1,
    email: 'manager@example.test',
    scope: 'company',
    userType: 'COMPANY_USER',
    companyId: 41,
    companyMembershipId: 51,
    employeeId: 61,
    roles: ['DEPARTMENT_MANAGER'],
    permissions: ['manager_self_service:read'],
  };

  let recommendations: Partial<
    Record<keyof Repository<ManagerRecommendation>, jest.Mock>
  >;
  let companies: Partial<Record<keyof Repository<Company>, jest.Mock>>;
  let employees: Partial<Record<keyof Repository<Employee>, jest.Mock>>;
  let departments: Partial<Record<keyof Repository<Department>, jest.Mock>>;
  let branches: Partial<Record<keyof Repository<Branch>, jest.Mock>>;
  let access: { assertCanAccessEmployee: jest.Mock };
  let service: ManagerRecommendationsService;

  beforeEach(() => {
    recommendations = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({
        id: 701,
        createdAt: new Date('2026-10-27T08:00:00Z'),
        reviewedAt: null,
        ...value,
      })),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    companies = {
      findOne: jest.fn().mockResolvedValue({
        id: 41,
        metadata: { demo: true, demo_recommendations_enabled: true },
      }),
    };
    employees = {
      findOne: jest.fn().mockResolvedValue({
        id: 62,
        company_id: 41,
        employment_status: 'ACTIVE',
      }),
    };
    departments = { findOne: jest.fn() };
    branches = { findOne: jest.fn() };
    access = {
      assertCanAccessEmployee: jest.fn().mockResolvedValue(undefined),
    };
    service = new ManagerRecommendationsService(
      recommendations as unknown as Repository<ManagerRecommendation>,
      companies as unknown as Repository<Company>,
      employees as unknown as Repository<Employee>,
      departments as unknown as Repository<Department>,
      branches as unknown as Repository<Branch>,
      access as unknown as HrAccessService,
    );
  });

  it('refuses to run outside an explicitly enabled demo company', async () => {
    companies.findOne!.mockResolvedValue({
      id: 41,
      metadata: { demo: false },
    });

    await expect(
      service.create(actor, {
        employee_id: 62,
        recommendation_type: ManagerRecommendationType.PROMOTION,
        rationale: 'Synthetic promotion rationale for the demo.',
        proposal: { proposed_position_title: 'Senior Analyst' },
      }),
    ).rejects.toThrow(NotFoundException);
    expect(recommendations.save).not.toHaveBeenCalled();
  });

  it('keeps the workflow disabled in production even when the company is marked demo', async () => {
    const previousAppEnv = process.env.APP_ENV;
    process.env.APP_ENV = 'production';
    try {
      await expect(service.findMine(actor)).rejects.toThrow(NotFoundException);
      expect(companies.findOne).not.toHaveBeenCalled();
    } finally {
      if (previousAppEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = previousAppEnv;
    }
  });

  it('creates a team-scoped synthetic promotion recommendation', async () => {
    const result = await service.create(actor, {
      employee_id: 62,
      recommendation_type: ManagerRecommendationType.PROMOTION,
      rationale: 'Synthetic promotion rationale for the demo workflow.',
      proposal: { proposed_position_title: 'Senior Analyst' },
      proposed_effective_date: '2027-01-01',
    });

    expect(access.assertCanAccessEmployee).toHaveBeenCalledWith(actor, {
      id: 62,
      company_id: 41,
      employment_status: 'ACTIVE',
    });
    expect(recommendations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 41,
        employeeId: 62,
        submittedByCompanyUserId: 51,
        status: 'SUBMITTED',
        demoPolicyVersion: 'DEMO-1',
        metadata: { synthetic_demo: true, source: 'manager-self-service' },
      }),
    );
    expect(result).toMatchObject({
      id: 701,
      recommendation_type: 'PROMOTION',
      status: 'SUBMITTED',
      synthetic_demo: true,
    });
  });

  it('rejects target employees outside the actor company before scope checks', async () => {
    employees.findOne!.mockResolvedValue(null);
    await expect(
      service.create(actor, {
        employee_id: 999,
        recommendation_type: ManagerRecommendationType.DISCIPLINARY,
        rationale: 'Synthetic disciplinary recommendation for testing.',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(access.assertCanAccessEmployee).not.toHaveBeenCalled();
  });

  it('requires a valid company-local destination for transfer proposals', async () => {
    departments.findOne!.mockResolvedValue(null);
    await expect(
      service.create(actor, {
        employee_id: 62,
        recommendation_type: ManagerRecommendationType.TRANSFER,
        rationale: 'Synthetic transfer recommendation for testing.',
        proposal: { proposed_department_id: 999 },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(departments.findOne).toHaveBeenCalledWith({
      where: { id: 999, company_id: 41 },
      select: ['id'],
    });
    expect(recommendations.save).not.toHaveBeenCalled();
  });

  it('keeps the demo disciplinary proposal separate from employee master data', async () => {
    await expect(
      service.create(actor, {
        employee_id: 62,
        recommendation_type: ManagerRecommendationType.DISCIPLINARY,
        rationale: 'Synthetic disciplinary recommendation for testing.',
        proposal: { proposed_status: 'TERMINATED' },
      }),
    ).rejects.toThrow(BadRequestException);
    expect(recommendations.save).not.toHaveBeenCalled();
  });

  it('records demo HR approval without changing the employee master record or exposing HR notes', async () => {
    recommendations.findOne!.mockResolvedValue({
      id: 701,
      companyId: 41,
      employeeId: 62,
      recommendationType: ManagerRecommendationType.PROMOTION,
      rationale: 'Synthetic promotion rationale for the demo workflow.',
      proposal: { proposed_position_title: 'Senior Analyst' },
      proposedEffectiveDate: '2027-01-01',
      status: 'SUBMITTED',
      demoPolicyVersion: 'DEMO-1',
      metadata: { synthetic_demo: true },
      createdAt: new Date('2026-10-27T08:00:00Z'),
    });
    const decision: DecideManagerRecommendationDto = {
      decision: ManagerRecommendationDecision.APPROVE,
      comment: 'Demo approval only; no employee change applied.',
    };

    const result = await service.decide(
      { ...actor, permissions: ['self_service_requests:approve'] },
      701,
      decision,
    );

    expect(result.status).toBe('APPROVED');
    expect(result).not.toHaveProperty('reviewer_comment');
    expect(recommendations.update).toHaveBeenCalledWith(
      { id: 701, companyId: 41, status: 'SUBMITTED' },
      expect.objectContaining({
        status: 'APPROVED',
        reviewedByCompanyUserId: 51,
        reviewerComment: decision.comment,
      }),
    );
    expect(employees.findOne).not.toHaveBeenCalled();
  });

  it('prevents a second HR decision when another reviewer wins the race', async () => {
    recommendations.findOne!.mockResolvedValue({
      id: 701,
      companyId: 41,
      employeeId: 62,
      recommendationType: ManagerRecommendationType.PROMOTION,
      rationale: 'Synthetic promotion rationale for the demo workflow.',
      proposal: { proposed_position_title: 'Senior Analyst' },
      proposedEffectiveDate: null,
      status: 'SUBMITTED',
      demoPolicyVersion: 'DEMO-1',
      metadata: { synthetic_demo: true },
      createdAt: new Date('2026-10-27T08:00:00Z'),
    });
    recommendations.update!.mockResolvedValue({ affected: 0 });

    await expect(
      service.decide(
        { ...actor, permissions: ['self_service_requests:approve'] },
        701,
        { decision: ManagerRecommendationDecision.APPROVE },
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('requires an active company context', async () => {
    await expect(
      service.findMine({
        ...actor,
        companyId: undefined,
      }),
    ).rejects.toThrow(ForbiddenException);
  });
});
