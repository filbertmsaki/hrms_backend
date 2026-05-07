import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import {
  assertCanCreateSystemGeneratedRbacRecord,
  assertCanMutateSystemGeneratedRbacRecord,
} from '../../common/utils/system-generated-rbac.util';
import { Permission } from './entities/permission.entity';
import { CreatePermissionDto } from './dtos/create-permission.dto';
import { UpdatePermissionDto } from './dtos/update-permission.dto';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(Permission)
    private permissionsRepository: Repository<Permission>,
  ) {}

  async create(
    createPermissionDto: CreatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    assertCanCreateSystemGeneratedRbacRecord(
      actor,
      createPermissionDto.is_system_generated,
      'permission',
    );

    const permission = this.permissionsRepository.create({
      ...createPermissionDto,
      is_system_generated: createPermissionDto.is_system_generated ?? false,
    });

    return this.permissionsRepository.save(permission);
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionsRepository.find();
  }

  async findOne(id: number): Promise<Permission> {
    const permission = await this.permissionsRepository.findOneBy({ id });
    if (!permission) throw new NotFoundException('Permission not found');
    return permission;
  }

  async update(
    id: number,
    updatePermissionDto: UpdatePermissionDto,
    actor?: AuthenticatedUser,
  ): Promise<Permission> {
    const permission = await this.findOne(id);
    assertCanMutateSystemGeneratedRbacRecord(
      actor,
      permission,
      'permission',
    );
    assertCanCreateSystemGeneratedRbacRecord(
      actor,
      updatePermissionDto.is_system_generated,
      'permission',
    );
    Object.assign(permission, updatePermissionDto);
    return this.permissionsRepository.save(permission);
  }

  async remove(id: number, actor?: AuthenticatedUser): Promise<void> {
    const permission = await this.findOne(id);
    assertCanMutateSystemGeneratedRbacRecord(
      actor,
      permission,
      'permission',
    );
    await this.permissionsRepository.remove(permission);
  }
}
