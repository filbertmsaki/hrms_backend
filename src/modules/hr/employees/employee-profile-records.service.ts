import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource, In, Repository } from 'typeorm';
import {
  decryptField,
  encryptField,
  isEncryptedField,
  isFieldEncryptionEnabled,
  maskAccountNumber,
} from '../../../common/crypto/field-encryption';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { EmploymentStatusEnum } from './enums/employment-status.enum';
import { CreateEmployeeAcademicQualificationDto } from './dtos/create-employee-academic-qualification.dto';
import { CreateEmployeeAddressDto } from './dtos/create-employee-address.dto';
import { CreateEmployeeBankAccountDto } from './dtos/create-employee-bank-account.dto';
import { CreateEmployeeContactDto } from './dtos/create-employee-contact.dto';
import { CreateEmployeeExperienceDto } from './dtos/create-employee-experience.dto';
import { CreateEmployeeIdentificationDto } from './dtos/create-employee-identification.dto';
import { CreateEmployeeProfessionalQualificationDto } from './dtos/create-employee-professional-qualification.dto';
import { CreateEmployeeRelativeDto } from './dtos/create-employee-relative.dto';
import { UpdateEmployeeAcademicQualificationDto } from './dtos/update-employee-academic-qualification.dto';
import { UpdateEmployeeAddressDto } from './dtos/update-employee-address.dto';
import { UpdateEmployeeBankAccountDto } from './dtos/update-employee-bank-account.dto';
import { UpdateEmployeeContactDto } from './dtos/update-employee-contact.dto';
import { UpdateEmployeeExperienceDto } from './dtos/update-employee-experience.dto';
import { UpdateEmployeeIdentificationDto } from './dtos/update-employee-identification.dto';
import { UpdateEmployeeProfessionalQualificationDto } from './dtos/update-employee-professional-qualification.dto';
import { UpdateEmployeeRelativeDto } from './dtos/update-employee-relative.dto';
import { EmployeesService } from './employees.service';
import { EmployeeAcademicQualification } from './entities/employee-academic-qualification.entity';
import { EmployeeAddress } from './entities/employee-address.entity';
import { EmployeeBankAccount } from './entities/employee-bank-account.entity';
import { EmployeeContact } from './entities/employee-contact.entity';
import { EmployeeExperience } from './entities/employee-experience.entity';
import { EmployeeIdentification } from './entities/employee-identification.entity';
import { EmployeeProfessionalQualification } from './entities/employee-professional-qualification.entity';
import {
  EmployeeProfileRecordChange,
  PROFILE_RECORD_TYPES,
  ProfileRecordType,
  SENSITIVE_PROFILE_RECORD_TYPES,
} from './entities/employee-profile-record-change.entity';
import { EmployeeRelative } from './entities/employee-relative.entity';
import { Employee } from './entities/employee.entity';

type Dto = Record<string, unknown>;
type RecordHandler = {
  label: string;
  entity: new () => object;
  createDto: new () => object;
  updateDto: new () => object;
  add: (
    c: number,
    e: number,
    dto: Dto,
    a: AuthenticatedUser,
  ) => Promise<unknown>;
  update: (
    c: number,
    e: number,
    id: number,
    dto: Dto,
    a: AuthenticatedUser,
  ) => Promise<unknown>;
  remove: (
    c: number,
    e: number,
    id: number,
    a: AuthenticatedUser,
  ) => Promise<unknown>;
};

const SELF_EDITABLE_STATUSES: readonly string[] = [
  EmploymentStatusEnum.ONBOARDING,
  EmploymentStatusEnum.ACTIVE,
  EmploymentStatusEnum.SUSPENDED,
];
const SNAPSHOT_SKIP_KEYS = new Set([
  'id',
  'employee_id',
  'employee',
  'created_at',
  'updated_at',
  'deleted_at',
]);
const HR_FINAL_PERMISSION = 'self_service_requests:final_approve';

@Injectable()
export class EmployeeProfileRecordsService {
  private readonly handlers: Record<ProfileRecordType, RecordHandler>;

