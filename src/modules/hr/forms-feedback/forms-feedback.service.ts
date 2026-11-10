import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  HttpException,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../employees/enums/employment-status.enum';
import {
  FeedbackForm,
  FeedbackParticipation,
  FeedbackResponse,
  FeedbackRound,
} from './forms-feedback.entity';
import { FormListDto, SaveFormDto } from './forms-feedback.dto';
import {
  nextOpening,
  publicationOpening,
  validateAnswers,
  validateDefinition,
} from './forms-feedback.rules';

@Injectable()
export class FormsFeedbackService {
  constructor(private readonly db: DataSource) {}
  company(actor: AuthenticatedUser) {
    if (!actor.companyId)
      throw new ForbiddenException('Company context required');
    return actor.companyId;
  }
  async employee(actor: AuthenticatedUser, em = this.db.manager) {
    const employee = await em.findOne(Employee, {
      where: {
        company_id: this.company(actor),
        company_user_id: actor.companyMembershipId ?? -1,
      },
    });
    if (!employee || employee.employment_status !== EmploymentStatusEnum.ACTIVE)
      throw new ForbiddenException('An active employee account is required');
    return employee;
  }
  async list(actor: AuthenticatedUser, query: FormListDto) {
    const qb = this.db
      .getRepository(FeedbackForm)
      .createQueryBuilder('f')
      .where('f.company_id=:company', { company: this.company(actor) });
    const open =
      'EXISTS (SELECT 1 FROM feedback_rounds r WHERE r.form_id=f.id AND r.opens_at<=now() AND r.closes_at>now())';
    if (query.status === 'open') qb.andWhere(open);
    else if (query.status && query.status !== 'all') {
      qb.andWhere('f.status=:status', { status: query.status });
      if (query.status === 'closed') qb.andWhere(`NOT ${open}`);
    }
    const [rows, total] = await qb
      .orderBy('f.created_at', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    const enriched = await Promise.all(
      rows.map(async (form) => {
        const openRounds = await this.db
          .getRepository(FeedbackRound)
          .createQueryBuilder('r')
          .where('r.form_id=:id AND r.opens_at<=now() AND r.closes_at>now()', {
            id: form.id,
          })
          .getCount();
        const submittedCount = await this.db
          .getRepository(FeedbackParticipation)
          .createQueryBuilder('p')
          .innerJoin(FeedbackRound, 'r', 'r.id=p.round_id')
          .where('r.form_id=:id AND p.submitted=true', { id: form.id })
          .getCount();
        return {
          ...form,
          displayStatus: openRounds ? 'open' : form.status,
          submittedCount,
        };
      }),
    );
    return { rows: enriched, total, page: query.page, limit: query.limit };
  }
  async get(
    actor: AuthenticatedUser,
    id: string,
    em = this.db.manager,
    lock = false,
  ) {
    const form = await em.findOne(FeedbackForm, {
      where: { id, companyId: this.company(actor) },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!form) throw new NotFoundException('Form not found');
    return form;
  }
  async save(actor: AuthenticatedUser, definition: SaveFormDto, id?: string) {
    validateDefinition(definition, true);
    const companyId = this.company(actor);
    if (definition.audience.type !== 'all') {
      const table =
        definition.audience.type === 'branches' ? 'branches' : 'departments';
      const rows = await this.db.query<Array<{ id: number }>>(
        `SELECT id FROM ${table} WHERE company_id=$1 AND id=ANY($2::int[])`,
        [companyId, definition.audience.ids],
      );
      if (rows.length !== definition.audience.ids.length)
        throw new BadRequestException(
          'Audience contains an invalid branch or department',
        );
    }
    return this.db.transaction(async (em) => {
      const form = id
        ? await this.get(actor, id, em, true)
        : em.create(FeedbackForm, {
            companyId,
            createdBy: actor.id,
            status: 'draft',
            publishedMode: null,
            nextOpenAt: null,
            roundCount: 0,
          });
      if (form.publishedMode && form.publishedMode !== definition.responseMode)
        throw new BadRequestException(
          'Response mode is locked after publication',
        );
      if (!['draft', 'paused'].includes(form.status))
        throw new BadRequestException(
          'Pause the schedule before editing future rounds',
        );
      form.definition = definition;
      return em.save(form);
    });
  }
  async transition(
    actor: AuthenticatedUser,
    id: string,
    action: 'publish' | 'pause' | 'close',
  ) {
    return this.db.transaction(async (em) => {
      const form = await this.get(actor, id, em, true);
      if (action === 'publish') {
        if (!['draft', 'paused'].includes(form.status))
          throw new ConflictException(
            'Only draft or paused forms can be scheduled',
          );
        validateDefinition(form.definition);
        if (
          form.definition.schedule.occurrences &&
          form.roundCount >= form.definition.schedule.occurrences
        )
          throw new BadRequestException('Occurrence limit reached');
        const next = publicationOpening(
          form.definition.schedule,
          new Date(),
          form.roundCount,
        );
        if (!next)
          throw new BadRequestException(
            'Choose today or a future opening date that matches the schedule',
          );
        form.nextOpenAt = next;
        form.status = 'scheduled';
        form.publishedMode = form.definition.responseMode;
      } else {
        form.status = action === 'pause' ? 'paused' : 'closed';
        form.nextOpenAt = null;
        if (action === 'close')
          await em
            .getRepository(FeedbackRound)
            .createQueryBuilder()
            .update()
            .set({ closesAt: new Date() })
            .where('form_id = :id AND opens_at < now() AND closes_at > now()', {
              id,
            })
            .execute();
      }
      return em.save(form);
    });
  }
  async rounds(actor: AuthenticatedUser, id: string, query: FormListDto) {
    await this.get(actor, id);
    const [rows, total] = await this.db
      .getRepository(FeedbackRound)
      .findAndCount({
        where: { formId: id, companyId: this.company(actor) },
        order: { opensAt: 'DESC' },
        take: query.limit,
        skip: (query.page - 1) * query.limit,
      });
    const enriched = await Promise.all(
      rows.map(async (round) => ({
        ...round,
        status: round.closesAt <= new Date() ? 'closed' : 'open',
        eligible: await this.db
          .getRepository(FeedbackParticipation)
          .countBy({ roundId: round.id }),
        submitted: await this.db
          .getRepository(FeedbackParticipation)
          .countBy({ roundId: round.id, submitted: true }),
      })),
    );
    return { rows: enriched, total, page: query.page, limit: query.limit };
  }
  async mine(actor: AuthenticatedUser, query: FormListDto) {
    const employee = await this.employee(actor);
    const qb = this.db
      .getRepository(FeedbackParticipation)
      .createQueryBuilder('p')
      .innerJoin(FeedbackRound, 'r', 'r.id=p.round_id')
      .where('p.company_id=:company AND p.employee_id=:employee', {
        company: employee.company_id,
        employee: employee.id,
      });
    if (query.status === 'submitted') qb.andWhere('p.submitted=true');
    if (query.status === 'pending')
      qb.andWhere(
        'p.submitted=false AND r.closes_at>now() AND r.opens_at<=now()',
      );
    const total = await qb.getCount();
    const rows = await qb
      .select([
        'r.id AS id',
        'r.definition AS definition',
        'r.opens_at AS "opensAt"',
        'r.closes_at AS "closesAt"',
        'p.submitted AS submitted',
      ])
      .orderBy('r.opens_at', 'DESC')
      .offset((query.page - 1) * query.limit)
      .limit(query.limit)
      .getRawMany<{
        id: string;
        definition: SaveFormDto;
        opensAt: Date;
        closesAt: Date;
        submitted: boolean;
      }>();
    return { rows, total, page: query.page, limit: query.limit };
  }
  async submit(
    actor: AuthenticatedUser,
    roundId: string,
    answers: Record<string, unknown>,
  ) {
    return this.db
      .transaction(async (em) => {
        const employee = await this.employee(actor, em);
        const round = await em.findOne(FeedbackRound, {
          where: { id: roundId, companyId: employee.company_id },
          lock: { mode: 'pessimistic_read' },
        });
        if (!round) throw new NotFoundException('Form round not found');
        const participant = await em.findOne(FeedbackParticipation, {
          where: {
            roundId,
            employeeId: employee.id,
            companyId: employee.company_id,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!participant)
          throw new ForbiddenException('You are not in this form audience');
        if (participant.submitted)
          throw new ConflictException(
            'Your response has already been submitted',
          );
        const now = new Date();
        if (now < round.opensAt || now >= round.closesAt)
          throw new BadRequestException('This form is not open');
        const clean = validateAnswers(round.definition, answers);
        await em.save(
          FeedbackResponse,
          em.create(FeedbackResponse, {
            companyId: employee.company_id,
            roundId,
            employeeId:
              round.definition.responseMode === 'identified'
                ? employee.id
                : null,
            answers: clean,
          }),
        );
        participant.submitted = true;
        participant.lastNotifiedAt = null;
        await em.save(participant);
        // Never return a response ID that could link anonymous answers to participation.
        return { submitted: true };
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        throw new ServiceUnavailableException(
          'Could not save your response. Please retry.',
        );
      });
  }
  async results(actor: AuthenticatedUser, roundId: string, query: FormListDto) {
    const round = await this.db
      .getRepository(FeedbackRound)
      .findOneBy({ id: roundId, companyId: this.company(actor) });
    if (!round) throw new NotFoundException('Form round not found');
    const total = await this.db
      .getRepository(FeedbackResponse)
      .countBy({ roundId, companyId: round.companyId });
    const eligible = await this.db
      .getRepository(FeedbackParticipation)
      .countBy({ roundId });
    // Anonymous answers are released only after close and a minimum group size, so
    // successive result reads cannot reveal a newly arrived individual's answers.
    const withheld =
      round.definition.responseMode === 'anonymous' &&
      (new Date() < round.closesAt || total < 5);
    if (withheld)
      return {
        round,
        total,
        eligible,
        withheld: true,
        rows: [],
        summary: [],
        page: query.page,
        limit: query.limit,
      };
    const records = await this.db.getRepository(FeedbackResponse).find({
      where: { roundId, companyId: round.companyId },
      order: { id: 'ASC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    const rows = await Promise.all(
      records.map(async (response) => {
        if (round.definition.responseMode === 'anonymous')
          return { answers: response.answers };
        const employee = response.employeeId
          ? await this.db.getRepository(Employee).findOneBy({
              id: response.employeeId,
              company_id: round.companyId,
            })
          : null;
        return {
          answers: response.answers,
          employee: employee
            ? {
                id: employee.id,
                name: `${employee.first_name} ${employee.last_name}`,
                employeeNo: employee.employee_no,
              }
            : null,
        };
      }),
    );
    const summary = await this.db.query<
      Array<{ question: string; answer: unknown; count: string }>
    >(
      `SELECT a.key AS question, item.value AS answer, count(*)::text AS count
       FROM feedback_responses r CROSS JOIN LATERAL jsonb_each(r.answers) a
       CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.value)='array' THEN a.value ELSE jsonb_build_array(a.value) END) item
       WHERE r.round_id=$1 AND r.company_id=$2 AND a.key=ANY($3::text[])
       GROUP BY a.key,item.value`,
      [
        roundId,
        round.companyId,
        round.definition.questions
          .filter((q) =>
            ['single_choice', 'multiple_choice', 'yes_no', 'rating'].includes(
              q.type,
            ),
          )
          .map((q) => q.id),
      ],
    );
    return {
      round,
      total,
      eligible,
      withheld: false,
      rows,
      summary,
      page: query.page,
      limit: query.limit,
    };
  }
  async satisfaction(actor: AuthenticatedUser, from?: string, to?: string) {
    const rounds = await this.db
      .getRepository(FeedbackRound)
      .createQueryBuilder('r')
      .where('r.company_id=:company', { company: this.company(actor) })
      .andWhere("r.definition->>'satisfaction'='true'")
      .andWhere('r.closes_at <= now()')
      .andWhere('r.closes_at >= :from AND r.closes_at <= :to', {
        from: from ?? new Date(Date.now() - 30 * 86400000),
        to: to ?? new Date(),
      })
      .getMany();
    const scores: number[] = [];
    const categories: Record<string, number[]> = {};
    for (const round of rounds) {
      const responses = await this.db
        .getRepository(FeedbackResponse)
        .findBy({ roundId: round.id, companyId: round.companyId });
      if (round.definition.responseMode === 'anonymous' && responses.length < 5)
        continue;
      for (const response of responses) {
        const ratings: number[] = [];
        const byCategory: Record<string, number[]> = {};
        for (const question of round.definition.questions.filter(
          (q) => q.type === 'rating',
        )) {
          const answer = response.answers[question.id];
          if (typeof answer !== 'number') continue;
          ratings.push(answer);
          if (question.category)
            (byCategory[question.category] ??= []).push(answer);
        }
        if (ratings.length)
          scores.push(ratings.reduce((a, b) => a + b, 0) / ratings.length);
        for (const [category, values] of Object.entries(byCategory))
          (categories[category] ??= []).push(
            values.reduce((a, b) => a + b, 0) / values.length,
          );
      }
    }
    const percentage = (values: number[]) =>
      values.length
        ? Math.round(
            ((values.reduce((a, b) => a + b, 0) / values.length - 1) / 4) *
              1000,
          ) / 10
        : null;
    return {
      score: percentage(scores),
      responseCount: scores.length,
      satisfied: scores.filter((s) => s >= 4).length,
      neutral: scores.filter((s) => s >= 3 && s < 4).length,
      needsAttention: scores.filter((s) => s < 3).length,
      categories: Object.fromEntries(
        Object.entries(categories).map(([key, values]) => [
          key,
          percentage(values),
        ]),
      ),
    };
  }
  async openDueForm(id: string) {
    await this.db.transaction(async (em) => {
      const form = await em.findOne(FeedbackForm, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !form ||
        form.status !== 'scheduled' ||
        !form.nextOpenAt ||
        form.nextOpenAt > new Date()
      )
        return;
      const closesAt = new Date(
        form.nextOpenAt.getTime() +
          form.definition.schedule.openDays * 86400000,
      );
      if (closesAt > new Date()) {
        const round = await em.save(
          FeedbackRound,
          em.create(FeedbackRound, {
            formId: id,
            companyId: form.companyId,
            definition: form.definition,
            opensAt: form.nextOpenAt,
            closesAt,
          }),
        );
        await this.createAudience(em, round);
        form.roundCount += 1;
      }
      form.nextOpenAt =
        form.definition.schedule.occurrences &&
        form.roundCount >= form.definition.schedule.occurrences
          ? null
          : nextOpening(
              form.definition.schedule,
              new Date(Math.max(Date.now(), form.nextOpenAt.getTime())),
            );
      if (!form.nextOpenAt) form.status = 'closed';
      await em.save(form);
    });
  }
  private async createAudience(em: EntityManager, round: FeedbackRound) {
    const { audience } = round.definition;
    const filter =
      audience.type === 'all'
        ? ''
        : ` AND ${audience.type === 'branches' ? 'primary_branch_id' : 'primary_department_id'} = ANY($3::int[])`;
    await em.query(
      `INSERT INTO feedback_participation(round_id,employee_id,company_id) SELECT $1,id,company_id FROM employees WHERE company_id=$2 AND employment_status='active' AND company_user_id IS NOT NULL${filter}`,
      audience.type === 'all'
        ? [round.id, round.companyId]
        : [round.id, round.companyId, audience.ids],
    );
  }
}
