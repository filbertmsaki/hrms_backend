import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../../common/interfaces/authenticated-user.interface';
import { Employee } from '../../employees/entities/employee.entity';
import { EmploymentStatusEnum } from '../../employees/enums/employment-status.enum';
import { HrAccessService } from '../../shared/hr-access.service';
import { buildPaginationMeta } from '../../shared/hr.utils';
import { AttendanceRecalculationJob } from './entities/attendance-recalculation-job.entity';
import { AttendanceBusinessTrip } from './entities/attendance-business-trip.entity';
import { AttendanceProcessingJobStatusEnum } from './enums/attendance-processing-job-status.enum';
import { AttendanceBusinessTripStatusEnum } from './enums/attendance-business-trip-status.enum';
import { CreateAttendanceBusinessTripDto } from './dtos/create-attendance-business-trip.dto';
import { UpdateAttendanceBusinessTripDto } from './dtos/update-attendance-business-trip.dto';
import { QueryAttendanceBusinessTripsDto } from './dtos/query-attendance-business-trips.dto';
import { ReviewAttendanceBusinessTripDto } from './dtos/review-attendance-business-trip.dto';
import { CancelAttendanceBusinessTripDto } from './dtos/cancel-attendance-business-trip.dto';

@Injectable()
export class AttendanceBusinessTripsService {
  constructor(
    @InjectRepository(AttendanceBusinessTrip)
    private readonly businessTripRepository: Repository<AttendanceBusinessTrip>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
    @InjectRepository(AttendanceRecalculationJob)
    private readonly recalculationJobRepository: Repository<AttendanceRecalculationJob>,
    private readonly hrAccessService: HrAccessService,
  ) {}

  private map(item: AttendanceBusinessTrip) {
    return {
      id: item.id,
      company_id: item.companyId,
      employee_id: item.employeeId,
      start_date: item.startDate,
      end_date: item.endDate,
      reason: item.reason,
      status: item.status,
      approved_by_company_user_id: item.approvedByCompanyUserId,
      metadata: item.metadata,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
    };
  }

  private async findEmployeeOrFail(companyId: number, employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository.findOne({
      where: { id: employeeId },
      relations: {
        company_user: true,
        primary_department: true,
        primary_position: true,
      },
    });

    if (!employee || employee.company_user.company_id !== companyId) {
      throw new NotFoundException('Employee not found');
    }

    return employee;
  }

  private assertDateOrder(startDate: string, endDate: string): void {
    if (new Date(startDate) > new Date(endDate)) {
      throw new BadRequestException('end_date cannot be before start_date');
    }
  }

  private assertEmployeeEligible(employee: Employee, startDate: string, endDate: string): void {
    if (employee.employment_status !== EmploymentStatusEnum.ACTIVE) {
      throw new BadRequestException('Only active employees can be assigned business trips.');
    }

    if (employee.exit_date && (startDate > employee.exit_date || endDate > employee.exit_date)) {
      throw new BadRequestException('Business trip dates cannot be after the employee exit date.');
    }
  }

  private async ensureNoOverlap(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
    ignoreId?: number,
  ): Promise<void> {
    const qb = this.businessTripRepository
      .createQueryBuilder('trip')
      .where('trip.company_id = :companyId', { companyId })
      .andWhere('trip.employee_id = :employeeId', { employeeId })
      .andWhere('trip.status IN (:...statuses)', {
        statuses: [
          AttendanceBusinessTripStatusEnum.SUBMITTED,
          AttendanceBusinessTripStatusEnum.APPROVED,
        ],
      })
      .andWhere('trip.start_date <= :endDate', { endDate })
      .andWhere('trip.end_date >= :startDate', { startDate });

    if (ignoreId) {
      qb.andWhere('trip.id != :ignoreId', { ignoreId });
    }

    const overlap = await qb.getOne();
    if (overlap) {
      throw new ConflictException(`Business trip overlaps with request ${overlap.id}`);
    }
  }