  constructor(
    @InjectRepository(EmployeeProfileRecordChange)
    private readonly changes: Repository<EmployeeProfileRecordChange>,
    @InjectRepository(Employee)
    private readonly employees: Repository<Employee>,
    private readonly dataSource: DataSource,
    private readonly employeesService: EmployeesService,
  ) {
    const methods = employeesService as unknown as Record<
      string,
      (...args: unknown[]) => Promise<unknown>
    >;
    const handler = (
      label: string,
      entity: new () => object,
      createDto: new () => object,
      updateDto: new () => object,
      suffix: string,
    ): RecordHandler => ({
      label,
      entity,
      createDto,
      updateDto,
      add: (...args) => methods[`add${suffix}`](...args),
      update: (...args) => methods[`update${suffix}`](...args),
      remove: (...args) => methods[`remove${suffix}`](...args),
    });
    this.handlers = {
      contact: handler(
        'Contact',
        EmployeeContact,
        CreateEmployeeContactDto,
        UpdateEmployeeContactDto,
        'Contact',
      ),
      address: handler(
        'Address',
        EmployeeAddress,
        CreateEmployeeAddressDto,
        UpdateEmployeeAddressDto,
        'Address',
      ),
      relative: handler(
        'Next of kin / relative',
        EmployeeRelative,
        CreateEmployeeRelativeDto,
        UpdateEmployeeRelativeDto,
        'Relative',
      ),
      identification: handler(
        'Identification',
        EmployeeIdentification,
        CreateEmployeeIdentificationDto,
        UpdateEmployeeIdentificationDto,
        'Identification',
      ),
      bank_account: handler(
        'Bank account',
        EmployeeBankAccount,
        CreateEmployeeBankAccountDto,
        UpdateEmployeeBankAccountDto,
        'BankAccount',
      ),
      academic_qualification: handler(
        'Academic qualification',
        EmployeeAcademicQualification,
        CreateEmployeeAcademicQualificationDto,
        UpdateEmployeeAcademicQualificationDto,
        'AcademicQualification',
      ),
      professional_qualification: handler(
        'Professional qualification',
        EmployeeProfessionalQualification,
        CreateEmployeeProfessionalQualificationDto,
        UpdateEmployeeProfessionalQualificationDto,
        'ProfessionalQualification',
      ),
      experience: handler(
        'Work experience',
        EmployeeExperience,
        CreateEmployeeExperienceDto,
        UpdateEmployeeExperienceDto,
        'ExperienceDetail',
      ),
    };
  }

  // ─────────────────────────── employee side ───────────────────────────

  async listMine(actor: AuthenticatedUser) {
    const employee = await this.resolveSelf(actor);
    const rows = await this.changes.find({
      where: { company_id: employee.company_id, employee_id: employee.id },
      order: { created_at: 'DESC', id: 'DESC' },
      take: 200,
    });
    return rows.map((row) => this.present(row));
  }

  async create(
    actor: AuthenticatedUser,
    type: string,
    body: Dto,
    reason?: string,
  ) {
    const recordType = this.assertType(type);
    const employee = await this.resolveSelf(actor);
    const dto = await this.validateDto(
      this.handlers[recordType].createDto,
      body,
    );
    const sensitive = this.isSensitive(recordType);
    const change = this.changes.create({
      company_id: employee.company_id,
      employee_id: employee.id,
      record_type: recordType,
      record_id: null,
      action: 'CREATE',
      status: 'PENDING_HR',
      sensitive,
      payload: this.seal(dto, sensitive),
      reason: reason?.trim() || null,
      requested_by_user_id: actor.id,
    });
    if (sensitive) return this.present(await this.changes.save(change));
    return this.present(await this.applyAndSave(change, actor, null));
  }

