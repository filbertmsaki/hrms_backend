import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  Permissions,
  PermissionsAny,
} from '../../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { ProbationService } from './probation.service';
import { CreateProbationPolicyDto } from './dtos/create-probation-policy.dto';
import { UpdateProbationPolicyDto } from './dtos/update-probation-policy.dto';
import { ProbationPolicyQueryDto } from './dtos/probation-policy-query.dto';
import { ProbationCaseQueryDto } from './dtos/probation-case-query.dto';
import { CreateProbationCaseDto } from './dtos/create-probation-case.dto';
import { UpdateProbationCaseDto } from './dtos/update-probation-case.dto';
import { CreateProbationObjectiveDto } from './dtos/create-probation-objective.dto';
import { SubmitProbationManagerReviewDto } from './dtos/submit-probation-manager-review.dto';
import { SubmitProbationHrDecisionDto } from './dtos/submit-probation-hr-decision.dto';
import { ProbationLetterTypeEnum } from './enums/probation-letter-type.enum';
import { ProbationLetterService } from './services/probation-letter.service';
import { UpsertProbationLetterTemplateDto } from './dtos/upsert-probation-letter-template.dto';

type AuthedRequest = ExpressRequest & { user: AuthenticatedUser };

@ApiTags('Probation and Confirmation')
@ApiBearerAuth('access-token')
@Controller('probation')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class ProbationController {
  constructor(
    private readonly service: ProbationService,
    private readonly letters: ProbationLetterService,
  ) {}

  @Get('letter-templates')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_letters:generate')
  listLetterTemplates(@Req() req: AuthedRequest) {
    return this.letters.listTemplates(req.user);
  }

  @Post('letter-templates')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_letters:generate')
  upsertLetterTemplate(
    @Req() req: AuthedRequest,
    @Body() dto: UpsertProbationLetterTemplateDto,
  ) {
    return this.letters.upsertTemplate(req.user, dto);
  }

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

  @Delete('policies/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @Permissions('probation_policies:delete')
  deletePolicy(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deletePolicy(req.user.companyId!, id, req.user);
  }

  @Get('dashboard/summary')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'probation_cases:read',
    'probation_cases:read-team',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  getDashboardSummary(@Req() req: AuthedRequest) {
    return this.service.getDashboardSummary(req.user);
  }

  @Get('cases')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'probation_cases:read',
    'probation_cases:read-team',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  listCases(@Req() req: AuthedRequest, @Query() query: ProbationCaseQueryDto) {
    return this.service.listCases(req.user, query);
  }

  @Post('cases')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:create')
  createCase(@Req() req: AuthedRequest, @Body() dto: CreateProbationCaseDto) {
    return this.service.createCaseManually(req.user, dto);
  }

  @Patch('cases/:id')
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:update')
  updateCase(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProbationCaseDto,
  ) {
    return this.service.updateCaseManually(req.user, id, dto);
  }

  @Get('cases/my-team')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'probation_cases:read-team',
    'probation_reviews:manager-review',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  listMyTeamCases(
    @Req() req: AuthedRequest,
    @Query() query: ProbationCaseQueryDto,
  ) {
    return this.service.listMyTeamCases(req.user, query);
  }

  @Get('cases/:id')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'probation_cases:read',
    'probation_cases:read-team',
    'manager_team:read',
    'manager_self_service:read',
    'manager:read',
  )
  getCase(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.getCase(req.user, id);
  }

  @Delete('cases/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @Permissions('probation_cases:delete')
  deleteCase(@Req() req: AuthedRequest, @Param('id', ParseIntPipe) id: number) {
    return this.service.deleteCase(req.user, id);
  }

  @Post('cases/:id/objectives')
  @UseGuards(PermissionsGuard)
  @PermissionsAny('probation_objectives:create', 'probation_cases:update')
  createObjective(
    @Req() req: AuthedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProbationObjectiveDto,
  ) {
    return this.service.createObjective(req.user, id, dto);
  }

  @Post('cases/:id/manager-review')
  @UseGuards(PermissionsGuard)
  @PermissionsAny(
    'probation_reviews:manager-review',
    'probation_reviews:manager-review-any',
  )
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
    @Body('letter_type') letterType?: ProbationLetterTypeEnum,
  ) {
    return this.service.generateLetter(req.user, id, letterType);
  }
}
