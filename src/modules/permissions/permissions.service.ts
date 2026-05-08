import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
  ) {}

  private createBaseQuery() {
    return this.permissionsRepository
      .createQueryBuilder('permission')
      .leftJoinAndSelect('permission.company', 'company')
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

  private async findAccessiblePermissionOrFail(
    id: number,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    const query = this.createBaseQuery().where('permission.id = :id', { id });

    if (!hasOwnerRole(actor)) {
      const companyActor = ensureCompanyScopedActor(actor);
      query.andWhere(
        '(permission.company_id IS NULL OR permission.company_id = :companyId)',
        { companyId: companyActor.companyId },
      );
    }

    const permission = await query.getOne();

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return permission;
  }

  private resolveUpdatedCompanyId(
    actor: AuthenticatedUser | undefined,
    permission: Permission,
    requestedCompanyId: number | undefined,
  ): number | null {
    if (requestedCompanyId === undefined) {
      return permission.company_id;
    }

    if (hasOwnerRole(actor)) {
      return requestedCompanyId;
    }

    const companyActor = ensureCompanyScopedActor(actor);

    if (requestedCompanyId !== companyActor.companyId) {
      throw new ForbiddenException(
        'You can only keep permissions in your active company',
      );
    }

    return companyActor.companyId;
  }

  async create(
    createPermissionDto: CreatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    assertCanCreateSystemGeneratedRbacRecord(
      actor,
      createPermissionDto.is_system_generated,
      'permission',
    );

    const companyId = resolveScopedRbacCompanyId(
      actor,
      createPermissionDto.company_id,
      'permission',
    );

    if (companyId !== null) {
      await this.assertCompanyExists(companyId);
    }

    const permission = this.permissionsRepository.create({
      name: createPermissionDto.name,
      display_name: createPermissionDto.display_name,
      description: createPermissionDto.description ?? null,
      company_id: companyId,
      is_system_generated: createPermissionDto.is_system_generated ?? false,
    });

    return this.permissionsRepository.save(permission);
  }

  async findAll(actor?: AuthenticatedUser): Promise<Permission[]> {
    const query = this.createBaseQuery().orderBy('permission.name', 'ASC');

    if (!hasOwnerRole(actor)) {
      const companyActor = ensureCompanyScopedActor(actor);
      query.where(
        '(permission.company_id IS NULL OR permission.company_id = :companyId)',
        {
          companyId: companyActor.companyId,
        },
      );
    }

    return query.getMany();
  }

  async findOne(id: number, actor?: AuthenticatedUser): Promise<Permission> {
    return this.findAccessiblePermissionOrFail(id, actor);
  }

  async update(
    id: number,
    updatePermissionDto: UpdatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    const permission = await this.findAccessiblePermissionOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(
      actor,
      permission,
      'permission',
    );
    assertCanManageScopedRbacRecord(actor, permission, 'permission');
    assertCanCreateSystemGeneratedRbacRecord(
      actor,
      updatePermissionDto.is_system_generated,
      'permission',
    );

    const updatedCompanyId = this.resolveUpdatedCompanyId(
      actor,
      permission,
      updatePermissionDto.company_id,
    );

    if (updatedCompanyId !== null) {
      await this.assertCompanyExists(updatedCompanyId);
    }

    permission.name = updatePermissionDto.name ?? permission.name;
    permission.display_name =
      updatePermissionDto.display_name ?? permission.display_name;
    permission.description =
      updatePermissionDto.description !== undefined
        ? updatePermissionDto.description ?? null
        : permission.description;
    permission.company_id = updatedCompanyId;

    if (updatePermissionDto.is_system_generated !== undefined) {
      permission.is_system_generated = updatePermissionDto.is_system_generated;
    }

    return this.permissionsRepository.save(permission);
  }

  async remove(id: number, actor?: AuthenticatedUser): Promise<void> {
    const permission = await this.findAccessiblePermissionOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(
      actor,
      permission,
      'permission',
    );
    assertCanManageScopedRbacRecord(actor, permission, 'permission');

    await this.permissionsRepository.remove(permission);
  }
}