  async update(
    actor: AuthenticatedUser,
    type: string,
    recordId: number,
    body: Dto,
    reason?: string,
  ) {
    const recordType = this.assertType(type);
    const employee = await this.resolveSelf(actor);
    await this.loadRecordOrFail(recordType, employee.id, recordId);
    await this.assertNoPending(employee.id, recordType, recordId);
    const dto = await this.validateDto(
      this.handlers[recordType].updateDto,
      body,
    );
    if (!Object.keys(dto).length) {
      throw new BadRequestException('Nothing to change');
    }
    const sensitive = this.isSensitive(recordType);
    const change = this.changes.create({
      company_id: employee.company_id,
      employee_id: employee.id,
      record_type: recordType,
      record_id: recordId,
      action: 'UPDATE',
      status: 'PENDING_HR',
      sensitive,
      payload: this.seal(dto, sensitive),
      before_data: this.seal(
        await this.snapshot(recordType, employee.id, recordId),
        sensitive,
      ),
      reason: reason?.trim() || null,
      requested_by_user_id: actor.id,
    });
    if (sensitive) return this.present(await this.changes.save(change));
    return this.present(await this.applyAndSave(change, actor, null));
  }

  async remove(
    actor: AuthenticatedUser,
    type: string,
    recordId: number,
    reason?: string,
  ) {
    const recordType = this.assertType(type);
    const employee = await this.resolveSelf(actor);
    await this.loadRecordOrFail(recordType, employee.id, recordId);
    await this.assertNoPending(employee.id, recordType, recordId);
    const sensitive = this.isSensitive(recordType);
    const change = this.changes.create({
      company_id: employee.company_id,
      employee_id: employee.id,
      record_type: recordType,
      record_id: recordId,
      action: 'DELETE',
      status: 'PENDING_HR',
      sensitive,
      before_data: this.seal(
        await this.snapshot(recordType, employee.id, recordId),
        sensitive,
      ),
      reason: reason?.trim() || null,
      requested_by_user_id: actor.id,
    });
    if (sensitive) return this.present(await this.changes.save(change));
    return this.present(await this.applyAndSave(change, actor, null));
  }

  /** Rollbacks always wait for HR. */
  async requestRollback(
    actor: AuthenticatedUser,
    changeId: number,
    reason?: string,
  ) {
    const employee = await this.resolveSelf(actor);
    const target = await this.changes.findOne({
      where: {
        id: changeId,
        company_id: employee.company_id,
        employee_id: employee.id,
      },
    });
    if (!target) throw new NotFoundException('Change not found');
    await this.assertRollbackable(target);
    const change = this.changes.create({
      company_id: employee.company_id,
      employee_id: employee.id,
      record_type: target.record_type,
      record_id: target.record_id,
      action: 'ROLLBACK',
      status: 'PENDING_HR',
      sensitive: target.sensitive,
      rollback_of_change_id: target.id,
      reason: reason?.trim() || null,
      requested_by_user_id: actor.id,
    });
    return this.present(await this.changes.save(change));
  }

  async cancel(actor: AuthenticatedUser, changeId: number) {
    const employee = await this.resolveSelf(actor);
    const change = await this.changes.findOne({
      where: {
        id: changeId,
        company_id: employee.company_id,
        employee_id: employee.id,
      },
    });
    if (!change) throw new NotFoundException('Change not found');
    if (change.status !== 'PENDING_HR') {
      throw new ConflictException('Only pending requests can be cancelled');
    }
    change.status = 'CANCELLED';
    return this.present(await this.changes.save(change));
  }

  // ───────────────────────────── HR side ─────────────────────────────

  async listForHr(
    actor: AuthenticatedUser,
    query: { status?: string; employee_id?: number },
  ) {
    const companyId = this.companyIdOf(actor);
    const where: Record<string, unknown> = { company_id: companyId };
    if (query.status) where.status = query.status;
    if (query.employee_id) where.employee_id = Number(query.employee_id);
    const rows = await this.changes.find({
      where,
      order: { created_at: 'DESC', id: 'DESC' },
      take: 200,
    });
    const employees = rows.length
      ? await this.employees.find({
          where: {
            company_id: companyId,
            id: In([...new Set(rows.map((r) => r.employee_id))]),
          },
        })
      : [];
    const names = new Map(
      employees.map((e) => [
        e.id,
        {
          name: [e.first_name, e.middle_name, e.last_name]
            .filter(Boolean)
            .join(' '),
          number: e.employee_no,
        },
      ]),
    );
    return rows.map((row) => ({
      ...this.present(row),
      employee_name: names.get(row.employee_id)?.name ?? null,
      employee_no: names.get(row.employee_id)?.number ?? null,
    }));
  }

