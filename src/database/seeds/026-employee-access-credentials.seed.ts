import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { CompanyUser } from '../../modules/companies/entities/company-user.entity';
import { Employee } from '../../modules/hr/employees/entities/employee.entity';
import { User } from '../../modules/users/entities/user.entity';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { EmployeeAccessCredential } from '../../modules/access-control/employee-access-credentials/entity/employee-access-credential.entity';
import { EmployeeAccessCredentialTypeEnum } from '../../modules/access-control/employee-access-credentials/enum/employee-access-credential-type.enum';
import { EmployeeAccessCredentialStatusEnum } from '../../modules/access-control/employee-access-credentials/enum/employee-access-credential-status.enum';
import { EmployeeAccessCredentialSourceEnum } from '../../modules/access-control/employee-access-credentials/enum/employee-access-credential-source.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

// Seeds placeholder fingerprint + PIN credentials for every employee assigned
// to the main attendance device.
//
// WHY this is DEVELOPMENT / STAGING data only:
//   In production, fingerprints are captured live via the Hikvision biometric
//   device and synced back as EmployeeAccessCredential rows by the device-sync
//   service.  Real records have hasFingerprint=true only after a successful
//   biometric capture session.
//
//   In dev/staging, we seed simulated records (hasFingerprint=true,
//   fingerprintCount=1) so that the per-employee readiness check passes and
//   attendance processing can be tested end-to-end without physical hardware.
//
// In production, do NOT run this seeder.  Instead, rely on the biometric
// capture session flow (EmployeeBiometricCaptureSession) to populate real data.

const DEFAULT_DEVICE_CODE = 'ALLIANCE-HQ-MAIN';
const ISSUE_DATE = '2025-01-01';

export default class EmployeeAccessCredentialsSeeder implements Seeder {
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
      const credRepo = qr.manager.getRepository(EmployeeAccessCredential);

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

      const companyUsers = await companyUserRepo.find({
        where: { company_id: company.id },
      });

      let fingerprintCount = 0;
      let pinCount = 0;
      let skippedCount = 0;

      for (const cu of companyUsers) {
        const employee = await employeeRepo.findOne({
          where: { company_user_id: cu.id },
        });
        if (!employee) continue;

        const user = await userRepo.findOne({ where: { id: cu.user_id } });

        // ── Fingerprint credential ────────────────────────────────────────────
        const existingFp = await credRepo.findOne({
          where: {
            companyId: company.id,
            employeeId: employee.id,
            deviceId: device.id,
            credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
          },
        });

        if (!existingFp) {
          await credRepo.save(
            credRepo.create({
              companyId: company.id,
              employeeId: employee.id,
              employeeNo: employee.employee_no,
              deviceId: device.id,
              credentialType: EmployeeAccessCredentialTypeEnum.FINGERPRINT,
              credentialNo: `FP-${employee.employee_no}-01`,
              fingerprintId: '1',
              cardReaderNo: 0,
              fingerprintCount: 1,
              hasFingerprint: true,
              credentialStatus: EmployeeAccessCredentialStatusEnum.ACTIVE,
              isPrimary: true,
              issueDate: ISSUE_DATE,
              expiryDate: null,
              source: EmployeeAccessCredentialSourceEnum.MANUAL,
              metadata: {
                seeded: true,
                simulated: true,
                source: '026-employee-access-credentials',
                note: 'Development placeholder — replace with live Hikvision sync data in production.',
              },
            }),
          );
          fingerprintCount++;
        } else {
          skippedCount++;
        }

        // ── PIN credential ────────────────────────────────────────────────────
        // PIN is derived from the last 6 digits of the user phone, falling back
        // to employee_no suffix.  Change via the access credentials UI before
        // going live.
        const existingPin = await credRepo.findOne({
          where: {
            companyId: company.id,
            employeeId: employee.id,
            deviceId: device.id,
            credentialType: EmployeeAccessCredentialTypeEnum.PIN,
          },
        });

        if (!existingPin) {
          const defaultPin = user?.phone
            ? user.phone.replace(/\D/g, '').slice(-6).padStart(6, '0')
            : employee.employee_no
                .replace(/\D/g, '')
                .slice(-6)
                .padStart(6, '0');

          await credRepo.save(
            credRepo.create({
              companyId: company.id,
              employeeId: employee.id,
              employeeNo: employee.employee_no,
              deviceId: device.id,
              credentialType: EmployeeAccessCredentialTypeEnum.PIN,
              credentialNo: `PIN-${employee.employee_no}`,
              pinPassword: defaultPin,
              passwordSet: true,
              credentialStatus: EmployeeAccessCredentialStatusEnum.ACTIVE,
              isPrimary: false,
              issueDate: ISSUE_DATE,
              expiryDate: null,
              source: EmployeeAccessCredentialSourceEnum.MANUAL,
              metadata: {
                seeded: true,
                simulated: true,
                source: '026-employee-access-credentials',
                note: 'Default PIN — employee must change via self-service or admin.',
              },
            }),
          );
          pinCount++;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][EmployeeAccessCredentials] Seeded ${fingerprintCount} fingerprint + ${pinCount} PIN credentials ` +
          `(${skippedCount} fingerprint records already existed, skipped).`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][EmployeeAccessCredentials] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
