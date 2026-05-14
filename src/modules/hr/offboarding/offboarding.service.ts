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
import { Branch } from '../branches/entities/branch.entity';
import { Document } from '../documents/entities/document.entity';
import { DocumentEntityTypeEnum } from '../documents/enums/document-entity-type.enum';
import { DocumentModuleEnum } from '../documents/enums/document-module.enum';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import { Position } from '../positions/entities/position.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { CancelOffboardingRequestDto } from './dtos/cancel-offboarding-request.dto';
import { CompleteOffboardingClearanceDto } from './dtos/complete-offboarding-clearance.dto';
import { CompleteOffboardingTaskDto } from './dtos/complete-offboarding-task.dto';
import { CreateOffboardingClearanceDto } from './dtos/create-offboarding-clearance.dto';
import { CreateOffboardingRequestDto } from './dtos/create-offboarding-request.dto';
import { CreateOffboardingTaskDto } from './dtos/create-offboarding-task.dto';
import { CreateOffboardingWorkflowStepDto } from './dtos/create-offboarding-workflow-step.dto';
import { CreateOffboardingWorkflowDto } from './dtos/create-offboarding-workflow.dto';
import { OffboardingRequestQueryDto } from './dtos/offboarding-request-query.dto';
import { OffboardingWorkflowQueryDto } from './dtos/offboarding-workflow-query.dto';
import { OffboardingWorkflowStepInputDto } from './dtos/offboarding-workflow-step-input.dto';
import { RejectOffboardingTaskDto } from './dtos/reject-offboarding-task.dto';
import { SubmitOffboardingRequestDto } from './dtos/submit-offboarding-request.dto';
import { UpdateOffboardingRequestDto } from './dtos/update-offboarding-request.dto';
import { UpdateOffboardingWorkflowStepDto } from './dtos/update-offboarding-workflow-step.dto';
import { UpdateOffboardingWorkflowDto } from './dtos/update-offboarding-workflow.dto';
import { UploadOffboardingDocumentDto } from './dtos/upload-offboarding-document.dto';
import { OffboardingApprovalActionTypeEnum } from './enums/offboarding-approval-action-type.enum';
import { OffboardingApprovalStatusEnum } from './enums/offboarding-approval-status.enum';
import { OffboardingApproverTypeEnum } from './enums/offboarding-approver-type.enum';
import { OffboardingAuditActionEnum } from './enums/offboarding-audit-action.enum';
import { OffboardingClearanceStatusEnum } from './enums/offboarding-clearance-status.enum';
import { OffboardingRecordStatusEnum } from './enums/offboarding-record-status.enum';
import { OffboardingRequestStatusEnum } from './enums/offboarding-request-status.enum';
import { OffboardingTaskPriorityEnum } from './enums/offboarding-task-priority.enum';
import { OffboardingTaskStatusEnum } from './enums/offboarding-task-status.enum';
import { OffboardingTaskTypeEnum } from './enums/offboarding-task-type.enum';
import { OffboardingTypeEnum } from './enums/offboarding-type.enum';
import { OffboardingApproval } from './entities/offboarding-approval.entity';
import { OffboardingAuditLog } from './entities/offboarding-audit-log.entity';
import { OffboardingClearance } from './entities/offboarding-clearance.entity';
import { OffboardingRequest } from './entities/offboarding-request.entity';
import { OffboardingTask } from './entities/offboarding-task.entity';
import { OffboardingWorkflowStep } from './entities/offboarding-workflow-step.entity';
import { OffboardingWorkflow } from './entities/offboarding-workflow.entity';
import { OffboardingAuditService } from './services/offboarding-audit.service';
import { OffboardingWorkflowService } from './services/offboarding-workflow.service';

type ProgressSummary = {
  total_tasks: number;
  completed_tasks: number;
  total_approvals: number;
  approved_approvals: number;
  total_clearances: number;
  cleared_clearances: number;
  progress_percentage: string;
};

type RequestContext = {
  ip_address?: string | null;
  user_agent?: string | null;
};

