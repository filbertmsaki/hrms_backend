import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../mail/mail.module';
import { SmsModule } from '../../sms/sms.module';
import { Company } from '../../companies/entities/company.entity';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { UsersModule } from '../../users/users.module';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeesModule } from '../employees/employees.module';
import { Position } from '../positions/entities/position.entity';
import { OnboardingWorkflow } from '../onboarding/entities/onboarding-workflow.entity';
import { EmployeeInvitationsController } from './employee-invitations.controller';
import { EmployeeInvitationsService } from './employee-invitations.service';
import { EmployeeInvitation } from './entities/employee-invitation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmployeeInvitation,
      Company,
      User,
      CompanyUser,
      Branch,
      Department,
      Position,
      Employee,
      OnboardingWorkflow,
    ]),
    MailModule,
    SmsModule,
    EmployeesModule,
    UsersModule,
  ],
  controllers: [EmployeeInvitationsController],
  providers: [EmployeeInvitationsService],
  exports: [EmployeeInvitationsService],
})
export class EmployeeInvitationsModule {}
