import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../departments/entities/department.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { DesignationsController } from './designations.controller';
import { DesignationsService } from './designations.service';
import { Designation } from './entities/designation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Designation, Department]), HrSharedModule],
  controllers: [DesignationsController],
  providers: [DesignationsService],
  exports: [DesignationsService, TypeOrmModule],
})
export class DesignationsModule {}
