import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailModule } from '../../mail/mail.module';
import { HrDocumentsModule } from '../documents/hr-documents.module';
import { EmployeeInvitationsModule } from '../employee-invitations/employee-invitations.module';
import { EmployeeInvitation } from '../employee-invitations/entities/employee-invitation.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Position } from '../positions/entities/position.entity';
import {
  RecruitmentController,
  RecruitmentOffersController,
} from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';
import { RecruitmentCandidate } from './entities/recruitment-candidate.entity';
import { RecruitmentRequest } from './entities/recruitment-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecruitmentRequest,
      RecruitmentCandidate,
      Position,
      Employee,
      EmployeeInvitation,
    ]),
    MailModule,
    HrDocumentsModule,
    EmployeeInvitationsModule,
  ],
  controllers: [RecruitmentController, RecruitmentOffersController],
  providers: [RecruitmentService],
})
export class RecruitmentModule {}
