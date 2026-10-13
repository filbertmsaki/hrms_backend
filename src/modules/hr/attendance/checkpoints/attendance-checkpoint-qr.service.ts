import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';
import QRCode from 'qrcode';
import { Repository } from 'typeorm';
import { AttendanceCheckpoint } from './entities/attendance-checkpoint.entity';
import { AttendanceCheckpointQrTokenUse } from './entities/attendance-checkpoint-qr-token-use.entity';
import { AttendanceCheckpointTypeEnum } from './enums/attendance-checkpoint-type.enum';
import { AttendanceCheckpointStatusEnum } from './enums/attendance-checkpoint-status.enum';

type QrTokenPayload = {
  version: 1;
  companyId: number;
  checkpointId: number;
  policySetId: number;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
};

@Injectable()
export class AttendanceCheckpointQrService {
  constructor(
    @InjectRepository(AttendanceCheckpointQrTokenUse)
    private readonly tokenUseRepository: Repository<AttendanceCheckpointQrTokenUse>,
    @InjectRepository(AttendanceCheckpoint)
    private readonly checkpointRepository: Repository<AttendanceCheckpoint>,
    private readonly configService: ConfigService,
  ) {}

  async issueToken(params: {
    companyId: number;
    checkpointId: number;
    validForSeconds?: number;
  }) {
    const checkpoint = await this.checkpointRepository.findOne({
      where: { id: params.checkpointId },
      relations: { policySet: true },
    });
    if (
      !checkpoint ||
      checkpoint.policySet?.company_id !== params.companyId ||
      checkpoint.type !== AttendanceCheckpointTypeEnum.QR ||
      checkpoint.status !== AttendanceCheckpointStatusEnum.ACTIVE
    ) {
      throw new BadRequestException('Active QR checkpoint not found.');
    }

    const now = Math.floor(Date.now() / 1000);
    const validForSeconds = Math.min(
      300,
      Math.max(15, params.validForSeconds ?? 60),
    );
    const payload: QrTokenPayload = {
      version: 1,
      companyId: params.companyId,
      checkpointId: checkpoint.id,
      policySetId: checkpoint.policySetId,
      issuedAt: now,
      expiresAt: now + validForSeconds,
      nonce: randomUUID(),
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );

    const token = `${encodedPayload}.${this.sign(encodedPayload).toString('base64url')}`;
    return {
      token,
      qr_image_data_url: await QRCode.toDataURL(token, {
        errorCorrectionLevel: 'M',
        margin: 2,
        width: 320,
      }),
      checkpoint_id: checkpoint.id,
      expires_at: new Date(payload.expiresAt * 1000).toISOString(),
      valid_for_seconds: validForSeconds,
    };
  }

  async validateAndConsume(params: {
    companyId: number;
    employeeId: number;
    policySetId: number;
    requiredCheckpoints: AttendanceCheckpoint[];
    token?: string | null;
  }) {
    const qrCheckpoints = params.requiredCheckpoints.filter(
      (checkpoint) => checkpoint.type === AttendanceCheckpointTypeEnum.QR,
    );
    if (!qrCheckpoints.length) {
      return {
        required: false,
        valid: true,
        checkpointId: null as number | null,
      };
    }
    if (!params.token?.trim()) {
      throw new BadRequestException('A valid QR checkpoint token is required.');
    }

    const [encodedPayload, encodedSignature, extra] = params.token.split('.');
    if (!encodedPayload || !encodedSignature || extra !== undefined) {
      throw new BadRequestException('QR checkpoint token is invalid.');
    }
    const providedSignature = Buffer.from(encodedSignature, 'base64url');
    const expectedSignature = this.sign(encodedPayload);
    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      throw new BadRequestException('QR checkpoint token is invalid.');
    }

    let payload: QrTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as QrTokenPayload;
    } catch {
      throw new BadRequestException('QR checkpoint token is invalid.');
    }

    const now = Math.floor(Date.now() / 1000);
    const checkpoint = qrCheckpoints.find(
      (item) => item.id === payload.checkpointId,
    );
    if (
      payload.version !== 1 ||
      payload.companyId !== params.companyId ||
      payload.policySetId !== params.policySetId ||
      !checkpoint ||
      payload.issuedAt > now + 30 ||
      payload.expiresAt <= now ||
      payload.expiresAt <= payload.issuedAt ||
      payload.expiresAt - payload.issuedAt > 300 ||
      typeof payload.nonce !== 'string' ||
      payload.nonce.length < 16
    ) {
      throw new BadRequestException(
        'QR checkpoint token is expired or invalid.',
      );
    }

    const tokenNonceHash = createHash('sha256')
      .update(payload.nonce)
      .digest('hex');
    await this.tokenUseRepository
      .createQueryBuilder()
      .delete()
      .where('expires_at < :retentionDate', {
        retentionDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      })
      .execute();

    try {
      await this.tokenUseRepository.insert({
        companyId: params.companyId,
        checkpointId: checkpoint.id,
        employeeId: params.employeeId,
        tokenNonceHash,
        expiresAt: new Date(payload.expiresAt * 1000),
      });
    } catch (error) {
      if (
        (error as { code?: string }).code === '23505' ||
        (error as { code?: string }).code === 'SQLITE_CONSTRAINT'
      ) {
        throw new ConflictException('This QR code has already been used.');
      }
      throw error;
    }

    return {
      required: true,
      valid: true,
      checkpointId: checkpoint.id,
    };
  }

  private sign(encodedPayload: string) {
    return createHmac('sha256', this.getSigningSecret())
      .update(encodedPayload)
      .digest();
  }

  private getSigningSecret() {
    const secret =
      this.configService.get<string>('ATTENDANCE_DEVICE_SECRET_KEY') ??
      this.configService.get<string>('APP_KEY');
    if (!secret || Buffer.byteLength(secret) < 32) {
      throw new ServiceUnavailableException(
        'A 32-byte attendance QR signing secret must be configured.',
      );
    }
    return secret;
  }
}
