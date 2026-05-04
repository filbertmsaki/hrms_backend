import { forwardRef, Module } from '@nestjs/common';
import { TwoFaService } from './2fa.service';
import { UsersModule } from '../../users/users.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule, forwardRef(() => UsersModule)],
  providers: [TwoFaService],
  exports: [TwoFaService],
})
export class TwoFaModule {}
