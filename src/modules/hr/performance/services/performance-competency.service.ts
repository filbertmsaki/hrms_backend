import {
  assertWeightTotal,
  assertUniqueValues,
} from '../utils/workflow-validation';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { CreateCompetencyTemplateDto } from '../dto/create-competency-template.dto';
import { CompetencyTemplate } from '../entities/competency-template.entity';
import { PerformanceCompetencyRating } from '../entities/performance-competency-rating.entity';

@Injectable()
export class PerformanceCompetencyService {
  constructor(
    @InjectRepository(CompetencyTemplate)
    private readonly competencyTemplateRepository: Repository<CompetencyTemplate>,
    @InjectRepository(PerformanceCompetencyRating)
    private readonly competencyRatingRepository: Repository<PerformanceCompetencyRating>,
  ) {}

  async createTemplate(
    actor: AuthenticatedUser,
    dto: CreateCompetencyTemplateDto,
  ): Promise<CompetencyTemplate> {
    if (!actor.companyId) {
      throw new BadRequestException('Active company context is required.');
    }

    assertWeightTotal(
      dto.items.map((item) => item.weight),
      'Competency template',
    );
    assertUniqueValues(
      dto.items.map((item) => item.code.trim().toUpperCase()),
      'Competency item codes',
    );

    return this.competencyTemplateRepository.save(
      this.competencyTemplateRepository.create({
        companyId: actor.companyId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim() ?? null,
        status: 'ACTIVE',
        items: dto.items.map((item, index) => ({
          code: item.code.trim().toUpperCase(),
          name: item.name.trim(),
          description: item.description?.trim() ?? null,
          category: item.category,
          weight: String(item.weight),
          maximumRating: String(item.maximum_rating ?? 5),
          sortOrder: index,
        })),
      }),
    );
  }

  async listTemplates(actor: AuthenticatedUser): Promise<CompetencyTemplate[]> {
    if (!actor.companyId) {
      return [];
    }

    return this.competencyTemplateRepository.find({
      where: { companyId: actor.companyId },
      relations: { items: true },
      order: { id: 'DESC', items: { sortOrder: 'ASC', id: 'ASC' } },
    });
  }

  async scoreManagerRatings(
    companyId: number,
    performanceReviewId: number,
    ratings: Array<{
      template_item_code: string;
      rating: number;
      comment?: string;
    }>,
  ): Promise<{
    competencyScore: number;
    scoredItems: PerformanceCompetencyRating[];
  }> {
    const existingRatings = await this.competencyRatingRepository.find({
      where: { companyId, performanceReviewId },
      order: { id: 'ASC' },
    });

    if (existingRatings.length === 0) {
      throw new NotFoundException(
        'No competency ratings were initialized for this performance review.',
      );
    }

    const ratingMap = new Map(
      existingRatings.map((item) => [item.templateItemCode, item]),
    );

    for (const input of ratings) {
      const record = ratingMap.get(
        input.template_item_code.trim().toUpperCase(),
      );
      if (!record) {
        throw new BadRequestException(
          `Competency item ${input.template_item_code} is not assigned to this review.`,
        );
      }

      if (input.rating > Number(record.maximumRating)) {
        throw new BadRequestException(
          `Competency rating for ${record.templateItemCode} cannot exceed ${record.maximumRating}.`,
        );
      }

      record.managerRating = String(input.rating);
      record.managerComment = input.comment?.trim() ?? null;
    }

    await this.competencyRatingRepository.save(existingRatings);

    const competencyScore = existingRatings.reduce((sum, item) => {
      if (item.managerRating === null) {
        return sum;
      }

      return (
        sum +
        (Number(item.managerRating) / Number(item.maximumRating)) *
          Number(item.weight)
      );
    }, 0);

    return {
      competencyScore: Number(competencyScore.toFixed(4)),
      scoredItems: existingRatings,
    };
  }

  async initializeRatingsForReview(
    companyId: number,
    performanceReviewId: number,
    templateId: number,
  ): Promise<PerformanceCompetencyRating[]> {
    const template = await this.competencyTemplateRepository.findOne({
      where: { id: templateId, companyId },
      relations: { items: true },
    });

    if (!template) {
      throw new NotFoundException('Competency template not found.');
    }

    const existing = await this.competencyRatingRepository.find({
      where: { companyId, performanceReviewId },
    });
    if (existing.length > 0) {
      return existing;
    }

    const ratings = template.items.map((item) =>
      this.competencyRatingRepository.create({
        companyId,
        performanceReviewId,
        templateItemCode: item.code,
        templateItemName: item.name,
        category: item.category,
        weight: item.weight,
        maximumRating: item.maximumRating,
      }),
    );

    return this.competencyRatingRepository.save(ratings);
  }
}
