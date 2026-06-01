import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { Company } from '../../modules/companies/entities/company.entity';
import { Branch } from '../../modules/hr/branches/entities/branch.entity';
import { AttendanceDevice } from '../../modules/hr/attendance/devices/entities/attendance-device.entity';
import { AttendanceDeviceStatusEnum } from '../../modules/hr/attendance/devices/enums/attendance-device-status.enum';
import { AttendanceDeviceSyncModeEnum } from '../../modules/hr/attendance/devices/enums/attendance-device-sync-mode.enum';

export default class HikvisionDeviceSeeder implements Seeder {
  public async run(dataSource: DataSource, factoryManager: SeederFactoryManager): Promise<void> {
    void factoryManager;

    const manager = dataSource.manager;
    const companyRepository = manager.getRepository(Company);
    const branchRepository = manager.getRepository(Branch);
    const deviceRepository = manager.getRepository(AttendanceDevice);

    const company = await companyRepository.findOne({
      where: { status: 'active' },
      order: { id: 'ASC' },
    });

    if (!company) {
      console.warn('Skip HikvisionDeviceSeeder: no active company found');
      return;
    }

    const branch = await branchRepository.findOne({
      where: { company_id: company.id, status: 'active' },
      order: { id: 'ASC' },
    });

    const existing = await deviceRepository.findOne({
      where: {
        companyId: company.id,
        ipAddress: '192.168.1.216',
        port: 80,
      },
    });

    const device = existing ?? deviceRepository.create({ companyId: company.id });
    device.branchId = branch?.id ?? null;
    device.deviceName = 'Main Hikvision Device';
    device.deviceCode = device.deviceCode || `HIK-${company.id}-MAIN`;
    device.deviceSerialNumber = device.deviceSerialNumber || 'AA4693697';
    device.deviceModel = 'DS-K1T201AMF';
    device.ipAddress = '192.168.1.216';
    device.port = 80;
    device.apiUsername = 'admin';
    device.apiPassword = 'Hikvision12';
    device.protocol = 'ISAPI';
    device.vendorName = 'Hikvision';
    device.integrationType = 'hikvision';
    device.authType = 'digest';
    device.syncMode = AttendanceDeviceSyncModeEnum.PULL;
    device.status = AttendanceDeviceStatusEnum.ACTIVE;
    device.timezone = device.timezone || 'Africa/Dar_es_Salaam';
    device.firmwareVersion = 'V1.3.41';
    device.macAddress = 'BC:5E:33:54:C0:A2';
    device.deviceType = 'ACS';
    device.isActive = true;

    await deviceRepository.save(device);
    console.log(
      `Hikvision seed ready for company ${company.id}: ${device.deviceName} (${device.ipAddress})`,
    );
  }
}
