import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager, In } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { normalizeTanzaniaOrUgandaPhone } from '../../common/utils/tanzania-phone.util';
import { AccessGroupEmployee } from '../access-control/access-group-employees/entity/access-group-employee.entity';
import { AccessOrganizationEmployee } from '../access-control/access-organization-employees/entity/access-organization-employee.entity';
import { EmployeeDeviceAssignment } from '../access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeContact } from '../hr/employees/entities/employee-contact.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { ContactTypeEnum } from '../hr/employees/enums/contact-type.enum';
import { SecurityEventsService } from '../security/security-events.service';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { User } from '../users/entities/user.entity';
import {
  IDENTITY_FIELDS,
  IdentityChangeAudit,
  IdentityChangeSource,
  IdentityField,
} from './entities/identity-change-audit.entity';

export type IdentityValues = Partial<Record<IdentityField, string | null>>;

const NAME_MAX_LENGTH = 100;

export interface SyncIdentityInput {
  companyId: number;
  /** Linked user; null when the employee has no login account. */
  userId: number | null;
  /** Employee the change originated from, if any. */
  employeeId?: number | null;
  /** Desired values; undefined fields are left untouched. */
  values: IdentityValues;
  /**
   * Values before the change, when the caller already mutated part of the
   * records (e.g. the employee row was saved first). Defaults to the current
   * user values, or the employee's when there is no user.
   */
  before?: IdentityValues;
  source: IdentityChangeSource;
  actor: AuthenticatedUser | null;
  context?: AuditRequestContext | null;
  rollbackOfChangeSetId?: string | null;
  reason?: string | null;
}

export interface SyncIdentityResult {
  changeSetId: string | null;
  changedFields: IdentityField[];
}

/**
 * Keeps the shared identity fields (names, email, phone) consistent between a
 * User, every Employee linked to it (across companies) and the denormalized
 * employee name copies, and records an append-only audit trail.
 *
 * All methods taking an EntityManager must run inside the caller's
 * transaction so the whole update commits or fails together.
 */
