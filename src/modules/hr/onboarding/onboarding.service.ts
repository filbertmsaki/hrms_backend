import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { Role } from '../../roles/entities/role.entity';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Department } from '../departments/entities/department.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Employee } from '../employees/entities/employee.entity';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { CancelOnboardingRequestDto } from './dtos/cancel-onboarding-request.dto';
import { CompleteOnboardingTaskDto } from './dtos/complete-onboarding-task.dto';
import { CreateOnboardingRequestDto } from './dtos/create-onboarding-request.dto';
import { CreateOnboardingTaskDto } from './dtos/create-onboarding-task.dto';
import { CreateOnboardingWorkflowStepDto } from './dtos/create-onboarding-workflow-step.dto';
import { CreateOnboardingWorkflowDto } from './dtos/create-onboarding-workflow.dto';
import { OnboardingApprovalActionDto } from './dtos/onboarding-approval-action.dto';
import { OnboardingRequestQueryDto } from './dtos/onboarding-request-query.dto';
import { OnboardingWorkflowQueryDto } from './dtos/onboarding-workflow-query.dto';
import { OnboardingWorkflowStepInputDto } from './dtos/onboarding-workflow-step-input.dto';
import { UpdateOnboardingRequestDto } from './dtos/update-onboarding-request.dto';
import { UpdateOnboardingWorkflowStepDto } from './dtos/update-onboarding-workflow-step.dto';
import { UpdateOnboardingWorkflowDto } from './dtos/update-onboarding-workflow.dto';
import { UploadDocumentDto } from './dtos/upload-document.dto';
import { VerifyDocumentDto } from './dtos/verify-document.dto';
import { OnboardingApprovalStatusEnum } from './enums/onboarding-approval-status.enum';
import { OnboardingApproverTypeEnum } from './enums/onboarding-approver-type.enum';
import { OnboardingRecordStatusEnum } from './enums/onboarding-record-status.enum';
import { OnboardingRequestStatusEnum } from './enums/onboarding-request-status.enum';
import { OnboardingTaskStatusEnum } from './enums/onboarding-task-status.enum';
import { OnboardingTaskTypeEnum } from './enums/onboarding-task-type.enum';
import { OnboardingApproval } from './entities/onboarding-approval.entity';
import { OnboardingAuditLog } from './entities/onboarding-audit-log.entity';
import { OnboardingRequest } from './entities/onboarding-request.entity';
import { OnboardingTask } from './entities/onboarding-task.entity';
import { OnboardingWorkflowStep } from './entities/onboarding-workflow-step.entity';
import { OnboardingWorkflow } from './entities/onboarding-workflow.entity';
import { OnboardingAuditService } from './services/onboarding-audit.service';
import { OnboardingWorkflowService } from './services/onboarding-workflow.service';

type ProgressSummary = {
  total_tasks: number;
  completed_tasks: number;
  total_approvals: number;
  approved_approvals: number;
  progress_percentage: string;
};

