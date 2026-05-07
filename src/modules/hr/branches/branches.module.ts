import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { Branch } from './entities/branch.entity';
import { CompanyUserBranchAccess } from './entities/company-user-branch-access.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Branch,
      CompanyUserBranchAccess,
      CompanyUser,
      User,
    ]),
    HrSharedModule,
  ],
  controllers: [BranchesController],
  providers: [BranchesService],
  exports: [BranchesService, TypeOrmModule],
})
export class BranchesModule {}
