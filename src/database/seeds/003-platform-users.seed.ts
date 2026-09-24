import { DataSource, IsNull } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';
import { hashPassword } from '../../common/utils/hash.util';
import { Role } from '../../modules/roles/entities/role.entity';
import { User } from '../../modules/users/entities/user.entity';

export default class PlatformUsersSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager,
  ): Promise<void> {
    void factoryManager;

    const qr = dataSource.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();

    try {
      const userRepo = qr.manager.getRepository(User);
      const roleRepo = qr.manager.getRepository(Role);

      const email =
        process.env.PLATFORM_ADMIN_EMAIL ??
        process.env.INITIAL_OWNER_EMAIL ??
        'info@alliance.co.tz';
      const phone =
        process.env.PLATFORM_ADMIN_PHONE ??
        process.env.INITIAL_OWNER_PHONE ??
        '+255700000001';
      const firstName =
        process.env.PLATFORM_ADMIN_FIRST_NAME ??
        process.env.INITIAL_OWNER_FIRST_NAME ??
        'Alliance';
      const lastName =
        process.env.PLATFORM_ADMIN_LAST_NAME ??
        process.env.INITIAL_OWNER_LAST_NAME ??
        'Insurance';
      const rawPassword =
        process.env.PLATFORM_ADMIN_PASSWORD ??
        process.env.INITIAL_OWNER_PASSWORD;
      const userNo =
        process.env.PLATFORM_ADMIN_USER_NO ??
        process.env.INITIAL_OWNER_USER_NO ??
        'OWNER-00001';

      let user =
        (await userRepo.findOne({ where: { email }, relations: ['roles'] })) ??
        (await userRepo.findOne({ where: { phone }, relations: ['roles'] }));
      const alreadyExisted = !!user;

      const ownerRole = await roleRepo.findOne({
        where: { name: 'SUPER_ADMIN', company_id: IsNull() },
      });

      if (!rawPassword?.trim()) {
        throw new Error(
          'PLATFORM_ADMIN_PASSWORD or INITIAL_OWNER_PASSWORD must be set before seeding.',
        );
      }

      if (!user) {
        user = userRepo.create({
          user_no: userNo,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          password: await hashPassword(rawPassword.trim()),
          user_type: 'OWNER',
          status: 'active',
          is_email_verified: true,
        });

        if (ownerRole) {
          user.roles = [ownerRole];
        }

        await userRepo.save(user);
      }

      await qr.commitTransaction();
      console.log(
        alreadyExisted
          ? `[Seeder][PlatformUsers] Platform user ${email} already existed; left unchanged`
          : `[Seeder][PlatformUsers] Created platform user: ${email} with role SUPER_ADMIN`,
      );
    } catch (error) {
      await qr.rollbackTransaction();
      console.error('[Seeder][PlatformUsers] Failed:', error);
      throw error;
    } finally {
      await qr.release();
    }
  }
}
