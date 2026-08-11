import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { HrAccessService } from '../../shared/hr-access.service';
import { CreatePerformanceRatingScaleDto } from '../dto/create-performance-rating-scale.dto';
import { PerformanceRatingScale } from '../entities/performance-rating-scale.entity';

@Injectable()
export class PerformanceRatingScaleService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PerformanceRatingScale)
    private readonly ratingScaleRepository: Repository<PerformanceRatingScale>,
  ) {}

  async create(
    actor: AuthenticatedUser,
    dto: CreatePerformanceRatingScaleDto,
  ): Promise<PerformanceRatingScale> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);

    if ((dto.minimum_score ?? 0) >= (dto.maximum_score ?? 100)) {
      throw new BadRequestException(
        'Rating scale minimum score must be lower than the maximum score.',
      );
    }

    return this.ratingScaleRepository.save(
      this.ratingScaleRepository.create({
        companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        minimumScore: String(dto.minimum_score ?? 0),
        maximumScore: String(dto.maximum_score ?? 100),
        isDefault: dto.is_default ?? false,
        status: 'ACTIVE',
        bands: dto.bands.map((band, index) => ({
          code: band.code.trim().toUpperCase(),
          label: band.label.trim(),
          minimumScore: String(band.minimum_score),
          maximumScore: String(band.maximum_score),
          displayOrder: band.display_order ?? index,
          requiresImprovementPlan: band.requires_improvement_plan ?? false,
        })),
      }),
    );
  }

  async list(actor: AuthenticatedUser): Promise<PerformanceRatingScale[]> {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    return this.ratingScaleRepository.find({
      where: { companyId },
      relations: { bands: true },
      order: { id: 'DESC', bands: { displayOrder: 'ASC', id: 'ASC' } },
    });
  }
}
