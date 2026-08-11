import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request as ExpressRequest, Response } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CreateProfileChangeRequestDto } from './dtos/create-profile-change-request.dto';
import { ProfileChangeRequestQueryDto } from './dtos/profile-change-request-query.dto';
import { UpdateProfileChangeRequestDto } from './dtos/update-profile-change-request.dto';
import { ValidateProfileChangeRequestDto } from './dtos/validate-profile-change-request.dto';
import { ProfileChangeRequestsService } from './profile-change-requests.service';

@ApiTags('My Profile Change Requests')
@ApiBearerAuth('access-token')
@Controller('me/profile-change-requests')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class MeProfileChangeRequestsController {
  constructor(
    private readonly profileChangeRequestsService: ProfileChangeRequestsService,
  ) {}

  private readonly allowedProfilePhotoMimeTypes = new Set([
    'image/svg+xml',
    'image/jpeg',
    'image/png',
    'image/webp',
  ]);

  @Get()
  @ApiOperation({ summary: 'List my profile change requests' })
  listMine(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Query() query: ProfileChangeRequestQueryDto,
  ) {
    return this.profileChangeRequestsService.listMine(req.user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my profile change requests' })
  getMine(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.getMine(req.user, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a profile change request draft' })
  createDraft(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: CreateProfileChangeRequestDto,
  ) {
    return this.profileChangeRequestsService.createDraft(
      req.user,
      dto,
      this.buildContext(req),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a draft or correction-required request' })
  updateDraft(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProfileChangeRequestDto,
  ) {
    return this.profileChangeRequestsService.updateDraft(
      req.user,
      id,
      dto,
      this.buildContext(req),
    );
  }

  @Post(':id/submit')
  @ApiOperation({ summary: 'Submit a profile change request for review' })
  submit(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.submit(
      req.user,
      id,
      this.buildContext(req),
    );
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an eligible profile change request' })
  cancel(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.cancel(
      req.user,
      id,
      this.buildContext(req),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an eligible draft profile change request' })
  removeDraft(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.removeDraft(
      req.user,
      id,
      this.buildContext(req),
    );
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate proposed profile changes before submit' })
  validate(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Body() dto: ValidateProfileChangeRequestDto,
  ) {
    return this.profileChangeRequestsService.validateMine(req.user, dto);
  }

  @Post('profile-photo')
  @ApiOperation({ summary: 'Upload a pending profile photo for HR approval' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadProfilePhoto(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    if (!file) {
      throw new BadRequestException('Profile picture file is required.');
    }

    if (!this.allowedProfilePhotoMimeTypes.has(file.mimetype)) {
      throw new BadRequestException(
        'Only SVG, JPEG, PNG, and WEBP profile pictures are allowed.',
      );
    }

    if (!file.buffer?.length) {
      throw new BadRequestException('Uploaded profile picture is empty.');
    }

    return this.profileChangeRequestsService.createProfilePhotoRequest(
      req.user,
      file,
      this.buildContext(req),
    );
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get my profile change request audit history' })
  history(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.profileChangeRequestsService.getHistoryForEmployee(
      req.user,
      id,
    );
  }

  @Get(':id/files/:fileId')
  @ApiOperation({ summary: 'Preview a pending file for my own request' })
  async getPendingFile(
    @Req() req: ExpressRequest & { user: AuthenticatedUser },
    @Res() res: Response,
    @Param('id', ParseIntPipe) id: number,
    @Param('fileId', ParseIntPipe) fileId: number,
  ) {
    const file =
      await this.profileChangeRequestsService.getPendingFileForEmployee(
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
