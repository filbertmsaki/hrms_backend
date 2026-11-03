import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '../../notifications/notifications.module';
import { PostgresAdvisoryLockService } from '../../../common/database/postgres-advisory-lock.service';
import {
  FeedbackForm,
  FeedbackParticipation,
  FeedbackResponse,
  FeedbackRound,
} from './forms-feedback.entity';
import { FormsFeedbackService } from './forms-feedback.service';
import {
  FormsFeedbackController,
  EmployeeFormsFeedbackController,
} from './forms-feedback.controller';
import { FormsFeedbackScheduler } from './forms-feedback.scheduler';
@Module({
  imports: [
    TypeOrmModule.forFeature([
      FeedbackForm,
      FeedbackRound,
      FeedbackParticipation,
      FeedbackResponse,
    ]),
    NotificationsModule,
  ],
  controllers: [FormsFeedbackController, EmployeeFormsFeedbackController],
  providers: [
    FormsFeedbackService,
    FormsFeedbackScheduler,
    PostgresAdvisoryLockService,
  ],
  exports: [FormsFeedbackService],
})
export class FormsFeedbackModule {}