  async approve(actor: AuthenticatedUser, changeId: number, comment?: string) {
    const change = await this.findPendingForHr(actor, changeId);
    if (change.requested_by_user_id === actor.id) {
      throw new ForbiddenException('You cannot approve your own request');
    }
    return this.present(
      await this.applyAndSave(change, actor, comment ?? null),
    );
  }

  async reject(actor: AuthenticatedUser, changeId: number, comment?: string) {
    const change = await this.findPendingForHr(actor, changeId);
    if (!comment?.trim()) {
      throw new BadRequestException('A rejection reason is required');
    }
    change.status = 'REJECTED';
    change.reviewed_by_user_id = actor.id;
    change.reviewed_at = new Date();
    change.review_comment = comment.trim();
    return this.present(await this.changes.save(change));
  }

  // ───────────────────────────── internals ─────────────────────────────

  /**
   * Applies the change through EmployeesService (same validation and
   * archive-style deletes HR uses), then records the outcome.
   */
  private async applyAndSave(
    change: EmployeeProfileRecordChange,
    actor: AuthenticatedUser,
    comment: string | null,
  ) {
    const type = change.record_type;
    const h = this.handlers[type];
    const companyId = change.company_id;
    const employeeId = change.employee_id;

    if (change.action === 'CREATE') {
      const created = (await h.add(
        companyId,
        employeeId,
        this.open(change.payload) ?? {},
        actor,
      )) as { id?: number } | null;
      change.record_id = typeof created?.id === 'number' ? created.id : null;
    } else if (change.action === 'UPDATE') {
      const current = await this.snapshot(type, employeeId, change.record_id!);
      const before = this.open(change.before_data);
      if (before && !this.sameValues(before, current)) {
        throw new ConflictException(
          'This record changed after the request was made. Reject it and ask the employee to resubmit.',
        );
      }
      await h.update(
        companyId,
        employeeId,
        change.record_id!,
        this.open(change.payload) ?? {},
        actor,
      );
    } else if (change.action === 'DELETE') {
      await this.loadRecordOrFail(type, employeeId, change.record_id!);
      await h.remove(companyId, employeeId, change.record_id!, actor);
    } else {
      await this.applyRollback(change, actor);
    }

    change.after_data =
      change.action === 'DELETE' || !change.record_id
        ? null
        : this.seal(
            await this.snapshot(type, employeeId, change.record_id).catch(
              () => null,
            ),
            change.sensitive,
          );
    change.status = 'APPLIED';
    change.applied_at = new Date();
    if (change.requested_by_user_id !== actor.id) {
      change.reviewed_by_user_id = actor.id;
      change.reviewed_at = new Date();
      change.review_comment = comment?.trim() || null;
    }
    return this.changes.save(change);
  }

