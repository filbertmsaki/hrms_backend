import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { AcsEventCondDto } from './acs-event-cond.dto';

export class PullAttendancePageDto {
  @ApiProperty({
    type: AcsEventCondDto,
    example: {
      searchID: '1',
      searchResultPosition: 0,
      maxResults: 10,
      major: 5,
      eventAttribute: 'attendance',
      startTime: '2026-05-29T00:00:00+03:00',
      endTime: '2026-05-29T23:59:59+03:00',
    },
  })
  @ValidateNested()
  @Type(() => AcsEventCondDto)
  AcsEventCond: AcsEventCondDto;
}
