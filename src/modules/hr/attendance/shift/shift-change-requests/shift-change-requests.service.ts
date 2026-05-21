import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../../../common/dto/pagination.dto';
import { buildPaginationMeta } from '../../../shared/hr.utils';
import { Employee } from '../../../employees/entities/employee.entity';
import { Shift } from '../shifts/entities/shift.entity';
import { ShiftChangeRequestStatusEnum } from './enums/shift-change-request-status.enum';
import { ShiftChangeRequest } from './entities/shift-change-request.entity';
import { CreateShiftChangeRequestDto } from './dtos/create-shift-change-request.dto';
import { UpdateShiftChangeRequestDto } from './dtos/update-shift-change-request.dto';
import { ShiftChangeRequestQueryDto } from './dtos/shift-change-request-query.dto';

@Injectable()
export class ShiftChangeRequestsService {
  constructor(
    @InjectRepository(ShiftChangeRequest)
    private readonly changeRequestRepository: Repository<ShiftChangeRequest>,
    @InjectRepository(Shift)
    private readonly shiftRepository: Repository<Shift>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  private async ensureShift(companyId: number, shiftId: number): Promise<void> {
    const shift = await this.shiftRepository.findOne({ where: { id: shiftId, companyId }, select: ['id'] });
    if (!shift) throw new BadRequestException('shift id does not belong to the active company');
  }

  private async ensureEmployee(companyId: number, employeeId: number): Promise<void> {
    const employee = await this.employeeRepository
      .createQueryBuilder('employee')
      .innerJoin('employee.company_user', 'companyUser')
      .where('employee.id = :employeeId', { employeeId })
      .andWhere('companyUser.company_id = :companyId', { companyId })
      .getOne();
    if (!employee) throw new BadRequestException('employee_id does not belong to the active company');
  }

  private async findOrFail(companyId: number, id: number): Promise<ShiftChangeRequest> {
    const item = await this.changeRequestRepository.findOne({ where: { id, companyId } });
    if (!item) throw new NotFoundException('Shift change request not found');
    return item;
  }

  async create(companyId: number, dto: CreateShiftChangeRequestDto) {
    await this.ensureEmployee(companyId, dto.employee_id);
    await this.ensureShift(companyId, dto.current_shift_id);
    await this.ensureShift(companyId, dto.requested_shift_id);

    return this.changeRequestRepository.save(this.changeRequestRepository.create({
      companyId,
      employeeId: dto.employee_id,
      currentShiftId: dto.current_shift_id,
      requestedShiftId: dto.requested_shift_id,
      requestDate: dto.request_date,
      reason: dto.reason.trim(),
      status: dto.status ?? ShiftChangeRequestStatusEnum.PENDING,
      approvedBy: dto.approved_by ?? null,
      approvedAt: dto.approved_at ? new Date(dto.approved_at) : null,
    }));
  }

  async findAll(companyId: number, query: ShiftChangeRequestQueryDto) {
    const { page = 1, limit = 20, sortBy = 'request_date', sortOrder = SortDirection.DESC, employee_id, status, from_date, to_date } = query;

    const qb = this.changeRequestRepository.createQueryBuilder('changeRequest').where('changeRequest.company_id = :companyId', { companyId });

    if (employee_id) qb.andWhere('changeRequest.employee_id = :employeeId', { employeeId: employee_id });
    if (status) qb.andWhere('changeRequest.status = :status', { status });
    if (from_date) qb.andWhere('changeRequest.request_date >= :fromDate', { fromDate: from_date });
    if (to_date) qb.andWhere('changeRequest.request_date <= :toDate', { toDate: to_date });

    const safeSortBy = ['request_date', 'created_at'].includes(sortBy) ? sortBy : 'request_date';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const [items, total] = await qb.orderBy(`changeRequest.${safeSortBy}`, direction).skip((page - 1) * limit).take(limit).getManyAndCount();

    return { data: items, meta: buildPaginationMeta(total, items.length, limit, page) };
  }

  async findOne(companyId: number, id: number) { return this.findOrFail(companyId, id); }

  async update(companyId: number, id: number, dto: UpdateShiftChangeRequestDto) {
    const item = await this.findOrFail(companyId, id);

    const employeeId = dto.employee_id ?? item.employeeId;
    const currentShiftId = dto.current_shift_id ?? item.currentShiftId;
    const requestedShiftId = dto.requested_shift_id ?? item.requestedShiftId;

    await this.ensureEmployee(companyId, employeeId);
    await this.ensureShift(companyId, currentShiftId);
    await this.ensureShift(companyId, requestedShiftId);

    item.employeeId = employeeId;
    item.currentShiftId = currentShiftId;
    item.requestedShiftId = requestedShiftId;

    if (dto.request_date !== undefined) item.requestDate = dto.request_date;
    if (dto.reason !== undefined) item.reason = dto.reason.trim();
    if (dto.status !== undefined) item.status = dto.status;
    if (dto.approved_by !== undefined) item.approvedBy = dto.approved_by;
    if (dto.approved_at !== undefined) item.approvedAt = dto.approved_at ? new Date(dto.approved_at) : null;

    return this.changeRequestRepository.save(item);
  }

  async remove(companyId: number, id: number): Promise<{ message: string }> {
    const item = await this.findOrFail(companyId, id);
    await this.changeRequestRepository.remove(item);
    return { message: 'Shift change request deleted successfully' };
  }
}
