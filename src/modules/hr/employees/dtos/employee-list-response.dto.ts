import { ApiProperty } from '@nestjs/swagger';
import { EmploymentStatusEnum } from '../enums/employment-status.enum';
import { EmploymentTypeEnum } from '../enums/employment-type.enum';
import { ProfileImageSourceEnum } from '../enums/profile-image-source.enum';

export type EmployeeListRow = {
  id: number | string;
  employeeNo: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender?: string | null;
  email: string;
  phone: string;
  profilePhotoUrl?: string | null;
  uploadedProfilePhotoUrl?: string | null;
  profilePhotoSource?: string | null;
  storedProfileImageSource?: ProfileImageSourceEnum | null;
  defaultAvatarId?: number | string | null;
  branchName: string | null;
  departmentName: string | null;
  positionName: string | null;
  managerFirstName: string | null;
  managerMiddleName: string | null;
  managerLastName: string | null;
  employmentStatus: EmploymentStatusEnum;
  employmentType: EmploymentTypeEnum;
  hireDate: string | null;
};

type RawEmployeeListRow = EmployeeListRow &
  Record<string, string | number | null | undefined>;

function buildFullName(
  ...parts: Array<string | null | undefined>
): string | null {
  const fullName = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(' ');

  return fullName || null;
}

function getRowValue<T extends string | number | null>(
  row: RawEmployeeListRow,
  key: keyof EmployeeListRow,
): T | undefined {
  return (row[key] ?? row[String(key).toLowerCase()]) as T | undefined;
}

export class EmployeeListResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  employeeNo: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty({ nullable: true })
  profilePhotoUrl: string | null;

  @ApiProperty({ nullable: true })
  uploadedProfilePhotoUrl: string | null;

  @ApiProperty({ nullable: true })
  profilePhotoSource: string | null;

  @ApiProperty()
  email: string;

  @ApiProperty()
  phone: string;

  @ApiProperty({ nullable: true })
  branchName: string | null;

  @ApiProperty({ nullable: true })
  departmentName: string | null;

  @ApiProperty({ nullable: true })
  positionName: string | null;

  @ApiProperty({ nullable: true })
  managerName: string | null;

  @ApiProperty({ enum: EmploymentStatusEnum })
  employmentStatus: EmploymentStatusEnum;

  @ApiProperty({ enum: EmploymentTypeEnum })
  employmentType: EmploymentTypeEnum;

  @ApiProperty({ nullable: true, example: '2025-01-01' })
  hireDate: string | null;

  static fromRow(row: EmployeeListRow): EmployeeListResponseDto {
    const rawRow = row as RawEmployeeListRow;
    const dto = new EmployeeListResponseDto();
    const id = getRowValue<number | string>(rawRow, 'id');
    const employeeNo = getRowValue<string>(rawRow, 'employeeNo') ?? '';
    const firstName = getRowValue<string | null>(rawRow, 'firstName');
    const middleName = getRowValue<string | null>(rawRow, 'middleName');
    const lastName = getRowValue<string | null>(rawRow, 'lastName');
    const managerFirstName = getRowValue<string | null>(
      rawRow,
      'managerFirstName',
    );
    const managerMiddleName = getRowValue<string | null>(
      rawRow,
      'managerMiddleName',
    );
    const managerLastName = getRowValue<string | null>(
      rawRow,
      'managerLastName',
    );

    dto.id = typeof id === 'string' ? Number(id) : (id ?? 0);
    dto.employeeNo = employeeNo;
    dto.fullName = buildFullName(firstName, middleName, lastName) ?? employeeNo;
    dto.profilePhotoUrl =
      getRowValue<string | null>(rawRow, 'profilePhotoUrl') ?? null;
    dto.uploadedProfilePhotoUrl =
      getRowValue<string | null>(rawRow, 'uploadedProfilePhotoUrl') ?? null;
    dto.profilePhotoSource =
      getRowValue<string | null>(rawRow, 'profilePhotoSource') ?? null;
    dto.email = getRowValue<string>(rawRow, 'email') ?? '';
    dto.phone = getRowValue<string>(rawRow, 'phone') ?? '';
    dto.branchName = getRowValue<string | null>(rawRow, 'branchName') ?? null;
    dto.departmentName =
      getRowValue<string | null>(rawRow, 'departmentName') ?? null;
    dto.positionName =
      getRowValue<string | null>(rawRow, 'positionName') ?? null;
    dto.managerName = buildFullName(
      managerFirstName,
      managerMiddleName,
      managerLastName,
    );
    dto.employmentStatus = getRowValue<EmploymentStatusEnum>(
      rawRow,
      'employmentStatus',
    ) as EmploymentStatusEnum;
    dto.employmentType = getRowValue<EmploymentTypeEnum>(
      rawRow,
      'employmentType',
    ) as EmploymentTypeEnum;
    dto.hireDate = getRowValue<string | null>(rawRow, 'hireDate') ?? null;

    return dto;
  }
}
