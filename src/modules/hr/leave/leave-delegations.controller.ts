import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { PermissionsAny } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveDelegationService } from './services/leave-delegation.service';

export class CreateLeaveDelegationDto {
  @ApiPropertyOptional({
    description: 'HR only: delegate on behalf of someone',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  delegator_company_user_id?: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  delegate_company_user_id: number;

  @ApiProperty({ example: '2026-12-01' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string | null;
}

/** Leave approvers can delegate while away; HR can manage anyone's. */
@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/delegations')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
@PermissionsAny(
  'leave_requests:approve',
  'self_service_requests:manager_review',
  'leave_workflows:update',
)
export class LeaveDelegationsController {
  constructor(private readonly delegations: LeaveDelegationService) {}

  @Get()
  @ApiOperation({ summary: 'My delegations, or all with ?all=true (HR)' })
  list(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query('all') all?: string,
  ) {
    return this.delegations.list(req.user.companyId!, req.user, all === 'true');
  }

  @Post()
  @ApiOperation({ summary: 'Delegate leave approvals for a date range' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateLeaveDelegationDto,
  ) {
    return this.delegations.create(req.user.companyId!, req.user, {
      ...dto,
      start_date: dto.start_date.slice(0, 10),
      end_date: dto.end_date.slice(0, 10),
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel a delegation' })
  cancel(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.delegations.cancel(req.user.companyId!, id, req.user);
  }
}
