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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest } from 'express';
import { Permissions } from '../../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { ApiActionOperation, ApiGetOneOperation, ApiListOperation } from '../../../../docs/swagger-decorators';
import { QueryBiometricCaptureSessionDto } from '../dto/query-biometric-capture-session.dto';
import { SaveCapturedFingerprintDto } from '../dto/save-captured-fingerprint.dto';
import { StartFingerprintCaptureDto } from '../dto/start-fingerprint-capture.dto';
import { SyncFingerprintDto } from '../dto/sync-fingerprint.dto';
import { EmployeeBiometricCaptureSessionService } from '../service/employee-biometric-capture-session.service';

@ApiTags('Access Control Biometric Sessions')
@ApiBearerAuth('access-token')
@Controller('access-control')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeBiometricCaptureSessionsController {
  constructor(private readonly sessionService: EmployeeBiometricCaptureSessionService) {}

  @Post('employees/:employeeId/biometric-sessions/fingerprint/start')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Start Fingerprint Session', 'Start capture and setup fingerprint for one employee')
  startFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: StartFingerprintCaptureDto,
  ) {
    return this.sessionService.startFingerprintCapture(req.user.companyId!, employeeId, dto, {
      performedByCompanyUserId: req.user.companyMembershipId,
      performedByUserId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('employees/:employeeId/fingerprints/capture')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Capture Fingerprint', 'Capture fingerprint from device and save it in backend')
  captureFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: StartFingerprintCaptureDto,
  ) {
    return this.sessionService.captureFingerprintOnly(req.user.companyId!, employeeId, dto, {
      performedByCompanyUserId: req.user.companyMembershipId,
      performedByUserId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('employees/:employeeId/fingerprints')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Save Fingerprint', 'Save an already captured fingerprint payload in backend')
  saveFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body() dto: SaveCapturedFingerprintDto,
  ) {
    return this.sessionService.saveCapturedFingerprint(req.user.companyId!, employeeId, dto, {
      performedByCompanyUserId: req.user.companyMembershipId,
      performedByUserId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Post('employees/:employeeId/fingerprints/:fingerprintId/sync')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Sync Fingerprint', 'Upload an already saved fingerprint to Hikvision device')
  syncFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('fingerprintId') fingerprintId: string,
    @Body() dto: SyncFingerprintDto,
  ) {
    return this.sessionService.syncFingerprintToDevice(req.user.companyId!, employeeId, fingerprintId, dto, {
      performedByCompanyUserId: req.user.companyMembershipId,
      performedByUserId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('employees/:employeeId/fingerprints')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation('Employee Fingerprints', 'List saved fingerprints for one employee')
  getEmployeeFingerprints(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query('deviceId') deviceId?: string,
  ) {
    return this.sessionService.findEmployeeFingerprints(
      req.user.companyId!,
      employeeId,
      deviceId ? Number(deviceId) : undefined,
    );
  }

  @Delete('employees/:employeeId/fingerprints/:fingerprintId')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Delete Fingerprint', 'Delete fingerprint from backend and device when supported')
  deleteFingerprint(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Param('fingerprintId') fingerprintId: string,
    @Query('deviceId') deviceId: string,
    @Query('deleteFromDevice') deleteFromDevice?: string,
  ) {
    return this.sessionService.deleteFingerprint(
      req.user.companyId!,
      employeeId,
      fingerprintId,
      Number(deviceId),
      deleteFromDevice !== 'false',
      {
        performedByCompanyUserId: req.user.companyMembershipId,
        performedByUserId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );
  }

  @Get('biometric-sessions')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiListOperation('Biometric Sessions', 'List biometric capture sessions')
  findAll(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: QueryBiometricCaptureSessionDto,
  ) {
    return this.sessionService.findAll(req.user.companyId!, query);
  }

  @Get('biometric-sessions/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiGetOneOperation('Biometric Session', 'Get one biometric capture session')
  findOne(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sessionService.findOne(req.user.companyId!, id);
  }

  @Patch('biometric-sessions/:id/cancel')
  @UseGuards(PermissionsGuard)
  @Permissions('access_control_sync:execute')
  @ApiActionOperation('Cancel Biometric Session', 'Cancel a biometric capture session')
  cancel(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.sessionService.cancel(req.user.companyId!, id);
  }
}
