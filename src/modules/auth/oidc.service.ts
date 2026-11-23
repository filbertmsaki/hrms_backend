import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, LessThan, QueryFailedError } from 'typeorm';
import {
  activeFieldKeyVersion,
  encryptField,
} from '../../common/crypto/field-encryption';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import type { AuditRequestContext } from '../../common/interfaces/audit-request-context.interface';
import { Company } from '../companies/entities/company.entity';
import { SecurityEventsService } from '../security/security-events.service';
import { SecurityEventType } from '../security/enums/security-event-type.enum';
import { SecurityEventOutcome } from '../security/enums/security-event-outcome.enum';
import { AuthService } from './auth.service';
import {
  OidcIdentity,
  OidcProvider,
  OidcRequest,
  type OidcPurpose,
} from './entities/oidc.entity';
import { OidcClientService } from './oidc-client.service';
import type { OidcCallbackDto, ProviderDto } from './dtos/oidc.dto';

const digest = (key: string) => createHash('sha256').update(key).digest('hex');

@Injectable()
export class OidcService {
  constructor(
    private readonly db: DataSource,
    private readonly client: OidcClientService,
    private readonly auth: AuthService,
    private readonly events: SecurityEventsService,
  ) {}

  private company(actor: AuthenticatedUser) {
    if (actor.scope !== 'company' || !actor.companyId)
      throw new ForbiddenException('Select an assigned company first.');
    return actor.companyId;
  }

  private async provider(companyId: number) {
    return this.db
      .getRepository(OidcProvider)
      .createQueryBuilder('p')
      .addSelect('p.secret_ciphertext')
      .where('p.company_id = :companyId', { companyId })
      .getOne();
  }

  async settings(actor: AuthenticatedUser) {
    const p = await this.db.manager.findOneBy(OidcProvider, {
      company_id: this.company(actor),
    });
    return {
      issuer: p?.issuer ?? '',
      client_id: p?.client_id ?? '',
      enabled: p?.enabled ?? false,
      company_code: actor.companySlug,
      configured: Boolean(p),
      tested_at: p?.tested_at ?? null,
      redirect_uri: this.client.redirectUri,
    };
  }

  async save(
    actor: AuthenticatedUser,
    input: ProviderDto,
    context: AuditRequestContext,
  ) {
    const companyId = this.company(actor);
    const issuer = input.issuer.trim();
    const clientId = input.client_id.trim();
    this.client.checkIssuer(issuer);
    if (!clientId) throw new BadRequestException('A client ID is required.');
    await this.db.transaction(async (manager) => {
      await manager.query('SELECT id FROM companies WHERE id=$1 FOR UPDATE', [
        companyId,
      ]);
      const old = await manager
        .createQueryBuilder(OidcProvider, 'p')
        .addSelect('p.secret_ciphertext')
        .where('p.company_id = :companyId', { companyId })
        .getOne();
      if (
        !input.client_secret &&
        (!old || old.issuer !== issuer || old.client_id !== clientId)
      ) {
        throw new BadRequestException(
          'Enter the client secret for this registration.',
        );
      }
      if (!input.client_secret && old) return;
      if (!activeFieldKeyVersion())
        throw new ServiceUnavailableException(
          'Configure the server field-encryption key before saving a provider.',
        );
      await manager.upsert(
        OidcProvider,
        {
          company_id: companyId,
          issuer,
          client_id: clientId,
          secret_ciphertext: encryptField(
            input.client_secret!,
            'oidc:' + companyId,
          ),
          revision: randomUUID(),
          tested_at: null,
          enabled: false,
        },
        ['company_id'],
      );
      await this.events.log(
        {
          actor,
          context,
          eventType: SecurityEventType.CONFIGURATION_CHANGED,
          outcome: SecurityEventOutcome.SUCCESS,
          resourceType: 'oidc_provider',
          reason: 'Saved provider registration for testing',
        },
        manager,
      );
    });
    return this.settings(actor);
  }

