import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
  StreamableFile,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { createDownloadStream } from '../../files/file-download.util';
import { EmploymentLettersService } from './employment-letters.service';
import { UpsertEmploymentLetterTemplateDto } from './dto/upsert-employment-letter-template.dto';
import { EmploymentLetterType } from './entities/employment-letter-template.entity';

@ApiTags('Employment Letters')
@ApiBearerAuth('access-token')
@Controller('employment-letters')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
export class EmploymentLettersController {
  constructor(private readonly service: EmploymentLettersService) {}

  @Get('templates')
  @Permissions('employees:read')
  @ApiOperation({ summary: 'List company employment letter templates' })
  listTemplates(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.service.listTemplates(req.user);
  }

  @Put('templates')
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Create or update an employment letter template' })
  upsertTemplate(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: UpsertEmploymentLetterTemplateDto,
  ) {
    return this.service.upsertTemplate(req.user, dto);
  }

  @Post('candidates/:id/offer')
  @Permissions('employees:update')
  generateOffer(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.generateForCandidate(req.user, id);
  }

  @Post('employees/:id/appointment')
  @Permissions('employees:update')
  generateAppointment(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.generateForEmployee(req.user, id);
  }

  @Post('employees/:id/generate')
  @Permissions('employees:update')
  @ApiOperation({ summary: 'Generate a joining form or other employee letter' })
  generateEmployeeLetter(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { letter_type: EmploymentLetterType },
  ) {
    return this.service.generateForEmployee(req.user, id, body.letter_type);
  }

  @Post('employees/:id/preview')
  @Permissions('employees:read')
  @ApiOperation({ summary: 'Preview a joining form or other employee letter' })
  previewEmployeeLetter(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { letter_type: EmploymentLetterType },
  ) {
    return this.service.previewForEmployee(req.user, id, body.letter_type);
  }

  @Get('employees/:id/history')
  @Permissions('employees:read')
  @ApiOperation({ summary: 'List generated employee letters' })
  employeeHistory(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.employeeHistory(req.user, id);
  }

  @Get('documents/:id/download')
  @Permissions('employees:read')
  async download(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ): Promise<StreamableFile> {
    const file = await this.service.download(req.user, id);
    return createDownloadStream(file);
  }
}
