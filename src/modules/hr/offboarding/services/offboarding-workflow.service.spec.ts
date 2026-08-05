import { EntityManager, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OffboardingWorkflowService } from './offboarding-workflow.service';
import { OffboardingApproval } from '../entities/offboarding-approval.entity';
import { OffboardingApprovalStatusEnum } from '../enums/offboarding-approval-status.enum';
import type { OffboardingWorkflow } from '../entities/offboarding-workflow.entity';
import type { OffboardingWorkflowStep } from '../entities/offboarding-workflow-step.entity';
import type { OffboardingRequest } from '../entities/offboarding-request.entity';
import type { OffboardingTask } from '../entities/offboarding-task.entity';
import type { CompanyUser } from '../../../companies/entities/company-user.entity';
import type { CompanyUserRole } from '../../../companies/entities/company-user-role.entity';
import type { EmployeePosition } from '../../employees/entities/employee-position.entity';

const createRepoMock = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneOrFail: jest.fn(),
  create: jest.fn((value: unknown) => value),
  save: jest.fn((value: unknown) => value),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('OffboardingWorkflowService.delegateApproval', () => {
  let service: OffboardingWorkflowService;
  let approvalRepository: ReturnType<typeof createRepoMock>;
  let requestRepository: ReturnType<typeof createRepoMock>;

  beforeEach(() => {
    approvalRepository = createRepoMock();
    requestRepository = createRepoMock();

    service = new OffboardingWorkflowService(
      createRepoMock() as unknown as Repository<OffboardingWorkflow>,
      createRepoMock() as unknown as Repository<OffboardingWorkflowStep>,
      approvalRepository as unknown as Repository<OffboardingApproval>,
      requestRepository as unknown as Repository<OffboardingRequest>,
      createRepoMock() as unknown as Repository<OffboardingTask>,
      createRepoMock() as unknown as Repository<CompanyUser>,
      createRepoMock() as unknown as Repository<CompanyUserRole>,
      createRepoMock() as unknown as Repository<EmployeePosition>,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { get: jest.fn() } as unknown as ConfigService,
    );
  });

  const baseApproval = () => ({
    id: 1,
    offboarding_request_id: 55,
    approver_company_user_id: 90,
    status: OffboardingApprovalStatusEnum.PENDING,
    original_approver_company_user_id: null,
    delegated_from_company_user_id: null,
    delegated_at: null,
    delegation_reason: null,
  });

  it('rejects delegating a non-pending approval', async () => {
    approvalRepository.findOne.mockResolvedValue({
      ...baseApproval(),
      status: OffboardingApprovalStatusEnum.APPROVED,
    });

    await expect(
      service.delegateApproval(55, 1, 90, 91, 'handover', false, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects delegation by someone other than the assigned approver when not elevated', async () => {
    approvalRepository.findOne.mockResolvedValue(baseApproval());

    await expect(
      service.delegateApproval(55, 1, 99, 91, 'handover', false, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("allows an HR actor with delegate-any to delegate someone else's approval", async () => {
    approvalRepository.findOne.mockResolvedValue(baseApproval());
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { company_user_id: 12 },
    });

    const result = await service.delegateApproval(
      55,
      1,
      99,
      91,
      'HR reassignment',
      true,
      undefined,
    );

    expect(result.approver_company_user_id).toBe(91);
    expect(result.original_approver_company_user_id).toBe(90);
    expect(result.delegated_from_company_user_id).toBe(90);
  });

  it('blocks assigning the exiting employee as their own approver', async () => {
    approvalRepository.findOne.mockResolvedValue(baseApproval());
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { company_user_id: 91 },
    });

    await expect(
      service.delegateApproval(55, 1, 90, 91, 'handover', false, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves the original approver across a second delegation', async () => {
    const approval = {
      ...baseApproval(),
      approver_company_user_id: 91,
      original_approver_company_user_id: 90,
    };
    approvalRepository.findOne.mockResolvedValue(approval);
    requestRepository.findOne.mockResolvedValue({
      id: 55,
      employee: { company_user_id: 12 },
    });

    const result = await service.delegateApproval(
      55,
      1,
      91,
      92,
      'second handover',
      false,
      undefined,
    );

    expect(result.original_approver_company_user_id).toBe(90);
    expect(result.delegated_from_company_user_id).toBe(91);
    expect(result.approver_company_user_id).toBe(92);
  });
});
