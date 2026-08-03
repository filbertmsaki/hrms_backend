import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { assertActorCanAccessPermission } from '../../common/utils/permission-scope.util';
import {
  assertCanMutateSystemGeneratedRbacRecord,
  hasOwnerRole,
} from '../../common/utils/system-generated-rbac.util';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';
import { Permission } from './entities/permission.entity';
import { PermissionScope } from './enums/permission-scope.enum';
import { SecurityEventsService } from '../security/security-events.service';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionsRepository: Repository<Permission>,
    private readonly securityEventsService: SecurityEventsService,
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
    context?: AuditRequestContext,
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

    const savedPermission = await this.permissionsRepository.save(permission);

    if (actor) {
      await this.securityEventsService.log({
        eventType: SecurityEventType.PERMISSION_CREATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        permissionId: savedPermission.id,
        resourceType: 'permission',
        resourceId: savedPermission.id,
        newValues: {
          name: savedPermission.name,
          display_name: savedPermission.display_name,
          description: savedPermission.description,
          scope: savedPermission.scope,
        },
        context,
      });
    }

    return savedPermission;
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
    context?: AuditRequestContext,
  ): Promise<Permission> {
    this.assertCanManagePermissions(actor);

    const permission = await this.findAccessiblePermissionOrFail(id, actor);
    const previousValues = {
      name: permission.name,
      display_name: permission.display_name,
      description: permission.description,
      scope: permission.scope,
    };

    assertCanMutateSystemGeneratedRbacRecord(actor, permission, 'permission');

    permission.name = updatePermissionDto.name ?? permission.name;
    permission.display_name =
      updatePermissionDto.display_name ?? permission.display_name;
    permission.description =
      updatePermissionDto.description !== undefined
        ? (updatePermissionDto.description ?? null)
        : permission.description;
    permission.scope = updatePermissionDto.scope ?? permission.scope;

    const savedPermission = await this.permissionsRepository.save(permission);

    if (actor) {
      await this.securityEventsService.log({
        eventType: SecurityEventType.PERMISSION_UPDATED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        permissionId: savedPermission.id,
        resourceType: 'permission',
        resourceId: savedPermission.id,
        oldValues: previousValues,
        newValues: {
          name: savedPermission.name,
          display_name: savedPermission.display_name,
          description: savedPermission.description,
          scope: savedPermission.scope,
        },
        context,
      });
    }

    return savedPermission;
  }

  async remove(
    id: number,
    actor?: AuthenticatedUser,
    context?: AuditRequestContext,
  ): Promise<void> {
    this.assertCanManagePermissions(actor);

    const permission = await this.findAccessiblePermissionOrFail(id, actor);

    assertCanMutateSystemGeneratedRbacRecord(actor, permission, 'permission');

    if (actor) {
      await this.securityEventsService.log({
        eventType: SecurityEventType.PERMISSION_DELETED,
        outcome: SecurityEventOutcome.SUCCESS,
        actor,
        permissionId: permission.id,
        resourceType: 'permission',
        resourceId: permission.id,
        oldValues: {
          name: permission.name,
          display_name: permission.display_name,
          description: permission.description,
          scope: permission.scope,
        },
        context,
      });
    }

    await this.permissionsRepository.remove(permission);
  }
}
