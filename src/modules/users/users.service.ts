import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { comparePasswords, hashPassword } from 'src/common/utils/hash.util';
import { UserProfileDto } from './dtos/user-profile-dto';
import { PaginationDto, SortDirection } from 'src/common/dto/pagination.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: [{ email: createUserDto.email }, { phone: createUserDto.phone }],
    });

    if (existing) {
      throw new ConflictException('Email or phone already in use');
    }

    const hashedPassword = await hashPassword(createUserDto.password);

    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      status: createUserDto.status ?? 'active',
    });

    return this.userRepository.save(user);
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

  async findAllPaginated(query: PaginationDto) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'created_at',
      sortOrder = SortDirection.DESC,
      search,
    } = query;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.roles', 'roles')
      .leftJoinAndSelect('roles.permissions', 'rolePermissions')
      .leftJoinAndSelect('user.permissions', 'permissions');

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      qb.andWhere(
        '(user.first_name ILIKE :term OR ' +
          'user.last_name ILIKE :term OR ' +
          'user.email ILIKE :term OR ' +
          'user.phone ILIKE :term OR ' +
          'user.user_no ILIKE :term)',
        { term },
      );
    }

    const allowedSortFields = [
      'id',
      'user_no',
      'first_name',
      'last_name',
      'email',
      'phone',
      'status',
      'created_at',
      'updated_at',
    ];

    let safeSortBy = 'created_at';
    if (allowedSortFields.includes(sortBy)) {
      safeSortBy = sortBy;
    }

    const direction = sortOrder === SortDirection.ASC ? 'ASC' : 'DESC';

    qb.orderBy(`user.${safeSortBy}`, direction);

    const skip = (page - 1) * limit;

    const [items, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data: items,
      meta: {
        totalItems: total,
        itemCount: items.length,
        itemsPerPage: limit,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findByIdWithRelations(id: number): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });
  }

  async findById(id: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async findProfileById(id: number): Promise<UserProfileDto> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['roles', 'roles.permissions', 'permissions'],
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    const roleNames =
      user.roles?.map((r) => r.name || r.display_name || r.id.toString()) ?? [];

    const permissionKeys = new Set<string>();

    // Direct permissions
    user.permissions?.forEach((p) => {
      permissionKeys.add(p.name || p.display_name || p.id.toString());
    });

    // Inherited from roles
    user.roles?.forEach((role) => {
      role.permissions?.forEach((p) => {
        permissionKeys.add(p.name || p.display_name || p.id.toString());
      });
    });

    return new UserProfileDto({
      id: user.id,
      user_no: user.user_no,
      first_name: user.first_name,
      last_name: user.last_name,
      phone: user.phone,
      email: user.email,
      status: user.status,
      is_email_verified: user.is_email_verified,
      is_two_factor_enabled: user.is_two_factor_enabled,
      last_login_at: user.last_login_at,
      last_login_ip: user.last_login_ip,
      created_at: user.created_at,
      updated_at: user.updated_at,
      roles: roleNames,
      permissions: [...permissionKeys],
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
    const user = await this.findById(id);
    Object.assign(user, updateUserDto);
    return this.userRepository.save(user);
  }

  async changePassword(
    userId: number,
    oldPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['password'],
    });

    if (!user) throw new NotFoundException('User not found');

    const isMatch = await comparePasswords(oldPassword, user.password);
    if (!isMatch) throw new UnauthorizedException('Current password incorrect');

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

  // ──────────────────────────────────────────────────────────────
  // RELATION MANAGEMENT (Roles)
  // ──────────────────────────────────────────────────────────────
  async assignRole(userId: number, roleId: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Prevent duplicate assignment
    if (!user.roles.some((r) => r.id === roleId)) {
      // In real apps, you should fetch the role entity first
      // Here we assume role exists and we use reference
      user.roles = [...(user.roles || []), { id: roleId } as any];
      await this.userRepository.save(user);
    }

    return this.findById(userId);
  }

  async revokeRole(userId: number, roleId: number): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['roles'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.roles = user.roles?.filter((r) => r.id !== roleId) || [];
    await this.userRepository.save(user);

    return this.findById(userId);
  }

  // ──────────────────────────────────────────────────────────────
  // DELETE
  // ──────────────────────────────────────────────────────────────
  async remove(id: number): Promise<void> {
    const user = await this.findById(id);
    await this.userRepository.softRemove(user); // soft delete
    // or: await this.userRepository.remove(user); // hard delete
  }
}
