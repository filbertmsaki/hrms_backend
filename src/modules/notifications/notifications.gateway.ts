import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { InjectRepository } from '@nestjs/typeorm';
import { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import { CompanyUser } from '../companies/entities/company-user.entity';

type NotificationSocketPayload = {
  sub: number;
  email: string;
  type: string;
  scope: 'platform' | 'company';
  companyId?: number;
  membershipId?: number;
};

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
  ) {}

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

      const membership = await this.companyUserRepository.findOne({
        where: {
          id: payload.membershipId,
          company_id: payload.companyId,
          status: 'active',
        },
        relations: {
          user: true,
        },
      });

      if (!membership) {
        client.emit('notification:error', {
          message: 'Company membership not found',
        });
        client.disconnect();
        return;
      }

      client.data.user = {
        user_id: payload.sub,
        company_id: payload.companyId,
        company_membership_id: payload.membershipId,
        email: payload.email,
      };

      client.join(`company:${payload.companyId}`);
      client.join(`company-user:${payload.membershipId}`);

      this.logger.log(
        `Notification socket connected: companyUser=${payload.membershipId}, socket=${client.id}`,
      );

      client.emit('notification:connected', {
        message: 'Connected to HRMS notification service',
        socket_id: client.id,
        company_id: payload.companyId,
        company_membership_id: payload.membershipId,
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
    this.server
      .to(`company-user:${companyUserId}`)
      .emit('notification:new', payload);
  }

  emitToCompany(companyId: number, payload: Record<string, unknown>): void {
    this.server.to(`company:${companyId}`).emit('notification:new', payload);
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;

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
}
