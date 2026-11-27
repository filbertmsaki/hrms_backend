import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { MailModule } from '../../mail/mail.module';
import { Document } from '../documents/entities/document.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeeLettersService } from './employee-letters.service';
import { EmployeeLetter } from './entities/employee-letter.entity';
import { EmployeeLetterEvent } from './entities/employee-letter-event.entity';
import { LetterReferenceSequence } from './entities/letter-reference-sequence.entity';
import { LetterTemplate } from './entities/letter-template.entity';
import { LetterTemplateVersion } from './entities/letter-template-version.entity';
import { LetterPdfService } from './letter-pdf.service';
import { LetterPlaceholdersService } from './letter-placeholders.service';
import { LetterTemplatesService } from './letter-templates.service';
import { LetterVerificationService } from './letter-verification.service';
import {
  EmployeeLettersController,
  LetterTemplatesController,
  LetterVerificationController,
} from './letters.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LetterTemplate,
      LetterTemplateVersion,
      EmployeeLetter,
      EmployeeLetterEvent,
      LetterReferenceSequence,
      Document,
    ]),
    HrSharedModule,
    FilesModule,
    MailModule,
  ],
  // Static routes first: "letters/templates" and "letters/verification" must
  // be registered before "letters/:id".
  controllers: [
    LetterVerificationController,
    LetterTemplatesController,
    EmployeeLettersController,
  ],
  providers: [
    LetterPlaceholdersService,
    LetterTemplatesService,
    LetterPdfService,
    LetterVerificationService,
    EmployeeLettersService,
  ],
  exports: [EmployeeLettersService, LetterTemplatesService],
})
export class LettersModule {}
