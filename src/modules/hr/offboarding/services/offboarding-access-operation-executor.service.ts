import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntityManager } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../../companies/entities/company-user.entity';
import { User } from '../../../users/entities/user.entity';
import { AccessControlSyncService } from '../../../access-control/service/access-control-sync.service';
import { AccessGroupEmployee } from '../../../access-control/access-group-employees/entity/access-group-employee.entity';
import { AccessGroupEmployeeStatusEnum } from '../../../access-control/access-group-employees/enum/access-group-employee-status.enum';
import { EmployeeAccessCredential } from '../../../access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialStatusEnum } from '../../../access-control/employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeDeviceAssignment } from '../../../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../../../access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import { EmployeeAssignmentService } from '../../employees/employee-assignment.service';
import { OffboardingAccessOperation } from '../entities/offboarding-access-operation.entity';
import { OffboardingRequest } from '../entities/offboarding-request.entity';
import { OffboardingAccessOperationTypeEnum } from '../enums/offboarding-access-operation-type.enum';
import { OffboardingLetterTypeEnum } from '../enums/offboarding-letter-type.enum';
import { OffboardingLetterService } from './offboarding-letter.service';

export interface AccessOperationExecutionResult {
  skipped: boolean;
  detail: Record<string, unknown>;
}

const SYSTEM_ACTOR: AuthenticatedUser = {
  id: 0,
  companyId: null,
  companyMembershipId: null,
  employeeId: null,
} as unknown as AuthenticatedUser;

@Injectable()
export class OffboardingAccessOperationExecutorService {
  private readonly logger = new Logger(
    OffboardingAccessOperationExecutorService.name,
  );

  constructor(
    private readonly configService: ConfigService,
    private readonly employeeAssignmentService: EmployeeAssignmentService,
    private readonly accessControlSyncService: AccessControlSyncService,
    private readonly offboardingLetterService: OffboardingLetterService,
  ) {}

  async execute(
    operationType: OffboardingAccessOperationTypeEnum,
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    switch (operationType) {
      case OffboardingAccessOperationTypeEnum.DEACTIVATE_COMPANY_MEMBERSHIP:
        return this.deactivateCompanyMembership(request, manager);
      case OffboardingAccessOperationTypeEnum.REVOKE_AUTH_SESSIONS:
        return this.revokeAuthSessions(request, manager);
      case OffboardingAccessOperationTypeEnum.DEACTIVATE_GLOBAL_USER_IF_UNUSED:
        return this.deactivateGlobalUserIfUnused(request, manager);
      case OffboardingAccessOperationTypeEnum.END_BRANCH_ACCESS:
      case OffboardingAccessOperationTypeEnum.END_DEPARTMENT_ACCESS:
      case OffboardingAccessOperationTypeEnum.END_POSITION_ASSIGNMENTS:
      case OffboardingAccessOperationTypeEnum.END_REPORTING_LINE:
        return this.endOrgAssignments(request, manager);
      case OffboardingAccessOperationTypeEnum.REMOVE_ACCESS_GROUP_MEMBERSHIP:
        return this.removeAccessGroupMembership(request, manager);
      case OffboardingAccessOperationTypeEnum.REMOVE_DEVICE_USER:
        return this.removeDeviceUser(request, manager);
      case OffboardingAccessOperationTypeEnum.REVOKE_ACCESS_CREDENTIALS:
        return this.revokeAccessCredentials(request, manager);
      case OffboardingAccessOperationTypeEnum.CLOSE_ATTENDANCE_ASSIGNMENTS:
        return {
          skipped: true,
          detail: {
            note: 'Attendance artifacts are realigned during offboarding finalization.',
          },
        };
      case OffboardingAccessOperationTypeEnum.CANCEL_FUTURE_LEAVE:
        return {
          skipped: true,
          detail: {
            note: 'Leave-settlement integration is handled outside the access-termination pipeline.',
          },
        };
      case OffboardingAccessOperationTypeEnum.GENERATE_RELIEVING_LETTER:
        return this.generateLetter(
          request,
          OffboardingLetterTypeEnum.RELIEVING,
          manager,
        );
      case OffboardingAccessOperationTypeEnum.GENERATE_SERVICE_LETTER:
        return this.generateLetter(
          request,
          OffboardingLetterTypeEnum.SERVICE,
          manager,
        );
      default:
        return {
          skipped: true,
          detail: { note: `Unhandled operation type ${operationType}` },
        };
    }
  }

  private async deactivateCompanyMembership(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const membership = await manager
      .getRepository(CompanyUser)
      .createQueryBuilder('membership')
      .setLock('pessimistic_write')
      .where('membership.id = :id', {
        id: request.employee.company_user_id,
      })
      .andWhere('membership.company_id = :companyId', {
        companyId: request.company_id,
      })
      .getOne();

    if (!membership) {
      throw new Error('Company membership not found for exiting employee');
    }

    if (membership.status !== 'active') {
      return {
        skipped: true,
        detail: {
          membership_id: membership.id,
          membership_status: membership.status,
        },
      };
    }

    membership.status = 'inactive';
    membership.is_default = false;
    await manager.getRepository(CompanyUser).save(membership);

    return {
      skipped: false,
      detail: { membership_id: membership.id, membership_status: 'inactive' },
    };
  }

