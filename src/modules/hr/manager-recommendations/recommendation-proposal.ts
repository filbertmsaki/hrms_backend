import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Department } from '../departments/entities/department.entity';
import { Branch } from '../branches/entities/branch.entity';
import { CreateManagerRecommendationDto } from './dtos/create-manager-recommendation.dto';
import { ManagerRecommendationType } from './entities/manager-recommendation.entity';

export async function validateRecommendationProposal(
  companyId: number,
  dto: CreateManagerRecommendationDto,
  departments: Repository<Department>,
  branches: Repository<Branch>,
  live = false,
): Promise<Record<string, unknown>> {
  const proposal = dto.proposal ?? {};
  if (dto.recommendation_type === ManagerRecommendationType.PROMOTION) {
    const title = proposal.proposed_position_title;
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      (live && title.trim().length > 120)
    )
      throw new BadRequestException(
        'Enter a proposed position title of up to 120 characters.',
      );
    return live ? { proposed_position_title: title.trim() } : proposal;
  }
  if (dto.recommendation_type === ManagerRecommendationType.TRANSFER) {
    const result: Record<string, unknown> = {};
    const departmentId = Number(proposal.proposed_department_id);
    const branchId = Number(proposal.proposed_branch_id);
    const hasDepartment =
      Number.isSafeInteger(departmentId) && departmentId > 0;
    const hasBranch = Number.isSafeInteger(branchId) && branchId > 0;
    if (!hasDepartment && !hasBranch)
      throw new BadRequestException(
        'Transfer recommendations require a proposed department or branch.',
      );
    if (
      live &&
      ((proposal.proposed_department_id != null && !hasDepartment) ||
        (proposal.proposed_branch_id != null && !hasBranch))
    )
      throw new BadRequestException('Invalid transfer destination.');
    const active = live ? { status: 'active' } : {};
    if (hasDepartment) {
      const row = await departments.findOne({
        where: { id: departmentId, company_id: companyId, ...active },
        select: live ? ['id', 'name', 'branch_id'] : ['id'],
      });
      if (!row)
        throw new BadRequestException('Proposed department is invalid.');
      if (
        live &&
        hasBranch &&
        row.branch_id != null &&
        row.branch_id !== branchId
      )
        throw new BadRequestException(
          'The proposed department belongs to a different branch.',
        );
      result.proposed_department_id = departmentId;
      result.proposed_department_name = row.name;
    }
    if (hasBranch) {
      const row = await branches.findOne({
        where: { id: branchId, company_id: companyId, ...active },
        select: live ? ['id', 'name'] : ['id'],
      });
      if (!row) throw new BadRequestException('Proposed branch is invalid.');
      result.proposed_branch_id = branchId;
      result.proposed_branch_name = row.name;
    }
    return live ? result : proposal;
  }
  if (Object.keys(proposal).length)
    throw new BadRequestException(
      'Disciplinary recommendations do not accept proposed master-data changes.',
    );
  return {};
}
