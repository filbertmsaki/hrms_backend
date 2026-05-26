import { ApiProperty } from '@nestjs/swagger';
import { AccessDoorSyncStatusEnum } from '../enum/access-door-sync-status.enum';

export class AccessDoorResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  company_id: number;

  @ApiProperty({ nullable: true })
  branch_id: number | null;

  @ApiProperty()
  device_id: number;

  @ApiProperty()
  door_no: number;

  @ApiProperty()
  door_name: string;

  @ApiProperty({ nullable: true })
  magnetic_type: string | null;

  @ApiProperty({ nullable: true })
  open_button_type: string | null;

  @ApiProperty({ nullable: true })
  open_duration: number | null;

  @ApiProperty({ nullable: true })
  disabled_open_duration: number | null;

  @ApiProperty({ nullable: true })
  magnetic_alarm_timeout: number | null;

  @ApiProperty({ nullable: true })
  enable_leader_card: boolean | null;

  @ApiProperty({ nullable: true })
  leader_card_mode: string | null;

  @ApiProperty({ nullable: true })
  leader_card_open_duration: number | null;

  @ApiProperty({ nullable: true })
  remote_control_pw_status: boolean | null;

  @ApiProperty({ enum: AccessDoorSyncStatusEnum })
  sync_status: AccessDoorSyncStatusEnum;

  @ApiProperty({ nullable: true })
  last_synced_at: Date | null;

  @ApiProperty({ nullable: true })
  metadata: Record<string, unknown> | null;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;

  @ApiProperty({ nullable: true })
  deleted_at: Date | null;
}
