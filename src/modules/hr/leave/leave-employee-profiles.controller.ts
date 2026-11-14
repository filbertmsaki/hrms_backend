import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveEmployeeProfileService } from './services/leave-employee-profile.service';

class PriorEmploymentPeriodDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) start_date: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) end_date: string;
}

class CreateLeaveEmployeeProfileDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) effective_date: string;
  @IsIn(['mainland', 'zanzibar']) jurisdiction: 'mainland' | 'zanzibar';
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(1)
  fte: number;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) cycle_anchor_date?:
    | string
    | null;
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PriorEmploymentPeriodDto)
  previous_employment_periods: PriorEmploymentPeriodDto[];
  @IsString() @MaxLength(500) reason: string;
}

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/employee-profiles/:employeeId')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveEmployeeProfilesController {
  constructor(private readonly profiles: LeaveEmployeeProfileService) {}

  @Get()
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'Resolve an employee leave profile as of a date' })
  asOf(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('as_of') date: string,
  ) {
    return this.profiles.asOf(
      req.user.companyId!,
      employeeId,
      req.user,
      date ?? '',
    );
  }

  @Post()
  @Permissions('leave-balances.manage')
  @ApiOperation({ summary: 'Record an effective-dated employee leave profile' })
  create(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: CreateLeaveEmployeeProfileDto,
  ) {
    return this.profiles.create(req.user.companyId!, employeeId, req.user, {
      effectiveDate: dto.effective_date,
      jurisdiction: dto.jurisdiction,
      fte: dto.fte,
      cycleAnchorDate: dto.cycle_anchor_date,
      previousEmploymentPeriods: dto.previous_employment_periods,
      reason: dto.reason,
    });
  }
}
