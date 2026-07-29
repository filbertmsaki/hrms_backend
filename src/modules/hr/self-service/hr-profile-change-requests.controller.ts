import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request as ExpressRequest, Response } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ApproveProfileChangeRequestDto } from './dtos/approve-profile-change-request.dto';
import { ProfileChangeRequestQueryDto } from './dtos/profile-change-request-query.dto';
import { RejectProfileChangeRequestDto } from './dtos/reject-profile-change-request.dto';
import { RequestProfileChangeCorrectionDto } from './dtos/request-profile-change-correction.dto';
import { StartProfileChangeReviewDto } from './dtos/start-profile-change-review.dto';
import { ProfileChangeRequestsService } from './profile-change-requests.service';

@ApiTags('HR Profile Change Requests')
@ApiBearerAuth('access-token')
@Controller('hr/profile-change-requests')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class HrProfileChangeRequestsController {
  constructor(
    private readonly profileChangeRequestsService: ProfileChangeRequestsService,
  ) {}

  @Get()
  @Permissions('profile_change_request.view_all')
  @ApiOperation({ summary: 'List profile change requests for HR review' })
  listForReview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ProfileChangeRequestQueryDto,
  ) {
    return this.profileChangeRequestsService.listForReview(req.user, query);
  }

  @Get(':id')
  @Permissions('profile_change_request.view_all')
  @ApiOperation({ summary: 'Get one profile change request for HR review' })
  getForReview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.getForReview(req.user, id);
  }

  @Post(':id/start-review')
  @Permissions('profile_change_request.review')
  @ApiOperation({ summary: 'Start reviewing a profile change request' })
  startReview(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: StartProfileChangeReviewDto,
  ) {
    return this.profileChangeRequestsService.startReview(
      req.user,
      id,
      dto,
      this.buildContext(req),
    );
  }

  @Post(':id/approve')
  @Permissions('profile_change_request.approve')
  @ApiOperation({ summary: 'Approve a profile change request' })
  approve(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApproveProfileChangeRequestDto,
  ) {
    return this.profileChangeRequestsService.approve(
      req.user,
      id,
      dto,
      this.buildContext(req),
    );
  }

  @Post(':id/reject')
  @Permissions('profile_change_request.reject')
  @ApiOperation({ summary: 'Reject a profile change request' })
  reject(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectProfileChangeRequestDto,
  ) {
    return this.profileChangeRequestsService.reject(
      req.user,
      id,
      dto,
      this.buildContext(req),
    );
  }

  @Post(':id/request-correction')
  @Permissions('profile_change_request.request_correction')
  @ApiOperation({ summary: 'Return a profile change request for correction' })
  requestCorrection(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RequestProfileChangeCorrectionDto,
  ) {
    return this.profileChangeRequestsService.requestCorrection(
      req.user,
      id,
      dto,
      this.buildContext(req),
    );
  }

  @Get(':id/history')
  @Permissions('profile_change_request.view_audit')
  @ApiOperation({ summary: 'Get audit history for a profile change request' })
  history(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.getHistoryForReviewer(
      req.user,
      id,
    );
  }

  @Get(':id/files/:fileId')
  @Permissions('profile_change_request.view_pending_files')
  @ApiOperation({ summary: 'Preview a pending profile change request file' })
  async getPendingFile(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Res() res: Response,
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    const file =
      await this.profileChangeRequestsService.getPendingFileForReviewer(
        req.user,
        id,
        fileId,
      );

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${file.originalFileName}"`,
    );
    res.send(file.buffer);
  }

  private buildContext(req: ExpressRequest) {
    return {
      ipAddress: req.ip,
      userAgent:
        typeof req.headers['user-agent'] === 'string'
          ? req.headers['user-agent']
          : null,
      requestIdHeader:
        typeof req.headers['x-request-id'] === 'string'
          ? req.headers['x-request-id']
          : null,
    };
  }
}
