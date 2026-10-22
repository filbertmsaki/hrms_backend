import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnboardingWorkspaceNoteEvent } from '../../notifications/events';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { OnboardingRequest } from '../entities/onboarding-request.entity';
import {
  OnboardingWorkspaceNote,
  OnboardingWorkspaceVisit,
} from '../entities/onboarding-workspace.entity';
import { OnboardingWorkspaceNoteDto } from '../dtos/onboarding-workspace-note.dto';
import { OnboardingService } from '../onboarding.service';

@Injectable()
export class OnboardingWorkspaceService {
  constructor(
    private readonly source: DataSource,
    private readonly access: HrAccessService,
    private readonly onboarding: OnboardingService,
    private readonly events: EventEmitter2,
  ) {}

  private async request(
    companyId: number,
    requestId: number,
    actor: AuthenticatedUser,
    employeeView = false,
  ) {
    const request = await this.source.getRepository(OnboardingRequest).findOne({
      where: { id: requestId, company_id: companyId },
      relations: ['employee'],
    });
    if (!request) throw new NotFoundException('Onboarding request not found');
    if (employeeView) {
      if (
        actor.employeeId !== request.employee_id &&
        (!actor.companyMembershipId ||
          actor.companyMembershipId !== request.employee.company_user_id)
      )
        throw new ForbiddenException(
          'Only the employee can read these messages',
        );
    } else {
      await this.access.assertCanAccessEmployee(actor, request.employee);
    }
    return request;
  }

  async notes(
    companyId: number,
    requestId: number,
    actor: AuthenticatedUser,
    employeeView = false,
  ) {
    await this.request(companyId, requestId, actor, employeeView);
    const notes = await this.source
      .getRepository(OnboardingWorkspaceNote)
      .find({
        where: {
          company_id: companyId,
          request_id: requestId,
          ...(employeeView ||
          !actor.permissions?.includes('onboarding_requests:update')
            ? { visibility: 'employee' as const }
            : {}),
        },
        relations: ['author', 'author.user'],
        order: { created_at: 'DESC', id: 'DESC' },
        take: 200,
      });
    return notes.map((note) => ({
      id: note.id,
      requirement_id: note.requirement_id,
      visibility: note.visibility,
      body: note.body,
      created_at: note.created_at,
      author_name: note.author?.user
        ? `${note.author.user.first_name} ${note.author.user.last_name}`.trim()
        : 'Former team member',
    }));
  }

  async addNote(
    companyId: number,
    requestId: number,
    actor: AuthenticatedUser,
    dto: OnboardingWorkspaceNoteDto,
  ) {
    const request = await this.request(companyId, requestId, actor);
    if (!actor.companyMembershipId)
      throw new ForbiddenException('A company membership is required');
    if (['completed', 'cancelled', 'activating'].includes(request.status))
      throw new ConflictException(
        'This onboarding request is closed for new notes',
      );
    const readiness = await this.onboarding.getActivationReadiness(
      companyId,
      requestId,
      actor,
    );
    if (!readiness.requirements.some((item) => item.id === dto.requirement_id))
      throw new BadRequestException('Unknown onboarding requirement');
    if (!dto.body.trim()) throw new BadRequestException('A note is required');
    const saved = await this.source.transaction(async (manager) => {
      const locked = await manager
        .getRepository(OnboardingRequest)
        .findOneOrFail({
          where: { id: requestId, company_id: companyId },
          lock: { mode: 'pessimistic_write' },
        });
      if (['completed', 'cancelled', 'activating'].includes(locked.status))
        throw new ConflictException(
          'This onboarding request is closed for new notes',
        );
      await manager
        .getRepository(OnboardingWorkspaceNote)
        .createQueryBuilder()
        .insert()
        .values({
          company_id: companyId,
          request_id: requestId,
          author_id: actor.companyMembershipId,
          client_key: dto.client_key,
          requirement_id: dto.requirement_id,
          visibility: dto.visibility,
          body: dto.body.trim(),
        })
        .orIgnore()
        .execute();
      return manager.getRepository(OnboardingWorkspaceNote).findOneByOrFail({
        request_id: requestId,
        author_id: actor.companyMembershipId,
        client_key: dto.client_key,
      });
    });
    this.events.emit(
      OnboardingWorkspaceNoteEvent.EVENT,
      new OnboardingWorkspaceNoteEvent(
        companyId,
        requestId,
        saved.id,
        saved.requirement_id,
        actor.companyMembershipId,
        request.employee.company_user_id ?? null,
        saved.visibility === 'employee',
      ),
    );
    return { message: 'Handoff note saved' };
  }

  async visit(companyId: number, requestId: number, actor: AuthenticatedUser) {
    await this.request(companyId, requestId, actor);
    return this.source.transaction(async (manager) => {
      await manager.getRepository(OnboardingRequest).findOne({
        where: { id: requestId, company_id: companyId },
        lock: { mode: 'pessimistic_write' },
      });
      const repository = manager.getRepository(OnboardingWorkspaceVisit);
      const previous = await repository.findOneBy({
        request_id: requestId,
        user_id: actor.id,
      });
      const viewedAt = new Date();
      await repository.upsert(
        { request_id: requestId, user_id: actor.id, viewed_at: viewedAt },
        ['request_id', 'user_id'],
      );
      return {
        previous_viewed_at: previous?.viewed_at ?? null,
        viewed_at: viewedAt,
      };
    });
  }
}
