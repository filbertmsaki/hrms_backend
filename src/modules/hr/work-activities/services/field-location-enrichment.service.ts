import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FieldVisitLocationEvent } from '../entities/field-visit.entities';

@Injectable()
export class FieldLocationEnrichmentService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(FieldVisitLocationEvent)
    private readonly repository: Repository<FieldVisitLocationEvent>,
  ) {}

  @Cron('0 */10 * * * *')
  async processPendingAddresses() {
    const events = await this.repository.find({
      where: { addressStatus: 'PENDING' },
      order: { capturedAt: 'ASC', id: 'ASC' },
      take: 100,
    });

    if (!events.length) {
      return 0;
    }

    const reverseGeocodingEnabled = this.configService.get<boolean>(
      'FIELD_VISIT_REVERSE_GEOCODING_ENABLED',
      false,
    );
    const defaultStatus = reverseGeocodingEnabled ? 'UNAVAILABLE' : 'SKIPPED';

    for (const event of events) {
      event.addressStatus = defaultStatus;
      if (!event.locationValidationResult || Array.isArray(event.locationValidationResult)) {
        event.locationValidationResult = {};
      }
      event.locationValidationResult = {
        ...event.locationValidationResult,
        reverse_geocoding: {
          enabled: reverseGeocodingEnabled,
          processed_at: new Date().toISOString(),
          status: defaultStatus,
        },
      };
      await this.repository.save(event);
    }

    return events.length;
  }
}
