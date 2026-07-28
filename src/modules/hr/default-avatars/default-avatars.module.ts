import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Company } from '../../companies/entities/company.entity';
import { FilesModule } from '../../files/files.module';
import { Employee } from '../employees/entities/employee.entity';
import { DefaultAvatarsController } from './default-avatars.controller';
import { DefaultAvatarsService } from './default-avatars.service';
import { DefaultAvatar } from './entities/default-avatar.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([DefaultAvatar, Employee, Company]),
    FilesModule,
  ],
  controllers: [DefaultAvatarsController],
  providers: [DefaultAvatarsService],
  exports: [DefaultAvatarsService, TypeOrmModule],
})
export class DefaultAvatarsModule {}
