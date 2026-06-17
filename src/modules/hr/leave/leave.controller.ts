import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { AddLeaveDocumentDto } from './dtos/add-leave-document.dto';
import { AdjustLeaveBalanceDto } from './dtos/adjust-leave-balance.dto';
import { CancelLeaveRequestDto } from './dtos/cancel-leave-request.dto';
import { CreateHolidayDto } from './dtos/create-holiday.dto';
import { CreateLeavePolicyDto } from './dtos/create-leave-policy.dto';
import { CreateLeaveRequestDto } from './dtos/create-leave-request.dto';
import { CreateLeaveTypeDto } from './dtos/create-leave-type.dto';
import { CreateLeaveWorkflowDto } from './dtos/create-leave-workflow.dto';
import { CreateLeaveWorkflowStepDto } from './dtos/create-leave-workflow-step.dto';
import { HolidayQueryDto } from './dtos/holiday-query.dto';
import { LeaveApprovalActionDto } from './dtos/leave-approval-action.dto';
import { LeaveBalanceQueryDto } from './dtos/leave-balance-query.dto';
import { LeavePolicyQueryDto } from './dtos/leave-policy-query.dto';
import { LeaveRequestQueryDto } from './dtos/leave-request-query.dto';
import { LeaveTypeQueryDto } from './dtos/leave-type-query.dto';
import { LeaveWorkflowQueryDto } from './dtos/leave-workflow-query.dto';
import { UpdateHolidayDto } from './dtos/update-holiday.dto';
import { UpdateLeavePolicyDto } from './dtos/update-leave-policy.dto';
import { UpdateLeaveTypeDto } from './dtos/update-leave-type.dto';
import { UpdateLeaveWorkflowDto } from './dtos/update-leave-workflow.dto';
import { UpdateLeaveWorkflowStepDto } from './dtos/update-leave-workflow-step.dto';
import { UpsertLeaveMedicalDetailDto } from './dtos/upsert-leave-medical-detail.dto';
import { LeaveService } from './leave.service';