  async enable(
    actor: AuthenticatedUser,
    enabled: boolean,
    context: AuditRequestContext,
  ) {
    await this.db.transaction(async (manager) => {
      const q = manager
        .createQueryBuilder()
        .update(OidcProvider)
        .set({ enabled, revision: randomUUID() })
        .where('company_id = :companyId', { companyId: this.company(actor) });
      if (enabled) q.andWhere('tested_at IS NOT NULL');
      if (!(await q.execute()).affected)
        throw new BadRequestException(
          'Save and test the registration before enabling it.',
        );
      await this.events.log(
        {
          actor,
          context,
          eventType: SecurityEventType.CONFIGURATION_CHANGED,
          outcome: SecurityEventOutcome.SUCCESS,
          resourceType: 'oidc_provider',
          newValues: { enabled },
        },
        manager,
      );
    });
    return this.settings(actor);
  }

  private async confirmAccount(actor: AuthenticatedUser, password: string) {
    if (
      actor.userType === 'OWNER' ||
      (await this.auth.validateUser(actor.email, password))?.id !== actor.id
    ) {
      throw new ForbiddenException(
        'Verify your company account password to manage its identity.',
      );
    }
  }

  async linkStatus(actor: AuthenticatedUser) {
    const companyId = this.company(actor);
    const p = await this.db.manager.findOneBy(OidcProvider, {
      company_id: companyId,
    });
    const link = await this.db.manager.findOneBy(OidcIdentity, {
      company_id: companyId,
      user_id: actor.id,
    });
    return {
      available: Boolean(p?.enabled) && actor.userType !== 'OWNER',
      linked: Boolean(link),
      issuer: link?.issuer ?? null,
    };
  }

  async unlink(
    actor: AuthenticatedUser,
    password: string,
    context: AuditRequestContext,
  ) {
    await this.confirmAccount(actor, password);
    await this.db.transaction(async (manager) => {
      await manager.delete(OidcIdentity, {
        company_id: this.company(actor),
        user_id: actor.id,
      });
      await this.events.log(
        {
          actor,
          context,
          eventType: SecurityEventType.SSO_UNLINKED,
          outcome: SecurityEventOutcome.SUCCESS,
        },
        manager,
      );
    });
    return { linked: false };
  }

  async start(
    purpose: OidcPurpose,
    key: string,
    context: AuditRequestContext,
    options: { slug?: string; actor?: AuthenticatedUser; password?: string },
  ) {
    const { actor, slug } = options;
    const companyId = actor
      ? this.company(actor)
      : (
          await this.db.manager.findOneBy(Company, {
            slug: slug?.trim().toLowerCase() || '',
            status: 'active',
          })
        )?.id;
    try {
      const p = companyId ? await this.provider(companyId) : null;
      if (!p || (!p.enabled && purpose !== 'test'))
        throw new NotFoundException('Company SSO is unavailable.');
      if (purpose === 'link' && actor)
        await this.confirmAccount(actor, options.password ?? '');
      const { url, state, verifier, nonce } = await this.client.authorize(
        p,
        purpose,
      );
      const requests = this.db.getRepository(OidcRequest);
      await requests.delete({ expires_at: LessThan(new Date()) });
      await requests.insert({
        state_hash: digest(state),
        browser_hash: digest(key),
        company_id: p.company_id,
        revision: p.revision,
        purpose,
        session_id: actor?.sessionId ?? null,
        user_id: actor?.id ?? null,
        nonce,
        verifier,
        expires_at: new Date(Date.now() + 600000),
      });
      return { authorization_url: url };
    } catch (error) {
      await this.events.logBestEffort({
        actor,
        companyId,
        context,
        eventType: SecurityEventType.SSO_FAILED,
        outcome: SecurityEventOutcome.FAILURE,
        reason: 'SSO request could not start',
        metadata: { purpose },
      });
      if (
        error instanceof ForbiddenException ||
        error instanceof NotFoundException
      )
        throw error;
      throw new BadRequestException(
        'Could not contact the configured identity provider. Check the registration and approved endpoints.',
      );
    }
  }

