import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Branch } from '../branches/entities/branch.entity';
import { Department } from '../departments/entities/department.entity';
import { Employee } from '../employees/entities/employee.entity';
import { CreateCostCenterDto } from './dtos/create-cost-center.dto';
import { UpdateCostCenterDto } from './dtos/update-cost-center.dto';
import { CostCenter } from './entities/cost-center.entity';

@Injectable()
export class CostCentersService {
  constructor(
    @InjectRepository(CostCenter)
    private readonly repository: Repository<CostCenter>,
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Employee)
    private readonly employeeRepository: Repository<Employee>,
  ) {}

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private async assertUniqueCode(
    companyId: number,
    code: string,
    excludeId?: number,
  ): Promise<void> {
    const existing = await this.repository.findOne({
      where: {
        company_id: companyId,
        code,
        ...(excludeId ? { id: Not(excludeId) } : {}),
      },
      select: ['id'],
    });

    if (existing) {
      throw new ConflictException(`Cost center code "${code}" already exists`);
    }
  }

  private async resolveScope(
    companyId: number,
    branchId?: number | null,
    departmentId?: number | null,
  ): Promise<{ branch: Branch | null; department: Department | null }> {
    const branch =
      typeof branchId === 'number'
        ? await this.branchRepository.findOne({
            where: { id: branchId, company_id: companyId },
          })
        : null;

    if (typeof branchId === 'number' && !branch) {
      throw new NotFoundException('Branch not found');
    }

    const department =
      typeof departmentId === 'number'
        ? await this.departmentRepository.findOne({
            where: { id: departmentId, company_id: companyId },
          })
        : null;

    if (typeof departmentId === 'number' && !department) {
      throw new NotFoundException('Department not found');
    }

    if (branch && department && department.branch_id !== branch.id) {
      throw new BadRequestException(
        'department_id must belong to the selected branch_id',
      );
    }

    return { branch, department };
  }

  async create(companyId: number, dto: CreateCostCenterDto) {
    const code = this.normalizeCode(dto.code);
    await this.assertUniqueCode(companyId, code);
    const { branch, department } = await this.resolveScope(
      companyId,
      dto.branch_id,
      dto.department_id,
    );

    return this.repository.save(
      this.repository.create({
        company_id: companyId,
        branch_id: branch?.id ?? null,
        department_id: department?.id ?? null,
        code,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: dto.status?.trim().toLowerCase() || 'active',
      }),
    );
  }

  findAll(companyId: number) {
    return this.repository.find({
      where: { company_id: companyId },
      relations: { branch: true, department: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(companyId: number, id: number) {
    const center = await this.repository.findOne({
      where: { id, company_id: companyId },
      relations: { branch: true, department: true },
    });

    if (!center) {
      throw new NotFoundException('Cost center not found');
    }

    return center;
  }

  async update(companyId: number, id: number, dto: UpdateCostCenterDto) {
    const center = await this.findOne(companyId, id);

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      await this.assertUniqueCode(companyId, code, id);
      center.code = code;
    }

    const scope = await this.resolveScope(
      companyId,
      dto.branch_id ?? center.branch_id,
      dto.department_id ?? center.department_id,
    );

    center.branch_id = scope.branch?.id ?? null;
    center.department_id = scope.department?.id ?? null;

    if (dto.name !== undefined) {
      center.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      center.description = dto.description?.trim() || null;
    }

    if (dto.status !== undefined) {
      center.status = dto.status.trim().toLowerCase();
    }

    return this.repository.save(center);
  }

  async remove(companyId: number, id: number) {
    const center = await this.findOne(companyId, id);
    const employees = await this.employeeRepository.count({
      where: { company_id: companyId, cost_center_id: id },
    });

    if (employees > 0) {
      throw new ConflictException(
        'The cost center is assigned to employees and cannot be deleted',
      );
    }

    await this.repository.remove(center);
    return { message: 'Cost center deleted successfully' };
  }
}
