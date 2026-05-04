import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { Permission } from '../permissions/entities/permission.entity';
import { Role } from '../roles/entities/role.entity';
import { User } from '../users/entities/user.entity';
import { Company } from './entities/company.entity';
import { CompanyUser } from './entities/company-user.entity';
import { CompanyUserPermission } from './entities/company-user-permission.entity';
import { CompanyUserRole } from './entities/company-user-role.entity';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      CompanyUser,
      CompanyUserRole,
      CompanyUserPermission,
      User,
      Role,
      Permission,
    ]),
  ],
  controllers: [CompaniesController],
  providers: [CompaniesService, TenantGuard],
  exports: [CompaniesService, TypeOrmModule],
})
export class CompaniesModule {}