  private async applyRollback(
    change: EmployeeProfileRecordChange,
    actor: AuthenticatedUser,
  ) {
    const target = await this.changes.findOne({
      where: {
        id: change.rollback_of_change_id!,
        company_id: change.company_id,
      },
    });
    if (!target) throw new NotFoundException('Original change not found');
    await this.assertRollbackable(target, change.id);
    const h = this.handlers[target.record_type];
    const { company_id: companyId, employee_id: employeeId } = target;

    if (target.action === 'CREATE') {
      // Undo an add: archive the record that was created.
      await h.remove(companyId, employeeId, target.record_id!, actor);
      change.before_data = target.after_data;
    } else if (target.action === 'UPDATE') {
      const current = await this.snapshot(
        target.record_type,
        employeeId,
        target.record_id!,
      );
      const after = this.open(target.after_data);
      if (after && !this.sameValues(after, current)) {
        throw new ConflictException(
          'This record has been changed again since; only the latest change can be rolled back.',
        );
      }
      change.before_data = this.seal(current, target.sensitive);
      await h.update(
        companyId,
        employeeId,
        target.record_id!,
        this.restorable(this.open(target.before_data)),
        actor,
      );
    } else if (target.action === 'DELETE') {
      // Undo a delete: re-create the record from the saved copy.
      const created = (await h.add(
        companyId,
        employeeId,
        this.restorable(this.open(target.before_data)),
        actor,
      )) as { id?: number } | null;
      change.record_id = typeof created?.id === 'number' ? created.id : null;
    } else {
      throw new BadRequestException('A rollback cannot itself be rolled back');
    }

    target.rolled_back_by_change_id = change.id;
    await this.changes.save(target);
  }

  private async assertRollbackable(
    target: EmployeeProfileRecordChange,
    pendingRollbackId?: number,
  ) {
    if (target.action === 'ROLLBACK') {
      throw new BadRequestException('A rollback cannot itself be rolled back');
    }
    if (target.status !== 'APPLIED' || !target.record_id) {
      throw new BadRequestException('Only applied changes can be rolled back');
    }
    if (target.rolled_back_by_change_id) {
      throw new ConflictException('This change was already rolled back');
    }
    const later = await this.changes
      .createQueryBuilder('c')
      .where('c.employee_id = :employeeId', { employeeId: target.employee_id })
      .andWhere('c.record_type = :type', { type: target.record_type })
      .andWhere('c.record_id = :recordId', { recordId: target.record_id })
      .andWhere('c.id > :id', { id: target.id })
      .andWhere(pendingRollbackId ? 'c.id <> :pendingRollbackId' : '1=1', {
        pendingRollbackId,
      })
      .andWhere(`c.status IN ('APPLIED','PENDING_HR')`)
      .getCount();
    if (later > 0) {
      throw new ConflictException(
        'Only the latest change to a record can be rolled back, and not while another request is pending.',
      );
    }
  }

  private async assertNoPending(
    employeeId: number,
    type: ProfileRecordType,
    recordId: number,
  ) {
    const pending = await this.changes.count({
      where: {
        employee_id: employeeId,
        record_type: type,
        record_id: recordId,
        status: 'PENDING_HR',
      },
    });
    if (pending) {
      throw new ConflictException(
        'This record already has a request waiting for HR approval',
      );
    }
  }

  private async findPendingForHr(actor: AuthenticatedUser, changeId: number) {
    const companyId = this.companyIdOf(actor);
    const change = await this.changes.findOne({
      where: { id: changeId, company_id: companyId },
    });
    if (!change) throw new NotFoundException('Request not found');
    if (change.status !== 'PENDING_HR') {
      throw new ConflictException('This request is no longer pending');
    }
    return change;
  }

  private async resolveSelf(actor: AuthenticatedUser) {
    const companyId = this.companyIdOf(actor);
    if (!actor.companyMembershipId) {
      throw new ForbiddenException('Active company context is required');
    }
    const employee = await this.employees.findOne({
      where: {
        company_id: companyId,
        company_user_id: actor.companyMembershipId,
      },
      select: ['id', 'company_id', 'employment_status'],
    });
    if (!employee) throw new NotFoundException('Employee not found');
    if (!SELF_EDITABLE_STATUSES.includes(employee.employment_status)) {
      throw new ForbiddenException(
        'Personal details can no longer be changed for this employee',
      );
    }
    return employee;
  }

  private companyIdOf(actor: AuthenticatedUser) {
    if (!actor.companyId) {
      throw new ForbiddenException('Active company context is required');
    }
    return actor.companyId;
  }

  private assertType(type: string): ProfileRecordType {
    if (!(PROFILE_RECORD_TYPES as readonly string[]).includes(type)) {
      throw new BadRequestException(`Unknown record type "${type}"`);
    }
    return type as ProfileRecordType;
  }

