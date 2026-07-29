import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { assertActorCanAccessPermission } from '../../common/utils/permission-scope.util';
import {
  assertCanMutateSystemGeneratedRbacRecord,
  hasOwnerRole,
} from '../../common/utils/system-generated-rbac.util';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { Permission } from './entities/permission.entity';
import { PermissionScope } from './enums/permission-scope.enum';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
  ) {}

  private createBaseQuery() {
    return this.permissionsRepository.createQueryBuilder('permission');
  }

  private async findAccessiblePermissionOrFail(
    id: number,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    const permission = await this.createBaseQuery()
      .where('permission.id = :id', { id })
      .getOne();

    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    assertActorCanAccessPermission(actor, permission);

    return permission;
  }

  async create(
    createPermissionDto: CreatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    if (!hasOwnerRole(actor)) {
      throw new ForbiddenException(
        'Only platform-scoped users can create permissions',
      );
    }

    const permission = this.permissionsRepository.create({
      name: createPermissionDto.name,
      display_name: createPermissionDto.display_name,
      description: createPermissionDto.description ?? null,
      scope: createPermissionDto.scope ?? PermissionScope.COMPANY,
      is_system_generated: false,
    });

    return this.permissionsRepository.save(permission);
  }

  async findAll(actor?: AuthenticatedUser): Promise<Permission[]> {
    const query = this.createBaseQuery().orderBy('permission.name', 'ASC');

    if (!hasOwnerRole(actor)) {
      query.where('permission.scope IN (:...scopes)', {
        scopes: [PermissionScope.COMPANY, PermissionScope.SHARED],
      });
    }

    return query.getMany();
  }

  private assertCanManagePermissions(actor?: AuthenticatedUser): void {
    if (!hasOwnerRole(actor)) {
      throw new ForbiddenException(
        'Only platform-scoped users can modify permissions',
      );
    }
  }

  async findOne(id: number, actor?: AuthenticatedUser): Promise<Permission> {
    return this.findAccessiblePermissionOrFail(id, actor);
  }

  async update(
    id: number,
    updatePermissionDto: UpdatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    this.assertCanManagePermissions(actor);

    const permission = await this.findAccessiblePermissionOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(actor, permission, 'permission');

    permission.name = updatePermissionDto.name ?? permission.name;
    permission.display_name =
      updatePermissionDto.display_name ?? permission.display_name;
    permission.description =
      updatePermissionDto.description !== undefined
        ? (updatePermissionDto.description ?? null)
        : permission.description;
    permission.scope = updatePermissionDto.scope ?? permission.scope;

    return this.permissionsRepository.save(permission);
  }

  async remove(id: number, actor?: AuthenticatedUser): Promise<void> {
    this.assertCanManagePermissions(actor);

    const permission = await this.findAccessiblePermissionOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(actor, permission, 'permission');

    await this.permissionsRepository.remove(permission);
  }
}
