import { forwardRef, Module } from '@nestjs/common';
import { TwoFaService } from './2fa.service';
import { UsersModule } from '../../users/users.module';
import { ConfigModule } from '@nestjs/config';
import { CompaniesModule } from '../../companies/companies.module';

@Module({
  imports: [ConfigModule, CompaniesModule, forwardRef(() => UsersModule)],
  providers: [TwoFaService],
  exports: [TwoFaService],
})
export class TwoFaModule {}
