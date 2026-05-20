import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttendancePoliciesController } from './attendance-policies.controller';
import { AttendancePoliciesService } from './attendance-policies.service';
import { AttendancePolicy } from './entities/attendance-policy.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AttendancePolicy])],
  controllers: [AttendancePoliciesController],
  providers: [AttendancePoliciesService],
  exports: [AttendancePoliciesService, TypeOrmModule],
})
export class AttendanceModule {}