import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldVisitLocationEvent } from '../entities/field-visit.entities';

@Injectable()
export class FieldLocationRetentionService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(FieldVisitLocationEvent)
    private readonly repository: Repository<FieldVisitLocationEvent>,
  ) {}

  @Cron('0 0 3 * * *')
  async processRetention() {
    const retentionDays = this.configService.get<number>(
      'FIELD_LOCATION_RETENTION_DAYS',
      730,
    );
    const anonymize = this.configService.get<boolean>(
      'FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION',
      true,
    );

    if (!anonymize) {
      return 0;
    }

    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await this.repository
      .createQueryBuilder()
      .update(FieldVisitLocationEvent)
      .set({
        latitude: null,
        longitude: null,
        address: null,
        deviceInfo: null,
        locationValidationResult: {
          anonymized: true,
          anonymized_at: new Date().toISOString(),
        },
      })
      .where('captured_at < :cutoff', { cutoff })
      .andWhere('legal_hold = false')
      .execute();

    return result.affected ?? 0;
  }
}