@Injectable()
export class OnboardingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(OnboardingWorkflow)
    private readonly onboardingWorkflowRepository: Repository<OnboardingWorkflow>,
    @InjectRepository(OnboardingWorkflowStep)
    private readonly onboardingWorkflowStepRepository: Repository<OnboardingWorkflowStep>,
    @InjectRepository(OnboardingRequest)
    private readonly onboardingRequestRepository: Repository<OnboardingRequest>,
    @InjectRepository(OnboardingTask)
    private readonly onboardingTaskRepository: Repository<OnboardingTask>,
    @InjectRepository(OnboardingApproval)
    private readonly onboardingApprovalRepository: Repository<OnboardingApproval>,
    @InjectRepository(OnboardingAuditLog)
    private readonly onboardingAuditLogRepository: Repository<OnboardingAuditLog>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly hrAccessService: HrAccessService,
    private readonly onboardingAuditService: OnboardingAuditService,
    private readonly onboardingWorkflowService: OnboardingWorkflowService,
  ) {}

  private getOnboardingWorkflowRepository(
    manager?: EntityManager,
  ): Repository<OnboardingWorkflow> {
    return manager?.getRepository(OnboardingWorkflow) ?? this.onboardingWorkflowRepository;
  }

  private getOnboardingWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<OnboardingWorkflowStep> {
    return (
      manager?.getRepository(OnboardingWorkflowStep) ??
      this.onboardingWorkflowStepRepository
    );
  }

  private getOnboardingRequestRepository(
    manager?: EntityManager,
  ): Repository<OnboardingRequest> {
    return manager?.getRepository(OnboardingRequest) ?? this.onboardingRequestRepository;
  }

  private getOnboardingTaskRepository(manager?: EntityManager): Repository<OnboardingTask> {
    return manager?.getRepository(OnboardingTask) ?? this.onboardingTaskRepository;
  }

  private getOnboardingApprovalRepository(
    manager?: EntityManager,
  ): Repository<OnboardingApproval> {
    return manager?.getRepository(OnboardingApproval) ?? this.onboardingApprovalRepository;
  }

  private getEmployeeRepository(manager?: EntityManager): Repository<Employee> {
    return manager?.getRepository(Employee) ?? this.employeeRepository;
  }

  private getDepartmentRepository(manager?: EntityManager): Repository<Department> {
    return manager?.getRepository(Department) ?? this.departmentRepository;
  }

  private getPositionRepository(manager?: EntityManager): Repository<Position> {
    return manager?.getRepository(Position) ?? this.positionRepository;
  }

  private getCompanyUserRepository(manager?: EntityManager): Repository<CompanyUser> {
    return manager?.getRepository(CompanyUser) ?? this.companyUserRepository;
  }

  private getRoleRepository(manager?: EntityManager): Repository<Role> {
    return manager?.getRepository(Role) ?? this.roleRepository;
  }

  private getDocumentRepository(manager?: EntityManager): Repository<Document> {
    return manager?.getRepository(Document) ?? this.documentRepository;
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private assertDateOrder(startDate: string, endDate: string, message: string): void {
    if (new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException(message);
    }
  }

  private formatDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private async findEmployeeOrFail(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
  ): Promise<Employee> {
    const repository = this.getEmployeeRepository(manager);
    const employee = await repository.findOne({
      where: { id: employeeId },
      relations: {
        company_user: true,
        primary_department: true,
        position: true,
      },
    });

    if (!employee || employee.company_user.company_id !== companyId) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async ensureNoActiveOnboarding(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
    ignoreOnboardingRequestId?: number,
  ): Promise<void> {
    const repository = this.getOnboardingRequestRepository(manager);
    const qb = repository
      .createQueryBuilder('onboardingRequest')
      .where('onboardingRequest.company_id = :companyId', { companyId })
      .andWhere('onboardingRequest.employee_id = :employeeId', { employeeId })
      .andWhere('onboardingRequest.status IN (:...statuses)', {
        statuses: [
          OnboardingRequestStatusEnum.DRAFT,
          OnboardingRequestStatusEnum.SUBMITTED,
          OnboardingRequestStatusEnum.IN_REVIEW,
          OnboardingRequestStatusEnum.IN_PROGRESS,
        ],
      });

    if (ignoreOnboardingRequestId) {
      qb.andWhere('onboardingRequest.id != :ignoreOnboardingRequestId', {
        ignoreOnboardingRequestId,
      });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Employee already has active onboarding request ${existing.onboarding_no}`,
      );
    }
  }

  private async generateOnboardingNo(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getOnboardingRequestRepository(manager);
    const year = new Date().getFullYear();
    const prefix = `ONB-${year}-`;
    const latest = await repository
      .createQueryBuilder('onboardingRequest')
      .where('onboardingRequest.company_id = :companyId', { companyId })
      .andWhere('onboardingRequest.onboarding_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('onboardingRequest.id', 'DESC')
      .getOne();

    const nextSequence = latest ? Number(latest.onboarding_no.split('-').pop() ?? '0') + 1 : 1;
    return `${prefix}${String(nextSequence).padStart(6, '0')}`;
  }

  private async generateTaskNo(
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getOnboardingTaskRepository(manager);
    const total = await repository.count({
      where: { onboarding_request_id: onboardingRequestId },
    });
    return `TASK-${onboardingRequestId}-${String(total + 1).padStart(3, '0')}`;
  }

  private validateWorkflowStepOrder(steps: OnboardingWorkflowStepInputDto[]): void {
    if (!steps.length) {
      throw new BadRequestException('Workflow must include at least one step');
    }

    const levels = steps.map((step) => step.approval_level).sort((a, b) => a - b);
    const uniqueLevels = new Set(levels);
    if (uniqueLevels.size !== levels.length) {
      throw new BadRequestException('Workflow approval levels must be unique');
    }

    for (let index = 0; index < levels.length; index += 1) {
      if (levels[index] !== index + 1) {
        throw new BadRequestException(
          'Workflow approval levels must be sequential starting at 1',
        );
      }
    }
  }

  private async validateWorkflowStepReferences(
    companyId: number,
    steps: OnboardingWorkflowStepInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const departmentIds = steps
      .map((step) => step.assigned_department_id)
      .filter((value): value is number => typeof value === 'number');
    const positionIds = steps
      .map((step) => step.position_id)
      .filter((value): value is number => typeof value === 'number');
    const companyUserIds = steps
      .map((step) => step.company_user_id)
      .filter((value): value is number => typeof value === 'number');
    const roleIds = steps
      .map((step) => step.role_id)
      .filter((value): value is number => typeof value === 'number');

    if (departmentIds.length) {
      const departments = await this.getDepartmentRepository(manager).count({
        where: {
          id: In([...new Set(departmentIds)]),
          company_id: companyId,
        },
      });
      if (departments !== new Set(departmentIds).size) {
        throw new BadRequestException('One or more assigned departments are invalid');
      }
    }

    if (positionIds.length) {
      const positions = await this.getPositionRepository(manager).count({
        where: {
          id: In([...new Set(positionIds)]),
          company_id: companyId,
        },
      });
      if (positions !== new Set(positionIds).size) {
        throw new BadRequestException('One or more positions are invalid');
      }
    }

    if (companyUserIds.length) {
      const memberships = await this.getCompanyUserRepository(manager).count({
        where: {
          id: In([...new Set(companyUserIds)]),
          company_id: companyId,
        },
      });
      if (memberships !== new Set(companyUserIds).size) {
        throw new BadRequestException('One or more company user assignments are invalid');
      }
    }

    if (roleIds.length) {
      const roles = await this.getRoleRepository(manager).count({
        where: {
          id: In([...new Set(roleIds)]),
        },
      });
      if (roles !== new Set(roleIds).size) {
        throw new BadRequestException('One or more roles are invalid');
      }
    }

    for (const step of steps) {
      if (step.approver_type === OnboardingApproverTypeEnum.ROLE && !step.role_id) {
        throw new BadRequestException('role_id is required for role approver type');
      }
      if (
        step.approver_type === OnboardingApproverTypeEnum.POSITION &&
        !step.position_id
      ) {
        throw new BadRequestException('position_id is required for position approver type');
      }
      if (
        step.approver_type === OnboardingApproverTypeEnum.COMPANY_USER &&
        !step.company_user_id
      ) {
        throw new BadRequestException(
          'company_user_id is required for company_user approver type',
        );
      }
    }
  }

  private mapWorkflow(entity: OnboardingWorkflow) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      description: entity.description,
      is_default: entity.is_default,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      steps:
        entity.steps?.map((step) => this.mapWorkflowStep(step)) ?? [],
    };
  }

  private mapWorkflowStep(entity: OnboardingWorkflowStep) {
    return {
      id: entity.id,
      workflow_id: entity.workflow_id,
      approval_level: entity.approval_level,
      step_name: entity.step_name,
      task_title: entity.task_title,
      task_description: entity.task_description,
      task_type: entity.task_type,
      assigned_department_id: entity.assigned_department_id,
      approver_type: entity.approver_type,
      role_id: entity.role_id,
      position_id: entity.position_id,
      company_user_id: entity.company_user_id,
      action_type: entity.action_type,
      is_required: entity.is_required,
      expected_duration_days: entity.expected_duration_days,
      created_at: entity.created_at,
    };
  }

  private async findOnboardingWorkflowOrFail(
    companyId: number,
    workflowId: number,
    manager?: EntityManager,
  ): Promise<OnboardingWorkflow> {
    const repository = this.getOnboardingWorkflowRepository(manager);
    const workflow = await repository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: {
        steps: true,
      },
      order: {
        steps: {
          approval_level: 'ASC',
          id: 'ASC',
        },
      },
    });

    if (!workflow) {
      throw new NotFoundException('Onboarding workflow not found');
    }

    return workflow;
  }

  private async findOnboardingWorkflowStepOrFail(
    workflowId: number,
    stepId: number,
    manager?: EntityManager,
  ): Promise<OnboardingWorkflowStep> {
    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const step = await repository.findOne({
      where: {
        id: stepId,
        workflow_id: workflowId,
      },
    });

    if (!step) {
      throw new NotFoundException('Onboarding workflow step not found');
    }

    return step;
  }

  private async shiftWorkflowStepLevelsUp(
    workflowId: number,
    fromLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const candidates = await repository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'DESC', id: 'DESC' },
    });

    for (const candidate of candidates) {
      if (candidate.approval_level >= fromLevel) {
        candidate.approval_level += 1;
        await repository.save(candidate);
      }
    }
  }

  private async shiftWorkflowStepLevelsDown(
    workflowId: number,
    fromLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const candidates = await repository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    for (const candidate of candidates) {
      if (candidate.approval_level > fromLevel) {
        candidate.approval_level -= 1;
        await repository.save(candidate);
      }
    }
  }

  private async moveWorkflowStepLevel(
    workflowId: number,
    stepId: number,
    currentLevel: number,
    targetLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    if (currentLevel === targetLevel) {
      return;
    }

    const repository = this.getOnboardingWorkflowStepRepository(manager);
    const allSteps = await repository.find({
      where: { workflow_id: workflowId },
      order: { approval_level: 'ASC', id: 'ASC' },
    });

    if (targetLevel > currentLevel) {
      const range = allSteps
        .filter(
          (step) =>
            step.id !== stepId &&
            step.approval_level > currentLevel &&
            step.approval_level <= targetLevel,
        )
        .sort((left, right) => left.approval_level - right.approval_level);

      for (const candidate of range) {
        candidate.approval_level -= 1;
        await repository.save(candidate);
      }
      return;
    }

    const range = allSteps
      .filter(
        (step) =>
          step.id !== stepId &&
          step.approval_level >= targetLevel &&
          step.approval_level < currentLevel,
      )
      .sort((left, right) => right.approval_level - left.approval_level);

    for (const candidate of range) {
      candidate.approval_level += 1;
      await repository.save(candidate);
    }
  }

  private buildStepValidationPayload(
    existingStep: OnboardingWorkflowStep,
    dto: UpdateOnboardingWorkflowStepDto,
  ): OnboardingWorkflowStepInputDto {
    return {
      approval_level: dto.approval_level ?? existingStep.approval_level,
      step_name: dto.step_name ?? existingStep.step_name,
      task_title: dto.task_title ?? existingStep.task_title ?? undefined,
      task_description: dto.task_description ?? existingStep.task_description ?? undefined,
      task_type: dto.task_type ?? existingStep.task_type,
      assigned_department_id:
        dto.assigned_department_id ?? existingStep.assigned_department_id ?? undefined,
      approver_type: dto.approver_type ?? existingStep.approver_type,
      role_id: dto.role_id ?? existingStep.role_id ?? undefined,
      position_id: dto.position_id ?? existingStep.position_id ?? undefined,
      company_user_id: dto.company_user_id ?? existingStep.company_user_id ?? undefined,
      action_type: dto.action_type ?? existingStep.action_type,
      is_required: dto.is_required ?? existingStep.is_required,
      expected_duration_days:
        dto.expected_duration_days ?? existingStep.expected_duration_days ?? undefined,
    };
  }

  private mapTask(entity: OnboardingTask) {
    return {
      id: entity.id,
      onboarding_request_id: entity.onboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      task_no: entity.task_no,
      title: entity.title,
      description: entity.description,
      task_type: entity.task_type,
      status: entity.status,
      assigned_department_id: entity.assigned_department_id,
      assigned_company_user_id: entity.assigned_company_user_id,
      due_date: entity.due_date,
      started_at: entity.started_at,
      completed_at: entity.completed_at,
      cancelled_at: entity.cancelled_at,
      completion_notes: entity.completion_notes,
    };
  }

  private mapApproval(entity: OnboardingApproval) {
    return {
      id: entity.id,
      onboarding_request_id: entity.onboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      approval_level: entity.approval_level,
      approver_company_user_id: entity.approver_company_user_id,
      status: entity.status,
      comments: entity.comments,
      signature_url: entity.signature_url,
      acted_at: entity.acted_at,
      approver: entity.approver?.user
        ? {
            id: entity.approver.user.id,
            first_name: entity.approver.user.first_name,
            last_name: entity.approver.user.last_name,
            email: entity.approver.user.email,
          }
        : null,
      workflow_step: entity.workflow_step
        ? {
            id: entity.workflow_step.id,
            step_name: entity.workflow_step.step_name,
            action_type: entity.workflow_step.action_type,
          }
        : null,
    };
  }

  private mapDocument(entity: Document) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      module: entity.module,
      document_type: entity.document_type,
      title: entity.title,
      description: entity.description,
      file_name: entity.file_name,
      original_file_name: entity.original_file_name,
      mime_type: entity.mime_type,
      file_extension: entity.file_extension,
      file_size: entity.file_size,
      file_path: entity.file_path,
      is_verified: entity.is_verified,
      verified_at: entity.verified_at,
      verified_by_company_user_id: entity.verified_by_company_user_id,
      uploaded_by_company_user_id: entity.uploaded_by_company_user_id,
      expiry_date: entity.expiry_date,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private mapRequest(entity: OnboardingRequest, documents: Document[] = []) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      workflow_id: entity.workflow_id,
      onboarding_no: entity.onboarding_no,
      title: entity.title,
      description: entity.description,
      planned_start_date: entity.planned_start_date,
      planned_completion_date: entity.planned_completion_date,
      current_approval_level: entity.current_approval_level,
      status: entity.status,
      progress_percentage: entity.progress_percentage,
      rejection_reason: entity.rejection_reason,
      submitted_at: entity.submitted_at,
      started_at: entity.started_at,
      completed_at: entity.completed_at,
      cancelled_at: entity.cancelled_at,
      created_by_company_user_id: entity.created_by_company_user_id,
      finalized_by_company_user_id: entity.finalized_by_company_user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      employee: entity.employee
        ? {
            id: entity.employee.id,
            employee_no: entity.employee.employee_no,
            first_name: entity.employee.first_name,
            last_name: entity.employee.last_name,
            employment_status: entity.employee.employment_status,
            primary_department: entity.employee.primary_department
              ? {
                  id: entity.employee.primary_department.id,
                  name: entity.employee.primary_department.name,
                }
              : null,
            position: entity.employee.position
              ? {
                  id: entity.employee.position.id,
                  name: entity.employee.position.name,
                }
              : null,
          }
        : null,
      workflow: entity.workflow
        ? {
            id: entity.workflow.id,
            name: entity.workflow.name,
            status: entity.workflow.status,
          }
        : null,
      tasks: entity.tasks?.map((task) => this.mapTask(task)) ?? [],
      approvals: entity.approvals?.map((approval) => this.mapApproval(approval)) ?? [],
      documents: documents.map((document) => this.mapDocument(document)),
    };
  }

  private async calculateProgressSummary(
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<ProgressSummary> {
    const taskRepository = this.getOnboardingTaskRepository(manager);
    const approvalRepository = this.getOnboardingApprovalRepository(manager);

    const tasks = await taskRepository.find({
      where: { onboarding_request_id: onboardingRequestId },
    });
    const approvals = await approvalRepository.find({
      where: { onboarding_request_id: onboardingRequestId },
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(
      (task) => task.status === OnboardingTaskStatusEnum.COMPLETED,
    ).length;

    const actionableApprovals = approvals.filter(
      (approval) => approval.status !== OnboardingApprovalStatusEnum.SKIPPED,
    );
    const totalApprovals = actionableApprovals.length;
    const approvedApprovals = actionableApprovals.filter(
      (approval) => approval.status === OnboardingApprovalStatusEnum.APPROVED,
    ).length;

    const totalUnits = totalTasks + totalApprovals;
    const completedUnits = completedTasks + approvedApprovals;
    const progress = totalUnits ? (completedUnits / totalUnits) * 100 : 0;

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      total_approvals: totalApprovals,
      approved_approvals: approvedApprovals,
      progress_percentage: progress.toFixed(2),
    };
  }

  private async updateRequestProgress(
    onboardingRequest: OnboardingRequest,
    manager?: EntityManager,
  ): Promise<ProgressSummary> {
    if (onboardingRequest.status === OnboardingRequestStatusEnum.COMPLETED) {
      onboardingRequest.progress_percentage = '100.00';
      await this.getOnboardingRequestRepository(manager).save(onboardingRequest);
      return {
        total_tasks: 0,
        completed_tasks: 0,
        total_approvals: 0,
        approved_approvals: 0,
        progress_percentage: onboardingRequest.progress_percentage,
      };
    }

    const summary = await this.calculateProgressSummary(onboardingRequest.id, manager);
    onboardingRequest.progress_percentage = summary.progress_percentage;
    await this.getOnboardingRequestRepository(manager).save(onboardingRequest);
    return summary;
  }

  private async createTasksFromWorkflowSteps(
    onboardingRequest: OnboardingRequest,
    steps: OnboardingWorkflowStep[],
    actor: AuthenticatedUser,
    manager?: EntityManager,
  ): Promise<void> {
    const taskRepository = this.getOnboardingTaskRepository(manager);

    for (const step of steps) {
      const taskNo = await this.generateTaskNo(onboardingRequest.id, manager);
      await taskRepository.save(
        taskRepository.create({
          onboarding_request_id: onboardingRequest.id,
          workflow_step_id: step.id,
          task_no: taskNo,
          title: step.task_title ?? step.step_name,
          description: step.task_description,
          task_type: step.task_type ?? OnboardingTaskTypeEnum.GENERAL,
          status: OnboardingTaskStatusEnum.PENDING,
          assigned_department_id: step.assigned_department_id,
          assigned_company_user_id:
            step.approver_type === OnboardingApproverTypeEnum.COMPANY_USER
              ? step.company_user_id
              : null,
          due_date: step.expected_duration_days
            ? new Date(Date.now() + step.expected_duration_days * 86400000)
            : null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      );
    }
  }

  private async findOnboardingRequestOrFail(
    companyId: number,
    onboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<OnboardingRequest> {
    const repository = this.getOnboardingRequestRepository(manager);
    const request = await repository.findOne({
      where: {
        id: onboardingRequestId,
        company_id: companyId,
      },
      relations: {
        employee: {
          company_user: true,
          primary_department: true,
          position: true,
        },
        workflow: true,
        tasks: true,
        approvals: { approver: { user: true }, workflow_step: true },
      },
    });

    if (!request) {
      throw new NotFoundException('Onboarding request not found');
    }

    return request;
  }

  async createOnboardingWorkflow(
    companyId: number,
    dto: CreateOnboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    this.validateWorkflowStepOrder(dto.steps);
    await this.validateWorkflowStepReferences(companyId, dto.steps);

    const created = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOnboardingWorkflowRepository(manager);
      const workflowStepRepository = this.getOnboardingWorkflowStepRepository(manager);

      if (dto.is_default) {
        await workflowRepository.update(
          { company_id: companyId, is_default: true },
          { is_default: false },
        );
      }

      const workflow = await workflowRepository.save(
        workflowRepository.create({
          company_id: companyId,
          name: dto.name.trim(),
          description: this.normalizeOptionalString(dto.description),
          is_default: dto.is_default ?? false,
          status: dto.status ?? OnboardingRecordStatusEnum.ACTIVE,
        }),
      );

      await workflowStepRepository.save(
        dto.steps.map((step) =>
          workflowStepRepository.create({
            workflow_id: workflow.id,
            approval_level: step.approval_level,
            step_name: step.step_name.trim(),
            task_title: this.normalizeOptionalString(step.task_title),
            task_description: this.normalizeOptionalString(step.task_description),
            task_type: step.task_type ?? OnboardingTaskTypeEnum.GENERAL,
            assigned_department_id: step.assigned_department_id ?? null,
            approver_type: step.approver_type,
            role_id: step.role_id ?? null,
            position_id: step.position_id ?? null,
            company_user_id: step.company_user_id ?? null,
            action_type: step.action_type,
            is_required: step.is_required ?? true,
            expected_duration_days: step.expected_duration_days ?? null,
          }),
        ),
      );

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.created',
      entity_name: 'onboarding_workflow',
      entity_id: created.id,
      actor,
    });

    return this.mapWorkflow(created);
  }

  async findAllOnboardingWorkflows(companyId: number, query: OnboardingWorkflowQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
    } = query;

    const qb = this.onboardingWorkflowRepository
      .createQueryBuilder('workflow')
      .leftJoinAndSelect('workflow.steps', 'steps')
      .where('workflow.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('workflow.status = :status', { status: status.trim() });
    }

    if (search?.trim()) {
      qb.andWhere('(workflow.name LIKE :term OR workflow.description LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = ['id', 'name', 'status', 'created_at', 'updated_at'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`workflow.${safeSortBy}`, direction)
      .addOrderBy('steps.approval_level', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.mapWorkflow(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneOnboardingWorkflow(companyId: number, workflowId: number) {
    const workflow = await this.onboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: { steps: true },
      order: { steps: { approval_level: 'ASC' } },
    });

    if (!workflow) {
      throw new NotFoundException('Onboarding workflow not found');
    }

    return this.mapWorkflow(workflow);
  }

  async updateOnboardingWorkflow(
    companyId: number,
    workflowId: number,
    dto: UpdateOnboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOnboardingWorkflowRepository(manager);
      const stepRepository = this.getOnboardingWorkflowStepRepository(manager);
      const workflow = await workflowRepository.findOne({
        where: {
          id: workflowId,
          company_id: companyId,
        },
        relations: { steps: true },
      });

      if (!workflow) {
        throw new NotFoundException('Onboarding workflow not found');
      }

      if (dto.steps) {
        this.validateWorkflowStepOrder(dto.steps);
        await this.validateWorkflowStepReferences(companyId, dto.steps, manager);
      }

      if (dto.name !== undefined) {
        workflow.name = dto.name.trim();
      }
      if (dto.description !== undefined) {
        workflow.description = this.normalizeOptionalString(dto.description);
      }
      if (dto.status !== undefined) {
        workflow.status = dto.status;
      }

      if (dto.is_default !== undefined) {
        workflow.is_default = dto.is_default;
        if (dto.is_default) {
          await workflowRepository.update(
            { company_id: companyId, is_default: true },
            { is_default: false },
          );
          workflow.is_default = true;
        }
      }

      await workflowRepository.save(workflow);

      if (dto.steps) {
        await stepRepository.delete({ workflow_id: workflow.id });
        await stepRepository.save(
          dto.steps.map((step) =>
            stepRepository.create({
              workflow_id: workflow.id,
              approval_level: step.approval_level,
              step_name: step.step_name.trim(),
              task_title: this.normalizeOptionalString(step.task_title),
              task_description: this.normalizeOptionalString(step.task_description),
              task_type: step.task_type ?? OnboardingTaskTypeEnum.GENERAL,
              assigned_department_id: step.assigned_department_id ?? null,
              approver_type: step.approver_type,
              role_id: step.role_id ?? null,
              position_id: step.position_id ?? null,
              company_user_id: step.company_user_id ?? null,
              action_type: step.action_type,
              is_required: step.is_required ?? true,
              expected_duration_days: step.expected_duration_days ?? null,
            }),
          ),
        );
      }

      return workflowRepository.findOneOrFail({
        where: { id: workflow.id },
        relations: { steps: true },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.updated',
      entity_name: 'onboarding_workflow',
      entity_id: updated.id,
      actor,
    });

    return this.mapWorkflow(updated);
  }

  async createOnboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    dto: CreateOnboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    await this.validateWorkflowStepReferences(companyId, [dto]);

    const createdStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOnboardingWorkflowOrFail(companyId, workflowId, manager);
      const repository = this.getOnboardingWorkflowStepRepository(manager);

      const targetLevel = dto.approval_level;
      const maxAllowed = workflow.steps.length + 1;
      if (targetLevel < 1 || targetLevel > maxAllowed) {
        throw new BadRequestException(
          `approval_level must be between 1 and ${maxAllowed} for this workflow`,
        );
      }

      await this.shiftWorkflowStepLevelsUp(workflowId, targetLevel, manager);

      let roleId = dto.role_id ?? null;
      let positionId = dto.position_id ?? null;
      let companyUserId = dto.company_user_id ?? null;
      if (dto.approver_type === OnboardingApproverTypeEnum.ROLE) {
        positionId = null;
        companyUserId = null;
      } else if (dto.approver_type === OnboardingApproverTypeEnum.POSITION) {
        roleId = null;
        companyUserId = null;
      } else {
        roleId = null;
        positionId = null;
      }

      return repository.save(
        repository.create({
          workflow_id: workflowId,
          approval_level: targetLevel,
          step_name: dto.step_name.trim(),
          task_title: this.normalizeOptionalString(dto.task_title),
          task_description: this.normalizeOptionalString(dto.task_description),
          task_type: dto.task_type ?? OnboardingTaskTypeEnum.GENERAL,
          assigned_department_id: dto.assigned_department_id ?? null,
          approver_type: dto.approver_type,
          role_id: roleId,
          position_id: positionId,
          company_user_id: companyUserId,
          action_type: dto.action_type,
          is_required: dto.is_required ?? true,
          expected_duration_days: dto.expected_duration_days ?? null,
        }),
      );
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.step_created',
      entity_name: 'onboarding_workflow_step',
      entity_id: createdStep.id,
      actor,
      payload: {
        workflow_id: workflowId,
        approval_level: createdStep.approval_level,
      },
    });

    return this.mapWorkflowStep(createdStep);
  }

  async updateOnboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    dto: UpdateOnboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const updatedStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOnboardingWorkflowOrFail(companyId, workflowId, manager);
      const existingStep = await this.findOnboardingWorkflowStepOrFail(
        workflowId,
        stepId,
        manager,
      );

      const validationPayload = this.buildStepValidationPayload(existingStep, dto);
      await this.validateWorkflowStepReferences(companyId, [validationPayload], manager);

      const totalSteps = workflow.steps.length;
      const targetLevel = dto.approval_level ?? existingStep.approval_level;
      if (targetLevel < 1 || targetLevel > totalSteps) {
        throw new BadRequestException(
          `approval_level must be between 1 and ${totalSteps} for this workflow`,
        );
      }

      await this.moveWorkflowStepLevel(
        workflowId,
        stepId,
        existingStep.approval_level,
        targetLevel,
        manager,
      );

      existingStep.approval_level = targetLevel;
      if (dto.step_name !== undefined) {
        existingStep.step_name = dto.step_name.trim();
      }
      if (dto.task_title !== undefined) {
        existingStep.task_title = this.normalizeOptionalString(dto.task_title);
      }
      if (dto.task_description !== undefined) {
        existingStep.task_description = this.normalizeOptionalString(dto.task_description);
      }
      if (dto.task_type !== undefined) {
        existingStep.task_type = dto.task_type;
      }
      if (dto.assigned_department_id !== undefined) {
        existingStep.assigned_department_id = dto.assigned_department_id ?? null;
      }
      if (dto.approver_type !== undefined) {
        existingStep.approver_type = dto.approver_type;
      }
      if (dto.role_id !== undefined) {
        existingStep.role_id = dto.role_id ?? null;
      }
      if (dto.position_id !== undefined) {
        existingStep.position_id = dto.position_id ?? null;
      }
      if (dto.company_user_id !== undefined) {
        existingStep.company_user_id = dto.company_user_id ?? null;
      }
      if (dto.action_type !== undefined) {
        existingStep.action_type = dto.action_type;
      }
      if (dto.is_required !== undefined) {
        existingStep.is_required = dto.is_required;
      }
      if (dto.expected_duration_days !== undefined) {
        existingStep.expected_duration_days = dto.expected_duration_days ?? null;
      }

      if (existingStep.approver_type === OnboardingApproverTypeEnum.ROLE) {
        existingStep.position_id = null;
        existingStep.company_user_id = null;
      } else if (existingStep.approver_type === OnboardingApproverTypeEnum.POSITION) {
        existingStep.role_id = null;
        existingStep.company_user_id = null;
      } else {
        existingStep.role_id = null;
        existingStep.position_id = null;
      }

      return this.getOnboardingWorkflowStepRepository(manager).save(existingStep);
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.step_updated',
      entity_name: 'onboarding_workflow_step',
      entity_id: updatedStep.id,
      actor,
      payload: {
        workflow_id: workflowId,
        approval_level: updatedStep.approval_level,
      },
    });

    return this.mapWorkflowStep(updatedStep);
  }

  async removeOnboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const deletedPayload = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOnboardingWorkflowOrFail(companyId, workflowId, manager);
      if (workflow.steps.length <= 1) {
        throw new BadRequestException('Workflow must contain at least one step');
      }

      const step = await this.findOnboardingWorkflowStepOrFail(workflowId, stepId, manager);
      const deletedLevel = step.approval_level;

      await this.getOnboardingWorkflowStepRepository(manager).delete({ id: step.id });
      await this.shiftWorkflowStepLevelsDown(workflowId, deletedLevel, manager);

      return {
        stepId: step.id,
        deletedLevel,
      };
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.step_deleted',
      entity_name: 'onboarding_workflow_step',
      entity_id: deletedPayload.stepId,
      actor,
      payload: {
        workflow_id: workflowId,
        deleted_level: deletedPayload.deletedLevel,
      },
    });

    return { message: 'Onboarding workflow step deleted successfully' };
  }

  async removeOnboardingWorkflow(
    companyId: number,
    workflowId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const workflow = await this.onboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
    });
    if (!workflow) {
      throw new NotFoundException('Onboarding workflow not found');
    }

    workflow.status = OnboardingRecordStatusEnum.INACTIVE;
    workflow.is_default = false;
    await this.onboardingWorkflowRepository.save(workflow);

    await this.onboardingAuditService.log({
      company_id: companyId,
      action: 'onboarding_workflow.deactivated',
      entity_name: 'onboarding_workflow',
      entity_id: workflow.id,
      actor,
    });

    return { message: 'Onboarding workflow deactivated successfully' };
  }

  async createOnboardingRequest(
    companyId: number,
    dto: CreateOnboardingRequestDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (employee.employment_status === EmploymentStatusEnum.ACTIVE) {
      throw new ConflictException('Cannot create onboarding for an active employee');
    }

    if (dto.planned_start_date && dto.planned_completion_date) {
      this.assertDateOrder(
        dto.planned_start_date,
        dto.planned_completion_date,
        'planned_completion_date cannot be before planned_start_date',
      );
    }

    await this.ensureNoActiveOnboarding(companyId, dto.employee_id);

    const shouldSubmit = dto.submit ?? true;

    const request = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const onboardingNo = await this.generateOnboardingNo(companyId, manager);

      const created = await requestRepository.save(
        requestRepository.create({
          company_id: companyId,
          employee_id: dto.employee_id,
          workflow_id: dto.workflow_id ?? null,
          onboarding_no: onboardingNo,
          title: dto.title.trim(),
          description: this.normalizeOptionalString(dto.description),
          planned_start_date: dto.planned_start_date ?? null,
          planned_completion_date: dto.planned_completion_date ?? null,
          current_approval_level: 0,
          status: shouldSubmit
            ? OnboardingRequestStatusEnum.SUBMITTED
            : OnboardingRequestStatusEnum.DRAFT,
          progress_percentage: '0.00',
          submitted_at: shouldSubmit ? new Date() : null,
          started_at: shouldSubmit ? new Date() : null,
          created_by_company_user_id: actor.companyMembershipId!,
        }),
      );

      if (shouldSubmit) {
        const init = await this.onboardingWorkflowService.initializeApprovalsForRequest(
          companyId,
          created,
          dto.workflow_id ?? null,
          manager,
        );
        await this.createTasksFromWorkflowSteps(created, init.steps, actor, manager);
      }

      await this.updateRequestProgress(created, manager);

      return requestRepository.findOneOrFail({
        where: { id: created.id },
        relations: {
          employee: { company_user: true, primary_department: true, position: true },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: request.id,
      action: 'onboarding_request.created',
      entity_name: 'onboarding_request',
      entity_id: request.id,
      actor,
      payload: {
        onboarding_no: request.onboarding_no,
        status: request.status,
      },
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: request.id,
      },
    });

    return this.mapRequest(request, documents);
  }

  async updateOnboardingRequest(
    companyId: number,
    onboardingRequestId: number,
    dto: UpdateOnboardingRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Cannot update a closed onboarding request');
    }

    if (dto.planned_start_date && dto.planned_completion_date) {
      this.assertDateOrder(
        dto.planned_start_date,
        dto.planned_completion_date,
        'planned_completion_date cannot be before planned_start_date',
      );
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOnboardingRequestRepository(manager);
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const approvalRepository = this.getOnboardingApprovalRepository(manager);

      const current = await repository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });

      if (dto.title !== undefined) {
        current.title = dto.title.trim();
      }
      if (dto.description !== undefined) {
        current.description = this.normalizeOptionalString(dto.description);
      }
      if (dto.planned_start_date !== undefined) {
        current.planned_start_date = dto.planned_start_date ?? null;
      }
      if (dto.planned_completion_date !== undefined) {
        current.planned_completion_date = dto.planned_completion_date ?? null;
      }

      const workflowChanged =
        dto.workflow_id !== undefined && dto.workflow_id !== current.workflow_id;
      if (workflowChanged) {
        current.workflow_id = dto.workflow_id ?? null;
        await approvalRepository.delete({ onboarding_request_id: current.id });
        await taskRepository.delete({ onboarding_request_id: current.id });

        const init = await this.onboardingWorkflowService.initializeApprovalsForRequest(
          companyId,
          current,
          dto.workflow_id ?? null,
          manager,
        );
        await this.createTasksFromWorkflowSteps(current, init.steps, actor, manager);
      }

      await repository.save(current);
      await this.updateRequestProgress(current, manager);

      return repository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: { company_user: true, primary_department: true, position: true },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: updated.id,
      action: 'onboarding_request.updated',
      entity_name: 'onboarding_request',
      entity_id: updated.id,
      actor,
      payload: {
        status: updated.status,
      },
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: updated.id,
      },
    });

    return this.mapRequest(updated, documents);
  }

  async findAllOnboardingRequests(
    companyId: number,
    query: OnboardingRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      employee_id,
      status,
    } = query;

    const qb = this.onboardingRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .leftJoinAndSelect('employee.company_user', 'membership')
      .leftJoinAndSelect('employee.primary_department', 'department')
      .leftJoinAndSelect('employee.position', 'position')
      .leftJoinAndSelect('request.workflow', 'workflow')
      .leftJoinAndSelect('request.tasks', 'tasks')
      .leftJoinAndSelect('request.approvals', 'approvals')
      .leftJoinAndSelect('approvals.approver', 'approvalMembership')
      .leftJoinAndSelect('approvalMembership.user', 'approvalUser')
      .leftJoinAndSelect('approvals.workflow_step', 'workflowStep')
      .where('request.company_id = :companyId', { companyId });

    if (typeof employee_id === 'number') {
      qb.andWhere('request.employee_id = :employeeId', { employeeId: employee_id });
    }

    if (status?.trim()) {
      qb.andWhere('request.status = :status', { status: status.trim() });
    }

    if (search?.trim()) {
      qb.andWhere('(request.onboarding_no LIKE :term OR employee.employee_no LIKE :term)', {
        term: `%${search.trim()}%`,
      });
    }

    const allowedSortFields = [
      'id',
      'onboarding_no',
      'status',
      'progress_percentage',
      'created_at',
      'updated_at',
    ];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`request.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    if (typeof employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(companyId, employee_id);
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: In(items.map((item) => item.id)),
      },
    });
    const documentsMap = new Map<number, Document[]>();
    documents.forEach((document) => {
      const current = documentsMap.get(document.entity_id) ?? [];
      current.push(document);
      documentsMap.set(document.entity_id, current);
    });

    return {
      data: items.map((item) => this.mapRequest(item, documentsMap.get(item.id) ?? [])),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOneOnboardingRequest(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: request.id,
      },
      order: { created_at: 'DESC' },
    });

    return this.mapRequest(request, documents);
  }

  async completeOnboarding(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Onboarding request is already closed');
    }

    const hasOpenTasks = request.tasks.some(
      (task) => task.status !== OnboardingTaskStatusEnum.COMPLETED,
    );
    if (hasOpenTasks) {
      throw new BadRequestException('All onboarding tasks must be completed before finalizing');
    }

    const hasRejectedApproval = request.approvals.some(
      (approval) => approval.status === OnboardingApprovalStatusEnum.REJECTED,
    );
    if (hasRejectedApproval) {
      throw new BadRequestException(
        'Cannot complete onboarding with rejected approval decisions',
      );
    }

    const hasPendingApproval = request.approvals.some(
      (approval) => approval.status === OnboardingApprovalStatusEnum.PENDING,
    );
    if (hasPendingApproval) {
      throw new BadRequestException(
        'All onboarding approvals must be completed before finalizing',
      );
    }

    const completed = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const employeeRepository = this.getEmployeeRepository(manager);

      const current = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
        relations: { employee: { company_user: true } },
      });

      current.status = OnboardingRequestStatusEnum.COMPLETED;
      current.completed_at = new Date();
      current.finalized_by_company_user_id = actor.companyMembershipId ?? null;
      current.progress_percentage = '100.00';
      current.current_approval_level = 0;
      await requestRepository.save(current);

      const employee = await employeeRepository.findOneOrFail({
        where: { id: current.employee_id },
      });
      employee.employment_status = EmploymentStatusEnum.ACTIVE;
      if (!employee.hire_date) {
        employee.hire_date = this.formatDateOnly(new Date());
      }
      await employeeRepository.save(employee);

      return requestRepository.findOneOrFail({
        where: { id: current.id },
        relations: {
          employee: { company_user: true, primary_department: true, position: true },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: completed.id,
      action: 'onboarding_request.completed',
      entity_name: 'onboarding_request',
      entity_id: completed.id,
      actor,
    });

    return {
      message: 'Onboarding completed successfully',
      data: this.mapRequest(completed),
    };
  }

  async cancelOnboarding(
    companyId: number,
    onboardingRequestId: number,
    dto: CancelOnboardingRequestDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Onboarding request is already closed');
    }

    const cancelled = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOnboardingRequestRepository(manager);
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const current = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });

      await this.onboardingWorkflowService.closeAllPendingApprovals(
        current.id,
        'Skipped after onboarding cancellation',
        manager,
      );

      const openTasks = await taskRepository.find({
        where: {
          onboarding_request_id: current.id,
          status: In([OnboardingTaskStatusEnum.PENDING, OnboardingTaskStatusEnum.IN_PROGRESS]),
        },
      });
      if (openTasks.length) {
        openTasks.forEach((task) => {
          task.status = OnboardingTaskStatusEnum.CANCELLED;
          task.cancelled_at = new Date();
          task.completion_notes = task.completion_notes ?? 'Task cancelled with onboarding';
        });
        await taskRepository.save(openTasks);
      }

      current.status = OnboardingRequestStatusEnum.CANCELLED;
      current.cancelled_at = new Date();
      current.rejection_reason = dto.reason?.trim() || null;
      await requestRepository.save(current);
      await this.updateRequestProgress(current, manager);

      return current;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: cancelled.id,
      action: 'onboarding_request.cancelled',
      entity_name: 'onboarding_request',
      entity_id: cancelled.id,
      actor,
      payload: { reason: dto.reason ?? null },
    });

    return { message: 'Onboarding request cancelled successfully' };
  }

  async createTask(
    companyId: number,
    onboardingRequestId: number,
    dto: CreateOnboardingTaskDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OnboardingRequestStatusEnum.CANCELLED ||
      request.status === OnboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Cannot add task to closed onboarding request');
    }

    if (dto.assigned_department_id) {
      const department = await this.departmentRepository.findOne({
        where: {
          id: dto.assigned_department_id,
          company_id: companyId,
        },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    if (dto.assigned_company_user_id) {
      const membership = await this.companyUserRepository.findOne({
        where: {
          id: dto.assigned_company_user_id,
          company_id: companyId,
        },
      });
      if (!membership) {
        throw new NotFoundException('Assigned company user not found');
      }
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const requestRepository = this.getOnboardingRequestRepository(manager);

      const task = await taskRepository.save(
        taskRepository.create({
          onboarding_request_id: onboardingRequestId,
          workflow_step_id: null,
          task_no: await this.generateTaskNo(onboardingRequestId, manager),
          title: dto.title.trim(),
          description: this.normalizeOptionalString(dto.description),
          task_type: dto.task_type ?? OnboardingTaskTypeEnum.GENERAL,
          status: OnboardingTaskStatusEnum.PENDING,
          assigned_department_id: dto.assigned_department_id ?? null,
          assigned_company_user_id: dto.assigned_company_user_id ?? null,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          created_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return task;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_task.created',
      entity_name: 'onboarding_task',
      entity_id: created.id,
      actor,
    });

    return this.mapTask(created);
  }

  async completeTask(
    companyId: number,
    onboardingRequestId: number,
    taskId: number,
    dto: CompleteOnboardingTaskDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const task = await this.onboardingTaskRepository.findOne({
      where: {
        id: taskId,
        onboarding_request_id: onboardingRequestId,
      },
    });
    if (!task) {
      throw new NotFoundException('Onboarding task not found');
    }

    if (task.status === OnboardingTaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Task is already completed');
    }
    if (task.status === OnboardingTaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Task is cancelled');
    }

    const updated = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOnboardingTaskRepository(manager);
      const requestRepository = this.getOnboardingRequestRepository(manager);

      const currentTask = await taskRepository.findOneOrFail({
        where: { id: taskId, onboarding_request_id: onboardingRequestId },
      });

      currentTask.status = OnboardingTaskStatusEnum.COMPLETED;
      currentTask.started_at = currentTask.started_at ?? new Date();
      currentTask.completed_at = new Date();
      currentTask.completed_by_company_user_id = actor.companyMembershipId ?? null;
      currentTask.completion_notes = dto.completion_notes?.trim() || null;
      await taskRepository.save(currentTask);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return currentTask;
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_task.completed',
      entity_name: 'onboarding_task',
      entity_id: updated.id,
      actor,
    });

    return this.mapTask(updated);
  }

  async applyApprovalAction(
    companyId: number,
    onboardingRequestId: number,
    dto: OnboardingApprovalActionDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = actor.companyMembershipId!;

    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const updated = await this.dataSource.transaction(async (manager) => {
      const current = await this.onboardingWorkflowService.applyApprovalAction(
        onboardingRequestId,
        membershipId,
        dto,
        manager,
      );
      await this.updateRequestProgress(current, manager);

      return this.getOnboardingRequestRepository(manager).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
        relations: {
          employee: { company_user: true, primary_department: true, position: true },
          workflow: true,
          tasks: true,
          approvals: { approver: { user: true }, workflow_step: true },
        },
      });
    });

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: updated.id,
      action: dto.approve
        ? 'onboarding_request.approved_step'
        : 'onboarding_request.rejected',
      entity_name: 'onboarding_request',
      entity_id: updated.id,
      actor,
      payload: {
        status: updated.status,
        current_approval_level: updated.current_approval_level,
      },
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: updated.id,
      },
    });

    return this.mapRequest(updated, documents);
  }

  async addDocument(
    companyId: number,
    onboardingRequestId: number,
    dto: UploadDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.getDocumentRepository().save(
      this.getDocumentRepository().create({
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
        module: DocumentModuleEnum.ONBOARDING,
        document_type: this.normalizeOptionalString(dto.document_type),
        title: dto.title.trim(),
        description: this.normalizeOptionalString(dto.description),
        file_name: dto.file_name.trim(),
        original_file_name: dto.original_file_name.trim(),
        mime_type: this.normalizeOptionalString(dto.mime_type),
        file_extension: this.normalizeOptionalString(dto.file_extension),
        file_size: this.normalizeOptionalString(dto.file_size),
        file_path: dto.file_path.trim(),
        uploaded_by_company_user_id: actor.companyMembershipId ?? null,
        expiry_date: dto.expiry_date ? new Date(dto.expiry_date) : null,
      }),
    );

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: 'onboarding_document.uploaded',
      entity_name: 'document',
      entity_id: document.id,
      actor,
      payload: {
        title: document.title,
        document_type: document.document_type,
      },
    });

    return this.mapDocument(document);
  }

  async verifyDocument(
    companyId: number,
    onboardingRequestId: number,
    documentId: number,
    dto: VerifyDocumentDto,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.documentRepository.findOne({
      where: {
        id: documentId,
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.ONBOARDING,
        entity_id: onboardingRequestId,
      },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    document.is_verified = dto.is_verified;
    document.verified_at = dto.is_verified ? new Date() : null;
    document.verified_by_company_user_id = dto.is_verified
      ? actor.companyMembershipId ?? null
      : null;

    const saved = await this.documentRepository.save(document);

    await this.onboardingAuditService.log({
      company_id: companyId,
      onboarding_request_id: onboardingRequestId,
      action: dto.is_verified ? 'onboarding_document.verified' : 'onboarding_document.unverified',
      entity_name: 'document',
      entity_id: saved.id,
      actor,
    });

    return this.mapDocument(saved);
  }

  async getOnboardingProgress(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const summary = await this.dataSource.transaction(async (manager) => {
      const current = await this.getOnboardingRequestRepository(manager).findOneOrFail({
        where: { id: onboardingRequestId, company_id: companyId },
      });
      const progress = await this.updateRequestProgress(current, manager);
      return progress;
    });

    return {
      onboarding_request_id: request.id,
      onboarding_no: request.onboarding_no,
      status: request.status,
      progress_percentage: summary.progress_percentage,
      tasks: {
        total: summary.total_tasks,
        completed: summary.completed_tasks,
      },
      approvals: {
        total: summary.total_approvals,
        approved: summary.approved_approvals,
      },
    };
  }

  async getOnboardingAuditLogs(
    companyId: number,
    onboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOnboardingRequestOrFail(companyId, onboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const logs = await this.onboardingAuditLogRepository.find({
      where: {
        company_id: companyId,
        onboarding_request_id: onboardingRequestId,
      },
      relations: {
        actor_company_user: {
          user: true,
        },
      },
      order: { id: 'DESC' },
    });

    return logs.map((entry) => ({
      id: entry.id,
      company_id: entry.company_id,
      onboarding_request_id: entry.onboarding_request_id,
      action: entry.action,
      entity_name: entry.entity_name,
      entity_id: entry.entity_id,
      payload: entry.payload,
      created_at: entry.created_at,
      actor_company_user_id: entry.actor_company_user_id,
      actor_user_id: entry.actor_user_id,
      actor: entry.actor_company_user?.user
        ? {
            id: entry.actor_company_user.user.id,
            first_name: entry.actor_company_user.user.first_name,
            last_name: entry.actor_company_user.user.last_name,
            email: entry.actor_company_user.user.email,
          }
        : null,
    }));
  }
}
