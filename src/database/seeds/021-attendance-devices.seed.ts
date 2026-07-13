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
    deviceCode: 'ALLIANCE-HQ-MAIN',
    deviceName: 'Main Entrance Attendance Device',
    deviceModel: 'DS-K1T201AMF',
    deviceSerialNumber: 'AA4693697',
    ipAddress: '192.168.1.216',
    port: 80,
    branchCode: 'HQ',
    vendorName: 'Hikvision',
    integrationType: 'hikvision',
    apiUsername: 'admin',
    apiPassword: 'Hikvision12',
    locationDescription: 'HQ Main Entrance',
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

      for (const seed of DEVICE_SEEDS) {
        const branch = branchMap.get(seed.branchCode) ?? null;

        let device = await deviceRepo.findOne({
          where: { deviceCode: seed.deviceCode },
        });

        if (!device) {
          device = deviceRepo.create({ deviceCode: seed.deviceCode });
        }

        device.companyId = company.id;
        device.branchId = branch?.id ?? null;
        device.deviceName = seed.deviceName;
        device.deviceModel = seed.deviceModel;
        device.deviceSerialNumber = seed.deviceSerialNumber;
        device.ipAddress = seed.ipAddress;
        device.port = seed.port;
        device.protocol = 'http';
        device.vendorName = seed.vendorName;
        device.integrationType = seed.integrationType;
        device.authType = 'basic';
        device.apiUsername = seed.apiUsername;
        device.apiPassword = seed.apiPassword;
        device.syncMode = AttendanceDeviceSyncModeEnum.PULL;
        device.status = AttendanceDeviceStatusEnum.ACTIVE;
        device.timezone = 'Africa/Dar_es_Salaam';
        device.locationDescription = seed.locationDescription;
        device.metadata = { seeded: true, source: '021-attendance-devices' };

        await deviceRepo.save(device);
      }

      await qr.commitTransaction();
      console.log(
        `[Seeder][AttendanceDevices] Upserted ${DEVICE_SEEDS.length} device(s) for company "${company.name}"`,
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
