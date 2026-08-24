import { EmploymentStatusEnum } from '../enums/employment-status.enum';
import { EmploymentTypeEnum } from '../enums/employment-type.enum';
import { EmployeeListResponseDto } from './employee-list-response.dto';

describe('EmployeeListResponseDto', () => {
  it('includes the linked user id needed for employee account actions', () => {
    const result = EmployeeListResponseDto.fromRow({
      id: 41,
      userId: '43',
      employeeNo: 'AICL/00041',
      firstName: 'Amina',
      middleName: null,
      lastName: 'Moshi',
      email: 'amina@example.com',
      phone: '+255712345678',
      branchName: null,
      departmentName: null,
      positionName: null,
      managerFirstName: null,
      managerMiddleName: null,
      managerLastName: null,
      employmentStatus: EmploymentStatusEnum.ACTIVE,
      employmentType: EmploymentTypeEnum.FULL_TIME,
      hireDate: null,
    });

    expect(result.userId).toBe(43);
  });
});