  private async revokeAuthSessions(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const membership = await manager.getRepository(CompanyUser).findOne({
      where: {
        id: request.employee.company_user_id,
        company_id: request.company_id,
      },
    });

    if (!membership) {
      throw new Error('Company membership not found for exiting employee');
    }

    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :id', { id: membership.user_id })
      .getOne();

    if (!user) {
      throw new Error('User account not found for exiting employee');
    }

    user.auth_token_invalid_before = new Date();
    user.auth_token_version = (user.auth_token_version ?? 0) + 1;
    await manager.getRepository(User).save(user);

    return {
      skipped: false,
      detail: {
        user_id: user.id,
        auth_token_version: user.auth_token_version,
      },
    };
  }

  private async deactivateGlobalUserIfUnused(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const membership = await manager.getRepository(CompanyUser).findOne({
      where: {
        id: request.employee.company_user_id,
        company_id: request.company_id,
      },
    });

    if (!membership) {
      throw new Error('Company membership not found for exiting employee');
    }

    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :id', { id: membership.user_id })
      .getOne();

    if (!user) {
      throw new Error('User account not found for exiting employee');
    }

    const activeMemberships = await manager
      .getRepository(CompanyUser)
      .count({ where: { user_id: user.id, status: 'active' } });

    if (activeMemberships > 0) {
      return {
        skipped: true,
        detail: { user_id: user.id, active_memberships: activeMemberships },
      };
    }

    if (user.status === 'inactive') {
      return {
        skipped: true,
        detail: { user_id: user.id, user_status: user.status },
      };
    }

    user.status = 'inactive';
    await manager.getRepository(User).save(user);

    return {
      skipped: false,
      detail: { user_id: user.id, user_status: 'inactive' },
    };
  }

  private async endOrgAssignments(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    await this.employeeAssignmentService.endAssignmentsForExit(
      request.company_id,
      request.employee_id,
      request.last_working_date,
      { ...SYSTEM_ACTOR, companyId: request.company_id },
      manager,
    );

    return {
      skipped: false,
      detail: {
        employee_id: request.employee_id,
        effective_date: request.last_working_date,
      },
    };
  }

  private async removeAccessGroupMembership(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const result = await manager
      .getRepository(AccessGroupEmployee)
      .createQueryBuilder()
      .update(AccessGroupEmployee)
      .set({ status: AccessGroupEmployeeStatusEnum.INACTIVE })
      .where('employee_id = :employeeId', {
        employeeId: request.employee_id,
      })
      .andWhere('status = :status', {
        status: AccessGroupEmployeeStatusEnum.ACTIVE,
      })
      .execute();

    return {
      skipped: (result.affected ?? 0) === 0,
      detail: { rows_deactivated: result.affected ?? 0 },
    };
  }

  private async revokeAccessCredentials(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const result = await manager
      .getRepository(EmployeeAccessCredential)
      .createQueryBuilder()
      .update(EmployeeAccessCredential)
      .set({ credentialStatus: EmployeeAccessCredentialStatusEnum.DELETED })
      .where('company_id = :companyId', { companyId: request.company_id })
      .andWhere('employee_id = :employeeId', {
        employeeId: request.employee_id,
      })
      .andWhere('credential_status != :deleted', {
        deleted: EmployeeAccessCredentialStatusEnum.DELETED,
      })
      .execute();

    return {
      skipped: (result.affected ?? 0) === 0,
      detail: { rows_revoked: result.affected ?? 0 },
    };
  }

  private async generateLetter(
    request: OffboardingRequest,
    letterType: OffboardingLetterTypeEnum,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const alreadyGenerated = await this.offboardingLetterService.isLetterGenerated(
      request.id,
      letterType,
      manager,
    );

    if (alreadyGenerated) {
      return { skipped: true, detail: { letter_type: letterType } };
    }

    const document = await this.offboardingLetterService.generateAndStore(
      request.company_id,
      request.id,
      letterType,
      manager,
    );

    return {
      skipped: false,
      detail: { letter_type: letterType, document_id: document.id },
    };
  }

  private async removeDeviceUser(
    request: OffboardingRequest,
    manager: EntityManager,
  ): Promise<AccessOperationExecutionResult> {
    const assignments = await manager
      .getRepository(EmployeeDeviceAssignment)
      .find({ where: { employeeId: request.employee_id } });

    const activeAssignments = assignments.filter(
      (assignment) =>
        assignment.deviceId !== null &&
        assignment.syncStatus !== EmployeeDeviceAssignmentSyncStatusEnum.REMOVED,
    );

    if (!activeAssignments.length) {
      return {
        skipped: true,
        detail: { device_count: 0 },
      };
    }

    const results: Array<{ device_id: number; status: string }> = [];
    const failures: string[] = [];

    for (const assignment of activeAssignments) {
      try {
        await this.accessControlSyncService.deleteEmployeeFromDevice(
          request.company_id,
          request.employee_id,
          assignment.deviceId!,
        );
        results.push({ device_id: assignment.deviceId!, status: 'REMOVED' });
      } catch (error) {
        const message = (error as Error).message;
        this.logger.warn(
          `Failed removing employee ${request.employee_id} from device ${assignment.deviceId}: ${message}`,
        );
        results.push({ device_id: assignment.deviceId!, status: 'FAILED' });
        failures.push(`device ${assignment.deviceId}: ${message}`);
      }
    }

    if (failures.length) {
      throw new Error(
        `Failed to remove employee from ${failures.length} device(s): ${failures.join('; ')}`,
      );
    }

    return {
      skipped: false,
      detail: { devices: results },
    };
  }
}
