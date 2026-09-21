import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Department } from '../../departments/entities/department.entity';
import { Employee } from '../../employees/entities/employee.entity';
import { HrAccessService } from '../../shared/hr-access.service';
import { PerformanceReview } from '../entities/performance-review.entity';
import { PerformanceReviewStatusEnum } from '../enums/performance-review-status.enum';

@Injectable()
export class PerformanceCalibrationService {
  constructor(
    private readonly hrAccessService: HrAccessService,
    @InjectRepository(PerformanceReview)
    private readonly reviewRepository: Repository<PerformanceReview>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  async departmentSummary(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const [reviews, employees, departments] = await Promise.all([
      this.reviewRepository.find({ where: { companyId } }),
      this.employeeRepository.find({ where: { company_id: companyId } }),
      this.departmentRepository.find({ where: { company_id: companyId } }),
    ]);
    const employeeDepartment = new Map(
      employees.map((employee) => [
        employee.id,
        employee.primary_department_id,
      ]),
    );
    const departmentName = new Map(
      departments.map((department) => [department.id, department.name]),
    );
    const grouped = new Map<
      number,
      { scores: number[]; published: number; pending: number }
    >();

    for (const review of reviews) {
      const departmentId = employeeDepartment.get(review.employeeId) ?? 0;
      const current = grouped.get(departmentId) ?? {
        scores: [],
        published: 0,
        pending: 0,
      };
      if (review.finalScore !== null)
        current.scores.push(Number(review.finalScore));
      if (review.status === PerformanceReviewStatusEnum.PUBLISHED)
        current.published += 1;
      if (
        ![
          PerformanceReviewStatusEnum.PUBLISHED,
          PerformanceReviewStatusEnum.APPROVED,
          PerformanceReviewStatusEnum.LOCKED,
        ].includes(review.status)
      ) {
        current.pending += 1;
      }
      grouped.set(departmentId, current);
    }

    return Array.from(grouped.entries()).map(([departmentId, value]) => ({
      department_id: departmentId || null,
      department_name: departmentName.get(departmentId) ?? 'Unassigned',
      review_count: value.scores.length + value.pending,
      published_reviews: value.published,
      pending_reviews: value.pending,
      average_score: value.scores.length
        ? Number(
            (
              value.scores.reduce((sum, score) => sum + score, 0) /
              value.scores.length
            ).toFixed(2),
          )
        : null,
      minimum_score: value.scores.length ? Math.min(...value.scores) : null,
      maximum_score: value.scores.length ? Math.max(...value.scores) : null,
    }));
  }

  async comparison(actor: AuthenticatedUser) {
    const companyId = this.hrAccessService.ensureActorCompanyId(actor);
    const [reviews, employees, departments] = await Promise.all([
      this.reviewRepository.find({
        where: { companyId },
        order: { finalScore: 'DESC', id: 'DESC' },
      }),
      this.employeeRepository.find({ where: { company_id: companyId } }),
      this.departmentRepository.find({ where: { company_id: companyId } }),
    ]);
    const employeeMap = new Map(
      employees.map((employee) => [employee.id, employee]),
    );
    const departmentName = new Map(
      departments.map((department) => [department.id, department.name]),
    );

    return reviews.map((review) => {
      const employee = employeeMap.get(review.employeeId);
      return {
        review_id: review.id,
        employee_id: review.employeeId,
        employee_name: employee
          ? `${employee.first_name} ${employee.last_name}`.trim()
          : `Employee #${review.employeeId}`,
        department_id: employee?.primary_department_id ?? null,
        department_name:
          departmentName.get(employee?.primary_department_id ?? 0) ??
          'Unassigned',
        status: review.status,
        final_score: review.finalScore,
        rating_code: review.ratingCode,
        moderation_snapshot: review.moderationSnapshot,
      };
    });
  }
}