@Injectable()
export class OffboardingService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    @InjectRepository(OffboardingWorkflow)
    private readonly offboardingWorkflowRepository: Repository<OffboardingWorkflow>,
    @InjectRepository(OffboardingWorkflowStep)
    private readonly offboardingWorkflowStepRepository: Repository<OffboardingWorkflowStep>,
    @InjectRepository(OffboardingRequest)
    private readonly offboardingRequestRepository: Repository<OffboardingRequest>,
    @InjectRepository(OffboardingTask)
    private readonly offboardingTaskRepository: Repository<OffboardingTask>,
    @InjectRepository(OffboardingApproval)
    private readonly offboardingApprovalRepository: Repository<OffboardingApproval>,
    @InjectRepository(OffboardingClearance)
    private readonly offboardingClearanceRepository: Repository<OffboardingClearance>,
    @InjectRepository(OffboardingAuditLog)
    private readonly offboardingAuditLogRepository: Repository<OffboardingAuditLog>,
    @InjectRepository(Document)
    private readonly documentRepository: Repository<Document>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    private readonly hrAccessService: HrAccessService,
    private readonly offboardingAuditService: OffboardingAuditService,
    private readonly offboardingWorkflowService: OffboardingWorkflowService,
  ) {}

  private getOffboardingWorkflowRepository(
    manager?: EntityManager,
  ): Repository<OffboardingWorkflow> {
    return manager?.getRepository(OffboardingWorkflow) ?? this.offboardingWorkflowRepository;
  }

  private getOffboardingWorkflowStepRepository(
    manager?: EntityManager,
  ): Repository<OffboardingWorkflowStep> {
    return manager?.getRepository(OffboardingWorkflowStep) ?? this.offboardingWorkflowStepRepository;
  }

  private getOffboardingRequestRepository(
    manager?: EntityManager,
  ): Repository<OffboardingRequest> {
    return manager?.getRepository(OffboardingRequest) ?? this.offboardingRequestRepository;
  }

  private getOffboardingTaskRepository(manager?: EntityManager): Repository<OffboardingTask> {
    return manager?.getRepository(OffboardingTask) ?? this.offboardingTaskRepository;
  }

  private getOffboardingApprovalRepository(
    manager?: EntityManager,
  ): Repository<OffboardingApproval> {
    return manager?.getRepository(OffboardingApproval) ?? this.offboardingApprovalRepository;
  }

  private getOffboardingClearanceRepository(
    manager?: EntityManager,
  ): Repository<OffboardingClearance> {
    return manager?.getRepository(OffboardingClearance) ?? this.offboardingClearanceRepository;
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

  private getBranchRepository(manager?: EntityManager): Repository<Branch> {
    return manager?.getRepository(Branch) ?? this.branchRepository;
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

  private normalizeOptionalDate(value?: string): string | null {
    if (!value) {
      return null;
    }
    return value;
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
        primary_position: true,
      },
    });

    if (!employee || employee.company_user.company_id !== companyId) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private async findOffboardingRequestOrFail(
    companyId: number,
    offboardingRequestId: number,
    manager?: EntityManager,
  ): Promise<OffboardingRequest> {
    const repository = this.getOffboardingRequestRepository(manager);
    const request = await repository.findOne({
      where: { id: offboardingRequestId, company_id: companyId },
      relations: {
        employee: {
          company_user: true,
          primary_department: true,
          primary_position: true,
        },
        workflow: true,
        tasks: { assigned_to_company_user: { user: true } },
        approvals: {
          approver_company_user: { user: true },
          workflow_step: true,
        },
        clearances: { cleared_by_company_user: { user: true } },
      },
      order: {
        tasks: { id: 'ASC' },
        approvals: { id: 'ASC' },
        clearances: { id: 'ASC' },
      },
    });

    if (!request) {
      throw new NotFoundException('Offboarding request not found');
    }

    return request;
  }

  private async ensureNoActiveOffboarding(
    companyId: number,
    employeeId: number,
    manager?: EntityManager,
    ignoreRequestId?: number,
  ): Promise<void> {
    const repository = this.getOffboardingRequestRepository(manager);
    const qb = repository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.employee_id = :employeeId', { employeeId })
      .andWhere('request.status IN (:...statuses)', {
        statuses: [
          OffboardingRequestStatusEnum.DRAFT,
          OffboardingRequestStatusEnum.PENDING,
          OffboardingRequestStatusEnum.IN_PROGRESS,
          OffboardingRequestStatusEnum.WAITING_APPROVAL,
          OffboardingRequestStatusEnum.APPROVED,
        ],
      });

    if (ignoreRequestId) {
      qb.andWhere('request.id != :ignoreRequestId', { ignoreRequestId });
    }

    const existing = await qb.getOne();
    if (existing) {
      throw new ConflictException(
        `Employee already has active offboarding request ${existing.offboarding_code}`,
      );
    }
  }

  private async generateOffboardingCode(
    companyId: number,
    manager?: EntityManager,
  ): Promise<string> {
    const repository = this.getOffboardingRequestRepository(manager);
    const year = new Date().getFullYear();
    const prefix = `OFF-${year}-`;
    const latest = await repository
      .createQueryBuilder('request')
      .where('request.company_id = :companyId', { companyId })
      .andWhere('request.offboarding_code LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('request.id', 'DESC')
      .getOne();

    const nextSequence = latest ? Number(latest.offboarding_code.split('-').pop() ?? '0') + 1 : 1;
    return `${prefix}${String(nextSequence).padStart(6, '0')}`;
  }

  private validateWorkflowStepOrder(steps: OffboardingWorkflowStepInputDto[]): void {
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
    steps: OffboardingWorkflowStepInputDto[],
    manager?: EntityManager,
  ): Promise<void> {
    const branchIds = steps
      .map((step) => step.assigned_branch_id)
      .filter((value): value is number => typeof value === 'number');
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

    if (branchIds.length) {
      const branches = await this.getBranchRepository(manager).count({
        where: {
          id: In([...new Set(branchIds)]),
          company_id: companyId,
        },
      });
      if (branches !== new Set(branchIds).size) {
        throw new BadRequestException('One or more assigned branches are invalid');
      }
    }

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
      if (step.assigned_branch_id && step.assigned_department_id) {
        const department = await this.getDepartmentRepository(manager).findOne({
          where: {
            id: step.assigned_department_id,
            company_id: companyId,
          },
        });

        if (
          department?.branch_id &&
          department.branch_id !== step.assigned_branch_id
        ) {
          throw new BadRequestException(
            `Department ${step.assigned_department_id} does not belong to branch ${step.assigned_branch_id}`,
          );
        }
      }

      if (step.position_id) {
        const position = await this.getPositionRepository(manager).findOne({
          where: {
            id: step.position_id,
            company_id: companyId,
          },
        });

        if (
          position?.branch_id &&
          step.assigned_branch_id &&
          position.branch_id !== step.assigned_branch_id
        ) {
          throw new BadRequestException(
            `Position ${step.position_id} does not belong to branch ${step.assigned_branch_id}`,
          );
        }

        if (
          position?.department_id &&
          step.assigned_department_id &&
          position.department_id !== step.assigned_department_id
        ) {
          throw new BadRequestException(
            `Position ${step.position_id} does not belong to department ${step.assigned_department_id}`,
          );
        }
      }

      if (step.approver_type === OffboardingApproverTypeEnum.ROLE && !step.role_id) {
        throw new BadRequestException('role_id is required for role approver type');
      }
      if (
        step.approver_type === OffboardingApproverTypeEnum.POSITION &&
        !step.position_id
      ) {
        throw new BadRequestException('position_id is required for position approver type');
      }
      if (
        step.approver_type === OffboardingApproverTypeEnum.COMPANY_USER &&
        !step.company_user_id
      ) {
        throw new BadRequestException(
          'company_user_id is required for company_user approver type',
        );
      }
    }
  }

  private mapWorkflowStep(entity: OffboardingWorkflowStep) {
    return {
      id: entity.id,
      workflow_id: entity.workflow_id,
      approval_level: entity.approval_level,
      step_name: entity.step_name,
      task_title: entity.task_title,
      task_description: entity.task_description,
      task_type: entity.task_type,
      assigned_branch_id: entity.assigned_branch_id,
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

  private mapWorkflow(entity?: OffboardingWorkflow | null) {
    if (!entity) {
      return null;
    }

    return {
      id: entity.id,
      company_id: entity.company_id,
      name: entity.name,
      description: entity.description,
      is_default: entity.is_default,
      status: entity.status,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      steps: entity.steps?.map((step) => this.mapWorkflowStep(step)) ?? [],
    };
  }

  private async findOffboardingWorkflowOrFail(
    companyId: number,
    workflowId: number,
    manager?: EntityManager,
  ): Promise<OffboardingWorkflow> {
    const repository = this.getOffboardingWorkflowRepository(manager);
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
      throw new NotFoundException('Offboarding workflow not found');
    }

    return workflow;
  }

  private async findOffboardingWorkflowStepOrFail(
    workflowId: number,
    stepId: number,
    manager?: EntityManager,
  ): Promise<OffboardingWorkflowStep> {
    const repository = this.getOffboardingWorkflowStepRepository(manager);
    const step = await repository.findOne({
      where: {
        id: stepId,
        workflow_id: workflowId,
      },
    });

    if (!step) {
      throw new NotFoundException('Offboarding workflow step not found');
    }

    return step;
  }

  private async shiftWorkflowStepLevelsUp(
    workflowId: number,
    fromLevel: number,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = this.getOffboardingWorkflowStepRepository(manager);
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
    const repository = this.getOffboardingWorkflowStepRepository(manager);
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

    const repository = this.getOffboardingWorkflowStepRepository(manager);
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
    existingStep: OffboardingWorkflowStep,
    dto: UpdateOffboardingWorkflowStepDto,
  ): OffboardingWorkflowStepInputDto {
    return {
      approval_level: dto.approval_level ?? existingStep.approval_level,
      step_name: dto.step_name ?? existingStep.step_name,
      task_title: dto.task_title ?? existingStep.task_title,
      task_description: dto.task_description ?? existingStep.task_description ?? undefined,
      task_type: dto.task_type ?? existingStep.task_type,
      assigned_branch_id:
        dto.assigned_branch_id ?? existingStep.assigned_branch_id ?? undefined,
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

  private mapTask(entity: OffboardingTask) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      offboarding_request_id: entity.offboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      assigned_to_company_user_id: entity.assigned_to_company_user_id,
      title: entity.title,
      description: entity.description,
      task_type: entity.task_type,
      status: entity.status,
      priority: entity.priority,
      due_date: entity.due_date,
      completed_at: entity.completed_at,
      remarks: entity.remarks,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      assigned_to:
        entity.assigned_to_company_user?.user
          ? {
              id: entity.assigned_to_company_user.user.id,
              first_name: entity.assigned_to_company_user.user.first_name,
              last_name: entity.assigned_to_company_user.user.last_name,
              email: entity.assigned_to_company_user.user.email,
            }
          : null,
    };
  }

  private mapApproval(entity: OffboardingApproval) {
    return {
      id: entity.id,
      offboarding_request_id: entity.offboarding_request_id,
      workflow_step_id: entity.workflow_step_id,
      approver_company_user_id: entity.approver_company_user_id,
      status: entity.status,
      comments: entity.comments,
      acted_at: entity.acted_at,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      approval_level: entity.workflow_step?.approval_level ?? null,
      step_name: entity.workflow_step?.step_name ?? null,
      approver:
        entity.approver_company_user?.user
          ? {
              id: entity.approver_company_user.user.id,
              first_name: entity.approver_company_user.user.first_name,
              last_name: entity.approver_company_user.user.last_name,
              email: entity.approver_company_user.user.email,
            }
          : null,
    };
  }

  private mapClearance(entity: OffboardingClearance) {
    return {
      id: entity.id,
      offboarding_request_id: entity.offboarding_request_id,
      clearance_type: entity.clearance_type,
      status: entity.status,
      remarks: entity.remarks,
      cleared_by_company_user_id: entity.cleared_by_company_user_id,
      cleared_at: entity.cleared_at,
      created_at: entity.created_at,
      cleared_by:
        entity.cleared_by_company_user?.user
          ? {
              id: entity.cleared_by_company_user.user.id,
              first_name: entity.cleared_by_company_user.user.first_name,
              last_name: entity.cleared_by_company_user.user.last_name,
              email: entity.cleared_by_company_user.user.email,
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
      uploaded_by_company_user_id: entity.uploaded_by_company_user_id,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
    };
  }

  private mapRequest(entity: OffboardingRequest, documents: Document[] = []) {
    return {
      id: entity.id,
      company_id: entity.company_id,
      employee_id: entity.employee_id,
      branch_id: entity.branch_id,
      department_id: entity.department_id,
      workflow_id: entity.workflow_id,
      created_by_company_user_id: entity.created_by_company_user_id,
      offboarding_code: entity.offboarding_code,
      title: entity.title,
      description: entity.description,
      offboarding_type: entity.offboarding_type,
      reason: entity.reason,
      notice_date: entity.notice_date,
      last_working_date: entity.last_working_date,
      submitted_at: entity.submitted_at,
      completed_at: entity.completed_at,
      cancelled_at: entity.cancelled_at,
      status: entity.status,
      progress_percentage: entity.progress_percentage,
      metadata: entity.metadata,
      created_at: entity.created_at,
      updated_at: entity.updated_at,
      employee: {
        id: entity.employee.id,
        employee_no: entity.employee.employee_no,
        first_name: entity.employee.first_name,
        middle_name: entity.employee.middle_name,
        last_name: entity.employee.last_name,
        employment_status: entity.employee.employment_status,
      },
      workflow: this.mapWorkflow(entity.workflow),
      tasks: entity.tasks?.map((task) => this.mapTask(task)) ?? [],
      approvals: entity.approvals?.map((approval) => this.mapApproval(approval)) ?? [],
      clearances: entity.clearances?.map((clearance) => this.mapClearance(clearance)) ?? [],
      documents: documents.map((document) => this.mapDocument(document)),
    };
  }

  private resolveFinalEmployeeStatus(type: OffboardingTypeEnum): EmploymentStatusEnum {
    switch (type) {
      case OffboardingTypeEnum.TERMINATION:
        return EmploymentStatusEnum.TERMINATED;
      case OffboardingTypeEnum.RESIGNATION:
        return EmploymentStatusEnum.RESIGNED;
      case OffboardingTypeEnum.RETIREMENT:
        return EmploymentStatusEnum.RETIRED;
      default:
        return EmploymentStatusEnum.INACTIVE;
    }
  }

  private async updateRequestProgress(
    request: OffboardingRequest,
    manager?: EntityManager,
  ): Promise<ProgressSummary> {
    const taskRepository = this.getOffboardingTaskRepository(manager);
    const approvalRepository = this.getOffboardingApprovalRepository(manager);
    const clearanceRepository = this.getOffboardingClearanceRepository(manager);
    const requestRepository = this.getOffboardingRequestRepository(manager);

    const [tasks, approvals, clearances] = await Promise.all([
      taskRepository.find({ where: { offboarding_request_id: request.id } }),
      approvalRepository.find({ where: { offboarding_request_id: request.id } }),
      clearanceRepository.find({ where: { offboarding_request_id: request.id } }),
    ]);

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.status === OffboardingTaskStatusEnum.COMPLETED).length;
    const totalApprovals = approvals.length;
    const approvedApprovals = approvals.filter(
      (approval) =>
        approval.status === OffboardingApprovalStatusEnum.APPROVED ||
        approval.status === OffboardingApprovalStatusEnum.SKIPPED,
    ).length;
    const totalClearances = clearances.length;
    const clearedClearances = clearances.filter(
      (clearance) => clearance.status === OffboardingClearanceStatusEnum.CLEARED,
    ).length;

    const ratios: number[] = [];
    if (totalTasks > 0) {
      ratios.push(completedTasks / totalTasks);
    }
    if (totalApprovals > 0) {
      ratios.push(approvedApprovals / totalApprovals);
    }
    if (totalClearances > 0) {
      ratios.push(clearedClearances / totalClearances);
    }

    const progressValue = ratios.length
      ? (ratios.reduce((sum, value) => sum + value, 0) / ratios.length) * 100
      : 0;
    request.progress_percentage = progressValue.toFixed(2);

    if (
      request.status !== OffboardingRequestStatusEnum.CANCELLED &&
      request.status !== OffboardingRequestStatusEnum.REJECTED &&
      request.status !== OffboardingRequestStatusEnum.COMPLETED
    ) {
      const hasPendingApprovals = approvals.some(
        (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
      );

      if (hasPendingApprovals) {
        request.status = OffboardingRequestStatusEnum.WAITING_APPROVAL;
      } else {
        const hasOpenTasks = tasks.some(
          (task) => task.status === OffboardingTaskStatusEnum.PENDING || task.status === OffboardingTaskStatusEnum.IN_PROGRESS,
        );
        const hasOpenClearances = clearances.some(
          (clearance) => clearance.status === OffboardingClearanceStatusEnum.PENDING,
        );

        if (hasOpenTasks || hasOpenClearances) {
          request.status = OffboardingRequestStatusEnum.IN_PROGRESS;
        } else if (totalApprovals > 0) {
          request.status = OffboardingRequestStatusEnum.APPROVED;
        }
      }
    }

    await requestRepository.save(request);

    return {
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      total_approvals: totalApprovals,
      approved_approvals: approvedApprovals,
      total_clearances: totalClearances,
      cleared_clearances: clearedClearances,
      progress_percentage: request.progress_percentage,
    };
  }

  private async validateReferenceIds(
    companyId: number,
    payload: {
      branch_id?: number | null;
      department_id?: number | null;
      workflow_id?: number | null;
      assigned_to_company_user_id?: number | null;
    },
    manager?: EntityManager,
  ): Promise<void> {
    if (payload.branch_id) {
      const branch = await this.getBranchRepository(manager).findOne({
        where: { id: payload.branch_id, company_id: companyId },
      });
      if (!branch) {
        throw new NotFoundException('Branch not found');
      }
    }

    if (payload.department_id) {
      const department = await this.getDepartmentRepository(manager).findOne({
        where: { id: payload.department_id, company_id: companyId },
      });
      if (!department) {
        throw new NotFoundException('Department not found');
      }
    }

    if (payload.workflow_id) {
      const workflow = await this.getOffboardingWorkflowRepository(manager).findOne({
        where: { id: payload.workflow_id, company_id: companyId },
      });
      if (!workflow) {
        throw new NotFoundException('Offboarding workflow not found');
      }
    }

    if (payload.assigned_to_company_user_id) {
      const companyUser = await this.getCompanyUserRepository(manager).findOne({
        where: {
          id: payload.assigned_to_company_user_id,
          company_id: companyId,
        },
      });
      if (!companyUser) {
        throw new NotFoundException('Assigned company user not found');
      }
    }
  }

  async createOffboardingWorkflow(
    companyId: number,
    dto: CreateOffboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    this.validateWorkflowStepOrder(dto.steps);
    await this.validateWorkflowStepReferences(companyId, dto.steps);

    const created = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOffboardingWorkflowRepository(manager);
      const workflowStepRepository = this.getOffboardingWorkflowStepRepository(manager);

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
          status: dto.status ?? OffboardingRecordStatusEnum.ACTIVE,
          created_by_company_user_id: actor.companyMembershipId ?? null,
        }),
      );

      await workflowStepRepository.save(
        dto.steps.map((step) =>
          workflowStepRepository.create({
            workflow_id: workflow.id,
            approval_level: step.approval_level,
            step_name: step.step_name.trim(),
            task_title: step.task_title.trim(),
            task_description: this.normalizeOptionalString(step.task_description),
            task_type: step.task_type ?? OffboardingTaskTypeEnum.GENERAL,
            assigned_branch_id: step.assigned_branch_id ?? null,
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

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CREATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow created',
      metadata: {
        workflow_id: created.id,
      },
    });

    return this.mapWorkflow(created);
  }

  async findAllOffboardingWorkflows(companyId: number, query: OffboardingWorkflowQueryDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder,
      search,
      status,
    } = query;

    const qb = this.offboardingWorkflowRepository
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

  async findOneOffboardingWorkflow(companyId: number, workflowId: number) {
    const workflow = await this.offboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
      relations: { steps: true },
      order: { steps: { approval_level: 'ASC' } },
    });

    if (!workflow) {
      throw new NotFoundException('Offboarding workflow not found');
    }

    return this.mapWorkflow(workflow);
  }

  async updateOffboardingWorkflow(
    companyId: number,
    workflowId: number,
    dto: UpdateOffboardingWorkflowDto,
    actor: AuthenticatedUser,
  ) {
    const updated = await this.dataSource.transaction(async (manager) => {
      const workflowRepository = this.getOffboardingWorkflowRepository(manager);
      const stepRepository = this.getOffboardingWorkflowStepRepository(manager);
      const workflow = await workflowRepository.findOne({
        where: {
          id: workflowId,
          company_id: companyId,
        },
        relations: { steps: true },
      });

      if (!workflow) {
        throw new NotFoundException('Offboarding workflow not found');
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
              task_title: step.task_title.trim(),
              task_description: this.normalizeOptionalString(step.task_description),
              task_type: step.task_type ?? OffboardingTaskTypeEnum.GENERAL,
              assigned_branch_id: step.assigned_branch_id ?? null,
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

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow updated',
      metadata: {
        workflow_id: updated.id,
      },
    });

    return this.mapWorkflow(updated);
  }

  async createOffboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    dto: CreateOffboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    await this.validateWorkflowStepReferences(companyId, [dto]);

    const createdStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOffboardingWorkflowOrFail(companyId, workflowId, manager);
      const repository = this.getOffboardingWorkflowStepRepository(manager);

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
      if (dto.approver_type === OffboardingApproverTypeEnum.ROLE) {
        positionId = null;
        companyUserId = null;
      } else if (dto.approver_type === OffboardingApproverTypeEnum.POSITION) {
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
          task_title: dto.task_title.trim(),
          task_description: this.normalizeOptionalString(dto.task_description),
          task_type: dto.task_type ?? OffboardingTaskTypeEnum.GENERAL,
          assigned_branch_id: dto.assigned_branch_id ?? null,
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

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CREATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow step created',
      metadata: {
        workflow_id: workflowId,
        step_id: createdStep.id,
        approval_level: createdStep.approval_level,
      },
    });

    return this.mapWorkflowStep(createdStep);
  }

  async updateOffboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    dto: UpdateOffboardingWorkflowStepDto,
    actor: AuthenticatedUser,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const updatedStep = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOffboardingWorkflowOrFail(companyId, workflowId, manager);
      const existingStep = await this.findOffboardingWorkflowStepOrFail(
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
        existingStep.task_title = dto.task_title.trim();
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
      if (dto.assigned_branch_id !== undefined) {
        existingStep.assigned_branch_id = dto.assigned_branch_id ?? null;
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

      if (existingStep.approver_type === OffboardingApproverTypeEnum.ROLE) {
        existingStep.position_id = null;
        existingStep.company_user_id = null;
      } else if (existingStep.approver_type === OffboardingApproverTypeEnum.POSITION) {
        existingStep.role_id = null;
        existingStep.company_user_id = null;
      } else {
        existingStep.role_id = null;
        existingStep.position_id = null;
      }

      return this.getOffboardingWorkflowStepRepository(manager).save(existingStep);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow step updated',
      metadata: {
        workflow_id: workflowId,
        step_id: updatedStep.id,
        approval_level: updatedStep.approval_level,
      },
    });

    return this.mapWorkflowStep(updatedStep);
  }

  async removeOffboardingWorkflowStep(
    companyId: number,
    workflowId: number,
    stepId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    this.hrAccessService.assertCompanyScopedActor(actor);

    const deletedPayload = await this.dataSource.transaction(async (manager) => {
      const workflow = await this.findOffboardingWorkflowOrFail(companyId, workflowId, manager);
      if (workflow.steps.length <= 1) {
        throw new BadRequestException('Workflow must contain at least one step');
      }

      const step = await this.findOffboardingWorkflowStepOrFail(workflowId, stepId, manager);
      const deletedLevel = step.approval_level;

      await this.getOffboardingWorkflowStepRepository(manager).delete({ id: step.id });
      await this.shiftWorkflowStepLevelsDown(workflowId, deletedLevel, manager);

      return {
        stepId: step.id,
        deletedLevel,
      };
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow step deleted',
      metadata: {
        workflow_id: workflowId,
        step_id: deletedPayload.stepId,
        deleted_level: deletedPayload.deletedLevel,
      },
    });

    return { message: 'Offboarding workflow step deleted successfully' };
  }

  async removeOffboardingWorkflow(
    companyId: number,
    workflowId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const workflow = await this.offboardingWorkflowRepository.findOne({
      where: {
        id: workflowId,
        company_id: companyId,
      },
    });
    if (!workflow) {
      throw new NotFoundException('Offboarding workflow not found');
    }

    workflow.status = OffboardingRecordStatusEnum.INACTIVE;
    workflow.is_default = false;
    await this.offboardingWorkflowRepository.save(workflow);

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: null,
      actor,
      description: 'Offboarding workflow deactivated',
      metadata: {
        workflow_id: workflow.id,
      },
    });

    return { message: 'Offboarding workflow deactivated successfully' };
  }

  // The public API methods are intentionally long because they coordinate
  // workflow, approval, task, clearance, document, and audit orchestration.
  // Keeping them in one service mirrors existing onboarding/leave patterns.

  async createOffboardingRequest(
    companyId: number,
    dto: CreateOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    await this.ensureNoActiveOffboarding(companyId, dto.employee_id);
    await this.validateReferenceIds(companyId, {
      branch_id: dto.branch_id ?? null,
      department_id: dto.department_id ?? null,
      workflow_id: dto.workflow_id ?? null,
    });

    if (dto.notice_date && new Date(dto.notice_date) > new Date(dto.last_working_date)) {
      throw new BadRequestException('notice_date cannot be after last_working_date');
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOffboardingRequestRepository(manager);
      const entity = repository.create({
        company_id: companyId,
        employee_id: dto.employee_id,
        branch_id: dto.branch_id ?? employee.primary_branch_id ?? null,
        department_id: dto.department_id ?? employee.primary_department_id ?? null,
        workflow_id: dto.workflow_id ?? null,
        created_by_company_user_id: actor.companyMembershipId ?? null,
        offboarding_code: await this.generateOffboardingCode(companyId, manager),
        title: dto.title.trim(),
        description: this.normalizeOptionalString(dto.description),
        offboarding_type: dto.offboarding_type,
        reason: dto.reason.trim(),
        notice_date: this.normalizeOptionalDate(dto.notice_date),
        last_working_date: dto.last_working_date,
        status: dto.submit ? OffboardingRequestStatusEnum.PENDING : OffboardingRequestStatusEnum.DRAFT,
        metadata: dto.metadata ?? null,
      });

      const saved = await repository.save(entity);
      if (dto.submit) {
        await this.submitOffboardingInternal(companyId, saved.id, actor, dto.workflow_id ?? null, manager);
      }

      return repository.findOneOrFail({
        where: { id: saved.id, company_id: companyId },
        relations: {
          employee: { company_user: true, primary_department: true, primary_position: true },
          workflow: true,
          tasks: { assigned_to_company_user: { user: true } },
          approvals: { approver_company_user: { user: true }, workflow_step: true },
          clearances: { cleared_by_company_user: { user: true } },
        },
      });
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CREATED,
      offboarding_request_id: created.id,
      actor,
      description: 'Offboarding request created',
      new_values: {
        offboarding_code: created.offboarding_code,
        status: created.status,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: created.id,
      },
      order: { id: 'DESC' },
    });

    return this.mapRequest(created, documents);
  }

  async submitOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    dto: SubmitOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    await this.dataSource.transaction(async (manager) => {
      await this.submitOffboardingInternal(companyId, offboardingRequestId, actor, dto.workflow_id, manager);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.SUBMITTED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding request submitted',
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.findOneOffboardingRequest(companyId, offboardingRequestId, actor);
  }

  private async submitOffboardingInternal(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
    workflowId?: number | null,
    manager?: EntityManager,
  ) {
    const requestRepository = this.getOffboardingRequestRepository(manager);
    const request = await requestRepository.findOneOrFail({
      where: { id: offboardingRequestId, company_id: companyId },
      relations: { employee: { company_user: true } },
    });

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Cannot submit a closed offboarding request');
    }

    request.submitted_at = new Date();
    request.status = OffboardingRequestStatusEnum.PENDING;

    const workflowResult = await this.offboardingWorkflowService.initializeForRequest(
      companyId,
      request,
      workflowId ?? request.workflow_id,
      manager,
    );

    if (!workflowResult.pending_approvals) {
      request.status = OffboardingRequestStatusEnum.IN_PROGRESS;
      await requestRepository.save(request);
    }

    await this.updateRequestProgress(request, manager);
    void actor;
  }

  async updateOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    dto: UpdateOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Cannot update a closed offboarding request');
    }

    if (dto.notice_date && dto.last_working_date && new Date(dto.notice_date) > new Date(dto.last_working_date)) {
      throw new BadRequestException('notice_date cannot be after last_working_date');
    }

    const oldValues = {
      title: request.title,
      description: request.description,
      offboarding_type: request.offboarding_type,
      reason: request.reason,
      notice_date: request.notice_date,
      last_working_date: request.last_working_date,
      workflow_id: request.workflow_id,
      branch_id: request.branch_id,
      department_id: request.department_id,
    };

    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = this.getOffboardingRequestRepository(manager);
      const current = await repository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });

      await this.validateReferenceIds(
        companyId,
        {
          branch_id: dto.branch_id ?? current.branch_id,
          department_id: dto.department_id ?? current.department_id,
          workflow_id: dto.workflow_id ?? current.workflow_id,
        },
        manager,
      );

      if (dto.branch_id !== undefined) current.branch_id = dto.branch_id;
      if (dto.department_id !== undefined) current.department_id = dto.department_id;
      if (dto.workflow_id !== undefined) current.workflow_id = dto.workflow_id;
      if (dto.title !== undefined) current.title = dto.title.trim();
      if (dto.description !== undefined) current.description = this.normalizeOptionalString(dto.description);
      if (dto.offboarding_type !== undefined) current.offboarding_type = dto.offboarding_type;
      if (dto.reason !== undefined) current.reason = dto.reason.trim();
      if (dto.notice_date !== undefined) current.notice_date = this.normalizeOptionalDate(dto.notice_date);
      if (dto.last_working_date !== undefined) current.last_working_date = dto.last_working_date;
      if (dto.metadata !== undefined) current.metadata = dto.metadata ?? null;

      await repository.save(current);
      await this.updateRequestProgress(current, manager);

      return repository.findOneOrFail({
        where: { id: current.id, company_id: companyId },
        relations: {
          employee: { company_user: true, primary_department: true, primary_position: true },
          workflow: true,
          tasks: { assigned_to_company_user: { user: true } },
          approvals: { approver_company_user: { user: true }, workflow_step: true },
          clearances: { cleared_by_company_user: { user: true } },
        },
      });
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: updated.id,
      actor,
      description: 'Offboarding request updated',
      old_values: oldValues,
      new_values: {
        title: updated.title,
        description: updated.description,
        offboarding_type: updated.offboarding_type,
        reason: updated.reason,
        notice_date: updated.notice_date,
        last_working_date: updated.last_working_date,
        workflow_id: updated.workflow_id,
        branch_id: updated.branch_id,
        department_id: updated.department_id,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: updated.id,
      },
      order: { id: 'DESC' },
    });

    return this.mapRequest(updated, documents);
  }

  async cancelOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    dto: CancelOffboardingRequestDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Offboarding request is already closed');
    }

    await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const taskRepository = this.getOffboardingTaskRepository(manager);

      const current = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });

      await this.offboardingWorkflowService.closeAllPendingApprovals(
        current.id,
        'Skipped after offboarding cancellation',
        manager,
      );

      const openTasks = await taskRepository.find({
        where: {
          offboarding_request_id: current.id,
          status: In([OffboardingTaskStatusEnum.PENDING, OffboardingTaskStatusEnum.IN_PROGRESS]),
        },
      });

      if (openTasks.length) {
        openTasks.forEach((task) => {
          task.status = OffboardingTaskStatusEnum.CANCELLED;
          task.remarks = task.remarks ?? 'Task cancelled with offboarding request';
        });
        await taskRepository.save(openTasks);
      }

      current.status = OffboardingRequestStatusEnum.CANCELLED;
      current.cancelled_at = new Date();
      current.metadata = {
        ...(current.metadata ?? {}),
        cancellation_reason: this.normalizeOptionalString(dto.reason),
      };

      await requestRepository.save(current);
      await this.updateRequestProgress(current, manager);
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.CANCELLED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding request cancelled',
      metadata: { reason: dto.reason ?? null },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return { message: 'Offboarding request cancelled successfully' };
  }

  async completeOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Offboarding request is already closed');
    }

    const hasOpenTasks = request.tasks.some(
      (task) => task.status !== OffboardingTaskStatusEnum.COMPLETED,
    );
    if (hasOpenTasks) {
      throw new BadRequestException('All offboarding tasks must be completed before finalization');
    }

    const hasRejectedApproval = request.approvals.some(
      (approval) => approval.status === OffboardingApprovalStatusEnum.REJECTED,
    );
    if (hasRejectedApproval) {
      throw new BadRequestException('Cannot complete offboarding with rejected approvals');
    }

    const hasPendingApproval = request.approvals.some(
      (approval) => approval.status === OffboardingApprovalStatusEnum.PENDING,
    );
    if (hasPendingApproval) {
      throw new BadRequestException('All approvals must be resolved before finalization');
    }

    const hasPendingClearance = request.clearances.some(
      (clearance) => clearance.status === OffboardingClearanceStatusEnum.PENDING,
    );
    if (hasPendingClearance) {
      throw new BadRequestException('All clearances must be resolved before finalization');
    }

    const hasFailedClearance = request.clearances.some(
      (clearance) => clearance.status === OffboardingClearanceStatusEnum.NOT_CLEARED,
    );
    if (hasFailedClearance) {
      throw new BadRequestException('Cannot complete offboarding with uncleared assets/access');
    }

    const completed = await this.dataSource.transaction(async (manager) => {
      const requestRepository = this.getOffboardingRequestRepository(manager);
      const employeeRepository = this.getEmployeeRepository(manager);

      const current = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });

      current.status = OffboardingRequestStatusEnum.COMPLETED;
      current.completed_at = new Date();
      current.progress_percentage = '100.00';
      await requestRepository.save(current);

      const employee = await employeeRepository.findOneOrFail({
        where: { id: current.employee_id },
      });
      employee.employment_status = this.resolveFinalEmployeeStatus(current.offboarding_type);
      employee.exit_date = current.last_working_date;
      employee.exit_reason = current.reason;
      await employeeRepository.save(employee);

      return requestRepository.findOneOrFail({
        where: { id: current.id, company_id: companyId },
        relations: {
          employee: { company_user: true, primary_department: true, primary_position: true },
          workflow: true,
          tasks: { assigned_to_company_user: { user: true } },
          approvals: { approver_company_user: { user: true }, workflow_step: true },
          clearances: { cleared_by_company_user: { user: true } },
        },
      });
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.COMPLETED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding request completed and employee status updated',
      metadata: {
        employee_status: completed.employee.employment_status,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: completed.id,
      },
      order: { id: 'DESC' },
    });

    return {
      message: 'Offboarding completed successfully',
      data: this.mapRequest(completed, documents),
    };
  }

  async findOneOffboardingRequest(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: request.id,
      },
      order: { created_at: 'DESC' },
    });

    return this.mapRequest(request, documents);
  }

  async findAllOffboardingRequests(
    companyId: number,
    query: OffboardingRequestQueryDto,
    actor: AuthenticatedUser,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const sortBy = query.sortBy ?? 'created_at';
    const sortOrder = query.sortOrder ?? SortDirection.DESC;
    const { employee_id, status, offboarding_type, search } = query;

    const qb = this.offboardingRequestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.employee', 'employee')
      .where('request.company_id = :companyId', { companyId });

    if (typeof employee_id === 'number') {
      qb.andWhere('request.employee_id = :employeeId', { employeeId: employee_id });
    }

    if (status) {
      qb.andWhere('request.status = :status', { status });
    }

    if (offboarding_type) {
      qb.andWhere('request.offboarding_type = :offboardingType', { offboardingType: offboarding_type });
    }

    if (search) {
      qb.andWhere(
        '(request.offboarding_code LIKE :search OR request.title LIKE :search OR employee.first_name LIKE :search OR employee.last_name LIKE :search)',
        {
          search: `%${search}%`,
        },
      );
    }

    const sortableColumns = new Set([
      'id',
      'created_at',
      'updated_at',
      'offboarding_code',
      'last_working_date',
      'status',
      'progress_percentage',
    ]);
    const safeSortBy = sortableColumns.has(sortBy) ? sortBy : 'created_at';

    const [items, total] = await qb
      .orderBy(`request.${safeSortBy}`, sortOrder === SortDirection.ASC ? 'ASC' : 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    if (typeof employee_id === 'number') {
      const employee = await this.findEmployeeOrFail(companyId, employee_id);
      await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    }

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
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

  async addDocument(
    companyId: number,
    offboardingRequestId: number,
    dto: UploadOffboardingDocumentDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const document = await this.getDocumentRepository().save(
      this.getDocumentRepository().create({
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
        module: DocumentModuleEnum.OFFBOARDING,
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

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding document uploaded',
      metadata: {
        document_id: document.id,
        title: document.title,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapDocument(document);
  }

  async listDocuments(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const documents = await this.documentRepository.find({
      where: {
        company_id: companyId,
        entity_type: DocumentEntityTypeEnum.OFFBOARDING_REQUEST,
        entity_id: offboardingRequestId,
      },
      order: { created_at: 'DESC' },
    });

    return documents.map((document) => this.mapDocument(document));
  }

  async createTask(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    if (
      request.status === OffboardingRequestStatusEnum.CANCELLED ||
      request.status === OffboardingRequestStatusEnum.COMPLETED
    ) {
      throw new BadRequestException('Cannot add tasks to a closed offboarding request');
    }

    await this.validateReferenceIds(companyId, {
      assigned_to_company_user_id: dto.assigned_to_company_user_id ?? null,
    });

    const created = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const task = await taskRepository.save(
        taskRepository.create({
          company_id: companyId,
          offboarding_request_id: offboardingRequestId,
          workflow_step_id: null,
          assigned_to_company_user_id: dto.assigned_to_company_user_id ?? null,
          title: dto.title.trim(),
          description: this.normalizeOptionalString(dto.description),
          task_type: dto.task_type ?? OffboardingTaskTypeEnum.GENERAL,
          status: OffboardingTaskStatusEnum.PENDING,
          priority: dto.priority ?? OffboardingTaskPriorityEnum.MEDIUM,
          due_date: dto.due_date ? new Date(dto.due_date) : null,
          remarks: null,
          metadata: dto.metadata ?? null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);
      return task;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.TASK_CREATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task created',
      metadata: { task_id: created.id },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapTask(created);
  }

  async completeTask(
    companyId: number,
    offboardingRequestId: number,
    taskId: number,
    dto: CompleteOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const task = await this.offboardingTaskRepository.findOne({
      where: { id: taskId, offboarding_request_id: offboardingRequestId },
    });
    if (!task) {
      throw new NotFoundException('Offboarding task not found');
    }

    if (task.status === OffboardingTaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Task is already completed');
    }
    if (task.status === OffboardingTaskStatusEnum.CANCELLED) {
      throw new BadRequestException('Task is cancelled');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const currentTask = await taskRepository.findOneOrFail({
        where: { id: taskId, offboarding_request_id: offboardingRequestId },
      });

      currentTask.status = OffboardingTaskStatusEnum.COMPLETED;
      currentTask.completed_at = new Date();
      currentTask.remarks = this.normalizeOptionalString(dto.remarks);
      await taskRepository.save(currentTask);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return currentTask;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.TASK_COMPLETED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task completed',
      metadata: { task_id: saved.id },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapTask(saved);
  }

  async rejectTask(
    companyId: number,
    offboardingRequestId: number,
    taskId: number,
    dto: RejectOffboardingTaskDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const task = await this.offboardingTaskRepository.findOne({
      where: { id: taskId, offboarding_request_id: offboardingRequestId },
    });
    if (!task) {
      throw new NotFoundException('Offboarding task not found');
    }

    if (task.status === OffboardingTaskStatusEnum.COMPLETED) {
      throw new BadRequestException('Completed task cannot be rejected');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const taskRepository = this.getOffboardingTaskRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const currentTask = await taskRepository.findOneOrFail({
        where: { id: taskId, offboarding_request_id: offboardingRequestId },
      });
      currentTask.status = OffboardingTaskStatusEnum.REJECTED;
      currentTask.remarks = this.normalizeOptionalString(dto.remarks);
      await taskRepository.save(currentTask);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      currentRequest.status = OffboardingRequestStatusEnum.REJECTED;
      await requestRepository.save(currentRequest);
      await this.offboardingWorkflowService.closeAllPendingApprovals(
        offboardingRequestId,
        'Skipped after task rejection',
        manager,
      );
      await this.updateRequestProgress(currentRequest, manager);

      return currentTask;
    });

    await this.offboardingAuditService.log({
      action: OffboardingAuditActionEnum.REJECTED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding task rejected',
      metadata: { task_id: saved.id, remarks: saved.remarks },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapTask(saved);
  }

  async applyApprovalAction(
    companyId: number,
    offboardingRequestId: number,
    dto: { approve: boolean; comments?: string },
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    this.hrAccessService.assertCompanyScopedActor(actor);
    const membershipId = actor.companyMembershipId!;

    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    await this.dataSource.transaction(async (manager) => {
      const current = await this.offboardingWorkflowService.applyApprovalAction(
        offboardingRequestId,
        membershipId,
        dto,
        manager,
      );
      await this.updateRequestProgress(current, manager);
    });

    await this.offboardingAuditService.log({
      action: dto.approve ? OffboardingAuditActionEnum.APPROVED : OffboardingAuditActionEnum.REJECTED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: dto.approve ? 'Offboarding approval action accepted' : 'Offboarding approval action rejected',
      metadata: { comments: dto.comments ?? null },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.findOneOffboardingRequest(companyId, offboardingRequestId, actor);
  }

  async createClearance(
    companyId: number,
    offboardingRequestId: number,
    dto: CreateOffboardingClearanceDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const existing = await this.offboardingClearanceRepository.findOne({
      where: {
        offboarding_request_id: offboardingRequestId,
        clearance_type: dto.clearance_type,
      },
    });
    if (existing) {
      throw new ConflictException('Clearance entry for this type already exists');
    }

    const created = await this.dataSource.transaction(async (manager) => {
      const clearanceRepository = this.getOffboardingClearanceRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const clearance = await clearanceRepository.save(
        clearanceRepository.create({
          offboarding_request_id: offboardingRequestId,
          clearance_type: dto.clearance_type,
          status: dto.status ?? OffboardingClearanceStatusEnum.PENDING,
          remarks: this.normalizeOptionalString(dto.remarks),
          cleared_by_company_user_id:
            dto.status && dto.status !== OffboardingClearanceStatusEnum.PENDING
              ? actor.companyMembershipId ?? null
              : null,
          cleared_at:
            dto.status && dto.status !== OffboardingClearanceStatusEnum.PENDING ? new Date() : null,
        }),
      );

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return clearance;
    });

    await this.offboardingAuditService.log({
      action:
        created.status === OffboardingClearanceStatusEnum.CLEARED
          ? OffboardingAuditActionEnum.CLEARANCE_COMPLETED
          : OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding clearance created',
      metadata: {
        clearance_id: created.id,
        clearance_type: created.clearance_type,
        status: created.status,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapClearance(created);
  }

  async completeClearance(
    companyId: number,
    offboardingRequestId: number,
    clearanceId: number,
    dto: CompleteOffboardingClearanceDto,
    actor: AuthenticatedUser,
    context?: RequestContext,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const clearance = await this.offboardingClearanceRepository.findOne({
      where: { id: clearanceId, offboarding_request_id: offboardingRequestId },
    });
    if (!clearance) {
      throw new NotFoundException('Offboarding clearance not found');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const clearanceRepository = this.getOffboardingClearanceRepository(manager);
      const requestRepository = this.getOffboardingRequestRepository(manager);

      const currentClearance = await clearanceRepository.findOneOrFail({
        where: { id: clearanceId, offboarding_request_id: offboardingRequestId },
      });

      currentClearance.status = dto.status;
      currentClearance.remarks = this.normalizeOptionalString(dto.remarks);
      currentClearance.cleared_by_company_user_id =
        dto.status === OffboardingClearanceStatusEnum.PENDING
          ? null
          : actor.companyMembershipId ?? null;
      currentClearance.cleared_at =
        dto.status === OffboardingClearanceStatusEnum.PENDING ? null : new Date();
      await clearanceRepository.save(currentClearance);

      const currentRequest = await requestRepository.findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      await this.updateRequestProgress(currentRequest, manager);

      return currentClearance;
    });

    await this.offboardingAuditService.log({
      action:
        saved.status === OffboardingClearanceStatusEnum.CLEARED
          ? OffboardingAuditActionEnum.CLEARANCE_COMPLETED
          : saved.status === OffboardingClearanceStatusEnum.NOT_CLEARED
            ? OffboardingAuditActionEnum.CLEARANCE_FAILED
            : OffboardingAuditActionEnum.UPDATED,
      offboarding_request_id: offboardingRequestId,
      actor,
      description: 'Offboarding clearance updated',
      metadata: {
        clearance_id: saved.id,
        status: saved.status,
      },
      ip_address: context?.ip_address ?? null,
      user_agent: context?.user_agent ?? null,
    });

    return this.mapClearance(saved);
  }

  async getProgress(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const summary = await this.dataSource.transaction(async (manager) => {
      const current = await this.getOffboardingRequestRepository(manager).findOneOrFail({
        where: { id: offboardingRequestId, company_id: companyId },
      });
      return this.updateRequestProgress(current, manager);
    });

    return {
      offboarding_request_id: offboardingRequestId,
      offboarding_code: request.offboarding_code,
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
      clearances: {
        total: summary.total_clearances,
        cleared: summary.cleared_clearances,
      },
    };
  }

  async getApprovals(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const approvals = await this.offboardingApprovalRepository.find({
      where: { offboarding_request_id: offboardingRequestId },
      relations: {
        workflow_step: true,
        approver_company_user: { user: true },
      },
      order: {
        workflow_step: {
          approval_level: 'ASC',
        },
        id: 'ASC',
      },
    });

    return approvals.map((approval) => this.mapApproval(approval));
  }

  async getAuditLogs(
    companyId: number,
    offboardingRequestId: number,
    actor: AuthenticatedUser,
  ) {
    const request = await this.findOffboardingRequestOrFail(companyId, offboardingRequestId);
    await this.hrAccessService.assertCanAccessEmployee(actor, request.employee);

    const logs = await this.offboardingAuditLogRepository.find({
      where: { offboarding_request_id: offboardingRequestId },
      relations: {
        actor_company_user: { user: true },
      },
      order: { id: 'DESC' },
    });

    return logs.map((entry) => ({
      id: entry.id,
      offboarding_request_id: entry.offboarding_request_id,
      actor_company_user_id: entry.actor_company_user_id,
      action: entry.action,
      description: entry.description,
      old_values: entry.old_values,
      new_values: entry.new_values,
      metadata: entry.metadata,
      ip_address: entry.ip_address,
      user_agent: entry.user_agent,
      created_at: entry.created_at,
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