  private async queueAttendanceRecalculation(
    companyId: number,
    employeeId: number,
    startDate: string,
    endDate: string,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    await this.recalculationJobRepository.save(
      this.recalculationJobRepository.create({
        companyId,
        employeeId,
        dateFrom: startDate,
        dateTo: endDate,
        reason,
        status: AttendanceProcessingJobStatusEnum.PENDING,
        attempts: 0,
        requestedByCompanyUserId: actor.companyMembershipId ?? null,
        metadata: {
          source: 'business_trip',
        },
      }),
    );
  }

  async create(
    companyId: number,
    dto: CreateAttendanceBusinessTripDto,
    actor: AuthenticatedUser,
  ) {
    this.assertDateOrder(dto.start_date, dto.end_date);
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);
    this.assertEmployeeEligible(employee, dto.start_date, dto.end_date);
    await this.ensureNoOverlap(companyId, dto.employee_id, dto.start_date, dto.end_date);

    const status = (dto.submit ?? true)
      ? AttendanceBusinessTripStatusEnum.SUBMITTED
      : AttendanceBusinessTripStatusEnum.DRAFT;

    const created = await this.businessTripRepository.save(
      this.businessTripRepository.create({
        companyId,
        employeeId: dto.employee_id,
        startDate: dto.start_date,
        endDate: dto.end_date,
        reason: dto.reason?.trim() || null,
        status,
        approvedByCompanyUserId: null,
        metadata: dto.metadata ?? null,
      }),
    );

