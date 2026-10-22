import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { hasPermission } from '../../../common/utils/permission.util';
import { EmploymentStatusEnum } from './enums/employment-status.enum';

@Injectable()
export class EmployeeLifecycleService {
  private readonly allowedTransitions = new Map<
    EmploymentStatusEnum,
    Set<EmploymentStatusEnum>
  >([
    [
      EmploymentStatusEnum.ONBOARDING,
      new Set([EmploymentStatusEnum.ACTIVE, EmploymentStatusEnum.INACTIVE]),
    ],
    [
      EmploymentStatusEnum.ACTIVE,
      new Set([
        EmploymentStatusEnum.SUSPENDED,
        EmploymentStatusEnum.INACTIVE,
        EmploymentStatusEnum.RESIGNED,
        EmploymentStatusEnum.TERMINATED,
        EmploymentStatusEnum.RETIRED,
        EmploymentStatusEnum.DECEASED,
        EmploymentStatusEnum.EXITED,
      ]),
    ],
    [
      EmploymentStatusEnum.SUSPENDED,
      new Set([
        EmploymentStatusEnum.ACTIVE,
        EmploymentStatusEnum.INACTIVE,
        EmploymentStatusEnum.TERMINATED,
        EmploymentStatusEnum.EXITED,
      ]),
    ],
    [
      EmploymentStatusEnum.INACTIVE,
      new Set([
        EmploymentStatusEnum.ACTIVE,
        EmploymentStatusEnum.TERMINATED,
        EmploymentStatusEnum.EXITED,
      ]),
    ],
    [EmploymentStatusEnum.RESIGNED, new Set([EmploymentStatusEnum.EXITED])],
    [EmploymentStatusEnum.TERMINATED, new Set([EmploymentStatusEnum.EXITED])],
    [EmploymentStatusEnum.RETIRED, new Set([EmploymentStatusEnum.EXITED])],
    [EmploymentStatusEnum.DECEASED, new Set()],
    [EmploymentStatusEnum.EXITED, new Set()],
  ]);

  private readonly exitStatuses = new Set([
    EmploymentStatusEnum.RESIGNED,
    EmploymentStatusEnum.TERMINATED,
    EmploymentStatusEnum.RETIRED,
    EmploymentStatusEnum.DECEASED,
    EmploymentStatusEnum.EXITED,
  ]);

  assertTransition(
    currentStatus: EmploymentStatusEnum,
    targetStatus: EmploymentStatusEnum,
    actor: AuthenticatedUser,
  ): void {
    if (currentStatus === targetStatus) {
      return;
    }

    const allowed =
      this.allowedTransitions.get(currentStatus)?.has(targetStatus) ?? false;
    if (!allowed) {
      throw new BadRequestException(
        `Employee status cannot change from ${currentStatus} to ${targetStatus}`,
      );
    }

    if (
      this.exitStatuses.has(targetStatus) &&
      !hasPermission(actor.permissions, 'employees:force-exit-status')
    ) {
      throw new ForbiddenException(
        'Exit-related employee statuses must be completed through the offboarding workflow',
      );
    }
  }
}
