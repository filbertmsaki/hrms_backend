import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  LocationPrivacyAcknowledgement,
  LocationPrivacyNotice,
} from './entities/location-privacy.entities';
import { LocationPrivacyController } from './location-privacy.controller';
import { LocationPrivacyService } from './location-privacy.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LocationPrivacyNotice,
      LocationPrivacyAcknowledgement,
    ]),
  ],
  controllers: [LocationPrivacyController],
  providers: [LocationPrivacyService],
  exports: [LocationPrivacyService],
})
export class LocationPrivacyModule {}
