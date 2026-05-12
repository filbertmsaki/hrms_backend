import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompaniesModule } from '../../companies/companies.module';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { User } from '../../users/entities/user.entity';
import { UsersModule } from '../../users/users.module';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Position } from '../positions/entities/position.entity';
import { HrSharedModule } from '../shared/hr-shared.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { EmployeeAddress } from './entities/employee-address.entity';
import { EmployeeBankAccount } from './entities/employee-bank-account.entity';
import { EmployeeContact } from './entities/employee-contact.entity';
import { EmployeeDepartment } from './entities/employee-department.entity';
import { EmployeeDocument } from './entities/employee-document.entity';
import { EmployeeExperience } from './entities/employee-experience.entity';
import { EmployeeIdentification } from './entities/employee-identification.entity';
import { EmployeeAcademicQualification } from './entities/employee-academic-qualification.entity';
import { EmployeeProfessionalQualification } from './entities/employee-professional-qualification.entity';
import { EmployeeRelative } from './entities/employee-relative.entity';
import { Employee } from './entities/employee.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      EmployeeDepartment,
      EmployeeDocument,
      EmployeeContact,
      EmployeeAddress,
      EmployeeRelative,
      EmployeeIdentification,
      EmployeeBankAccount,
      EmployeeAcademicQualification,
      EmployeeProfessionalQualification,
      EmployeeExperience,
      CompanyUser,
      User,
      Branch,
      Department,
      Position,
    ]),
    CompaniesModule,
    UsersModule,
    HrSharedModule,
  ],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService, TypeOrmModule],
})
export class EmployeesModule {}