  private isSensitive(type: ProfileRecordType) {
    return SENSITIVE_PROFILE_RECORD_TYPES.includes(type);
  }

  private async validateDto(cls: new () => object, body: Dto): Promise<Dto> {
    const instance = plainToInstance(cls, body ?? {});
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length) {
      throw new BadRequestException(
        errors.flatMap((e) => Object.values(e.constraints ?? {})),
      );
    }
    return JSON.parse(JSON.stringify(instance)) as Dto;
  }

  private async loadRecordOrFail(
    type: ProfileRecordType,
    employeeId: number,
    recordId: number,
  ) {
    const record = await this.dataSource
      .getRepository(this.handlers[type].entity)
      .findOne({ where: { id: recordId, employee_id: employeeId } as never });
    if (!record) {
      throw new NotFoundException(`${this.handlers[type].label} not found`);
    }
    return record as Record<string, unknown>;
  }

  private async snapshot(
    type: ProfileRecordType,
    employeeId: number,
    recordId: number,
  ): Promise<Dto> {
    const record = await this.loadRecordOrFail(type, employeeId, recordId);
    const out: Dto = {};
    for (const [key, value] of Object.entries(record)) {
      if (SNAPSHOT_SKIP_KEYS.has(key)) continue;
      if (
        value !== null &&
        typeof value === 'object' &&
        !(value instanceof Date)
      )
        continue;
      out[key] = value instanceof Date ? value.toISOString() : value;
    }
    return out;
  }

  /** Snapshot → payload for add/update: only fields the create DTO accepts. */
  private restorable(snapshot: Dto | null): Dto {
    return Object.fromEntries(
      Object.entries(snapshot ?? {}).filter(
        ([key, value]) => !SNAPSHOT_SKIP_KEYS.has(key) && value !== undefined,
      ),
    );
  }

  private sameValues(a: Dto, b: Dto) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (key === 'updated_at') continue;
      if (JSON.stringify(a[key] ?? null) !== JSON.stringify(b[key] ?? null))
        return false;
    }
    return true;
  }

  private seal(value: unknown, sensitive: boolean): string | null {
    if (value === null || value === undefined) return null;
    const json = JSON.stringify(value);
    return sensitive && isFieldEncryptionEnabled()
      ? encryptField(json, 'employee_profile_record_changes.data')
      : json;
  }

  private open(value: string | null): Dto | null {
    if (!value) return null;
    const json = isEncryptedField(value)
      ? decryptField(value, 'employee_profile_record_changes.data')
      : value;
    return JSON.parse(json) as Dto;
  }

  /** API shape: decrypted, with account numbers masked. */
  private present(row: EmployeeProfileRecordChange) {
    const mask = (data: Dto | null) => {
      if (!data) return null;
      const copy = { ...data };
      if (typeof copy.account_number === 'string') {
        copy.account_number = maskAccountNumber(copy.account_number);
      }
      return copy;
    };
    return {
      id: row.id,
      employee_id: row.employee_id,
      record_type: row.record_type,
      record_label: this.handlers[row.record_type]?.label ?? row.record_type,
      record_id: row.record_id,
      action: row.action,
      status: row.status,
      sensitive: row.sensitive,
      requested_values: mask(this.open(row.payload)),
      before: mask(this.open(row.before_data)),
      after: mask(this.open(row.after_data)),
      rollback_of_change_id: row.rollback_of_change_id,
      rolled_back_by_change_id: row.rolled_back_by_change_id,
      can_roll_back:
        row.status === 'APPLIED' &&
        row.action !== 'ROLLBACK' &&
        !row.rolled_back_by_change_id,
      reason: row.reason,
      requested_by_user_id: row.requested_by_user_id,
      reviewed_by_user_id: row.reviewed_by_user_id,
      reviewed_at: row.reviewed_at,
      review_comment: row.review_comment,
      applied_at: row.applied_at,
      created_at: row.created_at,
    };
  }

  static readonly HR_PERMISSION = HR_FINAL_PERMISSION;
}
