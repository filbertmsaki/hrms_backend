import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../roles/entities/role.entity';
import { User } from '../../users/entities/user.entity';
import { PermissionScope } from '../enums/permission-scope.enum';

@Entity('permissions')
@Index('UQ_permission_name', ['name'], { unique: true })
export class Permission {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 100 })
  name: string;

  @Column({ length: 100 })
  display_name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @ApiProperty({
    description:
      'Scope that controls whether this permission is platform-only, company-only, or reusable in both contexts',
    enum: PermissionScope,
    default: PermissionScope.COMPANY,
  })
  @Column({
    type: 'varchar',
    length: 20,
    default: PermissionScope.COMPANY,
  })
  scope: PermissionScope;

  @ApiProperty({
    description:
      'Whether this permission is system-generated and protected from non-owner mutations',
    default: false,
  })
  @Column({ default: false })
  is_system_generated: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];

  @ManyToMany(() => User, (user) => user.permissions)
  users: User[];
}
