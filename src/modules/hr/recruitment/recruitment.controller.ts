import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request, Response } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Base64FileDto } from '../../files/dtos/base64-file.dto';
import { AcceptRecruitmentOfferDto, ConvertCandidateDto, CreateRecruitmentCandidateDto, CreateRecruitmentRequestDto, RecruitmentCheckDto, RecruitmentInterviewDto, RecruitmentOfferDto, RecruitmentScoreDto } from './dto/recruitment.dto';
import { RecruitmentService } from './recruitment.service';

type AuthedRequest = Request & { user: AuthenticatedUser };

@Controller('recruitment')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class RecruitmentController {
  constructor(private readonly service: RecruitmentService) {}

  @Get('requests')
  requests(@Req() req: AuthedRequest) { return this.service.listRequests(req.user); }

  @Post('requests')
  createRequest(@Req() req: AuthedRequest, @Body() dto: CreateRecruitmentRequestDto) { return this.service.createRequest(req.user, dto); }

  @Post('requests/:id/approve')
  approveRequest(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.approveRequest(req.user, id); }

  @Post('requests/:id/post')
  post(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.post(req.user, id); }

  @Post('requests/:id/close')
  close(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.closeRequest(req.user, id); }

  @Get('requests/:id/candidates')
  candidates(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.listCandidates(req.user, id); }

  @Post('requests/:id/candidates')
  createCandidate(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: CreateRecruitmentCandidateDto) { return this.service.createCandidate(req.user, id, dto); }

  @Post('candidates/:id/cv')
  uploadCv(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: Base64FileDto) { return this.service.uploadCandidateDocument(req.user, id, 'CV', dto); }

  @Get('candidates/:id/documents/:documentId')
  async document(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Param('documentId', ParseIntPipe) documentId: number, @Res() response: Response) {
    const document = await this.service.candidateDocument(req.user, id, documentId);
    response.setHeader('Content-Type', document.mimeType ?? 'application/octet-stream');
    response.setHeader('Content-Disposition', `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`);
    response.send(document.buffer);
  }

  @Post('candidates/:id/shortlist')
  shortlist(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.shortlist(req.user, id, true); }

  @Post('candidates/:id/reject')
  reject(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.rejectCandidate(req.user, id); }

  @Post('candidates/:id/interview')
  interview(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: RecruitmentInterviewDto) { return this.service.scheduleInterview(req.user, id, dto); }

  @Post('candidates/:id/interview/score')
  score(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: RecruitmentScoreDto) { return this.service.scoreInterview(req.user, id, dto); }

  @Post('candidates/:id/checks')
  check(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: RecruitmentCheckDto) { return this.service.recordCheck(req.user, id, dto); }

  @Post('candidates/:id/offer')
  draftOffer(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: RecruitmentOfferDto) { return this.service.draftOffer(req.user, id, dto); }

  @Post('candidates/:id/offer-letter')
  offerLetter(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: Base64FileDto) { return this.service.uploadCandidateDocument(req.user, id, 'OFFER', dto); }

  @Post('candidates/:id/offer/approve')
  approveOffer(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.approveOffer(req.user, id); }

  @Post('candidates/:id/offer/send')
  sendOffer(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) { return this.service.sendOffer(req.user, id); }

  @Post('candidates/:id/convert')
  convert(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number, @Body() dto: ConvertCandidateDto) { return this.service.convertToInvitation(req.user, id, dto.onboarding_workflow_id); }
}

@Controller('recruitment/offers')
export class RecruitmentOffersController {
  constructor(private readonly service: RecruitmentService) {}

  @Get('preview')
  preview(@Query('token') token: string) { return this.service.previewOffer(token); }

  @Get('letter')
  async letter(@Query('token') token: string, @Res() response: Response) {
    const document = await this.service.offerLetter(token);
    response.setHeader('Content-Type', document.mimeType ?? 'application/octet-stream');
    response.setHeader('Content-Disposition', `inline; filename="${document.fileName.replace(/["\r\n]/g, '')}"`);
    response.send(document.buffer);
  }

  @Post('accept')
  accept(@Body() dto: AcceptRecruitmentOfferDto) { return this.service.acceptOffer(dto.token); }
}
