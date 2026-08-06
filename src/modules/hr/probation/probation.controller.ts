import {
  Body,
  Controller,
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
import { Request as ExpressRequest } from 'express';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ProbationService } from './probation.service';
import { CreateProbationPolicyDto } from './dtos/create-probation-policy.dto';
import { UpdateProbationPolicyDto } from './dtos/update-probation-policy.dto';
import { ProbationPolicyQueryDto } from './dtos/probation-policy-query.dto';
import { ProbationCaseQueryDto } from './dtos/probation-case-query.dto';
import { SubmitProbationManagerReviewDto } from './dtos/submit-probation-manager-review.dto';
import { SubmitProbationHrDecisionDto } from './dtos/submit-probation-hr-decision.dto';
import { ProbationLetterTypeEnum } from './enums/probation-letter-type.enum';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Probation and Confirmation')
@ApiBearerAuth('access-token')
@Controller('probation')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ProbationController {
  constructor(private readonly service: ProbationService) {}

  @Post('policies')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_policies:create')
  createPolicy(
    @Req() req: AuthedRequest,
    @Body() dto: CreateProbationPolicyDto,
  ) {
    return this.service.createPolicy(req.user.companyId!, dto, req.user);
  }

  @Get('policies')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_policies:read')
  listPolicies(
    @Req() req: AuthedRequest,
    @Query() query: ProbationPolicyQueryDto,
  ) {
    return this.service.listPolicies(req.user.companyId!, query);
  }

  @Patch('policies/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_policies:update')
  updatePolicy(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProbationPolicyDto,
  ) {
    return this.service.updatePolicy(req.user.companyId!, id, dto, req.user);
  }

  @Get('dashboard/summary')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:read')
  getDashboardSummary(@Req() req: AuthedRequest) {
    return this.service.getDashboardSummary(req.user);
  }

  @Get('cases')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:read')
  listCases(
    @Req() req: AuthedRequest,
    @Query() query: ProbationCaseQueryDto,
  ) {
    return this.service.listCases(req.user, query);
  }

  @Get('cases/my-team')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:read-team')
  listMyTeamCases(
    @Req() req: AuthedRequest,
    @Query() query: ProbationCaseQueryDto,
  ) {
    return this.service.listMyTeamCases(req.user, query);
  }

  @Get('cases/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:read')
  getCase(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.getCase(req.user, id);
  }

  @Post('cases/:id/manager-review')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_reviews:manager-review')
  managerReview(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitProbationManagerReviewDto,
  ) {
    return this.service.submitManagerReview(req.user, id, dto);
  }

  @Post('cases/:id/hr-decision')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_reviews:hr-decision')
  hrDecision(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SubmitProbationHrDecisionDto,
  ) {
    return this.service.submitHrDecision(req.user, id, dto);
  }

  @Post('cases/:id/generate-letter')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_letters:generate')
  generateLetter(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body('letter_type') letterType: ProbationLetterTypeEnum,
  ) {
    return this.service.generateLetter(req.user, id, letterType);
  }
}
