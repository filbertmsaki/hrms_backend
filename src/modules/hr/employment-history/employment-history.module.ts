import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeeEmploymentEvent } from './entities/employee-employment-event.entity';
import { EmploymentHistoryController } from './employment-history.controller';
import { EmploymentHistoryService } from './employment-history.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmployeeEmploymentEvent, Employee]),
    HrSharedModule,
  ],
  controllers: [EmploymentHistoryController],
  providers: [EmploymentHistoryService],
  exports: [EmploymentHistoryService],
})
export class EmploymentHistoryModule {}
