import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { FieldParty } from '../entities/activity-config.entities';

@Injectable()
export class FieldPartyService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(FieldParty)
    private readonly repository: Repository<FieldParty>,
  ) {}

  private getCompanyId(actor: AuthenticatedUser) {
    return this.hrAccessService.ensureActorCompanyId(actor);
  }

  private toText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      return value;
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }

    return fallback;
  }

  async create(actor: AuthenticatedUser, dto: Record<string, unknown>) {
    const companyId = this.getCompanyId(actor);
    const party = this.repository.create({
      companyId,
      partyType: this.toText(dto.party_type),
      name: this.toText(dto.name).trim(),
      contactPerson: (dto.contact_person as string | undefined)?.trim() ?? null,
      phone: (dto.phone as string | undefined)?.trim() ?? null,
      email: (dto.email as string | undefined)?.trim() ?? null,
      address: (dto.address as string | undefined)?.trim() ?? null,
      latitude:
        dto.latitude !== undefined ? String(Number(dto.latitude)) : null,
      longitude:
        dto.longitude !== undefined ? String(Number(dto.longitude)) : null,
      locationRadiusMeters:
        dto.location_radius_meters !== undefined
          ? Number(dto.location_radius_meters)
          : null,
      sourceSystem: (dto.source_system as string | undefined)?.trim() ?? null,
      externalReference:
        (dto.external_reference as string | undefined)?.trim() ?? null,
      externalSnapshot:
        (dto.external_snapshot as Record<string, unknown> | undefined) ?? null,
      status: 'ACTIVE',
    });

    return this.repository.save(party);
  }

  async list(actor: AuthenticatedUser) {
    return this.repository.find({
      where: { companyId: this.getCompanyId(actor) },
      order: { name: 'ASC' },
    });
  }

  async get(actor: AuthenticatedUser, id: number) {
    const party = await this.repository.findOne({
      where: { id, companyId: this.getCompanyId(actor) },
    });
    if (!party) {
      throw new NotFoundException('Field party not found.');
    }
    return party;
  }

  async update(
    actor: AuthenticatedUser,
    id: number,
    dto: Record<string, unknown>,
  ) {
    const party = await this.get(actor, id);
    if (dto.party_type !== undefined) {
      party.partyType = this.toText(dto.party_type);
    }
    if (dto.name !== undefined) {
      party.name = this.toText(dto.name).trim();
    }
    if (dto.contact_person !== undefined) {
      party.contactPerson =
        (dto.contact_person as string | null)?.trim() ?? null;
    }
    if (dto.phone !== undefined)
      party.phone = (dto.phone as string | null)?.trim() ?? null;
    if (dto.email !== undefined)
      party.email = (dto.email as string | null)?.trim() ?? null;
    if (dto.address !== undefined) {
      party.address = (dto.address as string | null)?.trim() ?? null;
    }
    if (dto.latitude !== undefined) {
      party.latitude =
        dto.latitude === null ? null : String(Number(dto.latitude));
    }
    if (dto.longitude !== undefined) {
      party.longitude =
        dto.longitude === null ? null : String(Number(dto.longitude));
    }
    if (dto.location_radius_meters !== undefined) {
      party.locationRadiusMeters =
        dto.location_radius_meters === null
          ? null
          : Number(dto.location_radius_meters);
    }
    if (dto.source_system !== undefined) {
      party.sourceSystem = (dto.source_system as string | null)?.trim() ?? null;
    }
    if (dto.external_reference !== undefined) {
      party.externalReference =
        (dto.external_reference as string | null)?.trim() ?? null;
    }
    if (dto.external_snapshot !== undefined) {
      party.externalSnapshot =
        (dto.external_snapshot as Record<string, unknown> | null) ?? null;
    }
    return this.repository.save(party);
  }
}
