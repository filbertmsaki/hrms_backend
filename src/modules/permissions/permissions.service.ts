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
import { PERMISSION_SEEDS } from '../../database/seeds/001-permissions.seed';
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

    if (
      (updatePermissionDto.name !== undefined &&
        updatePermissionDto.name !== permission.name) ||
      (updatePermissionDto.scope !== undefined &&
        updatePermissionDto.scope !== permission.scope)
    ) {
      if (
        permission.is_system_generated ||
        PERMISSION_SEEDS.some((entry) => entry.name === permission.name) ||
        (await this.hasAssignments(permission.id))
      ) {
        throw new ForbiddenException(
          'The key and scope of a built-in or assigned permission are fixed',
        );
      }
    }
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
    if (
      permission.is_system_generated ||
      PERMISSION_SEEDS.some((entry) => entry.name === permission.name) ||
      (await this.hasAssignments(permission.id))
    ) {
      throw new ForbiddenException(
        'Only an unassigned custom permission can be deleted',
      );
    }

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

  private async hasAssignments(permissionId: number): Promise<boolean> {
    const [result]: Array<{ assigned: boolean }> =
      await this.permissionsRepository.query(
        `SELECT EXISTS(SELECT 1 FROM permission_role WHERE "permissionsId"=$1
         UNION ALL SELECT 1 FROM permission_user WHERE "permissionsId"=$1
         UNION ALL SELECT 1 FROM company_user_permissions WHERE permission_id=$1) AS assigned`,
        [permissionId],
      );
    return result.assigned;
  }
}