@ApiTags('Leave')
@ApiBearerAuth('access-token')
@Controller('leave')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Post('types')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_types:create')
  @ApiOperation({ summary: 'Create leave type' })
  createLeaveType(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.leaveService.createLeaveType(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get('types')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_types:read')
  @ApiOperation({ summary: 'List leave types' })
  listLeaveTypes(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveTypeQueryDto,
  ) {
    return this.leaveService.findAllLeaveTypes(req.user.companyId!, query);
  }

  @Get('types/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_types:read')
  @ApiOperation({ summary: 'Get leave type by id' })
  getLeaveType(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.findOneLeaveType(req.user.companyId!, id);
  }

  @Patch('types/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_types:update')
  @ApiOperation({ summary: 'Update leave type' })
  updateLeaveType(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveService.updateLeaveType(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Delete('types/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_types:delete')
  @ApiOperation({ summary: 'Delete leave type' })
  removeLeaveType(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.removeLeaveType(req.user.companyId!, id, req.user);
  }

  @Post('policies')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_policies:create')
  @ApiOperation({ summary: 'Create leave policy and quota assignments' })
  createLeavePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateLeavePolicyDto,
  ) {
    return this.leaveService.createLeavePolicy(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get('policies')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_policies:read')
  @ApiOperation({ summary: 'List leave policies' })
  listLeavePolicies(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeavePolicyQueryDto,
  ) {
    return this.leaveService.findAllLeavePolicies(req.user.companyId!, query);
  }

  @Get('policies/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_policies:read')
  @ApiOperation({ summary: 'Get leave policy by id' })
  getLeavePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.findOneLeavePolicy(req.user.companyId!, id);
  }

  @Patch('policies/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_policies:update')
  @ApiOperation({ summary: 'Update leave policy' })
  updateLeavePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeavePolicyDto,
  ) {
    return this.leaveService.updateLeavePolicy(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Delete('policies/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_policies:delete')
  @ApiOperation({ summary: 'Delete leave policy' })
  removeLeavePolicy(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.removeLeavePolicy(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:create')
  @ApiOperation({ summary: 'Create leave approval workflow' })
  createLeaveWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateLeaveWorkflowDto,
  ) {
    return this.leaveService.createLeaveWorkflow(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get('workflows')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:read')
  @ApiOperation({ summary: 'List leave workflows' })
  listLeaveWorkflows(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveWorkflowQueryDto,
  ) {
    return this.leaveService.findAllLeaveWorkflows(req.user.companyId!, query);
  }

  @Get('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:read')
  @ApiOperation({ summary: 'Get leave workflow by id' })
  getLeaveWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.findOneLeaveWorkflow(req.user.companyId!, id);
  }

  @Patch('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:update')
  @ApiOperation({ summary: 'Update leave workflow' })
  updateLeaveWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveWorkflowDto,
  ) {
    return this.leaveService.updateLeaveWorkflow(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Delete('workflows/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:delete')
  @ApiOperation({ summary: 'Delete leave workflow' })
  removeLeaveWorkflow(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.removeLeaveWorkflow(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('workflows/:workflowId/steps')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:create')
  @ApiOperation({ summary: 'Create leave workflow step' })
  createLeaveWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Body() dto: CreateLeaveWorkflowStepDto,
  ) {
    return this.leaveService.createLeaveWorkflowStep(
      req.user.companyId!,
      workflowId,
      dto,
      req.user,
    );
  }

  @Get('workflows/:workflowId/steps')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:read')
  @ApiOperation({ summary: 'List leave workflow steps' })
  listLeaveWorkflowSteps(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('workflowId', ParseIntPipe) workflowId: number,
  ) {
    return this.leaveService.findAllLeaveWorkflowSteps(
      req.user.companyId!,
      workflowId,
    );
  }

  @Get('workflows/:workflowId/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:read')
  @ApiOperation({ summary: 'Get leave workflow step by id' })
  getLeaveWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.leaveService.findOneLeaveWorkflowStep(
      req.user.companyId!,
      workflowId,
      stepId,
    );
  }

  @Patch('workflows/:workflowId/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:update')
  @ApiOperation({ summary: 'Update leave workflow step' })
  updateLeaveWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
    @Body() dto: UpdateLeaveWorkflowStepDto,
  ) {
    return this.leaveService.updateLeaveWorkflowStep(
      req.user.companyId!,
      workflowId,
      stepId,
      dto,
      req.user,
    );
  }

  @Delete('workflows/:workflowId/steps/:stepId')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_workflows:delete')
  @ApiOperation({ summary: 'Delete leave workflow step' })
  removeLeaveWorkflowStep(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('workflowId', ParseIntPipe) workflowId: number,
    @Param('stepId', ParseIntPipe) stepId: number,
  ) {
    return this.leaveService.removeLeaveWorkflowStep(
      req.user.companyId!,
      workflowId,
      stepId,
      req.user,
    );
  }

  @Post('holidays')
  @UseGuards(PermissionsGuard)
  @Permissions('holidays:create')
  @ApiOperation({ summary: 'Create holiday' })
  createHoliday(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateHolidayDto,
  ) {
    return this.leaveService.createHoliday(req.user.companyId!, dto, req.user);
  }

  @Get('holidays')
  @UseGuards(PermissionsGuard)
  @Permissions('holidays:read')
  @ApiOperation({ summary: 'List company holidays' })
  listHolidays(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: HolidayQueryDto,
  ) {
    return this.leaveService.findAllHolidays(req.user.companyId!, query);
  }

  @Patch('holidays/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('holidays:update')
  @ApiOperation({ summary: 'Update holiday' })
  updateHoliday(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateHolidayDto,
  ) {
    return this.leaveService.updateHoliday(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Delete('holidays/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('holidays:delete')
  @ApiOperation({ summary: 'Delete holiday' })
  removeHoliday(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.removeHoliday(req.user.companyId!, id, req.user);
  }

  @Get('balances')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_balances:read')
  @ApiOperation({ summary: 'List leave balances' })
  listLeaveBalances(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveBalanceQueryDto,
  ) {
    return this.leaveService.findAllLeaveBalances(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Patch('balances/adjust')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_balances:adjust')
  @ApiOperation({ summary: 'Adjust leave balance manually' })
  adjustLeaveBalance(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: AdjustLeaveBalanceDto,
  ) {
    return this.leaveService.adjustLeaveBalance(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Post('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:create')
  @ApiOperation({ summary: 'Create leave request (draft or submitted)' })
  createLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateLeaveRequestDto,
  ) {
    return this.leaveService.createLeaveRequest(
      req.user.companyId!,
      dto,
      req.user,
    );
  }

  @Get('requests')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:read')
  @ApiOperation({ summary: 'List leave requests' })
  listLeaveRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.findAllLeaveRequests(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get('requests/me')
  @ApiOperation({ summary: 'List my leave requests' })
  listMyLeaveRequests(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: LeaveRequestQueryDto,
  ) {
    return this.leaveService.findMyLeaveRequests(
      req.user.companyId!,
      query,
      req.user,
    );
  }

  @Get('requests/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:read')
  @ApiOperation({ summary: 'Get leave request by id' })
  getLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.findOneLeaveRequest(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/submit')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:update')
  @ApiOperation({ summary: 'Submit a draft leave request' })
  submitLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.leaveService.submitLeaveRequest(
      req.user.companyId!,
      id,
      req.user,
    );
  }

  @Post('requests/:id/approval-action')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:approve')
  @ApiOperation({ summary: 'Approve or reject leave request at current level' })
  approvalAction(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LeaveApprovalActionDto,
  ) {
    return this.leaveService.approveLeaveRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:cancel')
  @ApiOperation({ summary: 'Cancel leave request' })
  cancelLeaveRequest(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelLeaveRequestDto,
  ) {
    return this.leaveService.cancelLeaveRequest(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Post('requests/:id/documents')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:update')
  @ApiOperation({ summary: 'Attach supporting document to leave request' })
  addLeaveDocument(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddLeaveDocumentDto,
  ) {
    return this.leaveService.addLeaveDocument(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Patch('requests/:id/medical-detail')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:update')
  @ApiOperation({ summary: 'Create or update medical leave detail' })
  upsertMedicalDetail(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpsertLeaveMedicalDetailDto,
  ) {
    return this.leaveService.upsertMedicalDetail(
      req.user.companyId!,
      id,
      dto,
      req.user,
    );
  }

  @Get('requests/:id/pdf')
  @UseGuards(PermissionsGuard)
  @Permissions('leave_requests:read')
  @ApiOperation({ summary: 'Generate leave request PDF form' })
  async getLeaveRequestPdf(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ): Promise<void> {
    const buffer = await this.leaveService.getLeaveRequestPdf(
      req.user.companyId!,
      id,
      req.user,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename=leave-request-${id}.pdf`,
    );
    res.send(buffer);
  }
}
