import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaginationDto, SortDirection } from '../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  assertCanManageScopedRbacRecord,
  ensureCompanyScopedActor,
  resolveScopedRbacCompanyId,
} from '../../common/utils/scoped-rbac.util';
import {
  assertCanCreateSystemGeneratedRbacRecord,
  assertCanMutateSystemGeneratedRbacRecord,
  hasOwnerRole,
} from '../../common/utils/system-generated-rbac.util';
import { Company } from '../companies/entities/company.entity';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { CompanyUserRole } from '../companies/entities/company-user-role.entity';
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { Role } from './entities/role.entity';
import { RoleAuditActionEnum } from './enums/role-audit-action.enum';
import { RoleAuditService } from './services/role-audit.service';
import { DefaultAvatarsService } from '../hr/default-avatars/default-avatars.service';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserRole)
    private readonly companyUserRoleRepository: Repository<CompanyUserRole>,
    private readonly roleAuditService: RoleAuditService,
    private readonly defaultAvatarsService: DefaultAvatarsService,
  ) {}

  private createBaseQuery() {
    return this.rolesRepository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.company', 'company')
      .leftJoinAndSelect('role.permissions', 'permission');
  }

  private async assertCompanyExists(companyId: number): Promise<void> {
    const company = await this.companyRepository.findOne({
      where: { id: companyId, status: 'active' },
      select: ['id'],
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }
  }

  private async findAccessibleRoleOrFail(
    id: number,
    actor?: AuthenticatedUser,
  ): Promise<Role> {
    const query = this.createBaseQuery().where('role.id = :id', { id });

    if (!hasOwnerRole(actor)) {
      const companyActor = ensureCompanyScopedActor(actor);
      query.andWhere(
        '(role.company_id IS NULL OR role.company_id = :companyId)',
        { companyId: companyActor.companyId },
      );
    }

    const role = await query.getOne();

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  private async resolvePermissions(
    permissionIds: number[],
  ): Promise<Permission[]> {
    const ids = Array.from(new Set(permissionIds));

    if (!ids.length) {
      return [];
    }

    const query = this.permissionsRepository
      .createQueryBuilder('permission')
      .where('permission.id IN (:...ids)', { ids });

    const permissions = await query.getMany();

    if (permissions.length !== ids.length) {
      throw new NotFoundException('One or more permissions were not found');
    }

    return permissions;
  }

  private async findCurrentCompanyRoleOrFail(
    id: number,
    actor: AuthenticatedUser,
  ): Promise<{
    role: Role;
    companyId: number;
  }> {
    const companyActor = ensureCompanyScopedActor(actor);

    const role = await this.createBaseQuery()
      .where('role.id = :id', { id })
      .andWhere('role.company_id = :companyId', {
        companyId: companyActor.companyId,
      })
      .getOne();

    if (!role) {
      throw new NotFoundException('Company role not found');
    }

    return {
      role,
      companyId: companyActor.companyId,
    };
  }

  private mapRolePermission(permission: Permission) {
    return {
      id: permission.id,
      name: permission.name,
      display_name: permission.display_name,
      description: permission.description,
      is_system_generated: permission.is_system_generated,
      created_at: permission.created_at,
      updated_at: permission.updated_at,
    };
  }

  private async mapRoleUserAssignment(assignment: CompanyUserRole) {
    const membership = assignment.company_user;
    const user = membership.user;
    const resolvedAvatar =
      await this.defaultAvatarsService.resolveEmployeeProfileAvatar(
        membership.company_id,
        membership.employee,
      );

    return {
      assignment_id: assignment.id,
      company_user_id: membership.id,
      user_id: user.id,
      user_no: user.user_no,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: `${user.first_name} ${user.last_name}`.trim(),
      email: user.email,
      phone: user.phone,
      profile_photo_url: resolvedAvatar.profile_photo_url,
      uploaded_profile_photo_url: resolvedAvatar.uploaded_profile_photo_url,
      profile_photo_source: resolvedAvatar.profile_photo_source,
      user_status: user.status,
      membership_status: membership.status,
      assigned_at: assignment.created_at,
    };
  }

  private resolveUpdatedCompanyId(
    actor: AuthenticatedUser | undefined,
    role: Role,
    requestedCompanyId: number | undefined,
  ): number | null {
    if (requestedCompanyId === undefined) {
      return role.company_id;
    }

    if (hasOwnerRole(actor)) {
      return requestedCompanyId;
    }

    const companyActor = ensureCompanyScopedActor(actor);

    if (requestedCompanyId !== companyActor.companyId) {
      throw new ForbiddenException(
        'You can only keep roles in your active company',
      );
    }

    return companyActor.companyId;
  }

  async create(
    createRoleDto: CreateRoleDto,
    actor?: AuthenticatedUser,
  ): Promise<Role> {
    assertCanCreateSystemGeneratedRbacRecord(
      actor,
      createRoleDto.is_system_generated,
      'role',
    );

    const companyId = resolveScopedRbacCompanyId(
      actor,
      createRoleDto.company_id,
      'role',
    );

    if (companyId !== null) {
      await this.assertCompanyExists(companyId);
    }

    const permissions = await this.resolvePermissions(
      createRoleDto.permission_ids ?? [],
    );

    const role = this.rolesRepository.create({
      name: createRoleDto.name,
      display_name: createRoleDto.display_name,
      description: createRoleDto.description ?? null,
      company_id: companyId,
      is_system_generated: createRoleDto.is_system_generated ?? false,
      permissions,
    });

    return this.rolesRepository.save(role);
  }

  async findAll(actor?: AuthenticatedUser): Promise<Role[]> {
    const query = this.createBaseQuery().orderBy('role.name', 'ASC');

    if (!hasOwnerRole(actor)) {
      const companyActor = ensureCompanyScopedActor(actor);
      query.where('(role.company_id IS NULL OR role.company_id = :companyId)', {
        companyId: companyActor.companyId,
      });
    }

    return query.getMany();
  }

  async findOne(id: number, actor?: AuthenticatedUser): Promise<Role> {
    return this.findAccessibleRoleOrFail(id, actor);
  }

  async findOneByName(
    name: string,
    companyId: number | null = null,
  ): Promise<Role> {
    const role = await this.rolesRepository.findOne({
      where: {
        name,
        company_id: companyId === null ? IsNull() : companyId,
      },
      relations: ['company', 'permissions'],
    });

    if (!role) {
      throw new NotFoundException(`Role with name "${name}" not found`);
    }

    return role;
  }

  async listUsersAssignedToRole(
    roleId: number,
    actor: AuthenticatedUser,
    query: PaginationDto,
  ) {
    const { role, companyId } = await this.findCurrentCompanyRoleOrFail(
      roleId,
      actor,
    );

    const {
      page = 1,
      limit = 20,
      sortBy = 'assigned_at',
      sortOrder = SortDirection.DESC,
      search,
    } = query;

    const qb = this.companyUserRoleRepository
      .createQueryBuilder('assignment')
      .innerJoinAndSelect('assignment.company_user', 'membership')
      .innerJoinAndSelect('membership.user', 'user')
      .leftJoinAndSelect('membership.employee', 'employee')
      .where('assignment.role_id = :roleId', { roleId: role.id })
      .andWhere('membership.company_id = :companyId', { companyId })
      .andWhere('membership.status = :status', { status: 'active' });

    if (search?.trim()) {
      const term = `%${search.trim()}%`;

      qb.andWhere(
        '(user.first_name LIKE :term OR ' +
          'user.last_name LIKE :term OR ' +
          'user.email LIKE :term OR ' +
          'user.phone LIKE :term OR ' +
          'user.user_no LIKE :term)',
        { term },
      );
    }

    const sortColumnMap: Record<string, string> = {
      assigned_at: 'assignment.created_at',
      id: 'user.id',
      user_no: 'user.user_no',
      first_name: 'user.first_name',
      last_name: 'user.last_name',
      email: 'user.email',
      phone: 'user.phone',
      user_status: 'user.status',
      membership_status: 'membership.status',
      created_at: 'assignment.created_at',
      updated_at: 'user.updated_at',
    };

    const safeSortColumn = sortColumnMap[sortBy] ?? sortColumnMap.assigned_at;
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    qb.orderBy(safeSortColumn, direction).addOrderBy('assignment.id', 'DESC');

    const skip = (page - 1) * limit;
    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    const data = await Promise.all(
      items.map((item) => this.mapRoleUserAssignment(item)),
    );

    return {
      role: {
        id: role.id,
        name: role.name,
        display_name: role.display_name,
        company_id: role.company_id,
      },
      data,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async assignUserToRole(
    roleId: number,
    userId: number,
    actor: AuthenticatedUser,
  ) {
    const { role, companyId } = await this.findCurrentCompanyRoleOrFail(
      roleId,
      actor,
    );

    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
      relations: {
        user: true,
        employee: true,
      },
    });

    if (!membership) {
      throw new NotFoundException(
        'User is not an active member of this company',
      );
    }

    let assignment = await this.companyUserRoleRepository.findOne({
      where: {
        company_user_id: membership.id,
        role_id: role.id,
      },
      relations: {
        company_user: {
          user: true,
          employee: true,
        },
      },
    });

    if (!assignment) {
      assignment = await this.companyUserRoleRepository.save(
        this.companyUserRoleRepository.create({
          company_user_id: membership.id,
          role_id: role.id,
        }),
      );

      assignment = await this.companyUserRoleRepository.findOneOrFail({
        where: { id: assignment.id },
        relations: {
          company_user: {
            user: true,
            employee: true,
          },
        },
      });
    }

    return {
      message: 'User assigned to role successfully',
      role: {
        id: role.id,
        name: role.name,
        display_name: role.display_name,
        company_id: role.company_id,
      },
      assignment: await this.mapRoleUserAssignment(assignment),
    };
  }

  async revokeUserFromRole(
    roleId: number,
    userId: number,
    actor: AuthenticatedUser,
  ) {
    const { role, companyId } = await this.findCurrentCompanyRoleOrFail(
      roleId,
      actor,
    );

    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
      relations: {
        user: true,
        employee: true,
      },
    });

    if (!membership) {
      throw new NotFoundException(
        'User is not an active member of this company',
      );
    }

    await this.companyUserRoleRepository.delete({
      company_user_id: membership.id,
      role_id: role.id,
    });

    return {
      message: 'User revoked from role successfully',
      role: {
        id: role.id,
        name: role.name,
        display_name: role.display_name,
        company_id: role.company_id,
      },
      user: {
        id: membership.user.id,
        user_no: membership.user.user_no,
        first_name: membership.user.first_name,
        last_name: membership.user.last_name,
        email: membership.user.email,
        phone: membership.user.phone,
        profile_photo_url: membership.employee?.profile_photo_url ?? null,
      },
    };
  }

  async listRolePermissions(roleId: number, actor: AuthenticatedUser) {
    const { role } = await this.findCurrentCompanyRoleOrFail(roleId, actor);

    return {
      role: {
        id: role.id,
        name: role.name,
        display_name: role.display_name,
        company_id: role.company_id,
        is_system_generated: role.is_system_generated,
      },
      data:
        role.permissions?.map((permission) =>
          this.mapRolePermission(permission),
        ) ?? [],
    };
  }

  async assignPermissionToRole(
    roleId: number,
    permissionId: number,
    actor: AuthenticatedUser,
  ) {
    const { role } = await this.findCurrentCompanyRoleOrFail(roleId, actor);

    assertCanManageScopedRbacRecord(actor, role, 'role');

    const permission = await this.permissionsRepository.findOne({
      where: { id: permissionId },
    });

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    const currentPermissions = role.permissions ?? [];
    const exists = currentPermissions.some((item) => item.id === permission.id);

    if (!exists) {
      role.permissions = [...currentPermissions, permission];
      await this.rolesRepository.save(role);

      await this.roleAuditService.log({
        action: RoleAuditActionEnum.PERMISSION_ASSIGNED,
        role_id: role.id,
        permission_id: permission.id,
        actor,
        description: `Permission "${permission.name}" assigned to role "${role.name}"`,
        new_values: {
          permission_id: permission.id,
          permission_name: permission.name,
        },
      });
    }

    const updated = await this.findAccessibleRoleOrFail(role.id, actor);

    return {
      message: 'Permission assigned to role successfully',
      role: {
        id: updated.id,
        name: updated.name,
        display_name: updated.display_name,
        company_id: updated.company_id,
        is_system_generated: updated.is_system_generated,
      },
      permissions:
        updated.permissions?.map((item) => this.mapRolePermission(item)) ?? [],
    };
  }

  async revokePermissionFromRole(
    roleId: number,
    permissionId: number,
    actor: AuthenticatedUser,
  ) {
    const { role } = await this.findCurrentCompanyRoleOrFail(roleId, actor);

    assertCanManageScopedRbacRecord(actor, role, 'role');

    const permissionExists = role.permissions?.some(
      (permission) => permission.id === permissionId,
    );

    if (!permissionExists) {
      return {
        message: 'Permission was not assigned to this role',
        role: {
          id: role.id,
          name: role.name,
          display_name: role.display_name,
          company_id: role.company_id,
          is_system_generated: role.is_system_generated,
        },
        permissions:
          role.permissions?.map((item) => this.mapRolePermission(item)) ?? [],
      };
    }

    role.permissions = role.permissions.filter(
      (permission) => permission.id !== permissionId,
    );

    await this.rolesRepository.save(role);

    await this.roleAuditService.log({
      action: RoleAuditActionEnum.PERMISSION_REVOKED,
      role_id: role.id,
      permission_id: permissionId,
      actor,
      description: `Permission id ${permissionId} revoked from role "${role.name}"`,
      old_values: { permission_id: permissionId },
    });

    const updated = await this.findAccessibleRoleOrFail(role.id, actor);

    return {
      message: 'Permission revoked from role successfully',
      role: {
        id: updated.id,
        name: updated.name,
        display_name: updated.display_name,
        company_id: updated.company_id,
        is_system_generated: updated.is_system_generated,
      },
      permissions:
        updated.permissions?.map((item) => this.mapRolePermission(item)) ?? [],
    };
  }

  async update(
    id: number,
    updateRoleDto: UpdateRoleDto,
    actor?: AuthenticatedUser,
  ): Promise<Role> {
    const role = await this.findAccessibleRoleOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(actor, role, 'role');
    assertCanManageScopedRbacRecord(actor, role, 'role');
    assertCanCreateSystemGeneratedRbacRecord(
      actor,
      updateRoleDto.is_system_generated,
      'role',
    );

    const updatedCompanyId = this.resolveUpdatedCompanyId(
      actor,
      role,
      updateRoleDto.company_id,
    );

    if (updatedCompanyId !== null) {
      await this.assertCompanyExists(updatedCompanyId);
    }

    if (updateRoleDto.permission_ids !== undefined) {
      role.permissions = await this.resolvePermissions(
        updateRoleDto.permission_ids,
      );
    }

    role.name = updateRoleDto.name ?? role.name;
    role.display_name = updateRoleDto.display_name ?? role.display_name;
    role.description =
      updateRoleDto.description !== undefined
        ? (updateRoleDto.description ?? null)
        : role.description;
    role.company_id = updatedCompanyId;

    if (updateRoleDto.is_system_generated !== undefined) {
      role.is_system_generated = updateRoleDto.is_system_generated;
    }

    return this.rolesRepository.save(role);
  }

  async remove(id: number, actor?: AuthenticatedUser): Promise<void> {
    const role = await this.findAccessibleRoleOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(actor, role, 'role');
    assertCanManageScopedRbacRecord(actor, role, 'role');

    await this.rolesRepository.remove(role);
  }
}
