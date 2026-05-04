import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TwoFaModule } from '../auth/2fa/2fa.module';
import { CompaniesModule } from '../companies/companies.module';
import { TenantGuard } from '../../common/guards/tenant.guard';

@Module({
  imports: [
    forwardRef(() => TwoFaModule),
    TypeOrmModule.forFeature([User]),
    CompaniesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, TenantGuard],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
