import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { createClient, RedisClientType } from 'redis';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { isOriginAllowed } from '../../common/utils/allowed-origin.util';
import { CompanyUser } from '../companies/entities/company-user.entity';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { UsersService } from '../users/users.service';

type NotificationSocketPayload = {
  sub: number;
  email: string;
  type: string;
  scope: 'platform' | 'company';
  companyId?: number;
  membershipId?: number;
  tokenVersion?: number;
  iat?: number;
};

type RealtimeEnvelope = {
  event: string;
  room: string;
  payload: Record<string, unknown>;
};

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowed = (process.env.NOTIFICATION_WEBSOCKET_ALLOWED_ORIGINS ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

      if (!allowed.length || !origin || isOriginAllowed(origin, allowed)) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    credentials: true,
  },
})
export class NotificationsGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly redisChannel: string;
  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private readonly redisEnabled: boolean;

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    private readonly blacklistService: TokenBlacklistService,
    private readonly usersService: UsersService,
  ) {
    this.redisEnabled = this.getBooleanConfig('USE_REDIS', false);
    const appEnv =
      this.configService.get<string>('APP_ENV')?.trim() || 'production';
    this.redisChannel =
      this.configService.get<string>('REDIS_NOTIFICATION_CHANNEL')?.trim() ||
      `hrms:${appEnv}:notifications:realtime`;
  }

  private getBooleanConfig(key: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);

    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }

    return defaultValue;
  }

  async onModuleInit(): Promise<void> {
    if (!this.redisEnabled) {
      return;
    }

    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl?.trim()) {
      return;
    }

    try {
      this.publisher = createClient({ url: redisUrl });
      this.subscriber = createClient({ url: redisUrl });

      this.publisher.on('error', (error: Error) =>
        this.logger.warn(
          `Notification Redis publisher error: ${error.message}`,
        ),
      );
      this.subscriber.on('error', (error: Error) =>
        this.logger.warn(
          `Notification Redis subscriber error: ${error.message}`,
        ),
      );

      await this.publisher.connect();
      await this.subscriber.connect();

      await this.subscriber.subscribe(this.redisChannel, (message) => {
        try {
          const envelope = JSON.parse(message) as RealtimeEnvelope;
          this.server.to(envelope.room).emit(envelope.event, envelope.payload);
        } catch (error) {
          this.logger.warn(
            `Failed to process notification relay message: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      });

      this.logger.log('Notification realtime relay connected to Redis');
    } catch (error) {
      this.logger.warn(
        `Notification realtime relay is running in local-only mode: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await this.safeQuit(this.publisher);
      await this.safeQuit(this.subscriber);
      this.publisher = null;
      this.subscriber = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.safeQuit(this.subscriber);
    await this.safeQuit(this.publisher);
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token = this.extractToken(client);

      if (!token) {
        client.emit('notification:error', {
          message: 'Authentication token is missing',
        });
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify<NotificationSocketPayload>(token);

      if (
        payload.type !== 'access' ||
        payload.scope !== 'company' ||
        !payload.companyId ||
        !payload.membershipId
      ) {
        client.emit('notification:error', {
          message: 'Invalid company notification token',
        });
        client.disconnect();
        return;
      }

      const isBlacklisted = await this.blacklistService.isBlacklisted(token);
      if (isBlacklisted) {
        client.emit('notification:error', {
          message: 'Token has been revoked',
        });
        client.disconnect();
        return;
      }

      const user = await this.usersService
        .findById(payload.sub)
        .catch(() => null);

      if (!user || user.status !== 'active') {
        client.emit('notification:error', {
          message: 'User account is inactive',
        });
        client.disconnect();
        return;
      }

      if (
        typeof payload.tokenVersion !== 'number' ||
        payload.tokenVersion !== (user.auth_token_version ?? 0)
      ) {
        client.emit('notification:error', {
          message: 'Session has been revoked',
        });
        client.disconnect();
        return;
      }

      if (
        payload.iat &&
        user.auth_token_invalid_before &&
        payload.iat <=
          Math.floor(user.auth_token_invalid_before.getTime() / 1000)
      ) {
        client.emit('notification:error', {
          message: 'Session has been revoked',
        });
        client.disconnect();
        return;
      }

      const membership = await this.companyUserRepository.findOne({
        where: {
          id: payload.membershipId,
          company_id: payload.companyId,
          status: 'active',
        },
        relations: {
          user: true,
          role_assignments: { role: true },
          branch_accesses: true,
          employee: true,
        },
      });

      if (!membership) {
        client.emit('notification:error', {
          message: 'Company membership not found',
        });
        client.disconnect();
        return;
      }

      (client.data as Record<string, unknown>).user = {
        user_id: payload.sub,
        company_id: payload.companyId,
        company_membership_id: payload.membershipId,
        email: payload.email,
      };

      const rooms = this.getMembershipRooms(membership);
      for (const room of rooms) {
        void client.join(room);
      }

      this.logger.log(
        `Notification socket connected: companyUser=${payload.membershipId}, socket=${client.id}`,
      );

      client.emit('notification:connected', {
        message: 'Connected to HRMS notification service',
        socket_id: client.id,
        company_id: payload.companyId,
        company_membership_id: payload.membershipId,
        rooms,
      });
    } catch (error) {
      this.logger.warn(
        `Notification socket rejected: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      client.emit('notification:error', {
        message: 'Notification socket authentication failed',
      });

      client.disconnect();
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Notification socket disconnected: ${client.id}`);
  }

  emitToCompanyUser(
    companyUserId: number,
    payload: Record<string, unknown>,
  ): void {
    void this.dispatchToRoom(
      this.companyUserRoom(companyUserId),
      'notification:new',
      payload,
    );
  }

  emitUnreadCount(companyUserId: number, unreadCount: number): void {
    void this.dispatchToRoom(
      this.companyUserRoom(companyUserId),
      'notification:counter',
      {
        unread_count: unreadCount,
      },
    );
  }

  emitNotificationUpdate(
    companyUserId: number,
    payload: Record<string, unknown>,
  ): void {
    void this.dispatchToRoom(
      this.companyUserRoom(companyUserId),
      'notification:updated',
      payload,
    );
  }

  emitNotificationBulkUpdate(
    companyUserId: number,
    payload: Record<string, unknown>,
  ): void {
    void this.dispatchToRoom(
      this.companyUserRoom(companyUserId),
      'notification:bulk-updated',
      payload,
    );
  }

  emitToCompany(companyId: number, payload: Record<string, unknown>): void {
    void this.dispatchToRoom(
      this.companyRoom(companyId),
      'notification:new',
      payload,
    );
  }

  private getMembershipRooms(membership: CompanyUser): string[] {
    const rooms = new Set<string>([
      this.companyRoom(membership.company_id),
      this.companyUserRoom(membership.id),
    ]);

    membership.role_assignments?.forEach((assignment) => {
      if (assignment.role?.name) {
        rooms.add(this.roleRoom(membership.company_id, assignment.role.name));
      }
    });

    membership.branch_accesses?.forEach((access) => {
      rooms.add(this.branchRoom(membership.company_id, access.branch_id));
    });

    if (membership.employee?.primary_branch_id) {
      rooms.add(
        this.branchRoom(
          membership.company_id,
          membership.employee.primary_branch_id,
        ),
      );
    }

    if (membership.employee?.primary_department_id) {
      rooms.add(
        this.departmentRoom(
          membership.company_id,
          membership.employee.primary_department_id,
        ),
      );
    }

    return [...rooms];
  }

  private companyRoom(companyId: number): string {
    return `company:${companyId}`;
  }

  private companyUserRoom(companyUserId: number): string {
    return `company-user:${companyUserId}`;
  }

  private roleRoom(companyId: number, roleName: string): string {
    return `company:${companyId}:role:${roleName}`;
  }

  private branchRoom(companyId: number, branchId: number): string {
    return `company:${companyId}:branch:${branchId}`;
  }

  private departmentRoom(companyId: number, departmentId: number): string {
    return `company:${companyId}:department:${departmentId}`;
  }

  private async dispatchToRoom(
    room: string,
    event: string,
    payload: Record<string, unknown>,
  ) {
    const envelope: RealtimeEnvelope = { room, event, payload };

    if (this.publisher && this.subscriber) {
      await this.publisher.publish(this.redisChannel, JSON.stringify(envelope));
      return;
    }

    this.server.to(room).emit(event, payload);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token as unknown;

    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const authorization = client.handshake.headers.authorization;

    if (
      typeof authorization === 'string' &&
      authorization.toLowerCase().startsWith('bearer ')
    ) {
      return authorization.slice(7).trim();
    }

    return null;
  }

  private async safeQuit(client: RedisClientType | null) {
    if (!client) {
      return;
    }

    try {
      await client.quit();
    } catch {
      try {
        client.destroy();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}