    return this.map(created);
  }

  async findAll(companyId: number, query: QueryAttendanceBusinessTripsDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      employee_id,
      status,
      from_date,
      to_date,
    } = query;

    const qb = this.businessTripRepository
      .createQueryBuilder('trip')
      .where('trip.company_id = :companyId', { companyId });

    if (employee_id) qb.andWhere('trip.employee_id = :employeeId', { employeeId: employee_id });
    if (status) qb.andWhere('trip.status = :status', { status });
    if (from_date) qb.andWhere('trip.start_date >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('trip.end_date <= :toDate', { toDate: to_date });

    const allowedSortFields = ['created_at', 'updated_at', 'start_date', 'end_date'];
    const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    const [items, total] = await qb
      .orderBy(`trip.${safeSortBy}`, direction)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((item) => this.map(item)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  private async findOneOrFail(
    companyId: number,
    id: number,
  ): Promise<AttendanceBusinessTrip> {
    const trip = await this.businessTripRepository.findOne({
      where: { id, companyId },
    });

    if (!trip) {
      throw new NotFoundException('Attendance business trip not found');
    }

    return trip;
  }

  async findOne(companyId: number, id: number) {
    return this.map(await this.findOneOrFail(companyId, id));
  }

  async update(
    companyId: number,
    id: number,
    dto: UpdateAttendanceBusinessTripDto,
    actor: AuthenticatedUser,
  ) {
    const trip = await this.findOneOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, dto.employee_id ?? trip.employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (
      ![
        AttendanceBusinessTripStatusEnum.DRAFT,
        AttendanceBusinessTripStatusEnum.SUBMITTED,
        AttendanceBusinessTripStatusEnum.REJECTED,
      ].includes(trip.status as AttendanceBusinessTripStatusEnum)
    ) {
      throw new BadRequestException('Only draft, submitted, or rejected business trips can be updated.');
    }

    const nextStartDate = dto.start_date ?? trip.startDate;
    const nextEndDate = dto.end_date ?? trip.endDate;
    this.assertDateOrder(nextStartDate, nextEndDate);
    this.assertEmployeeEligible(employee, nextStartDate, nextEndDate);
    await this.ensureNoOverlap(
      companyId,
      dto.employee_id ?? trip.employeeId,
      nextStartDate,
      nextEndDate,
      trip.id,
    );

    trip.employeeId = dto.employee_id ?? trip.employeeId;
    trip.startDate = nextStartDate;
    trip.endDate = nextEndDate;
    if (dto.reason !== undefined) {
      trip.reason = dto.reason?.trim() || null;
    }
    if (dto.metadata !== undefined) {
      trip.metadata = dto.metadata ?? null;
    }

    return this.map(await this.businessTripRepository.save(trip));
  }

  async submit(companyId: number, id: number, actor: AuthenticatedUser) {
    const trip = await this.findOneOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, trip.employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (trip.status !== AttendanceBusinessTripStatusEnum.DRAFT) {
      throw new BadRequestException('Only draft business trips can be submitted.');
    }

    await this.ensureNoOverlap(companyId, trip.employeeId, trip.startDate, trip.endDate, trip.id);
    trip.status = AttendanceBusinessTripStatusEnum.SUBMITTED;
    return this.map(await this.businessTripRepository.save(trip));
  }

  async approve(
    companyId: number,
    id: number,
    dto: ReviewAttendanceBusinessTripDto,
    actor: AuthenticatedUser,
  ) {
    const trip = await this.findOneOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, trip.employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (trip.status !== AttendanceBusinessTripStatusEnum.SUBMITTED) {
      throw new BadRequestException('Only submitted business trips can be approved.');
    }

    trip.status = AttendanceBusinessTripStatusEnum.APPROVED;
    trip.approvedByCompanyUserId = actor.companyMembershipId ?? null;
    trip.metadata = {
      ...(trip.metadata ?? {}),
      approval_note: dto.note ?? null,
      approved_at: new Date().toISOString(),
    };
    const saved = await this.businessTripRepository.save(trip);
    await this.queueAttendanceRecalculation(
      companyId,
      trip.employeeId,
      trip.startDate,
      trip.endDate,
      'Business trip approved',
      actor,
    );

    return this.map(saved);
  }

  async reject(
    companyId: number,
    id: number,
    dto: ReviewAttendanceBusinessTripDto,
    actor: AuthenticatedUser,
  ) {
    const trip = await this.findOneOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, trip.employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (trip.status !== AttendanceBusinessTripStatusEnum.SUBMITTED) {
      throw new BadRequestException('Only submitted business trips can be rejected.');
    }

    trip.status = AttendanceBusinessTripStatusEnum.REJECTED;
    trip.approvedByCompanyUserId = null;
    trip.metadata = {
      ...(trip.metadata ?? {}),
      rejection_note: dto.note ?? null,
      rejected_at: new Date().toISOString(),
    };

    return this.map(await this.businessTripRepository.save(trip));
  }

  async cancel(
    companyId: number,
    id: number,
    dto: CancelAttendanceBusinessTripDto,
    actor: AuthenticatedUser,
  ) {
    const trip = await this.findOneOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, trip.employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (
      ![
        AttendanceBusinessTripStatusEnum.DRAFT,
        AttendanceBusinessTripStatusEnum.SUBMITTED,
        AttendanceBusinessTripStatusEnum.APPROVED,
        AttendanceBusinessTripStatusEnum.REJECTED,
      ].includes(trip.status as AttendanceBusinessTripStatusEnum)
    ) {
      throw new BadRequestException('Business trip is already closed.');
    }

    const wasApproved = trip.status === AttendanceBusinessTripStatusEnum.APPROVED;
    trip.status = AttendanceBusinessTripStatusEnum.CANCELLED;
    trip.approvedByCompanyUserId = null;
    trip.metadata = {
      ...(trip.metadata ?? {}),
      cancellation_reason: dto.reason ?? null,
      cancelled_at: new Date().toISOString(),
    };
    const saved = await this.businessTripRepository.save(trip);

    if (wasApproved) {
      await this.queueAttendanceRecalculation(
        companyId,
        trip.employeeId,
        trip.startDate,
        trip.endDate,
        'Business trip cancelled',
        actor,
      );
    }

    return this.map(saved);
  }

  async remove(companyId: number, id: number, actor: AuthenticatedUser) {
    const trip = await this.findOneOrFail(companyId, id);
    const employee = await this.findEmployeeOrFail(companyId, trip.employeeId);
    await this.hrAccessService.assertCanAccessEmployee(actor, employee);

    if (trip.status === AttendanceBusinessTripStatusEnum.APPROVED) {
      await this.queueAttendanceRecalculation(
        companyId,
        trip.employeeId,
        trip.startDate,
        trip.endDate,
        'Business trip deleted',
        actor,
      );
    }

    await this.businessTripRepository.remove(trip);
    return { message: 'Attendance business trip deleted successfully' };
  }
}