  async finish(
    purpose: OidcPurpose,
    input: OidcCallbackDto,
    context: AuditRequestContext,
    actor?: AuthenticatedUser,
  ) {
    const q = this.db
      .createQueryBuilder()
      .delete()
      .from(OidcRequest)
      .where(
        'state_hash=:state AND browser_hash=:browser AND purpose=:purpose AND expires_at > statement_timestamp()',
        {
          state: digest(input.state),
          browser: digest(input.browser_key),
          purpose,
        },
      );
    if (actor)
      q.andWhere(
        'user_id=:user AND session_id=:session AND company_id=:company',
        {
          user: actor.id,
          session: actor.sessionId,
          company: this.company(actor),
        },
      );
    const result = await q.returning('*').execute();
    const [flow] = result.raw as OidcRequest[];
    try {
      if (!flow) throw new UnauthorizedException();
      const p = await this.provider(flow.company_id);
      if (
        !p ||
        p.revision !== flow.revision ||
        (!p.enabled && purpose !== 'test')
      )
        throw new UnauthorizedException();
      const subject = await this.client.identify(p, input, flow);
      const identity = {
        company_id: p.company_id,
        issuer: p.issuer,
        client_id: p.client_id,
        subject,
      };
      const userId = await this.db.transaction(async (manager) => {
        const current = await manager.findOne(OidcProvider, {
          where: { company_id: p.company_id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current || current.revision !== p.revision)
          throw new UnauthorizedException();
        if (purpose === 'test')
          await manager.update(OidcProvider, p.company_id, {
            tested_at: new Date(),
          });
        if (purpose === 'link' && actor) {
          const previous = await manager.findOneBy(OidcIdentity, {
            company_id: p.company_id,
            user_id: actor.id,
          });
          if (
            previous &&
            (previous.issuer !== p.issuer ||
              previous.client_id !== p.client_id ||
              previous.subject !== subject)
          ) {
            throw new ConflictException('Unlink the previous identity first.');
          }
          if (!previous)
            await manager.insert(OidcIdentity, {
              ...identity,
              user_id: actor.id,
            });
        }
        if (purpose === 'login') {
          const link = await manager.findOneBy(OidcIdentity, identity);
          if (!link) throw new UnauthorizedException();
          return link.user_id;
        }
        await this.events.log(
          {
            actor,
            context,
            companyId: p.company_id,
            eventType:
              purpose === 'test'
                ? SecurityEventType.SSO_TESTED
                : SecurityEventType.SSO_LINKED,
            outcome: SecurityEventOutcome.SUCCESS,
          },
          manager,
        );
        return null;
      });
      if (userId !== null) {
        const login = await this.auth.loginWithLinkedIdentity(
          userId,
          p.company_id,
          context,
        );
        await this.events.logBestEffort({
          context,
          companyId: p.company_id,
          targetUserId: userId,
          eventType: SecurityEventType.SSO_IDENTITY_VERIFIED,
          outcome: SecurityEventOutcome.SUCCESS,
        });
        return login;
      }
      return { success: true };
    } catch (error) {
      await this.events.logBestEffort({
        actor,
        companyId: flow?.company_id,
        context,
        eventType: SecurityEventType.SSO_FAILED,
        outcome: SecurityEventOutcome.FAILURE,
        reason: 'SSO verification did not complete',
        metadata: { purpose },
      });
      if (
        error instanceof ConflictException ||
        (error instanceof QueryFailedError &&
          (error.driverError as { code?: string }).code === '23505')
      ) {
        throw new ConflictException(
          'This identity already has an account link. Review your linked identity.',
        );
      }
      throw new UnauthorizedException(
        'SSO could not be completed. Sign in with your password to check the company and account link.',
      );
    }
  }
}
