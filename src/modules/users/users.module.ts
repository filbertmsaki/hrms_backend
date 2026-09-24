import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TwoFaModule } from '../auth/2fa/2fa.module';
import { CompaniesModule } from '../companies/companies.module';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { DefaultAvatarsModule } from '../hr/default-avatars/default-avatars.module';
import { UserTwoFactorAuditLog } from './entities/user-two-factor-audit-log.entity';
import { UserTwoFactorAuditService } from './services/user-two-factor-audit.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { AuthSessionsModule } from '../auth/auth-sessions.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [
    forwardRef(() => TwoFaModule),
    TypeOrmModule.forFeature([User, UserTwoFactorAuditLog, Employee]),
    AuthSessionsModule,
    FilesModule,
    forwardRef(() => CompaniesModule),
    DefaultAvatarsModule,
  ],
  controllers: [UsersController],
  providers: [UsersService, UserTwoFactorAuditService, TenantGuard],
  exports: [UsersService, UserTwoFactorAuditService, TypeOrmModule],
})
export class UsersModule {}
