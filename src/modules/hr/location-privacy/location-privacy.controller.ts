import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { LocationPrivacyService } from './location-privacy.service';

type RequestWithUser = Request & { user: AuthenticatedUser };

@ApiTags('Location Privacy')
@ApiBearerAuth('access-token')
@Controller('location-privacy')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class LocationPrivacyController {
  constructor(private readonly service: LocationPrivacyService) {}

  @Get('current')
  current(@Req() req: RequestWithUser) {
    if (!req.user.employeeId) return { notice: null, acknowledged: true };
    return this.service.current(req.user.companyId!, req.user.employeeId);
  }

  @Post('acknowledgements')
  acknowledge(
    @Body() body: { notice_id: number },
    @Req() req: RequestWithUser,
  ) {
    if (!body || !Number.isSafeInteger(Number(body.notice_id))) {
      throw new BadRequestException('notice_id must be a positive integer.');
    }
    return this.service.acknowledge(req.user, Number(body.notice_id));
  }

  @Get('notices')
  @UseGuards(PermissionsGuard)
  @Permissions('location_privacy:manage')
  listNotices(@Req() req: RequestWithUser) {
    return this.service.listNotices(req.user.companyId!);
  }

  @Post('notices')
  @UseGuards(PermissionsGuard)
  @Permissions('location_privacy:manage')
  publish(
    @Body()
    body: {
      title: string;
      body: string;
      require_acknowledgement?: boolean;
      approval_status: 'DEMO_APPROVED' | 'COMPANY_APPROVED';
      approval_reference?: string;
    },
    @Req() req: RequestWithUser,
  ) {
    return this.service.publish(req.user, {
      title: body.title,
      body: body.body,
      requireAcknowledgement: body.require_acknowledgement,
      approvalStatus: body.approval_status,
      approvalReference: body.approval_reference,
    });
  }

  @Get('notices/:id/acknowledgements')
  @UseGuards(PermissionsGuard)
  @Permissions('location_privacy:manage')
  acknowledgements(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: RequestWithUser,
  ) {
    return this.service.listAcknowledgements(req.user.companyId!, id);
  }
}
