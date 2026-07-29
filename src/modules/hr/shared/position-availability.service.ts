import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DepartmentPosition } from '../departments/entities/department-position.entity';
import { Position } from '../positions/entities/position.entity';

@Injectable()
export class PositionAvailabilityService {
  constructor(
    @InjectRepository(DepartmentPosition)
    private readonly departmentPositionRepository: Repository<DepartmentPosition>,
  ) {}

  async positionHasMappings(
    companyId: number,
    positionId: number,
  ): Promise<boolean> {
    const count = await this.departmentPositionRepository.count({
      where: {
        company_id: companyId,
        position_id: positionId,
      },
    });

    return count > 0;
  }

  async isPositionAvailableForDepartment(
    companyId: number,
    position: Position,
    departmentId: number,
  ): Promise<boolean> {
    if (position.department_id !== null) {
      return position.department_id === departmentId;
    }

    const mapping = await this.departmentPositionRepository.findOne({
      where: {
        company_id: companyId,
        department_id: departmentId,
        position_id: position.id,
      },
    });

    if (mapping) {
      return true;
    }

    return !(await this.positionHasMappings(companyId, position.id));
  }

  async isPositionAvailableForBranch(
    companyId: number,
    position: Position,
    branchId: number,
  ): Promise<boolean> {
    if (position.branch_id !== null) {
      return position.branch_id === branchId;
    }

    const mapping = await this.departmentPositionRepository
      .createQueryBuilder('departmentPosition')
      .innerJoin('departmentPosition.department', 'department')
      .where('departmentPosition.company_id = :companyId', { companyId })
      .andWhere('departmentPosition.position_id = :positionId', {
        positionId: position.id,
      })
      .andWhere('department.branch_id = :branchId', { branchId })
      .getOne();

    if (mapping) {
      return true;
    }

    return !(await this.positionHasMappings(companyId, position.id));
  }

  async positionHasAccessibleMappings(
    companyId: number,
    positionId: number,
    branchIds: number[],
  ): Promise<boolean> {
    if (!branchIds.length) {
      return false;
    }

    const mapping = await this.departmentPositionRepository
      .createQueryBuilder('departmentPosition')
      .innerJoin('departmentPosition.department', 'department')
      .where('departmentPosition.company_id = :companyId', { companyId })
      .andWhere('departmentPosition.position_id = :positionId', { positionId })
      .andWhere('department.branch_id IN (:...branchIds)', { branchIds })
      .getOne();

    return Boolean(mapping);
  }
}
