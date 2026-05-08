import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
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
import { Permission } from '../permissions/entities/permission.entity';
import { CreateRoleDto } from './dtos/create-role.dto';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { Role } from './entities/role.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private readonly rolesRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private createBaseQuery() {
    return this.rolesRepository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.company', 'company')
      .leftJoinAndSelect('role.permissions', 'permission')
      .leftJoinAndSelect('permission.company', 'permissionCompany')
      .distinct(true);
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
    roleCompanyId: number | null,
    actor?: AuthenticatedUser,
  ): Promise<Permission[]> {
    const ids = Array.from(new Set(permissionIds));

    if (!ids.length) {
      return [];
    }

    const query = this.permissionsRepository
      .createQueryBuilder('permission')
      .where('permission.id IN (:...ids)', { ids });

    if (roleCompanyId === null) {
      query.andWhere('permission.company_id IS NULL');
    } else {
      query.andWhere(
        '(permission.company_id IS NULL OR permission.company_id = :companyId)',
        { companyId: roleCompanyId },
      );
    }

    if (!hasOwnerRole(actor)) {
      const companyActor = ensureCompanyScopedActor(actor);
      query.andWhere(
        '(permission.company_id IS NULL OR permission.company_id = :actorCompanyId)',
        { actorCompanyId: companyActor.companyId },
      );
    }

    const permissions = await query.getMany();

    if (permissions.length !== ids.length) {
      throw new NotFoundException(
        'One or more permissions were not found or are outside the allowed scope',
      );
    }

    return permissions;
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
      companyId,
      actor,
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

  async findOneByName(name: string, companyId: number | null = null): Promise<Role> {
    const role = await this.rolesRepository.findOne({
      where: {
        name,
        company_id: companyId === null ? IsNull() : companyId,
      },
      relations: ['company', 'permissions', 'permissions.company'],
    });

    if (!role) {
      throw new NotFoundException(`Role with name "${name}" not found`);
    }

    return role;
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
        updatedCompanyId,
        actor,
      );
    }

    role.name = updateRoleDto.name ?? role.name;
    role.display_name = updateRoleDto.display_name ?? role.display_name;
    role.description =
      updateRoleDto.description !== undefined
        ? updateRoleDto.description ?? null
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
