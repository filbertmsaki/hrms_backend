import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../../../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import {
  FormListDto,
  SaveFormDto,
  SubmitFormDto,
  SatisfactionQueryDto,
} from './forms-feedback.dto';
import { FormsFeedbackService } from './forms-feedback.service';
import { QUESTION_LIBRARY } from './forms-feedback.rules';
type ActorRequest = { user: AuthenticatedUser };
@ApiTags('Forms & Feedback')
@ApiBearerAuth('access-token')
@Controller('hr/forms-feedback')
@UseGuards(AuthGuard('jwt'), TenantGuard, PermissionsGuard)
@Permissions('forms_feedback:manage')
export class FormsFeedbackController {
  constructor(private readonly service: FormsFeedbackService) {}
  @Get('suggestions') suggestions() {
    return QUESTION_LIBRARY;
  }
  @Get('satisfaction') satisfaction(
    @Req() req: ActorRequest,
    @Query() query: SatisfactionQueryDto,
  ) {
    return this.service.satisfaction(req.user, query.from, query.to);
  }
  @Get() list(@Req() req: ActorRequest, @Query() query: FormListDto) {
    return this.service.list(req.user, query);
  }
  @Post() create(@Req() req: ActorRequest, @Body() dto: SaveFormDto) {
    return this.service.save(req.user, dto);
  }
  @Get('rounds/:id/results') results(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FormListDto,
  ) {
    return this.service.results(req.user, id, query);
  }
  @Get(':id') get(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(req.user, id);
  }
  @Put(':id') update(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveFormDto,
  ) {
    return this.service.save(req.user, dto, id);
  }
  @Get(':id/rounds') rounds(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: FormListDto,
  ) {
    return this.service.rounds(req.user, id, query);
  }
  @Post(':id/publish') publish(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.transition(req.user, id, 'publish');
  }
  @Post(':id/pause') pause(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.transition(req.user, id, 'pause');
  }
  @Post(':id/close') close(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.transition(req.user, id, 'close');
  }
}
@ApiTags('Employee Forms & Feedback')
@ApiBearerAuth('access-token')
@Controller('employee/forms-feedback')
@UseGuards(AuthGuard('jwt'), TenantGuard)
export class EmployeeFormsFeedbackController {
  constructor(private readonly service: FormsFeedbackService) {}
  @Get() mine(@Req() req: ActorRequest, @Query() query: FormListDto) {
    return this.service.mine(req.user, query);
  }
  @Post(':id/submit') submit(
    @Req() req: ActorRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitFormDto,
  ) {
    return this.service.submit(req.user, id, dto.answers);
  }
}
