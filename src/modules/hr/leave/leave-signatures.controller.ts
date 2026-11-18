import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, ValidateNested } from 'class-validator';
import { LeaveSignatureMarkDto } from './dtos/leave-signature-mark.dto';
import type { Request as ExpressRequest } from 'express';
import { DataSource } from 'typeorm';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import type { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import { HrAccessService } from '../shared/hr-access.service';
import { LeaveSignatureService } from './services/leave-signature.service';

class SignLeaveDto {
  /** Must be true: the signer explicitly confirms the signing action. */
  @IsBoolean() confirm: boolean;

  /** Typed name or drawn image shown on the leave form. */
  @IsOptional()
  @ValidateNested()
  @Type(() => LeaveSignatureMarkDto)
  signature?: LeaveSignatureMarkDto;
}

type Req = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Leave signatures')
@Controller('leave/requests/:id')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class LeaveSignaturesController {
  constructor(
    private readonly signatures: LeaveSignatureService,
    private readonly dataSource: DataSource,
    private readonly hrAccess: HrAccessService,
  ) {}

  private context(req: Req) {
    return {
      ip: req.ip ?? null,
      userAgent: String(req.headers['user-agent'] ?? '') || null,
    };
  }

  @Get('signatures')
  @Permissions('leave_requests:read')
  @ApiOperation({
    summary: 'Signatures on a leave application with their current validity',
  })
  async list(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    const [request] = await this.dataSource.query<
      Array<{ employee_id: number }>
    >(`SELECT employee_id FROM leave_requests WHERE id=$1 AND company_id=$2`, [
      id,
      req.user.companyId,
    ]);
    if (!request) throw new NotFoundException('Leave request not found');
    if (req.user.employeeId !== request.employee_id) {
      const employee = await this.dataSource.getRepository(Employee).findOne({
        where: { id: request.employee_id, company_id: req.user.companyId! },
        relations: {
          department_assignments: true,
          primary_department: true,
          primary_position: true,
        },
      });
      await this.hrAccess.assertCanAccessEmployee(req.user, employee!);
    }
    return this.signatures.list(req.user.companyId!, id);
  }

  /** The applicant signs; ownership is checked in the service. */
  @Post('sign')
  @Permissions('leave_requests:read')
  @ApiOperation({
    summary: 'Employee electronically signs their own leave application',
  })
  sign(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignLeaveDto,
  ) {
    return this.signatures.signAsEmployee(
      req.user.companyId!,
      id,
      req.user,
      dto.confirm,
      this.context(req),
      dto.signature,
    );
  }

  /** The officer assigned to the stage signs the decision they recorded. */
  @Post('approvals/:approvalId/sign')
  @Permissions('leave_requests:approve')
  @ApiOperation({
    summary: 'Approver electronically signs their recorded decision',
  })
  signApproval(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Param('approvalId', ParseIntPipe) approvalId: number,
    @Body() dto: SignLeaveDto,
  ) {
    return this.signatures.signApproval(
      req.user.companyId!,
      id,
      approvalId,
      req.user,
      dto.confirm,
      this.context(req),
      dto.signature,
    );
  }
}

/**
 * Self-service signing for the applicant (employees have no
 * leave_requests:read). Only the employee's own applications are visible.
 */
@ApiTags('Leave signatures')
@Controller('me/leave/requests/:id')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class MyLeaveSignaturesController {
  constructor(
    private readonly signatures: LeaveSignatureService,
    private readonly dataSource: DataSource,
  ) {}

  private async assertOwn(req: Req, id: number) {
    const [request] = await this.dataSource.query<
      Array<{ employee_id: number }>
    >(`SELECT employee_id FROM leave_requests WHERE id=$1 AND company_id=$2`, [
      id,
      req.user.companyId,
    ]);
    if (
      !request ||
      !req.user.employeeId ||
      request.employee_id !== req.user.employeeId
    )
      throw new NotFoundException('Leave request not found');
  }

  @Get('signatures')
  @ApiOperation({ summary: 'Signatures on my leave application' })
  async list(@Req() req: Req, @Param('id', ParseIntPipe) id: number) {
    await this.assertOwn(req, id);
    return this.signatures.list(req.user.companyId!, id);
  }

  @Post('sign')
  @ApiOperation({ summary: 'Electronically sign my own leave application' })
  async sign(
    @Req() req: Req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignLeaveDto,
  ) {
    await this.assertOwn(req, id);
    return this.signatures.signAsEmployee(
      req.user.companyId!,
      id,
      req.user,
      dto.confirm,
      {
        ip: req.ip ?? null,
        userAgent: String(req.headers['user-agent'] ?? '') || null,
      },
      dto.signature,
    );
  }
}
