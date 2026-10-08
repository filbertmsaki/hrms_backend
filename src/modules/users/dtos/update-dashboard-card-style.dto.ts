import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateDashboardCardStyleDto {
  @ApiProperty({
    enum: [
      'alliance-navy',
      'alliance-royal',
      'alliance-red',
      'alliance-gold',
      'alliance-cloud',
      'alliance-blue',
      'tomato',
      'ocean',
      'forest',
      'plum',
      'coral',
      'midnight',
      'berry',
      'neutral',
      'white',
    ],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn([
    'alliance-navy',
    'alliance-royal',
    'alliance-red',
    'alliance-gold',
    'alliance-cloud',
    'alliance-blue',
    'tomato',
    'ocean',
    'forest',
    'plum',
    'coral',
    'midnight',
    'berry',
    'neutral',
    'white',
  ])
  palette: string;

  @ApiProperty({
    enum: ['none', 'orbit', 'waves', 'confetti', 'arches', 'sprigs'],
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['none', 'orbit', 'waves', 'confetti', 'arches', 'sprigs'])
  artwork: string;
}
