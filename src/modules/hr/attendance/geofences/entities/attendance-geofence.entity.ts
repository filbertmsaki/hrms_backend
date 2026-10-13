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
import { AttendanceGeofenceStatusEnum } from '../enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from '../enums/attendance-geofence-type.enum';
import { Branch } from '../../../branches/entities/branch.entity';

@Entity('attendance_geofences')
@Index('IDX_attendance_geofences_company_id', ['companyId'])
@Index('IDX_attendance_geofences_branch_id', ['branchId'])
@Index('IDX_attendance_geofences_status', ['status'])
@Index('IDX_attendance_geofences_type', ['type'])
@Index('UQ_attendance_geofences_company_name', ['companyId', 'name'], {
  unique: true,
})
export class AttendanceGeofence {
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

  @Column({
    name: 'type',
    type: 'enum',
    enum: AttendanceGeofenceTypeEnum,
    default: AttendanceGeofenceTypeEnum.CIRCLE,
  })
  type: AttendanceGeofenceTypeEnum;

  @Column({ name: 'latitude', type: 'decimal', precision: 10, scale: 7 })
  latitude: string;

  @Column({ name: 'longitude', type: 'decimal', precision: 10, scale: 7 })
  longitude: string;

  @Column({ name: 'radius_meters', type: 'int', default: 100 })
  radiusMeters: number;

  @Column({ name: 'allowed_accuracy_meters', type: 'int', default: 50 })
  allowedAccuracyMeters: number;

  @Column({ name: 'strict_accuracy', type: 'boolean', default: false })
  strictAccuracy: boolean;

  /**
   * Polygon coordinates used for mobile point-in-polygon validation.
   * Example:
   * [
   *   { "latitude": -6.7924, "longitude": 39.2083 },
   *   { "latitude": -6.7926, "longitude": 39.2088 }
   * ]
   */
  @Column({ name: 'polygon_coordinates', type: 'json', nullable: true })
  polygonCoordinates: Array<{
    latitude: number;
    longitude: number;
  }> | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: AttendanceGeofenceStatusEnum,
    default: AttendanceGeofenceStatusEnum.ACTIVE,
  })
  status: AttendanceGeofenceStatusEnum;

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
