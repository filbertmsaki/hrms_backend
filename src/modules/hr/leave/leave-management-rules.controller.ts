import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  CreateLeaveManagementApprovalRuleDto,
  UpdateLeaveManagementApprovalRuleDto,
} from './dtos/leave-management-approval-rule.dto';
import { LeaveManagementRuleService } from './services/leave-management-rule.service';

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave/management-approval-rules')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveManagementRulesController {
  constructor(private readonly rules: LeaveManagementRuleService) {}

  @Get()
  @Permissions('leave_workflows:read')
  @ApiOperation({ summary: 'List conditional management approval rules' })
  list(@Req() req: ExpressRequest & { user: AuthenticatedUser }) {
    return this.rules.list(req.user.companyId!);
  }

  @Post()
  @Permissions('leave_workflows:create')
  @ApiOperation({ summary: 'Create a management approval rule' })
  create(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateLeaveManagementApprovalRuleDto,
  ) {
    return this.rules.create(req.user.companyId!, dto, req.user);
  }

  @Patch(':id')
  @Permissions('leave_workflows:update')
  @ApiOperation({ summary: 'Update a management approval rule' })
  update(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveManagementApprovalRuleDto,
  ) {
    return this.rules.update(req.user.companyId!, id, dto, req.user);
  }

  @Delete(':id')
  @Permissions('leave_workflows:update')
  @ApiOperation({ summary: 'Deactivate a management approval rule' })
  deactivate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rules.deactivate(req.user.companyId!, id, req.user);
  }
}
