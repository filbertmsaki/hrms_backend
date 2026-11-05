import {
  Body,
  Controller,
  Get,
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
  ApiTags,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, Min } from 'class-validator';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LeaveExitSettlementService } from './services/leave-exit-settlement.service';

export class RunLeaveExitSettlementDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  employee_id: number;

  @ApiProperty({ example: '2026-12-31' })
  @IsDateString()
  exit_date: string;
}

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/exit-settlements')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveExitSettlementsController {
  constructor(private readonly settlements: LeaveExitSettlementService) {}

  @Get()
  @Permissions('leave-balances.view')
  @ApiOperation({ summary: 'Leave settlements calculated at employee exit' })
  list(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query('employee_id') employeeId?: string,
  ) {
    return this.settlements.list(
      req.user.companyId!,
      employeeId && /^\d+$/.test(employeeId) ? Number(employeeId) : undefined,
    );
  }

  @Post('run')
  @Permissions('leave-balances.manage')
  @ApiOperation({
    summary:
      'Calculate (or recalculate) leave settlement for an exiting employee',
  })
  run(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: RunLeaveExitSettlementDto,
  ) {
    return this.settlements.settle(
      req.user.companyId!,
      dto.employee_id,
      dto.exit_date.slice(0, 10),
      req.user,
    );
  }
}
