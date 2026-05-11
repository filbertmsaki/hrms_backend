import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verify } from 'otplib';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import { UsersService } from '../../users/users.service';

@Injectable()
export class TwoFaService {
  constructor(
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  private normalizeCode(code: string): string {
    return code.replace(/[\s-]/g, '').toUpperCase();
  }

  private formatBackupCodes(codes: string[]): string[] {
    return codes.map((code) => code.match(/.{1,5}/g)?.join('-') ?? code);
  }

  async generate2FASetup(userId: number) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    if (user.is_two_factor_enabled) {
      throw new BadRequestException('2FA is already enabled for this account');
    }

    const secret = generateSecret({ length: 32 });
    const serviceName = this.configService.get('APP_NAME') || 'YourApp';
    const otpAuthUrl = generateURI({
      issuer: serviceName,
      label: user.email,
      secret,
    });

    const qrCode = await qrcode.toDataURL(otpAuthUrl);

    await this.usersService.update2FASecret(userId, secret);

    return {
      secret,
      qrCode,
      otpAuthUrl,
    };
  }

  async verifyAndActivate2FA(userId: number, token: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new BadRequestException('User not found');

    if (!user.two_factor_secret) {
      throw new BadRequestException('No 2FA setup in progress');
    }

    const normalizedToken = this.normalizeCode(token);
    const result = await verify({
      secret: user.two_factor_secret,
      token: normalizedToken,
    });

    if (!result.valid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    const backupCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );

    const hashed = backupCodes.map((code) =>
      crypto.createHash('sha256').update(code).digest('hex'),
    );

    await this.usersService.activate2FA(userId, user.two_factor_secret, hashed);

    const formattedBackupCodes = this.formatBackupCodes(backupCodes);

    return {
      message: '2FA successfully enabled!',
      backupCodes: formattedBackupCodes,
      note: 'Store these codes securely. Each is single-use. You can regenerate them later if needed.',
    };
  }

  /**
   * Verify 2FA code during login (TOTP or backup code)
   */
  async verify2FALogin(userId: number, token: string): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    if (!user || !user.is_two_factor_enabled || !user.two_factor_secret) {
      throw new BadRequestException('2FA is not enabled for this user');
    }

    const normalizedToken = this.normalizeCode(token);

    const totpResult = await verify({
      secret: user.two_factor_secret,
      token: normalizedToken,
    });
    if (totpResult.valid) return true;

    if (user.two_factor_backup_codes?.length) {
      const hashedToken = crypto
        .createHash('sha256')
        .update(normalizedToken)
        .digest('hex');
      const index = user.two_factor_backup_codes.indexOf(hashedToken);

      if (index !== -1) {
        user.two_factor_backup_codes.splice(index, 1);
        await this.usersService.updateBackupCodes(
          userId,
          user.two_factor_backup_codes,
        );
        return true;
      }
    }

    throw new UnauthorizedException('Invalid 2FA code');
  }

  async disable2FA(userId: number, token: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.is_two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const isValid = await this.verify2FALogin(userId, token);
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.usersService.disable2FA(userId);

    return { message: '2FA successfully disabled' };
  }

  async is2FARequired(userId: number): Promise<boolean> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return user.is_two_factor_enabled ?? false;
  }

  async regenerateBackupCodes(
    userId: number,
    token: string,
  ): Promise<{ backupCodes: string[]; message: string }> {
    const user = await this.usersService.findById(userId);
    if (!user?.is_two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    const valid = await this.verify2FALogin(userId, token);
    if (!valid) throw new UnauthorizedException('Invalid code');

    const newCodes = Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );

    const hashed = newCodes.map((c) =>
      crypto.createHash('sha256').update(c).digest('hex'),
    );

    await this.usersService.updateBackupCodes(userId, hashed);

    const formatted = this.formatBackupCodes(newCodes);

    return {
      backupCodes: formatted,
      message: 'New backup codes generated. Old ones are invalidated.',
    };
  }
}
