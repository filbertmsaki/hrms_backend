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
} from '../../common/utils/scoped-rbac.util';
import {
  assertCanMutateSystemGeneratedRbacRecord,
  hasOwnerRole,
} from '../../common/utils/system-generated-rbac.util';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { Permission } from './entities/permission.entity';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
  ) {}

  private createBaseQuery() {
    return this.permissionsRepository
      .createQueryBuilder('permission')
      .leftJoinAndSelect('permission.company', 'company')
      .distinct(true);
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

  async create(
    createPermissionDto: CreatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    if (!hasOwnerRole(actor)) {
      throw new ForbiddenException(
        'Only users with the OWNER role can create permissions',
      );
    }

    const permission = this.permissionsRepository.create({
      name: createPermissionDto.name,
      display_name: createPermissionDto.display_name,
      description: createPermissionDto.description ?? null,
      company_id: null,
      is_system_generated: false,
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

    permission.name = updatePermissionDto.name ?? permission.name;
    permission.display_name =
      updatePermissionDto.display_name ?? permission.display_name;
    permission.description =
      updatePermissionDto.description !== undefined
        ? updatePermissionDto.description ?? null
        : permission.description;

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
