import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Employee } from '../employees/entities/employee.entity';
import { CreateEmployeeGradeDto } from './dtos/create-employee-grade.dto';
import { UpdateEmployeeGradeDto } from './dtos/update-employee-grade.dto';
import { EmployeeGrade } from './entities/employee-grade.entity';

@Injectable()
export class EmployeeGradesService {
  constructor(
    @InjectRepository(EmployeeGrade)
    private readonly repository: Repository<EmployeeGrade>,
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
      throw new ConflictException(`Grade code "${code}" already exists`);
    }
  }

  async create(companyId: number, dto: CreateEmployeeGradeDto) {
    const code = this.normalizeCode(dto.code);
    await this.assertUniqueCode(companyId, code);

    return this.repository.save(
      this.repository.create({
        company_id: companyId,
        code,
        name: dto.name.trim(),
        level: dto.level ?? null,
        description: dto.description?.trim() || null,
        status: dto.status?.trim().toLowerCase() || 'active',
      }),
    );
  }

  findAll(companyId: number) {
    return this.repository.find({
      where: { company_id: companyId },
      order: { level: 'ASC', name: 'ASC' },
    });
  }

  async findOne(companyId: number, id: number) {
    const grade = await this.repository.findOne({
      where: { id, company_id: companyId },
    });

    if (!grade) {
      throw new NotFoundException('Employee grade not found');
    }

    return grade;
  }

  async update(companyId: number, id: number, dto: UpdateEmployeeGradeDto) {
    const grade = await this.findOne(companyId, id);

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      await this.assertUniqueCode(companyId, code, id);
      grade.code = code;
    }

    if (dto.name !== undefined) {
      grade.name = dto.name.trim();
    }

    if (dto.level !== undefined) {
      grade.level = dto.level;
    }

    if (dto.description !== undefined) {
      grade.description = dto.description?.trim() || null;
    }

    if (dto.status !== undefined) {
      grade.status = dto.status.trim().toLowerCase();
    }

    return this.repository.save(grade);
  }

  async remove(companyId: number, id: number) {
    const grade = await this.findOne(companyId, id);
    const employees = await this.employeeRepository.count({
      where: { company_id: companyId, grade_id: id },
    });

    if (employees > 0) {
      throw new ConflictException(
        'The grade is assigned to employees and cannot be deleted',
      );
    }

    await this.repository.remove(grade);
    return { message: 'Employee grade deleted successfully' };
  }
}