@Injectable()
export class IdentitySyncService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly securityEventsService: SecurityEventsService,
  ) {}

  /** Identity values as currently stored on an employee (primary contact rule). */
  readEmployeeIdentity(
    employee: Pick<Employee, 'first_name' | 'last_name'>,
    contacts: EmployeeContact[] | undefined,
  ): Required<IdentityValues> {
    return {
      first_name: employee.first_name ?? null,
      last_name: employee.last_name ?? null,
      email: this.findSourceContact(contacts, 'email')?.email ?? null,
      phone:
        this.findSourceContact(contacts, 'phone_number')?.phone_number ?? null,
    };
  }

  /** Fields whose normalized value differs between two snapshots. */
  diff(before: IdentityValues, after: IdentityValues): IdentityValues {
    const changes: IdentityValues = {};
    for (const field of IDENTITY_FIELDS) {
      if (after[field] === undefined) continue;
      const next = this.normalize(field, after[field]);
      if (next !== this.normalize(field, before[field] ?? null)) {
        changes[field] = next;
      }
    }
    return changes;
  }

  async sync(
    manager: EntityManager,
    input: SyncIdentityInput,
  ): Promise<SyncIdentityResult> {
    const user = input.userId
      ? await this.lockUser(manager, input.userId)
      : null;
    const employees = await this.lockEmployees(
      manager,
      input.userId,
      input.employeeId ?? null,
    );
    if (!user && !employees.length) {
      throw new NotFoundException('No user or employee to update');
    }

    const originEmployee =
      employees.find((employee) => employee.id === input.employeeId) ??
      employees[0] ??
      null;
    const current: IdentityValues = user
      ? {
          first_name: user.first_name,
          last_name: user.last_name,
          email: user.email,
          phone: user.phone,
        }
      : this.readEmployeeIdentity(originEmployee, originEmployee.contacts);
    const before = { ...current, ...(input.before ?? {}) };

    const normalized: IdentityValues = {};
    for (const field of IDENTITY_FIELDS) {
      if (input.values[field] === undefined) continue;
      normalized[field] = this.validate(field, input.values[field], !!user);
    }
    const changes = this.diff(before, normalized);
    // Desired values are applied to every target even when unchanged versus
    // `before`, which also repairs records that had drifted out of sync.
    const desired = { ...normalized };
    const changedFields = Object.keys(changes) as IdentityField[];

    if (user) {
      await this.assertUnique(manager, user.id, desired);
      Object.assign(user, this.pickDefined(desired));
      await manager.getRepository(User).save(user);
    }

    for (const employee of employees) {
      await this.applyToEmployee(manager, employee, desired);
    }
    if (desired.first_name !== undefined || desired.last_name !== undefined) {
      await this.refreshDenormalizedNames(manager, employees);
    }

    if (!changedFields.length) {
      return { changeSetId: null, changedFields };
    }

    const changeSetId = randomUUID();
    const affectedCompanyIds = [
      ...new Set([input.companyId, ...employees.map((e) => e.company_id)]),
    ];
    const subjectName = [
      desired.first_name ?? before.first_name,
      desired.last_name ?? before.last_name,
    ]
      .filter(Boolean)
      .join(' ');
    const actorProfile = input.actor
      ? await manager.getRepository(User).findOne({
          where: { id: input.actor.id },
          select: ['id', 'first_name', 'last_name', 'email'],
        })
      : null;

    const auditRepository = manager.getRepository(IdentityChangeAudit);
    await auditRepository.insert(
      changedFields.map((field) => ({
        change_set_id: changeSetId,
        company_id: input.companyId,
        affected_company_ids: affectedCompanyIds,
        user_id: user?.id ?? null,
        employee_id: input.employeeId ?? originEmployee?.id ?? null,
        affected_employee_ids: employees.map((employee) => employee.id),
        subject_name: subjectName.slice(0, 200) || null,
        field,
        old_value: before[field] ?? null,
        new_value: changes[field] ?? null,
        source: input.source,
        rollback_of_change_set_id: input.rollbackOfChangeSetId ?? null,
        actor_user_id: input.actor?.id ?? null,
        actor_name: actorProfile
          ? `${actorProfile.first_name} ${actorProfile.last_name}`.trim()
          : null,
        actor_email: actorProfile?.email ?? input.actor?.email ?? null,
        reason: input.reason ?? null,
        ip_address: input.context?.ipAddress ?? null,
      })),
    );

    await this.securityEventsService.log(
      {
        eventType: SecurityEventType.USER_UPDATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor: input.actor,
        companyId: input.companyId,
        targetUserId: user?.id ?? null,
        resourceType: 'identity',
        resourceId: changeSetId,
        oldValues: Object.fromEntries(
          changedFields.map((field) => [field, before[field] ?? null]),
        ),
        newValues: changes,
        metadata: {
          source: input.source,
          affectedEmployeeIds: employees.map((employee) => employee.id),
          rollbackOfChangeSetId: input.rollbackOfChangeSetId ?? null,
        },
        context: input.context,
      },
      manager,
    );

    return { changeSetId, changedFields };
  }

  /**
   * Restores the values recorded in a change set. Only the latest change for
   * the subject can be rolled back, and only when the current values still
   * match what that change wrote.
   */
  async rollback(
    companyId: number,
    changeSetId: string,
    actor: AuthenticatedUser,
    reason: string | null,
    context?: AuditRequestContext | null,
  ): Promise<SyncIdentityResult> {
    return this.dataSource.transaction(async (manager) => {
      const auditRepository = manager.getRepository(IdentityChangeAudit);
      const rows = await auditRepository.find({
        where: { change_set_id: changeSetId },
      });
      if (!rows.length) {
        throw new NotFoundException('Change set not found');
      }
      const head = rows[0];
      if (head.company_id !== companyId) {
        throw new ForbiddenException(
          'Only the company that made this change can roll it back',
        );
      }

      // Lock first so no concurrent edit can slip in between checks and write.
      if (head.user_id) {
        await this.lockUser(manager, head.user_id);
      }
      const employees = await this.lockEmployees(
        manager,
        head.user_id,
        head.employee_id,
      );

      const alreadyRolledBack = await auditRepository.exists({
        where: { rollback_of_change_set_id: changeSetId },
      });
      if (alreadyRolledBack) {
        throw new ConflictException('This change has already been rolled back');
      }

      const newer = await auditRepository
        .createQueryBuilder('audit')
        .where('audit.change_set_id <> :changeSetId', { changeSetId })
        .andWhere(
          head.user_id
            ? 'audit.user_id = :subjectId'
            : 'audit.user_id IS NULL AND audit.employee_id = :subjectId',
          { subjectId: head.user_id ?? head.employee_id },
        )
        .andWhere('audit.id > :id', { id: Math.max(...rows.map((r) => r.id)) })
        .getExists();
      if (newer) {
        throw new ConflictException(
          'A later change exists for this record; only the latest change can be rolled back',
        );
      }

      // Detect edits made outside the audited paths since this change.
      const current: IdentityValues = head.user_id
        ? await this.readUserIdentity(manager, head.user_id)
        : this.readEmployeeIdentity(employees[0], employees[0]?.contacts);
      const conflicts = rows.filter(
        (row) =>
          this.normalize(row.field, current[row.field] ?? null) !==
          this.normalize(row.field, row.new_value),
      );
      if (conflicts.length) {
        throw new ConflictException(
          `Current values no longer match this change (${conflicts
            .map((row) => row.field)
            .join(', ')}); roll back is not safe`,
        );
      }

      const values: IdentityValues = {};
      for (const row of rows) {
        if (head.user_id && row.old_value === null) {
          if (row.field === 'email' || row.field === 'phone') {
            throw new ConflictException(
              `Cannot restore an empty ${row.field} on a user account`,
            );
          }
        }
        values[row.field] = row.old_value;
      }

      return this.sync(manager, {
        companyId,
        userId: head.user_id,
        employeeId: head.employee_id,
        values,
        source: IdentityChangeSource.ROLLBACK,
        actor,
        context,
        rollbackOfChangeSetId: changeSetId,
        reason,
      });
    });
  }

  private async readUserIdentity(
    manager: EntityManager,
    userId: number,
  ): Promise<IdentityValues> {
    const user = await manager.getRepository(User).findOneOrFail({
      where: { id: userId },
    });
    return {
      first_name: user.first_name,
      last_name: user.last_name,
      email: user.email,
      phone: user.phone,
    };
  }

  private async lockUser(manager: EntityManager, userId: number) {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .setLock('pessimistic_write')
      .where('user.id = :userId', { userId })
      .getOne();
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Employees linked to the user in any company, plus the origin employee. */
  private async lockEmployees(
    manager: EntityManager,
    userId: number | null,
    employeeId: number | null,
  ): Promise<Employee[]> {
    const query = manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .leftJoin('employee.company_user', 'company_user')
      .setLock('pessimistic_write', undefined, ['employee'])
      .select('employee.id', 'id');
    if (userId) {
      query.where('company_user.user_id = :userId', { userId });
      if (employeeId)
        query.orWhere('employee.id = :employeeId', { employeeId });
    } else if (employeeId) {
      query.where('employee.id = :employeeId', { employeeId });
    } else {
      return [];
    }
    const ids = (await query.getRawMany<{ id: number }>()).map((r) => r.id);
    if (!ids.length) return [];
    return manager.getRepository(Employee).find({
      where: { id: In(ids) },
      relations: { contacts: true },
      order: { id: 'ASC' },
    });
  }

  private async applyToEmployee(
    manager: EntityManager,
    employee: Employee,
    values: IdentityValues,
  ) {
    const employeeRepository = manager.getRepository(Employee);
    const nameUpdate: Partial<Pick<Employee, 'first_name' | 'last_name'>> = {};
    if (values.first_name && employee.first_name !== values.first_name) {
      nameUpdate.first_name = values.first_name;
    }
    if (values.last_name && employee.last_name !== values.last_name) {
      nameUpdate.last_name = values.last_name;
    }
    if (Object.keys(nameUpdate).length) {
      await employeeRepository.update(employee.id, nameUpdate);
      Object.assign(employee, nameUpdate);
    }

    const contactRepository = manager.getRepository(EmployeeContact);
    for (const [field, column] of [
      ['email', 'email'],
      ['phone', 'phone_number'],
    ] as const) {
      const value = values[field];
      if (value === undefined) continue;
      const contacts = employee.contacts ?? [];
      const source = this.findSourceContact(contacts, column);
      if (source) {
        if (this.normalize(field, source[column]) !== value) {
          await contactRepository.update(source.id, { [column]: value });
          source[column] = value;
        }
        continue;
      }
      if (value === null) continue;
      const target =
        contacts.find((contact) => contact.is_primary && !contact[column]) ??
        null;
      if (target) {
        await contactRepository.update(target.id, { [column]: value });
        target[column] = value;
      } else {
        const created = await contactRepository.save(
          contactRepository.create({
            employee_id: employee.id,
            contact_type: ContactTypeEnum.WORK,
            [column]: value,
            is_primary: !contacts.some((contact) => contact.is_primary),
          }),
        );
        employee.contacts = [...contacts, created];
      }
    }
  }

  /** Current-state tables that copy the employee name (logs are left as history). */
  private async refreshDenormalizedNames(
    manager: EntityManager,
    employees: Employee[],
  ) {
    for (const employee of employees) {
      const displayName = [
        employee.first_name,
        employee.middle_name,
        employee.last_name,
      ]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join(' ');
      for (const entity of [
        AccessGroupEmployee,
        AccessOrganizationEmployee,
        EmployeeDeviceAssignment,
      ]) {
        await manager
          .createQueryBuilder()
          .update(entity)
          .set({ employeeName: displayName })
          .where('employee_id = :id', { id: employee.id })
          .execute();
      }
    }
  }

  private async assertUnique(
    manager: EntityManager,
    userId: number,
    values: IdentityValues,
  ) {
    const repository = manager.getRepository(User);
    if (values.email) {
      const duplicate = await repository
        .createQueryBuilder('user')
        .where('LOWER(user.email) = :email', { email: values.email })
        .andWhere('user.id <> :userId', { userId })
        .getExists();
      if (duplicate) {
        throw new ConflictException('Email is already used by another user');
      }
    }
    if (values.phone) {
      const duplicate = await repository
        .createQueryBuilder('user')
        .where('user.phone = :phone', { phone: values.phone })
        .andWhere('user.id <> :userId', { userId })
        .getExists();
      if (duplicate) {
        throw new ConflictException(
          'Phone number is already used by another user',
        );
      }
    }
  }

  private findSourceContact(
    contacts: EmployeeContact[] | undefined,
    column: 'email' | 'phone_number',
  ): EmployeeContact | undefined {
    if (!contacts?.length) return undefined;
    return (
      contacts.find((contact) => contact.is_primary && contact[column]) ??
      contacts.find((contact) => contact[column])
    );
  }

  private validate(
    field: IdentityField,
    raw: string | null | undefined,
    hasUser: boolean,
  ): string | null {
    const value = this.normalize(field, raw ?? null);
    if (field === 'first_name' || field === 'last_name') {
      if (!value) {
        throw new BadRequestException(`${field} is required`);
      }
      if (value.length > NAME_MAX_LENGTH) {
        throw new BadRequestException(
          `${field} must be at most ${NAME_MAX_LENGTH} characters`,
        );
      }
      return value;
    }
    if (!value) {
      if (hasUser) {
        throw new BadRequestException(
          `${field} cannot be empty for an employee with a user account`,
        );
      }
      return null;
    }
    if (field === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new BadRequestException('Email is invalid');
    }
    if (
      field === 'phone' &&
      hasUser &&
      !normalizeTanzaniaOrUgandaPhone(value)
    ) {
      throw new BadRequestException(
        'Phone number must be a valid Tanzanian (+255) or Ugandan (+256) number',
      );
    }
    return value;
  }

  private normalize(
    field: IdentityField,
    value: string | null | undefined,
  ): string | null {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    if (field === 'email') return trimmed.toLowerCase();
    if (field === 'phone') {
      return normalizeTanzaniaOrUgandaPhone(trimmed) ?? trimmed;
    }
    return trimmed;
  }

  private pickDefined(values: IdentityValues): Partial<User> {
    return Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== undefined),
    ) as Partial<User>;
  }
}
