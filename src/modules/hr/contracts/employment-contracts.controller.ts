import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { CreateEmploymentContractDto } from './dto/create-employment-contract.dto';
import { EmploymentContractsService } from './employment-contracts.service';
import { IsNotEmpty, IsString } from 'class-validator';

class SignContractDto {
  @IsString()
  @IsNotEmpty()
  signed_name: string;
}

@Controller('employment-contracts')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmploymentContractsController {
  constructor(private readonly service: EmploymentContractsService) {}

  @Post()
  @Permissions('employees:update')
  issue(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: CreateEmploymentContractDto,
  ) {
    return this.service.issue(req.user, dto);
  }

  @Get('employees/:employeeId')
  @PermissionsAny('employees:read', 'onboarding_requests:read')
  list(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.service.list(req.user, employeeId);
  }

  @Get('summary')
  @PermissionsAny('employees:read', 'onboarding_requests:read')
  summary(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.service.summary(req.user);
  }

  @Post(':id/document')
  @Permissions('employees:update')
  attach(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() file: Base64FileDto,
  ) {
    return this.service.attachDocument(req.user, id, file);
  }

  @Post(':id/sign')
  @Permissions('onboarding_requests:read')
  sign(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SignContractDto,
  ) {
    return this.service.sign(req.user, id, dto.signed_name);
  }

  @Get(':id/document')
  @PermissionsAny('employees:read', 'onboarding_requests:read')
  async document(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ) {
    const document = await this.service.readDocument(req.user, id);
    response.setHeader(
      'Content-Type',
      document.mimeType ?? 'application/octet-stream',
    );
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`,
    );
    response.send(document.buffer);
  }
}
