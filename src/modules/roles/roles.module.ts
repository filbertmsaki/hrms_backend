import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../companies/entities/company.entity';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { CompanyUserRole } from '../companies/entities/company-user-role.entity';
import { CompanyModuleGuard } from '../../common/guards/company-module.guard';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from './entities/role.entity';
import { RoleAuditLog } from './entities/role-audit-log.entity';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RoleAuditService } from './services/role-audit.service';
import { DefaultAvatarsModule } from '../hr/default-avatars/default-avatars.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Role,
      Permission,
      Company,
      CompanyUser,
      CompanyUserRole,
      RoleAuditLog,
    ]),
    DefaultAvatarsModule,
  ],
  controllers: [RolesController],
  providers: [RolesService, RoleAuditService, CompanyModuleGuard],
  exports: [RolesService, TypeOrmModule],
})
export class RolesModule {}
