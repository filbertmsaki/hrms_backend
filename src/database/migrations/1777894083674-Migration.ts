import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1777894083674 implements MigrationInterface {
    name = 'Migration1777894083674'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`permissions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(100) NOT NULL, \`display_name\` varchar(100) NOT NULL, \`description\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_48ce552495d14eae9b187bb671\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(50) NOT NULL, \`display_name\` varchar(100) NOT NULL, \`description\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_648e3f5447f725579d7d4ffdfb\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_no\` varchar(20) NOT NULL, \`first_name\` varchar(50) NOT NULL, \`last_name\` varchar(50) NOT NULL, \`phone\` varchar(20) NOT NULL, \`email\` varchar(100) NOT NULL, \`password\` varchar(255) NOT NULL, \`last_login_at\` timestamp NULL, \`last_login_ip\` varchar(45) NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`is_email_verified\` tinyint NOT NULL DEFAULT 0, \`email_verification_token\` varchar(255) NULL, \`email_verification_expires\` timestamp NULL, \`is_two_factor_enabled\` tinyint NOT NULL DEFAULT 0, \`two_factor_secret\` text NULL, \`two_factor_backup_codes\` json NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_e5f6813966537a78538a896d74\` (\`user_no\`), UNIQUE INDEX \`IDX_a000cca60bcf04454e72769949\` (\`phone\`), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permission_role\` (\`rolesId\` int NOT NULL, \`permissionsId\` int NOT NULL, INDEX \`IDX_ad249cf4f60be340850d7429e2\` (\`rolesId\`), INDEX \`IDX_f131407a830249c1b575316321\` (\`permissionsId\`), PRIMARY KEY (\`rolesId\`, \`permissionsId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`role_user\` (\`usersId\` int NOT NULL, \`rolesId\` int NOT NULL, INDEX \`IDX_788a980aa4fa89a8859419146a\` (\`usersId\`), INDEX \`IDX_eb446d431a1abb9801e6ade445\` (\`rolesId\`), PRIMARY KEY (\`usersId\`, \`rolesId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permission_user\` (\`usersId\` int NOT NULL, \`permissionsId\` int NOT NULL, INDEX \`IDX_eebf5c79455539db169da54830\` (\`usersId\`), INDEX \`IDX_fe30ce4377c9320e2b8a23c836\` (\`permissionsId\`), PRIMARY KEY (\`usersId\`, \`permissionsId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`permission_role\` ADD CONSTRAINT \`FK_ad249cf4f60be340850d7429e28\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`permission_role\` ADD CONSTRAINT \`FK_f131407a830249c1b5753163211\` FOREIGN KEY (\`permissionsId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`role_user\` ADD CONSTRAINT \`FK_788a980aa4fa89a8859419146ae\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`role_user\` ADD CONSTRAINT \`FK_eb446d431a1abb9801e6ade4456\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`permission_user\` ADD CONSTRAINT \`FK_eebf5c79455539db169da548301\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`permission_user\` ADD CONSTRAINT \`FK_fe30ce4377c9320e2b8a23c8362\` FOREIGN KEY (\`permissionsId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`permission_user\` DROP FOREIGN KEY \`FK_fe30ce4377c9320e2b8a23c8362\``);
        await queryRunner.query(`ALTER TABLE \`permission_user\` DROP FOREIGN KEY \`FK_eebf5c79455539db169da548301\``);
        await queryRunner.query(`ALTER TABLE \`role_user\` DROP FOREIGN KEY \`FK_eb446d431a1abb9801e6ade4456\``);
        await queryRunner.query(`ALTER TABLE \`role_user\` DROP FOREIGN KEY \`FK_788a980aa4fa89a8859419146ae\``);
        await queryRunner.query(`ALTER TABLE \`permission_role\` DROP FOREIGN KEY \`FK_f131407a830249c1b5753163211\``);
        await queryRunner.query(`ALTER TABLE \`permission_role\` DROP FOREIGN KEY \`FK_ad249cf4f60be340850d7429e28\``);
        await queryRunner.query(`DROP INDEX \`IDX_fe30ce4377c9320e2b8a23c836\` ON \`permission_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_eebf5c79455539db169da54830\` ON \`permission_user\``);
        await queryRunner.query(`DROP TABLE \`permission_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_eb446d431a1abb9801e6ade445\` ON \`role_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_788a980aa4fa89a8859419146a\` ON \`role_user\``);
        await queryRunner.query(`DROP TABLE \`role_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_f131407a830249c1b575316321\` ON \`permission_role\``);
        await queryRunner.query(`DROP INDEX \`IDX_ad249cf4f60be340850d7429e2\` ON \`permission_role\``);
        await queryRunner.query(`DROP TABLE \`permission_role\``);
        await queryRunner.query(`DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_a000cca60bcf04454e72769949\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_e5f6813966537a78538a896d74\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_648e3f5447f725579d7d4ffdfb\` ON \`roles\``);
        await queryRunner.query(`DROP TABLE \`roles\``);
        await queryRunner.query(`DROP INDEX \`IDX_48ce552495d14eae9b187bb671\` ON \`permissions\``);
        await queryRunner.query(`DROP TABLE \`permissions\``);
    }

}
