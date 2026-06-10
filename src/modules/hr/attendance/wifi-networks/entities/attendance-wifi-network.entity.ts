import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../../../companies/entities/company.entity';
import { AttendanceWifiNetworkStatusEnum } from '../enums/attendance-wifi-network-status.enum';
import { AttendanceWifiSecurityTypeEnum } from '../enums/attendance-wifi-security-type.enum';
import { Branch } from 'src/modules/hr/branches/entities/branch.entity';

@Entity('attendance_wifi_networks')
@Index('IDX_attendance_wifi_networks_company_id', ['companyId'])
@Index('IDX_attendance_wifi_networks_branch_id', ['branchId'])
@Index('IDX_attendance_wifi_networks_ssid', ['ssid'])
@Index('IDX_attendance_wifi_networks_bssid', ['bssid'])
@Index('IDX_attendance_wifi_networks_status', ['status'])
@Index('UQ_attendance_wifi_networks_company_ssid_bssid', [
  'companyId',
  'ssid',
  'bssid',
], {
  unique: true,
})
export class AttendanceWifiNetwork {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'company_id', type: 'int' })
  companyId: number;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branchId: number | null;

  @Column({ name: 'name', type: 'varchar', length: 150 })
  name: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description: string | null;

  /**
   * WiFi name shown to users.
   * Example: Alliance-Staff
   */
  @Column({ name: 'ssid', type: 'varchar', length: 255 })
  ssid: string;

  /**
   * BSSID is the Access Point MAC address.
   * Example: AA:BB:CC:DD:EE:FF
   *
   * Recommended when you have multiple floors/APs.
   */
  @Column({ name: 'bssid', type: 'varchar', length: 100, nullable: true })
  bssid: string | null;

  /**
   * Supports multiple office LAN/VLAN ranges.
   * Example:
   * [
   *   "192.168.80.0/24",
   *   "192.168.81.0/24",
   *   "10.10.7.0/24"
   * ]
   */
  @Column({ name: 'allowed_ip_cidrs', type: 'json', nullable: true })
  allowedIpCidrs: string[] | null;

  @Column({
    name: 'security_type',
    type: 'enum',
    enum: AttendanceWifiSecurityTypeEnum,
    default: AttendanceWifiSecurityTypeEnum.UNKNOWN,
  })
  securityType: AttendanceWifiSecurityTypeEnum;

  /**
   * If true, employee must be connected to this exact SSID.
   */
  @Column({ name: 'require_ssid_match', type: 'boolean', default: true })
  requireSsidMatch: boolean;

  /**
   * If true, employee must be connected to the exact AP MAC/BSSID.
   */
  @Column({ name: 'require_bssid_match', type: 'boolean', default: false })
  requireBssidMatch: boolean;

  /**
   * If true, request IP must be inside allowed_ip_cidrs.
   */
  @Column({ name: 'require_ip_match', type: 'boolean', default: false })
  requireIpMatch: boolean;

  /**
   * If true, mobile attendance can use this WiFi network.
   */
  @Column({ name: 'allow_mobile_attendance', type: 'boolean', default: true })
  allowMobileAttendance: boolean;

  /**
   * Extra data for router/AP/controller reference.
   * Example:
   * {
   *   "floor": "Floor 7",
   *   "apName": "AP-F7-Reception",
   *   "vlanId": 80
   * }
   */
  @Column({ name: 'metadata', type: 'json', nullable: true })
  metadata: Record<string, any> | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceWifiNetworkStatusEnum,
    default: AttendanceWifiNetworkStatusEnum.ACTIVE,
  })
  status: AttendanceWifiNetworkStatusEnum;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Company, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @ManyToOne(() => Branch, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch | null;
}