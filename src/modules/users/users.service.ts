import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThan, Repository } from 'typeorm';

import { PaginationDto } from 'src/common/dto/pagination.dto';
import { comparePasswords, hashPassword } from 'src/common/utils/hash.util';
import { CompaniesService } from '../companies/companies.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UserProfileDto } from './dtos/user-profile-dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly companiesService: CompaniesService,
  ) {}

  private extractRoleIds(
    roles?: Array<{ id?: number } | number>,
  ): number[] | undefined {
    if (!roles?.length) {
      return undefined;
    }

    const roleIds = roles
      .map((role) => (typeof role === 'number' ? role : role?.id))
      .filter((roleId): roleId is number => typeof roleId === 'number');

    return roleIds.length ? roleIds : undefined;
  }

  private async findOrFail(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async generateUserNo(manager?: EntityManager): Promise<string> {
    const repository = manager?.getRepository(User) ?? this.userRepository;
    const year = new Date().getFullYear();
    const prefix = `USER-${year}-`;

    const qb = repository
      .createQueryBuilder('user')
      .where('user.user_no LIKE :prefix', { prefix: `${prefix}%` })
      .orderBy('user.user_no', 'DESC')
      .limit(1);

    const lastUser = await qb.getOne();

    let nextNumber = 1;
    if (lastUser?.user_no) {
      const numPart = lastUser.user_no.substring(prefix.length);
      const parsed = Number(numPart);
      if (!isNaN(parsed)) {
        nextNumber = parsed + 1;
      }
    }

    return `${prefix}${String(nextNumber).padStart(5, '0')}`;
  }

  async createForCompany(
    companyId: number,
    createUserDto: CreateUserDto,
  ): Promise<UserProfileDto | { message: string; user: UserProfileDto }> {
    const { roles, password, ...userData } = createUserDto;
    const existingByEmail = await this.userRepository.findOne({
      where: { email: userData.email },
    });
    const existingByPhone = await this.userRepository.findOne({
      where: { phone: userData.phone },
    });

    if (
      existingByEmail &&
      existingByPhone &&
      existingByEmail.id !== existingByPhone.id
    ) {
      throw new ConflictException(
        'Email and phone belong to different existing users',
      );
    }

    const existingUser = existingByEmail ?? existingByPhone;
    const roleIds = this.extractRoleIds(roles as Array<{ id?: number }>);

    if (existingUser) {
      if (existingByEmail && existingByEmail.phone !== userData.phone) {
        throw new ConflictException(
          'This email already exists with a different phone number',
        );
      }

      if (existingByPhone && existingByPhone.email !== userData.email) {
        throw new ConflictException(
          'This phone number already exists with a different email address',
        );
      }

      const currentMembership = await this.companiesService
        .findCompanyUserContext(companyId, existingUser.id)
        .catch(() => null);

      if (currentMembership) {
        throw new ConflictException('User already belongs to this company');
      }

      await this.companiesService.addUserToCompany(existingUser.id, companyId, {
        roleIds,
      });

      return {
        message: 'Existing user added to company successfully',
        user: await this.findProfileInCompany(existingUser.id, companyId),
      };
    }

    const hashedPassword = await hashPassword(password);
    const user = this.userRepository.create({
      ...userData,
      password: hashedPassword,
      user_no: userData.user_no ?? (await this.generateUserNo()),
      status: userData.status ?? 'active',
      user_type: 'COMPANY_USER',
      is_email_verified: true,
    });

    const savedUser = await this.userRepository.save(user);

    await this.companiesService.addUserToCompany(savedUser.id, companyId, {
      roleIds,
    });

    return this.findProfileInCompany(savedUser.id, companyId);
  }

  async findByEmailWithRelations(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findByEmailForAuth(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'password',
        'status',
        'user_type',
        'first_name',
        'last_name',
        'user_no',
        'phone',
        'last_login_at',
        'last_login_ip',
        'is_email_verified',
        'is_two_factor_enabled',
      ],
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      relations: ['roles', 'permissions'],
    });
  }

  async findAllPaginatedInCompany(companyId: number, query: PaginationDto) {
    return this.companiesService.findCompanyUsersPaginated(companyId, query);
  }

  async findByIdWithRelations(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findById(id: number): Promise<User> {
    return this.findOrFail(id);
  }

  async findMyProfileById(
    id: number,
    companyId: number,
  ): Promise<UserProfileDto> {
    const user = await this.findOrFail(id);
    const currentCompany = await this.companiesService.findCompanyUserContext(
      companyId,
      id,
    );
    const companies = await this.companiesService.listUserCompanies(id);

    return new UserProfileDto({
      id: user.id,
      user_no: user.user_no,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email,
      status: user.status,
      user_type: user.user_type,
      is_email_verified: user.is_email_verified,
      is_two_factor_enabled: user.is_two_factor_enabled,
      last_login_at: user.last_login_at,
      last_login_ip: user.last_login_ip,
      created_at: user.created_at,
      updated_at: user.updated_at,
      roles: currentCompany.roles,
      permissions: currentCompany.permissions,
      current_company: {
        id: currentCompany.companyId,
        name: currentCompany.companyName,
        slug: currentCompany.companySlug,
      },
      companies,
    });
  }

  async findProfileInCompany(
    id: number,
    companyId: number,
  ): Promise<UserProfileDto> {
    const user = await this.findOrFail(id);
    const companyContext = await this.companiesService.findCompanyUserContext(
      companyId,
      id,
    );

    return new UserProfileDto({
      id: user.id,
      user_no: user.user_no,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email,
      status: user.status,
      user_type: user.user_type,
      is_email_verified: user.is_email_verified,
      is_two_factor_enabled: user.is_two_factor_enabled,
      last_login_at: user.last_login_at,
      last_login_ip: user.last_login_ip,
      created_at: user.created_at,
      updated_at: user.updated_at,
      roles: companyContext.roles,
      permissions: companyContext.permissions,
      current_company: {
        id: companyContext.companyId,
        name: companyContext.companyName,
        slug: companyContext.companySlug,
      },
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { phone } });
  }

  async findByUserNo(userNo: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { user_no: userNo } });
  }

  async existsByUserNo(userNo: string): Promise<boolean> {
    return !!(await this.findByUserNo(userNo));
  }

  async updateLastLogin(
    id: number,
    lastLoginAt: Date,
    lastLoginIp: string | null = null,
  ): Promise<void> {
    await this.userRepository.update(id, {
      last_login_at: lastLoginAt,
      last_login_ip: lastLoginIp,
    });
  }

  async updatePassword(id: number, hashedPassword: string): Promise<void> {
    await this.userRepository.update(id, { password: hashedPassword });
  }

  async update(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOrFail(id);
    const { roles, ...safeUpdate } = updateUserDto as UpdateUserDto & {
      roles?: unknown;
    };
    void roles;
    Object.assign(user, safeUpdate);
    return this.userRepository.save(user);
  }

  async updateInCompany(
    companyId: number,
    id: number,
    updateUserDto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    await this.companiesService.findCompanyUserContext(companyId, id);
    await this.update(id, updateUserDto);
    return this.findProfileInCompany(id, companyId);
  }

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'password'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isMatch = await comparePasswords(oldPassword, user.password);
    if (!isMatch) {
      throw new UnauthorizedException('Current password incorrect');
    }

    const hashed = await hashPassword(newPassword);
    await this.userRepository.update(userId, { password: hashed });

    return { message: 'Password changed successfully' };
  }

  async updateVerificationToken(
    userId: number,
    token: string,
    expires: Date,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      email_verification_token: token,
      email_verification_expires: expires,
    });
  }

  async markEmailVerified(userId: number): Promise<void> {
    await this.userRepository.update(userId, {
      is_email_verified: true,
      email_verification_token: null,
      email_verification_expires: null,
    });
  }

  async findByVerificationToken(token: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: {
        email_verification_token: token,
        email_verification_expires: MoreThan(new Date()),
      },
    });
  }

  async update2FASecret(userId: number, secret: string): Promise<void> {
    await this.userRepository.update(userId, { two_factor_secret: secret });
  }

  async activate2FA(
    userId: number,
    secret: string,
    backupCodes: string[],
  ): Promise<void> {
    await this.userRepository.update(userId, {
      is_two_factor_enabled: true,
      two_factor_secret: secret,
      two_factor_backup_codes: backupCodes,
    });
  }

  async updateBackupCodes(
    userId: number,
    backupCodes: string[],
  ): Promise<void> {
    await this.userRepository.update(userId, {
      two_factor_backup_codes: backupCodes,
    });
  }

  async disable2FA(userId: number): Promise<void> {
    await this.userRepository.update(userId, {
      is_two_factor_enabled: false,
      two_factor_secret: null,
      two_factor_backup_codes: null,
    });
  }

  async assignRoleInCompany(
    companyId: number,
    userId: number,
    roleId: number,
  ): Promise<UserProfileDto> {
    await this.companiesService.assignRole(companyId, userId, roleId);
    return this.findProfileInCompany(userId, companyId);
  }

  async revokeRoleInCompany(
    companyId: number,
    userId: number,
    roleId: number,
  ): Promise<UserProfileDto> {
    await this.companiesService.revokeRole(companyId, userId, roleId);
    return this.findProfileInCompany(userId, companyId);
  }

  async removeFromCompany(
    companyId: number,
    userId: number,
  ): Promise<{ message: string }> {
    return this.companiesService.removeUserFromCompany(companyId, userId);
  }
}
