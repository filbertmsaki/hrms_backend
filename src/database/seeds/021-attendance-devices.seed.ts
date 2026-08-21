import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../modules/access-control/attendance-devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../modules/access-control/attendance-devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../../modules/access-control/attendance-devices/enums/attendance-device-sync-mode.enum';
import {
  ALLIANCE_COMPANY_NAME,
  ALLIANCE_COMPANY_SLUG,
} from './company-structure.constants';

const LEGACY_DEVICE_CODES = ['ALLIANCE-HQ-MAIN'];

type DeviceSeed = {
  deviceCode: string;
  deviceName: string;
  deviceModel: string;
  deviceSerialNumber: string;
  ipAddress: string;
  port: number;
  branchCode: string;
  vendorName: string;
  integrationType: string;
  apiUsername: string;
  apiPassword: string;
  locationDescription: string;
};

const DEVICE_SEEDS: DeviceSeed[] = [
  {
    deviceCode: '255',
    deviceName: 'T&A Access Controller',
    deviceModel: 'DS-K1T201AMF',
    deviceSerialNumber: 'AA4693697',
    ipAddress: '192.168.1.216',
    port: 80,
    branchCode: 'HQ',
    vendorName: 'Hikvision',
    integrationType: 'hikvision',
    apiUsername: 'admin',
    apiPassword: 'Hikvision12',
    locationDescription: 'HQ 8th Floor Main Entrance',
  },
];

export default class AttendanceDevicesSeeder implements Seeder {
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
      const branchRepo = qr.manager.getRepository(Branch);
      const deviceRepo = qr.manager.getRepository(AttendanceDevice);

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

      const branches = await branchRepo.find({
        where: { company_id: company.id },
      });
      const branchMap = new Map(branches.map((b) => [b.code!, b]));

      let createdCount = 0;
      for (const seed of DEVICE_SEEDS) {
        const branch = branchMap.get(seed.branchCode) ?? null;

        let device = await deviceRepo.findOne({
          where: { deviceCode: seed.deviceCode },
        });

        if (!device) {
          device = await deviceRepo.findOne({
            where: LEGACY_DEVICE_CODES.map((deviceCode) => ({ deviceCode })),
          });
        }

        if (!device) {
          device = await deviceRepo.findOne({
            where: { deviceSerialNumber: seed.deviceSerialNumber },
          });
        }

        if (!device) {
          await deviceRepo.save(
            deviceRepo.create({
              deviceCode: seed.deviceCode,
              companyId: company.id,
              branchId: branch?.id ?? null,
              deviceName: seed.deviceName,
              deviceModel: seed.deviceModel,
              deviceSerialNumber: seed.deviceSerialNumber,
              ipAddress: seed.ipAddress,
              port: seed.port,
              protocol: 'http',
              vendorName: seed.vendorName,
              integrationType: seed.integrationType,
              authType: 'basic',
              apiUsername: seed.apiUsername,
              apiPassword: seed.apiPassword,
              syncMode: AttendanceDeviceSyncModeEnum.PULL,
              status: AttendanceDeviceStatusEnum.ACTIVE,
              timezone: 'Africa/Dar_es_Salaam',
              locationDescription: seed.locationDescription,
              metadata: { seeded: true, source: '021-attendance-devices' },
            }),
          );
          createdCount += 1;
        }
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][AttendanceDevices] Created ${createdCount} new device(s) (${DEVICE_SEEDS.length - createdCount} already existed, left unchanged) for company "${company.name}"`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][AttendanceDevices] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
