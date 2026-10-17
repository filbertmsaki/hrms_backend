import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
} from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Request, Response } from 'express';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

const ANONYMOUS_ID_COOKIE = 'hrms_throttle_id';
const ANONYMOUS_ID_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type ThrottleRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class UserAwareThrottlerGuard
  extends ThrottlerGuard
  implements OnModuleInit
{
  constructor(
    @InjectThrottlerOptions()
    options: ConstructorParameters<typeof ThrottlerGuard>[0],
    @InjectThrottlerStorage()
    storageService: ConstructorParameters<typeof ThrottlerGuard>[1],
    reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(req: ThrottleRequest): Promise<string> {
    if (req.user?.id) {
      return Promise.resolve(`user:${req.user.id}`);
    }

    const cookieId = this.readCookie(req);
    if (cookieId) {
      return Promise.resolve(`anonymous:${cookieId}:ip:${req.ip}`);
    }

    const cookieSecret = this.getCookieSecret();
    if (cookieSecret) {
      const id = randomBytes(24).toString('base64url');
      const signature = this.sign(id, cookieSecret);
      const response = req.res as Response | undefined;
      response?.cookie(ANONYMOUS_ID_COOKIE, `${id}.${signature}`, {
        httpOnly: true,
        secure: this.configService.get<string>('APP_ENV') === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: ANONYMOUS_ID_MAX_AGE_SECONDS * 1000,
      });
      return Promise.resolve(`anonymous:${id}:ip:${req.ip}`);
    }

    // Keep a safe fallback when deployments have not configured a signing secret.
    return Promise.resolve(`ip:${req.ip}`);
  }

  private readCookie(req: Request): string | undefined {
    const secret = this.getCookieSecret();
    if (!secret) return undefined;

    const rawCookie = req.headers.cookie;
    if (!rawCookie) return undefined;

    const value = rawCookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ANONYMOUS_ID_COOKIE}=`))
      ?.slice(ANONYMOUS_ID_COOKIE.length + 1);
    if (!value) return undefined;

    const [id, signature, ...extra] = decodeURIComponent(value).split('.');
    if (!id || !signature || extra.length || !/^[A-Za-z0-9_-]{32}$/.test(id)) {
      return undefined;
    }

    const expected = Buffer.from(this.sign(id, secret));
    const actual = Buffer.from(signature);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      return undefined;
    }

    return id;
  }

  private getCookieSecret(): string | undefined {
    return (
      this.configService.get<string>('THROTTLER_COOKIE_SECRET') ??
      this.configService.get<string>('JWT_ACCESS_SECRET')
    );
  }

  private sign(id: string, secret: string): string {
    return createHmac('sha256', secret).update(id).digest('base64url');
  }
}
