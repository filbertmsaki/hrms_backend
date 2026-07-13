import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { User } from '../../modules/users/entities/user.entity';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { AccessOrganization } from '../../modules/access-control/access-organizations/entity/access-organization.entity';
import { EmployeeDeviceAssignment } from '../../modules/access-control/employee-device-assignments/entity/employee-device-assignment.entity';
import { EmployeeDeviceAssignmentSyncStatusEnum } from '../../modules/access-control/employee-device-assignments/enum/employee-device-assignment-sync-status.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const DEFAULT_DEVICE_CODE = 'ALLIANCE-HQ-MAIN';
const ROOT_ORG_NAME = 'Alliance staff';

export default class EmployeeDeviceAssignmentsSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const companyRepo = qr.manager.getRepository(Company);
      const companyUserRepo = qr.manager.getRepository(CompanyUser);
      const employeeRepo = qr.manager.getRepository(Employee);
      const userRepo = qr.manager.getRepository(User);
      const deviceRepo = qr.manager.getRepository(AttendanceDevice);
      const orgRepo = qr.manager.getRepository(AccessOrganization);
      const assignmentRepo = qr.manager.getRepository(EmployeeDeviceAssignment);

      const companyName =
        process.env.DEFAULT_COMPANY_NAME ?? ALLIANCE_COMPANY_NAME;
      const company = await companyRepo.findOne({
        where: { slug: ALLIANCE_COMPANY_SLUG },
      });
      if (!company) {
        throw new Error(
          `Company "${companyName}" not found. Run 004-company.seed.ts first.`,
        );
      }

      const device = await deviceRepo.findOne({
        where: { deviceCode: DEFAULT_DEVICE_CODE },
      });
      if (!device) {
        throw new Error(
          `Device "${DEFAULT_DEVICE_CODE}" not found. Run 021-attendance-devices.seed.ts first.`,
        );
      }

      const org = await orgRepo.findOne({
        where: { companyId: company.id, orgName: ROOT_ORG_NAME },
      });

      const companyUsers = await companyUserRepo.find({
        where: { company_id: company.id },
      });

      let assignedCount = 0;

      for (const companyUser of companyUsers) {
        const employee = await employeeRepo.findOne({
          where: { company_user_id: companyUser.id },
        });
        if (!employee) continue;

        const user = await userRepo.findOne({
          where: { id: companyUser.user_id },
        });

        const existing = await assignmentRepo.findOne({
          where: { employeeId: employee.id, deviceId: device.id },
        });

        const hikvisionNo = employee.metadata?.hikvisionNo as
          | string
          | undefined;
        if (!hikvisionNo) continue;

        if (!existing) {
          const fullName = user
            ? `${user.first_name} ${user.last_name}`.trim()
            : undefined;

          await assignmentRepo.save(
            assignmentRepo.create({
              companyId: company.id,
              employeeId: employee.id,
              employeeNo: hikvisionNo,
              employeeName: fullName,
              deviceId: device.id,
              organizationId: org?.id ?? undefined,
              hikvisionUserType: 'normal',
              userVerifyMode: 'faceOrCardOrFp',
              validEnabled: true,
              localUiRight: false,
              closeDelayEnabled: false,
              maxOpenDoorTime: 0,
              openDoorTime: 0,
              syncStatus: EmployeeDeviceAssignmentSyncStatusEnum.PENDING,
              metadata: {
                seeded: true,
                source: '024-employee-device-assignments',
              },
            }),
          );
          assignedCount++;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][EmployeeDeviceAssignments] Assigned ${assignedCount} employees to device "${DEFAULT_DEVICE_CODE}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][EmployeeDeviceAssignments] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
