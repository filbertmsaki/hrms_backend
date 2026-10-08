import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { Base64FileDto } from '../../../../files/dtos/base64-file.dto';

export class AttendanceMobilePunchSelfieDto extends Base64FileDto {
  @ApiProperty({ maximum: 65536 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65536)
  declare fileSize: number;

  @ApiProperty({ maxLength: 87384 })
  @IsString()
  @MaxLength(87384)
  @Matches(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
  declare fileString: string;
}
