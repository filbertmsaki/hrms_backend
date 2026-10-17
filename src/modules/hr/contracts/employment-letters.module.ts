import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../../files/files.module';
import { Company } from '../../companies/entities/company.entity';
import { Document } from '../documents/entities/document.entity';
import { Employee } from '../employees/entities/employee.entity';
import { EmployeeCompensationVersion } from '../employee-movements/entities/employee-compensation-version.entity';
import { RecruitmentCandidate } from '../recruitment/entities/recruitment-candidate.entity';
import { RecruitmentRequest } from '../recruitment/entities/recruitment-request.entity';
import { Position } from '../positions/entities/position.entity';
import { Department } from '../departments/entities/department.entity';
import { EmploymentLetterTemplate } from './entities/employment-letter-template.entity';
import { EmploymentLettersController } from './employment-letters.controller';
import { EmploymentLettersService } from './employment-letters.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmploymentLetterTemplate,
      Document,
      RecruitmentCandidate,
      RecruitmentRequest,
      Employee,
      EmployeeCompensationVersion,
      Company,
      Position,
      Department,
    ]),
    FilesModule,
  ],
  controllers: [EmploymentLettersController],
  providers: [EmploymentLettersService],
  exports: [EmploymentLettersService],
})
export class EmploymentLettersModule {}
