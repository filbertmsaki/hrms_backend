import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SortDirection } from '../../../common/dto/pagination.dto';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { CompanyUser } from '../../companies/entities/company-user.entity';
import { BranchQueryDto } from './dtos/branch-query.dto';
import { CreateBranchDto } from './dtos/create-branch.dto';
import { UpdateBranchDto } from './dtos/update-branch.dto';
import { HrAccessService } from '../shared/hr-access.service';
import { buildPaginationMeta } from '../shared/hr.utils';
import { Branch } from './entities/branch.entity';
import { CompanyUserBranchAccess } from './entities/company-user-branch-access.entity';

@Injectable()
export class BranchesService {
  constructor(
    @InjectRepository(Branch)
    private readonly branchRepository: Repository<Branch>,
    @InjectRepository(CompanyUser)
    private readonly companyUserRepository: Repository<CompanyUser>,
    @InjectRepository(CompanyUserBranchAccess)
    private readonly branchAccessRepository: Repository<CompanyUserBranchAccess>,
    private readonly hrAccessService: HrAccessService,
  ) {}

  private mapBranch(branch: Branch) {
    return {
      id: branch.id,
      company_id: branch.company_id,
      name: branch.name,
      code: branch.code,
      country: branch.country,
      city: branch.city,
      address: branch.address,
      status: branch.status,
      created_at: branch.created_at,
      updated_at: branch.updated_at,
    };
  }

  private mapBranchAccess(access: CompanyUserBranchAccess) {
    return {
      id: access.id,
      branch_id: access.branch_id,
      company_user_id: access.company_user_id,
      created_at: access.created_at,
      user: access.company_user?.user
        ? {
            id: access.company_user.user.id,
            user_no: access.company_user.user.user_no,
            first_name: access.company_user.user.first_name,
            last_name: access.company_user.user.last_name,
            email: access.company_user.user.email,
            phone: access.company_user.user.phone,
            status: access.company_user.user.status,
          }
        : null,
    };
  }

  private async findBranchOrFail(
    companyId: number,
    branchId: number,
  ): Promise<Branch> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId, company_id: companyId },
    });

    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    return branch;
  }

  async create(
    companyId: number,
    createBranchDto: CreateBranchDto,
  ): Promise<ReturnType<BranchesService['mapBranch']>> {
    const branch = this.branchRepository.create({
      ...createBranchDto,
      company_id: companyId,
      status: createBranchDto.status ?? 'active',
    });

    return this.mapBranch(await this.branchRepository.save(branch));
  }

  async findAll(
    companyId: number,
    query: BranchQueryDto,
    actor: AuthenticatedUser,
  ) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
      status,
    } = query;

    const qb = this.branchRepository
      .createQueryBuilder('branch')
      .where('branch.company_id = :companyId', { companyId });

    if (status?.trim()) {
      qb.andWhere('branch.status = :status', { status: status.trim() });
    }

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(branch.name LIKE :term OR branch.code LIKE :term OR branch.city LIKE :term OR branch.country LIKE :term)',
        { term },
      );
    }

    const accessibleBranchIds =
      await this.hrAccessService.getAccessibleBranchIds(actor);

    if (accessibleBranchIds?.length === 0) {
      return {
        data: [],
        meta: buildPaginationMeta(0, 0, limit, page),
      };
    }

    if (accessibleBranchIds) {
      qb.andWhere('branch.id IN (:...branchIds)', {
        branchIds: accessibleBranchIds,
      });
    }

    const allowedSortFields = [
      'id',
      'name',
      'code',
      'country',
      'city',
      'status',
      'created_at',
      'updated_at',
    ];

    const safeSortBy = allowedSortFields.includes(sortBy)
      ? sortBy
      : 'created_at';
    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';
    const skip = (page - 1) * limit;

    const [items, total] = await qb
      .orderBy(`branch.${safeSortBy}`, direction)
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data: items.map((branch) => this.mapBranch(branch)),
      meta: buildPaginationMeta(total, items.length, limit, page),
    };
  }

  async findOne(
    companyId: number,
    branchId: number,
    actor: AuthenticatedUser,
  ) {
    const branch = await this.findBranchOrFail(companyId, branchId);
    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    return this.mapBranch(branch);
  }

  async update(
    companyId: number,
    branchId: number,
    updateBranchDto: UpdateBranchDto,
    actor: AuthenticatedUser,
  ) {
    const branch = await this.findBranchOrFail(companyId, branchId);
    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    Object.assign(branch, updateBranchDto);
    return this.mapBranch(await this.branchRepository.save(branch));
  }

  async remove(
    companyId: number,
    branchId: number,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const branch = await this.findBranchOrFail(companyId, branchId);
    await this.hrAccessService.assertCanAccessBranch(actor, branch.id);
    await this.branchRepository.remove(branch);
    return { message: 'Branch deleted successfully' };
  }

  async listAccessAssignments(companyId: number, branchId: number) {
    await this.findBranchOrFail(companyId, branchId);

    const assignments = await this.branchAccessRepository.find({
      where: {
        branch_id: branchId,
        company_user: {
          company_id: companyId,
        },
      },
      relations: {
        company_user: {
          user: true,
        },
      },
      order: {
        created_at: 'DESC',
      },
    });

    return assignments.map((assignment) => this.mapBranchAccess(assignment));
  }

  async grantAccess(
    companyId: number,
    branchId: number,
    userId: number,
  ): Promise<ReturnType<BranchesService['mapBranchAccess']>> {
    await this.findBranchOrFail(companyId, branchId);

    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
        status: 'active',
      },
      relations: {
        user: true,
      },
    });

    if (!membership) {
      throw new NotFoundException('Company user not found');
    }

    let assignment = await this.branchAccessRepository.findOne({
      where: {
        company_user_id: membership.id,
        branch_id: branchId,
      },
      relations: {
        company_user: {
          user: true,
        },
      },
    });

    if (!assignment) {
      assignment = await this.branchAccessRepository.save(
        this.branchAccessRepository.create({
          company_user_id: membership.id,
          branch_id: branchId,
        }),
      );

      assignment = await this.branchAccessRepository.findOneOrFail({
        where: { id: assignment.id },
        relations: {
          company_user: {
            user: true,
          },
        },
      });
    }

    return this.mapBranchAccess(assignment);
  }

  async revokeAccess(
    companyId: number,
    branchId: number,
    userId: number,
  ): Promise<{ message: string }> {
    await this.findBranchOrFail(companyId, branchId);

    const membership = await this.companyUserRepository.findOne({
      where: {
        company_id: companyId,
        user_id: userId,
      },
      select: ['id'],
    });

    if (!membership) {
      throw new NotFoundException('Company user not found');
    }

    await this.branchAccessRepository.delete({
      company_user_id: membership.id,
      branch_id: branchId,
    });

    return { message: 'Branch access revoked successfully' };
  }
}
