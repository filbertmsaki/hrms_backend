// src/modules/hr/attendance/geofences/attendance-geofences.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceGeofenceRepository } from './repositories/attendance-geofence.repository';
import { CreateAttendanceGeofenceDto } from './dtos/create-attendance-geofence.dto';
import { UpdateAttendanceGeofenceDto } from './dtos/update-attendance-geofence.dto';
import { AttendanceGeofenceQueryDto } from './dtos/attendance-geofence-query.dto';
import { AttendanceGeofenceStatusEnum } from './enums/attendance-geofence-status.enum';
import { AttendanceGeofenceTypeEnum } from './enums/attendance-geofence-type.enum';
import { GeofenceDistanceService } from './geofence-distance.service';

@Injectable()
export class AttendanceGeofencesService {
  constructor(
    private readonly geofenceRepo: AttendanceGeofenceRepository,
    private readonly distanceService: GeofenceDistanceService,
  ) {}

  async create(companyId: number, dto: CreateAttendanceGeofenceDto) {
    await this.validateName(companyId, dto.name);

    this.validateGeofencePayload(dto);

    const geofence = this.geofenceRepo.createEntity({
      companyId,
      branchId: dto.branchId ?? null,
      name: dto.name.trim(),
      description: dto.description ?? null,
      type: dto.type ?? AttendanceGeofenceTypeEnum.CIRCLE,
      latitude: String(dto.latitude),
      longitude: String(dto.longitude),
      radiusMeters: dto.radiusMeters,
      allowedAccuracyMeters: dto.allowedAccuracyMeters ?? 50,
      strictAccuracy: dto.strictAccuracy ?? false,
      polygonCoordinates: dto.polygonCoordinates ?? null,
      status: dto.status ?? AttendanceGeofenceStatusEnum.ACTIVE,
    });

    return this.geofenceRepo.save(geofence);
  }

  async findAll(companyId: number, query: AttendanceGeofenceQueryDto) {
    return this.geofenceRepo.findPaginated(companyId, query);
  }

  async findOne(companyId: number, id: number) {
    const geofence = await this.geofenceRepo.findOneById(companyId, id);

    if (!geofence) {
      throw new NotFoundException('Attendance geofence not found.');
    }

    return geofence;
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateAttendanceGeofenceDto,
  ) {
    const geofence = await this.findOne(companyId, id);

    if (dto.name && dto.name !== geofence.name) {
      await this.validateName(companyId, dto.name, id);
      geofence.name = dto.name.trim();
    }

    const nextPayload = {
      type: dto.type ?? geofence.type,
      latitude:
        dto.latitude !== undefined ? dto.latitude : Number(geofence.latitude),
      longitude:
        dto.longitude !== undefined
          ? dto.longitude
          : Number(geofence.longitude),
      radiusMeters: dto.radiusMeters ?? geofence.radiusMeters,
      polygonCoordinates: dto.polygonCoordinates ?? geofence.polygonCoordinates,
    };

    this.validateGeofencePayload(nextPayload);

    if (dto.branchId !== undefined) {
      geofence.branchId = dto.branchId;
    }

    if (dto.description !== undefined) {
      geofence.description = dto.description;
    }

    if (dto.type !== undefined) {
      geofence.type = dto.type;
    }

    if (dto.latitude !== undefined) {
      geofence.latitude = String(dto.latitude);
    }

    if (dto.longitude !== undefined) {
      geofence.longitude = String(dto.longitude);
    }

    if (dto.radiusMeters !== undefined) {
      geofence.radiusMeters = dto.radiusMeters;
    }

    if (dto.allowedAccuracyMeters !== undefined) {
      geofence.allowedAccuracyMeters = dto.allowedAccuracyMeters;
    }

    if (dto.strictAccuracy !== undefined) {
      geofence.strictAccuracy = dto.strictAccuracy;
    }

    if (dto.polygonCoordinates !== undefined) {
      geofence.polygonCoordinates = dto.polygonCoordinates;
    }

    if (dto.status !== undefined) {
      geofence.status = dto.status;
    }

    return this.geofenceRepo.save(geofence);
  }

  async activate(companyId: number, id: number) {
    const geofence = await this.findOne(companyId, id);

    geofence.status = AttendanceGeofenceStatusEnum.ACTIVE;

    return this.geofenceRepo.save(geofence);
  }

  async deactivate(companyId: number, id: number) {
    const geofence = await this.findOne(companyId, id);

    geofence.status = AttendanceGeofenceStatusEnum.INACTIVE;

    return this.geofenceRepo.save(geofence);
  }

  async remove(companyId: number, id: number) {
    await this.findOne(companyId, id);

    await this.geofenceRepo.softDelete(id);

    return {
      message: 'Attendance geofence deleted successfully.',
    };
  }

  async validateLocation(
    companyId: number,
    id: number,
    params: {
      latitude: number;
      longitude: number;
      accuracyMeters?: number;
    },
  ) {
    const geofence = await this.findOne(companyId, id);

    if (geofence.status !== AttendanceGeofenceStatusEnum.ACTIVE) {
      throw new BadRequestException('Attendance geofence is inactive.');
    }

    if (geofence.type !== AttendanceGeofenceTypeEnum.CIRCLE) {
      throw new BadRequestException(
        'Only circle geofence validation is currently supported.',
      );
    }

    return this.distanceService.validateCircleGeofence({
      officeLatitude: Number(geofence.latitude),
      officeLongitude: Number(geofence.longitude),
      userLatitude: params.latitude,
      userLongitude: params.longitude,
      radiusMeters: geofence.radiusMeters,
      accuracyMeters: params.accuracyMeters,
      allowedAccuracyMeters: geofence.allowedAccuracyMeters,
      strictAccuracy: geofence.strictAccuracy,
    });
  }

  private async validateName(
    companyId: number,
    name: string,
    excludeId?: number,
  ) {
    const exists = await this.geofenceRepo.existsByName(
      companyId,
      name,
      excludeId,
    );

    if (exists) {
      throw new BadRequestException(
        'Attendance geofence name already exists for this company.',
      );
    }
  }

  private validateGeofencePayload(payload: {
    type?: AttendanceGeofenceTypeEnum;
    latitude?: number;
    longitude?: number;
    radiusMeters?: number;
    polygonCoordinates?: Array<{ latitude: number; longitude: number }> | null;
  }) {
    const type = payload.type ?? AttendanceGeofenceTypeEnum.CIRCLE;
    
    if (type === AttendanceGeofenceTypeEnum.CIRCLE) {
      if (payload.latitude === undefined || payload.longitude === undefined) {
        throw new BadRequestException(
          'Latitude and longitude are required for circle geofence.',
        );
      }

      if (!payload.radiusMeters || payload.radiusMeters < 5) {
        throw new BadRequestException(
          'Radius meters must be at least 5 meters.',
        );
      }
    }

    if (type === AttendanceGeofenceTypeEnum.POLYGON) {
      if (
        !payload.polygonCoordinates ||
        payload.polygonCoordinates.length < 3
      ) {
        throw new BadRequestException(
          'Polygon geofence requires at least 3 coordinate points.',
        );
      }
    }
  }
}
