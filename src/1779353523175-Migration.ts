import { MigrationInterface, QueryRunner } from "typeorm";

export class Migration1779353523175 implements MigrationInterface {
    name = 'Migration1779353523175'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`company_user_roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_user_id\` int NOT NULL, \`role_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_company_user_roles_membership_role\` (\`company_user_id\`, \`role_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permissions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(100) NOT NULL, \`display_name\` varchar(100) NOT NULL, \`description\` text NULL, \`is_system_generated\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_permission_name\` (\`name\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`company_user_permissions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_user_id\` int NOT NULL, \`permission_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_company_user_permissions_membership_permission\` (\`company_user_id\`, \`permission_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_positions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`position_id\` int NOT NULL, \`designation_id\` int NULL, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`start_date\` date NOT NULL, \`end_date\` date NULL, \`assignment_type\` enum ('PRIMARY', 'ACTING', 'TEMPORARY', 'SECONDARY') NOT NULL DEFAULT 'PRIMARY', \`status\` enum ('ACTIVE', 'INACTIVE', 'COMPLETED') NOT NULL DEFAULT 'ACTIVE', \`notes\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_position_is_primary\` (\`is_primary\`), INDEX \`IDX_employee_position_designation\` (\`designation_id\`), INDEX \`IDX_employee_position_position\` (\`position_id\`), INDEX \`IDX_employee_position_employee\` (\`employee_id\`), INDEX \`IDX_employee_position_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`positions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`branch_id\` int NULL, \`department_id\` int NULL, \`designation_id\` int NULL, \`reports_to_position_id\` int NULL, \`name\` varchar(100) NOT NULL, \`code\` varchar(50) NULL, \`level\` int NULL, \`is_manager\` tinyint NOT NULL DEFAULT 0, \`headcount\` int NOT NULL DEFAULT '1', \`is_active\` tinyint NOT NULL DEFAULT 1, \`description\` text NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_position_status\` (\`status\`), INDEX \`IDX_position_reports_to\` (\`reports_to_position_id\`), INDEX \`IDX_position_designation\` (\`designation_id\`), INDEX \`IDX_position_department\` (\`department_id\`), INDEX \`IDX_position_branch\` (\`branch_id\`), INDEX \`IDX_position_company\` (\`company_id\`), UNIQUE INDEX \`UQ_position_code_company\` (\`company_id\`, \`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_addresses\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`address_line_1\` varchar(255) NULL, \`address_line_2\` varchar(255) NULL, \`city\` varchar(100) NULL, \`state\` varchar(100) NULL, \`country\` varchar(100) NULL, \`postal_code\` varchar(30) NULL, \`address_type\` enum ('home', 'temporary', 'work', 'mailing', 'other') NOT NULL DEFAULT 'home', \`is_primary\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_address_type\` (\`address_type\`), INDEX \`IDX_employee_address_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_bank_accounts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`bank_name\` varchar(120) NULL, \`account_name\` varchar(150) NULL, \`account_number\` varchar(100) NOT NULL, \`branch_name\` varchar(120) NULL, \`swift_code\` varchar(50) NULL, \`mobile_money_provider\` varchar(100) NULL, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_bank_account_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_contacts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`contact_type\` enum ('work', 'personal', 'mobile', 'home', 'whatsapp', 'other') NOT NULL DEFAULT 'personal', \`phone_number\` varchar(30) NULL, \`email\` varchar(150) NULL, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`is_verified\` tinyint NOT NULL DEFAULT 0, \`notes\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_contact_type\` (\`contact_type\`), INDEX \`IDX_employee_contact_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_designations\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`designation_id\` int NOT NULL, \`start_date\` date NOT NULL, \`end_date\` date NULL, \`is_current\` tinyint NOT NULL DEFAULT 1, \`remarks\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_designation_is_current\` (\`is_current\`), INDEX \`IDX_employee_designation_designation\` (\`designation_id\`), INDEX \`IDX_employee_designation_employee\` (\`employee_id\`), INDEX \`IDX_employee_designation_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_departments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`department_id\` int NOT NULL, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_employee_department\` (\`employee_id\`, \`department_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_documents\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`type\` varchar(50) NULL, \`title\` varchar(150) NULL, \`file_url\` text NOT NULL, \`notes\` text NULL, \`uploaded_by_company_user_id\` int NULL, \`uploaded_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_experiences\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`company_name\` varchar(150) NOT NULL, \`job_title\` varchar(150) NOT NULL, \`responsibilities_description\` text NOT NULL, \`start_date\` date NOT NULL, \`end_date\` date NULL, \`currently_working\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_experience_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_identifications\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`identification_type\` enum ('national_id', 'passport', 'tax_id', 'social_security', 'driver_license', 'work_permit', 'other') NOT NULL DEFAULT 'other', \`identification_number\` varchar(120) NOT NULL, \`issued_country\` varchar(100) NULL, \`expiry_date\` date NULL, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_employee_identification_employee_type_number\` (\`employee_id\`, \`identification_type\`, \`identification_number\`), INDEX \`IDX_employee_identification_type\` (\`identification_type\`), INDEX \`IDX_employee_identification_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_academic_qualifications\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`country_of_residence\` varchar(100) NOT NULL, \`education_level\` varchar(100) NOT NULL, \`institution_name\` varchar(150) NOT NULL, \`degree_or_certificate\` varchar(150) NOT NULL, \`field_of_study\` varchar(150) NOT NULL, \`start_date\` date NOT NULL, \`end_date\` date NOT NULL, \`academic_certificate_document_url\` text NOT NULL, \`uploaded_by_company_user_id\` int NULL, \`uploaded_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_academic_qualification_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_professional_qualifications\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`country_of_residence\` varchar(100) NOT NULL, \`institution_name\` varchar(150) NOT NULL, \`programme_name\` varchar(150) NOT NULL, \`issuing_organization\` varchar(150) NOT NULL, \`issue_date\` date NOT NULL, \`expiry_date\` date NULL, \`professional_certificate_document_url\` text NOT NULL, \`uploaded_by_company_user_id\` int NULL, \`uploaded_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_professional_qualification_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_relatives\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`full_name\` varchar(150) NOT NULL, \`relationship\` varchar(100) NOT NULL, \`phone\` varchar(30) NULL, \`email\` varchar(150) NULL, \`address\` text NULL, \`occupation\` varchar(120) NULL, \`is_emergency_contact\` tinyint NOT NULL DEFAULT 0, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_relative_emergency\` (\`is_emergency_contact\`), INDEX \`IDX_employee_relative_employee\` (\`employee_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employees\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_user_id\` int NOT NULL, \`employee_no\` varchar(50) NOT NULL, \`first_name\` varchar(100) NOT NULL, \`middle_name\` varchar(100) NULL, \`last_name\` varchar(100) NOT NULL, \`preferred_name\` varchar(100) NULL, \`gender\` varchar(20) NULL, \`date_of_birth\` date NULL, \`marital_status\` varchar(30) NULL, \`nationality\` varchar(100) NULL, \`profile_photo_url\` text NULL, \`primary_branch_id\` int NULL, \`primary_department_id\` int NULL, \`primary_position_id\` int NULL, \`primary_designation_id\` int NULL, \`employment_status\` enum ('onboarding', 'active', 'suspended', 'inactive', 'resigned', 'terminated', 'retired', 'exited') NOT NULL DEFAULT 'onboarding', \`employment_type\` enum ('full_time', 'part_time', 'contract', 'intern', 'consultant', 'temporary') NOT NULL DEFAULT 'full_time', \`hire_date\` date NULL, \`probation_end_date\` date NULL, \`confirmation_date\` date NULL, \`exit_date\` date NULL, \`reports_to\` int NULL, \`exit_reason\` text NULL, \`notes\` text NULL, \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_employee_company_user\` (\`company_user_id\`), UNIQUE INDEX \`REL_640b443f67415a68f5386f5e36\` (\`company_user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`designations\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`department_id\` int NULL, \`name\` varchar(120) NOT NULL, \`code\` varchar(50) NULL, \`hierarchy_level\` int NULL, \`grade_level\` int NULL, \`is_managerial\` tinyint NOT NULL DEFAULT 0, \`description\` text NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_designation_status\` (\`status\`), INDEX \`IDX_designation_department\` (\`department_id\`), INDEX \`IDX_designation_company\` (\`company_id\`), UNIQUE INDEX \`UQ_designation_code_company\` (\`company_id\`, \`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`departments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`branch_id\` int NULL, \`parent_id\` int NULL, \`name\` varchar(120) NOT NULL, \`code\` varchar(50) NULL, \`description\` text NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_department_branch\` (\`branch_id\`), INDEX \`IDX_department_company\` (\`company_id\`), UNIQUE INDEX \`UQ_department_code_company\` (\`company_id\`, \`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`branches\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`code\` varchar(50) NULL, \`country\` varchar(100) NULL, \`city\` varchar(100) NULL, \`address\` text NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_branch_company\` (\`company_id\`), UNIQUE INDEX \`UQ_branch_code_company\` (\`company_id\`, \`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`company_user_branch_accesses\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_user_id\` int NOT NULL, \`branch_id\` int NOT NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_company_user_branch_access_membership_branch\` (\`company_user_id\`, \`branch_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`company_users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`user_id\` int NOT NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`is_default\` tinyint NOT NULL DEFAULT 0, \`last_accessed_at\` timestamp NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_company_users_company_user\` (\`company_id\`, \`user_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`companies\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(120) NOT NULL, \`slug\` varchar(120) NOT NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_b28b07d25e4324eee577de5496\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(50) NOT NULL, \`display_name\` varchar(100) NOT NULL, \`description\` text NULL, \`company_id\` int NULL, \`company_scope_key\` int AS (COALESCE(\`company_id\`, 0)) STORED, \`is_system_generated\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_role_scope_name\` (\`company_scope_key\`, \`name\`), INDEX \`IDX_role_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`INSERT INTO \`hrms_db\`.\`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`, ["hrms_db","roles","GENERATED_COLUMN","company_scope_key","COALESCE(`company_id`, 0)"]);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_no\` varchar(20) NOT NULL, \`first_name\` varchar(50) NOT NULL, \`last_name\` varchar(50) NOT NULL, \`phone\` varchar(20) NOT NULL, \`email\` varchar(100) NOT NULL, \`password\` varchar(255) NOT NULL, \`last_login_at\` timestamp NULL, \`last_login_ip\` varchar(45) NULL, \`status\` varchar(20) NOT NULL DEFAULT 'active', \`user_type\` varchar(20) NOT NULL DEFAULT 'COMPANY_USER', \`is_email_verified\` tinyint NOT NULL DEFAULT 0, \`email_verification_token\` varchar(255) NULL, \`email_verification_expires\` timestamp NULL, \`is_two_factor_enabled\` tinyint NOT NULL DEFAULT 0, \`two_factor_secret\` text NULL, \`two_factor_backup_codes\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_e5f6813966537a78538a896d74\` (\`user_no\`), UNIQUE INDEX \`IDX_a000cca60bcf04454e72769949\` (\`phone\`), UNIQUE INDEX \`IDX_97672ac88f789774dd47f7c8be\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onboarding_tasks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`onboarding_request_id\` int NOT NULL, \`workflow_step_id\` int NULL, \`task_no\` varchar(50) NULL, \`title\` varchar(255) NOT NULL, \`description\` text NULL, \`task_type\` enum ('general', 'hr', 'it', 'department', 'manager') NOT NULL DEFAULT 'general', \`status\` enum ('pending', 'in_progress', 'completed', 'cancelled') NOT NULL DEFAULT 'pending', \`assigned_department_id\` int NULL, \`assigned_company_user_id\` int NULL, \`due_date\` datetime NULL, \`started_at\` datetime NULL, \`completed_at\` datetime NULL, \`cancelled_at\` datetime NULL, \`completion_notes\` text NULL, \`created_by_company_user_id\` int NULL, \`completed_by_company_user_id\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_onboarding_task_assignee\` (\`assigned_company_user_id\`), INDEX \`IDX_onboarding_task_department\` (\`assigned_department_id\`), INDEX \`IDX_onboarding_task_status\` (\`status\`), INDEX \`IDX_onboarding_task_request\` (\`onboarding_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onboarding_workflow_steps\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workflow_id\` int NOT NULL, \`approval_level\` int NOT NULL, \`step_name\` varchar(120) NOT NULL, \`task_title\` varchar(255) NULL, \`task_description\` text NULL, \`task_type\` enum ('general', 'hr', 'it', 'department', 'manager') NOT NULL DEFAULT 'general', \`assigned_branch_id\` int NULL, \`assigned_department_id\` int NULL, \`approver_type\` enum ('role', 'position', 'company_user') NOT NULL, \`role_id\` int NULL, \`position_id\` int NULL, \`company_user_id\` int NULL, \`action_type\` enum ('recommend', 'verify', 'approve') NOT NULL, \`is_required\` tinyint NOT NULL DEFAULT 1, \`expected_duration_days\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_onboarding_workflow_step_department\` (\`assigned_department_id\`), INDEX \`IDX_onboarding_workflow_step_branch\` (\`assigned_branch_id\`), INDEX \`IDX_onboarding_workflow_step_company_user\` (\`company_user_id\`), INDEX \`IDX_onboarding_workflow_step_position\` (\`position_id\`), INDEX \`IDX_onboarding_workflow_step_role\` (\`role_id\`), INDEX \`IDX_onboarding_workflow_step_workflow\` (\`workflow_id\`), UNIQUE INDEX \`UQ_onboarding_workflow_step_workflow_level\` (\`workflow_id\`, \`approval_level\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onboarding_approvals\` (\`id\` int NOT NULL AUTO_INCREMENT, \`onboarding_request_id\` int NOT NULL, \`workflow_step_id\` int NULL, \`approval_level\` int NOT NULL, \`approver_company_user_id\` int NULL, \`status\` enum ('pending', 'approved', 'rejected', 'skipped') NOT NULL DEFAULT 'pending', \`comments\` text NULL, \`signature_url\` text NULL, \`acted_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_onboarding_approval_actor\` (\`approver_company_user_id\`), INDEX \`IDX_onboarding_approval_status\` (\`status\`), INDEX \`IDX_onboarding_approval_request\` (\`onboarding_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onboarding_audit_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`onboarding_request_id\` int NULL, \`action\` varchar(120) NOT NULL, \`entity_name\` varchar(120) NOT NULL, \`entity_id\` int NULL, \`actor_company_user_id\` int NULL, \`actor_user_id\` int NULL, \`payload\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_onboarding_audit_action\` (\`action\`), INDEX \`IDX_onboarding_audit_entity\` (\`entity_name\`, \`entity_id\`), INDEX \`IDX_onboarding_audit_request\` (\`onboarding_request_id\`), INDEX \`IDX_onboarding_audit_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onboarding_requests\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`workflow_id\` int NULL, \`onboarding_no\` varchar(50) NOT NULL, \`title\` varchar(180) NOT NULL, \`description\` text NULL, \`planned_start_date\` date NULL, \`planned_completion_date\` date NULL, \`current_approval_level\` int NOT NULL DEFAULT '0', \`status\` enum ('draft', 'submitted', 'in_progress', 'in_review', 'completed', 'rejected', 'cancelled') NOT NULL DEFAULT 'draft', \`progress_percentage\` decimal(5,2) NOT NULL DEFAULT '0.00', \`rejection_reason\` text NULL, \`submitted_at\` datetime NULL, \`started_at\` datetime NULL, \`completed_at\` datetime NULL, \`cancelled_at\` datetime NULL, \`created_by_company_user_id\` int NOT NULL, \`finalized_by_company_user_id\` int NULL, \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_onboarding_request_status\` (\`status\`), INDEX \`IDX_onboarding_request_workflow\` (\`workflow_id\`), INDEX \`IDX_onboarding_request_employee\` (\`employee_id\`), INDEX \`IDX_onboarding_request_company\` (\`company_id\`), UNIQUE INDEX \`UQ_onboarding_request_company_no\` (\`company_id\`, \`onboarding_no\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`onboarding_workflows\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`description\` text NULL, \`is_default\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_onboarding_workflow_status\` (\`status\`), INDEX \`IDX_onboarding_workflow_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_tasks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`offboarding_request_id\` int NOT NULL, \`workflow_step_id\` int NULL, \`assigned_to_company_user_id\` int NULL, \`title\` varchar(255) NOT NULL, \`description\` text NULL, \`task_type\` enum ('hr', 'it', 'finance', 'manager', 'security', 'admin', 'general') NOT NULL DEFAULT 'general', \`status\` enum ('pending', 'in_progress', 'completed', 'cancelled', 'rejected') NOT NULL DEFAULT 'pending', \`priority\` enum ('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium', \`due_date\` datetime NULL, \`completed_at\` datetime NULL, \`remarks\` text NULL, \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_offboarding_task_assignee\` (\`assigned_to_company_user_id\`), INDEX \`IDX_offboarding_task_status\` (\`status\`), INDEX \`IDX_offboarding_task_request\` (\`offboarding_request_id\`), INDEX \`IDX_offboarding_task_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_workflow_steps\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workflow_id\` int NOT NULL, \`approval_level\` int NOT NULL, \`step_name\` varchar(120) NOT NULL, \`task_title\` varchar(255) NOT NULL, \`task_description\` text NULL, \`task_type\` enum ('hr', 'it', 'finance', 'manager', 'security', 'admin', 'general') NOT NULL DEFAULT 'general', \`assigned_branch_id\` int NULL, \`assigned_department_id\` int NULL, \`approver_type\` enum ('role', 'position', 'company_user') NOT NULL, \`role_id\` int NULL, \`position_id\` int NULL, \`company_user_id\` int NULL, \`action_type\` enum ('recommend', 'verify', 'approve') NOT NULL, \`is_required\` tinyint NOT NULL DEFAULT 1, \`expected_duration_days\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_offboarding_workflow_step_department\` (\`assigned_department_id\`), INDEX \`IDX_offboarding_workflow_step_branch\` (\`assigned_branch_id\`), INDEX \`IDX_offboarding_workflow_step_company_user\` (\`company_user_id\`), INDEX \`IDX_offboarding_workflow_step_position\` (\`position_id\`), INDEX \`IDX_offboarding_workflow_step_role\` (\`role_id\`), INDEX \`IDX_offboarding_workflow_step_workflow\` (\`workflow_id\`), UNIQUE INDEX \`UQ_offboarding_workflow_step_workflow_level\` (\`workflow_id\`, \`approval_level\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_approvals\` (\`id\` int NOT NULL AUTO_INCREMENT, \`offboarding_request_id\` int NOT NULL, \`workflow_step_id\` int NULL, \`approver_company_user_id\` int NULL, \`status\` enum ('pending', 'approved', 'rejected', 'skipped') NOT NULL DEFAULT 'pending', \`comments\` text NULL, \`acted_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_offboarding_approval_actor\` (\`approver_company_user_id\`), INDEX \`IDX_offboarding_approval_status\` (\`status\`), INDEX \`IDX_offboarding_approval_request\` (\`offboarding_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_audit_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`offboarding_request_id\` int NULL, \`actor_company_user_id\` int NULL, \`action\` enum ('created', 'updated', 'submitted', 'approved', 'rejected', 'task_created', 'task_completed', 'clearance_completed', 'clearance_failed', 'completed', 'cancelled') NOT NULL, \`description\` text NULL, \`old_values\` longtext NULL, \`new_values\` longtext NULL, \`metadata\` longtext NULL, \`ip_address\` varchar(45) NULL, \`user_agent\` varchar(255) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_offboarding_audit_action\` (\`action\`), INDEX \`IDX_offboarding_audit_request\` (\`offboarding_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_clearances\` (\`id\` int NOT NULL AUTO_INCREMENT, \`offboarding_request_id\` int NOT NULL, \`clearance_type\` enum ('laptop', 'id_card', 'email', 'system_access', 'vehicle', 'documents', 'finance', 'other') NOT NULL, \`status\` enum ('pending', 'cleared', 'not_cleared') NOT NULL DEFAULT 'pending', \`remarks\` text NULL, \`cleared_by_company_user_id\` int NULL, \`cleared_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_offboarding_clearance_status\` (\`status\`), INDEX \`IDX_offboarding_clearance_request\` (\`offboarding_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_requests\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`branch_id\` int NULL, \`department_id\` int NULL, \`workflow_id\` int NULL, \`created_by_company_user_id\` int NULL, \`offboarding_code\` varchar(50) NOT NULL, \`title\` varchar(180) NOT NULL, \`description\` text NULL, \`offboarding_type\` enum ('resignation', 'termination', 'retirement', 'contract_end', 'absconded', 'deceased', 'layoff', 'other') NOT NULL, \`reason\` text NOT NULL, \`notice_date\` date NULL, \`last_working_date\` date NOT NULL, \`submitted_at\` datetime NULL, \`completed_at\` datetime NULL, \`cancelled_at\` datetime NULL, \`status\` enum ('draft', 'pending', 'in_progress', 'waiting_approval', 'approved', 'rejected', 'completed', 'cancelled') NOT NULL DEFAULT 'draft', \`progress_percentage\` decimal(5,2) NOT NULL DEFAULT '0.00', \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, INDEX \`IDX_offboarding_request_status\` (\`status\`), INDEX \`IDX_offboarding_request_workflow\` (\`workflow_id\`), INDEX \`IDX_offboarding_request_employee\` (\`employee_id\`), INDEX \`IDX_offboarding_request_company\` (\`company_id\`), UNIQUE INDEX \`UQ_offboarding_code\` (\`offboarding_code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`offboarding_workflows\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`description\` text NULL, \`is_default\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active', \`created_by_company_user_id\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_offboarding_workflow_status\` (\`status\`), INDEX \`IDX_offboarding_workflow_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_audit_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`leave_request_id\` int NULL, \`action\` varchar(120) NOT NULL, \`entity_name\` varchar(120) NOT NULL, \`entity_id\` int NULL, \`actor_company_user_id\` int NULL, \`actor_user_id\` int NULL, \`payload\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_audit_action\` (\`action\`), INDEX \`IDX_leave_audit_entity\` (\`entity_name\`, \`entity_id\`), INDEX \`IDX_leave_audit_leave_request\` (\`leave_request_id\`), INDEX \`IDX_leave_audit_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_documents\` (\`id\` int NOT NULL AUTO_INCREMENT, \`leave_request_id\` int NOT NULL, \`file_url\` text NOT NULL, \`file_name\` varchar(180) NOT NULL, \`file_type\` varchar(80) NOT NULL, \`uploaded_by_company_user_id\` int NULL, \`uploaded_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_document_leave_request\` (\`leave_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_medical_details\` (\`id\` int NOT NULL AUTO_INCREMENT, \`leave_request_id\` int NOT NULL, \`sickness_nature\` varchar(150) NULL, \`doctor_name\` varchar(150) NULL, \`doctor_phone\` varchar(30) NULL, \`hospital_name\` varchar(150) NULL, \`treatment_start_date\` date NULL, \`treatment_end_date\` date NULL, \`attachment_url\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_leave_medical_detail_leave_request\` (\`leave_request_id\`), UNIQUE INDEX \`REL_d1bd68913860ced896392c02eb\` (\`leave_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_requests\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`leave_type_id\` int NOT NULL, \`leave_no\` varchar(50) NOT NULL, \`start_date\` date NOT NULL, \`end_date\` date NOT NULL, \`total_days\` decimal(8,2) NOT NULL, \`reason\` text NOT NULL, \`current_approval_level\` int NOT NULL DEFAULT '0', \`status\` enum ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'draft', \`rejection_reason\` text NULL, \`applied_at\` datetime NULL, \`created_by_company_user_id\` int NOT NULL, \`approved_at\` datetime NULL, \`cancelled_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_request_period\` (\`start_date\`, \`end_date\`), INDEX \`IDX_leave_request_status\` (\`status\`), INDEX \`IDX_leave_request_type\` (\`leave_type_id\`), INDEX \`IDX_leave_request_employee\` (\`employee_id\`), INDEX \`IDX_leave_request_company\` (\`company_id\`), UNIQUE INDEX \`UQ_leave_request_company_no\` (\`company_id\`, \`leave_no\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_request_approvals\` (\`id\` int NOT NULL AUTO_INCREMENT, \`leave_request_id\` int NOT NULL, \`workflow_step_id\` int NULL, \`approval_level\` int NOT NULL, \`approver_company_user_id\` int NULL, \`status\` enum ('pending', 'approved', 'rejected', 'skipped') NOT NULL DEFAULT 'pending', \`comments\` text NULL, \`signature_url\` text NULL, \`acted_at\` datetime NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_request_approval_actor\` (\`approver_company_user_id\`), INDEX \`IDX_leave_request_approval_status\` (\`status\`), INDEX \`IDX_leave_request_approval_leave_request\` (\`leave_request_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_approval_workflow_steps\` (\`id\` int NOT NULL AUTO_INCREMENT, \`workflow_id\` int NOT NULL, \`approval_level\` int NOT NULL, \`approver_type\` enum ('role', 'position', 'company_user') NOT NULL, \`assigned_branch_id\` int NULL, \`assigned_department_id\` int NULL, \`role_id\` int NULL, \`position_id\` int NULL, \`company_user_id\` int NULL, \`action_type\` enum ('recommend', 'verify', 'approve') NOT NULL, \`is_required\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_workflow_step_department\` (\`assigned_department_id\`), INDEX \`IDX_leave_workflow_step_branch\` (\`assigned_branch_id\`), INDEX \`IDX_leave_workflow_step_company_user\` (\`company_user_id\`), INDEX \`IDX_leave_workflow_step_position\` (\`position_id\`), INDEX \`IDX_leave_workflow_step_role\` (\`role_id\`), INDEX \`IDX_leave_workflow_step_workflow\` (\`workflow_id\`), UNIQUE INDEX \`UQ_leave_workflow_step_workflow_level\` (\`workflow_id\`, \`approval_level\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_approval_workflows\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`leave_type_id\` int NULL, \`is_default\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_workflow_leave_type\` (\`leave_type_id\`), INDEX \`IDX_leave_workflow_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_balances\` (\`id\` int NOT NULL AUTO_INCREMENT, \`employee_id\` int NOT NULL, \`leave_type_id\` int NOT NULL, \`fiscal_year\` varchar(20) NOT NULL, \`allocated_days\` decimal(8,2) NOT NULL DEFAULT '0.00', \`used_days\` decimal(8,2) NOT NULL DEFAULT '0.00', \`pending_days\` decimal(8,2) NOT NULL DEFAULT '0.00', \`carried_forward_days\` decimal(8,2) NOT NULL DEFAULT '0.00', \`expired_days\` decimal(8,2) NOT NULL DEFAULT '0.00', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_balance_fiscal_year\` (\`fiscal_year\`), INDEX \`IDX_leave_balance_leave_type\` (\`leave_type_id\`), INDEX \`IDX_leave_balance_employee\` (\`employee_id\`), UNIQUE INDEX \`UQ_leave_balance_employee_type_year\` (\`employee_id\`, \`leave_type_id\`, \`fiscal_year\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_policies\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`description\` text NULL, \`applicable_department_id\` int NULL, \`applicable_position_id\` int NULL, \`accrual_method\` enum ('monthly', 'yearly', 'manual') NOT NULL DEFAULT 'yearly', \`accrual_rate\` decimal(8,2) NULL, \`max_consecutive_days\` int NULL, \`min_service_months\` int NOT NULL DEFAULT '0', \`allow_negative_balance\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_policy_position\` (\`applicable_position_id\`), INDEX \`IDX_leave_policy_department\` (\`applicable_department_id\`), INDEX \`IDX_leave_policy_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_policy_types\` (\`id\` int NOT NULL AUTO_INCREMENT, \`policy_id\` int NOT NULL, \`leave_type_id\` int NOT NULL, \`annual_quota_days\` decimal(8,2) NOT NULL, \`max_per_request_days\` decimal(8,2) NULL, \`requires_approval\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_policy_type_leave_type\` (\`leave_type_id\`), INDEX \`IDX_leave_policy_type_policy\` (\`policy_id\`), UNIQUE INDEX \`UQ_leave_policy_type_policy_leave_type\` (\`policy_id\`, \`leave_type_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`leave_types\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`code\` varchar(50) NOT NULL, \`description\` text NULL, \`is_paid\` tinyint NOT NULL DEFAULT 1, \`requires_attachment\` tinyint NOT NULL DEFAULT 0, \`is_carry_forward_allowed\` tinyint NOT NULL DEFAULT 0, \`max_carry_forward_days\` decimal(8,2) NOT NULL DEFAULT '0.00', \`max_days_per_year\` decimal(8,2) NOT NULL DEFAULT '0.00', \`gender_restriction\` enum ('male', 'female', 'any') NOT NULL DEFAULT 'any', \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_leave_type_company\` (\`company_id\`), UNIQUE INDEX \`UQ_leave_type_company_code\` (\`company_id\`, \`code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`holidays\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(150) NOT NULL, \`holiday_date\` date NOT NULL, \`is_recurring\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_holiday_date\` (\`holiday_date\`), INDEX \`IDX_holiday_company\` (\`company_id\`), UNIQUE INDEX \`UQ_holiday_company_name_date\` (\`company_id\`, \`name\`, \`holiday_date\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`documents\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`entity_type\` enum ('ONBOARDING', 'offboarding_request', 'EMPLOYEE', 'LEAVE', 'CONTRACT', 'OTHER') NOT NULL, \`entity_id\` int NOT NULL, \`module\` enum ('ONBOARDING', 'offboarding', 'LEAVE', 'EMPLOYEE', 'CONTRACT') NULL, \`document_type\` varchar(100) NULL, \`title\` varchar(255) NOT NULL, \`description\` text NULL, \`file_name\` varchar(255) NOT NULL, \`original_file_name\` varchar(255) NOT NULL, \`mime_type\` varchar(150) NULL, \`file_extension\` varchar(20) NULL, \`file_size\` bigint NULL, \`file_path\` text NOT NULL, \`is_verified\` tinyint NOT NULL DEFAULT 0, \`verified_at\` datetime NULL, \`verified_by_company_user_id\` int NULL, \`uploaded_by_company_user_id\` int NULL, \`expiry_date\` datetime NULL, \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_document_module\` (\`module\`), INDEX \`IDX_document_entity\` (\`entity_type\`, \`entity_id\`), INDEX \`IDX_document_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`attendance_policies\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(255) NOT NULL, \`is_active\` tinyint NOT NULL DEFAULT 0, \`late_after_minutes\` int NOT NULL DEFAULT '10', \`half_day_after_minutes\` int NOT NULL DEFAULT '240', \`absent_after_minutes\` int NOT NULL DEFAULT '480', \`allow_early_checkin\` tinyint NOT NULL DEFAULT 1, \`allow_late_checkout\` tinyint NOT NULL DEFAULT 1, \`auto_absent_if_no_checkin\` tinyint NOT NULL DEFAULT 1, \`requires_manager_approval_for_overtime\` tinyint NOT NULL DEFAULT 0, \`rounding_mode\` enum ('UP', 'DOWN', 'NEAREST') NOT NULL DEFAULT 'NEAREST', \`max_missing_punch_allowed\` int NOT NULL DEFAULT '0', \`weekend_days\` varchar(100) NOT NULL DEFAULT 'SAT,SUN', \`auto_mark_weekend_as_off\` tinyint NOT NULL DEFAULT 1, \`treat_weekend_as_absent_if_scheduled\` tinyint NOT NULL DEFAULT 0, \`holiday_policy_mode\` enum ('OFF', 'PAID', 'UNPAID', 'OPTIONAL') NOT NULL DEFAULT 'OFF', \`authentication_modes\` varchar(120) NOT NULL DEFAULT 'MOBILE_APP,WEB', \`require_geo_fencing\` tinyint NOT NULL DEFAULT 0, \`allow_multi_device_login\` tinyint NOT NULL DEFAULT 0, \`auto_calculate_attendance\` tinyint NOT NULL DEFAULT 1, \`calculation_time\` time NOT NULL DEFAULT '23:59:00', \`grace_period_minutes\` int NOT NULL DEFAULT '10', \`consider_shift_roster\` tinyint NOT NULL DEFAULT 1, \`ignore_missing_checkout_if_hours_valid\` tinyint NOT NULL DEFAULT 1, \`active_company_key\` int AS (CASE WHEN \`is_active\` = 1 THEN \`company_id\` ELSE NULL END) STORED, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_attendance_policy_active_scope\` (\`active_company_key\`), UNIQUE INDEX \`UQ_attendance_policy_company_name\` (\`company_id\`, \`name\`), INDEX \`IDX_attendance_policy_company_active\` (\`company_id\`, \`is_active\`), INDEX \`IDX_attendance_policy_company\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`INSERT INTO \`hrms_db\`.\`typeorm_metadata\`(\`database\`, \`schema\`, \`table\`, \`type\`, \`name\`, \`value\`) VALUES (DEFAULT, ?, ?, ?, ?, ?)`, ["hrms_db","attendance_policies","GENERATED_COLUMN","active_company_key","CASE WHEN `is_active` = 1 THEN `company_id` ELSE NULL END"]);
        await queryRunner.query(`CREATE TABLE \`attendance_checkpoints\` (\`id\` int NOT NULL AUTO_INCREMENT, \`policy_set_id\` int NOT NULL, \`name\` varchar(150) NOT NULL, \`type\` enum ('DEVICE', 'GPS', 'WIFI', 'QR', 'MANUAL') NOT NULL, \`device_id\` int NULL, \`geofence_id\` int NULL, \`wifi_ssid\` varchar(255) NULL, \`is_required\` tinyint NOT NULL DEFAULT 1, \`allow_override\` tinyint NOT NULL DEFAULT 0, \`max_distance_meters\` int NULL, \`strict_mode\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_attendance_checkpoints_policy_name\` (\`policy_set_id\`, \`name\`), INDEX \`IDX_attendance_checkpoints_policy_type\` (\`policy_set_id\`, \`type\`), INDEX \`IDX_attendance_checkpoints_geofence_id\` (\`geofence_id\`), INDEX \`IDX_attendance_checkpoints_device_id\` (\`device_id\`), INDEX \`IDX_attendance_checkpoints_status\` (\`status\`), INDEX \`IDX_attendance_checkpoints_type\` (\`type\`), INDEX \`IDX_attendance_checkpoints_policy_set_id\` (\`policy_set_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`attendance_devices\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`branch_id\` int NULL, \`device_name\` varchar(150) NOT NULL, \`device_code\` varchar(100) NOT NULL, \`device_serial_number\` varchar(150) NOT NULL, \`device_model\` varchar(120) NOT NULL, \`ip_address\` varchar(64) NOT NULL, \`port\` int NOT NULL, \`protocol\` varchar(20) NOT NULL, \`api_username\` varchar(120) NOT NULL, \`api_password\` text NOT NULL, \`sync_mode\` enum ('PULL', 'PUSH') NOT NULL DEFAULT 'PULL', \`status\` enum ('ACTIVE', 'INACTIVE', 'OFFLINE') NOT NULL DEFAULT 'INACTIVE', \`last_sync_at\` timestamp NULL, \`last_heartbeat_at\` timestamp NULL, \`timezone\` varchar(100) NOT NULL, \`location_description\` varchar(255) NULL, \`metadata\` longtext NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, INDEX \`IDX_attendance_devices_company_status\` (\`company_id\`, \`status\`), INDEX \`IDX_attendance_devices_status\` (\`status\`), UNIQUE INDEX \`IDX_attendance_devices_device_code\` (\`device_code\`), INDEX \`IDX_attendance_devices_branch_id\` (\`branch_id\`), INDEX \`IDX_attendance_devices_company_id\` (\`company_id\`), UNIQUE INDEX \`IDX_a7b2730ecbf6007a4f2fa413a2\` (\`device_code\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`attendance_device_sync_logs\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`device_id\` int NOT NULL, \`sync_type\` enum ('MANUAL', 'AUTO', 'WEBHOOK') NOT NULL, \`status\` enum ('SUCCESS', 'FAILED', 'PARTIAL') NOT NULL, \`started_at\` timestamp NOT NULL, \`completed_at\` timestamp NULL, \`records_received\` int NOT NULL DEFAULT '0', \`records_processed\` int NOT NULL DEFAULT '0', \`failed_records\` int NOT NULL DEFAULT '0', \`error_message\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_attendance_device_sync_logs_company_device_started\` (\`company_id\`, \`device_id\`, \`started_at\`), INDEX \`IDX_attendance_device_sync_logs_started_at\` (\`started_at\`), INDEX \`IDX_attendance_device_sync_logs_status\` (\`status\`), INDEX \`IDX_attendance_device_sync_logs_device_id\` (\`device_id\`), INDEX \`IDX_attendance_device_sync_logs_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_breaks\` (\`id\` int NOT NULL AUTO_INCREMENT, \`shift_id\` int NOT NULL, \`name\` varchar(100) NOT NULL, \`break_type\` enum ('LUNCH', 'TEA', 'DINNER', 'PRAYER', 'CUSTOM') NOT NULL, \`start_time\` time NOT NULL, \`end_time\` time NOT NULL, \`duration_minutes\` int NOT NULL DEFAULT '0', \`is_paid\` tinyint NOT NULL DEFAULT 0, \`is_flexible\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_shift_breaks_shift_id\` (\`shift_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_overtime_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`shift_id\` int NOT NULL, \`overtime_start_after_minutes\` int NOT NULL DEFAULT '0', \`max_daily_overtime_minutes\` int NOT NULL DEFAULT '0', \`overtime_rate_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00', \`weekend_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00', \`holiday_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00', \`requires_approval\` tinyint NOT NULL DEFAULT 0, \`auto_calculate\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_shift_overtime_rules_shift\` (\`shift_id\`), INDEX \`IDX_shift_overtime_rules_shift_id\` (\`shift_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_attendance_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`shift_id\` int NOT NULL, \`late_after_minutes\` int NOT NULL DEFAULT '0', \`absent_after_minutes\` int NOT NULL DEFAULT '0', \`half_day_after_minutes\` int NOT NULL DEFAULT '0', \`allow_multiple_checkin\` tinyint NOT NULL DEFAULT 0, \`auto_mark_absent\` tinyint NOT NULL DEFAULT 1, \`allow_mobile_attendance\` tinyint NOT NULL DEFAULT 1, \`allow_remote_attendance\` tinyint NOT NULL DEFAULT 0, \`require_geofence\` tinyint NOT NULL DEFAULT 0, \`require_biometric\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_shift_attendance_rules_shift\` (\`shift_id\`), INDEX \`IDX_shift_attendance_rules_shift_id\` (\`shift_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_rotation_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`rotation_group_id\` int NOT NULL, \`shift_id\` int NULL, \`day_index\` int NOT NULL, \`is_off_day\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_shift_rotation_rules_group_day\` (\`rotation_group_id\`, \`day_index\`), INDEX \`IDX_shift_rotation_rules_shift_id\` (\`shift_id\`), INDEX \`IDX_shift_rotation_rules_rotation_group_id\` (\`rotation_group_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_rotation_groups\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`code\` varchar(50) NOT NULL, \`cycle_days\` int NOT NULL, \`description\` text NULL, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_shift_rotation_groups_company_name\` (\`company_id\`, \`name\`), UNIQUE INDEX \`UQ_shift_rotation_groups_company_code\` (\`company_id\`, \`code\`), INDEX \`IDX_shift_rotation_groups_status\` (\`status\`), INDEX \`IDX_shift_rotation_groups_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_assignments\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`shift_id\` int NOT NULL, \`effective_from\` date NOT NULL, \`effective_to\` date NULL, \`rotation_group_id\` int NULL, \`is_primary\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`assigned_by\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_shift_assignments_status\` (\`status\`), INDEX \`IDX_shift_assignments_rotation_group_id\` (\`rotation_group_id\`), INDEX \`IDX_shift_assignments_shift_id\` (\`shift_id\`), INDEX \`IDX_shift_assignments_employee_id\` (\`employee_id\`), INDEX \`IDX_shift_assignments_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`holiday_groups\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(150) NOT NULL, \`description\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_holiday_groups_company_name\` (\`company_id\`, \`name\`), INDEX \`IDX_holiday_groups_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`attendance_holidays\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`holiday_group_id\` int NOT NULL, \`name\` varchar(200) NOT NULL, \`date\` date NOT NULL, \`type\` enum ('PUBLIC', 'COMPANY', 'RELIGIOUS', 'OPTIONAL') NOT NULL, \`is_paid\` tinyint NOT NULL DEFAULT 1, \`affects_overtime\` tinyint NOT NULL DEFAULT 0, \`counts_as_working_day\` tinyint NOT NULL DEFAULT 0, \`branch_id\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_attendance_holidays_group_name_date\` (\`holiday_group_id\`, \`name\`, \`date\`), INDEX \`IDX_attendance_holidays_branch_id\` (\`branch_id\`), INDEX \`IDX_attendance_holidays_type\` (\`type\`), INDEX \`IDX_attendance_holidays_date\` (\`date\`), INDEX \`IDX_attendance_holidays_holiday_group_id\` (\`holiday_group_id\`), INDEX \`IDX_attendance_holidays_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_schedules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`shift_id\` int NOT NULL, \`schedule_date\` date NOT NULL, \`generated_from_rotation\` tinyint NOT NULL DEFAULT 0, \`override_shift_id\` int NULL, \`holiday_id\` int NULL, \`is_off_day\` tinyint NOT NULL DEFAULT 0, \`assigned_by\` int NULL, \`remarks\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_shift_schedules_company_employee_date\` (\`company_id\`, \`employee_id\`, \`schedule_date\`), INDEX \`IDX_shift_schedules_holiday_id\` (\`holiday_id\`), INDEX \`IDX_shift_schedules_schedule_date\` (\`schedule_date\`), INDEX \`IDX_shift_schedules_override_shift_id\` (\`override_shift_id\`), INDEX \`IDX_shift_schedules_shift_id\` (\`shift_id\`), INDEX \`IDX_shift_schedules_employee_id\` (\`employee_id\`), INDEX \`IDX_shift_schedules_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shifts\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`branch_id\` int NULL, \`department_id\` int NULL, \`name\` varchar(150) NOT NULL, \`code\` varchar(50) NOT NULL, \`description\` text NULL, \`shift_type\` enum ('FIXED', 'FLEXIBLE', 'ROTATIONAL') NOT NULL, \`start_time\` time NOT NULL, \`end_time\` time NOT NULL, \`expected_work_minutes\` int NOT NULL DEFAULT '0', \`minimum_work_minutes\` int NOT NULL DEFAULT '0', \`half_day_minutes\` int NOT NULL DEFAULT '0', \`grace_in_minutes\` int NOT NULL DEFAULT '0', \`grace_out_minutes\` int NOT NULL DEFAULT '0', \`late_after_minutes\` int NOT NULL DEFAULT '0', \`early_leave_after_minutes\` int NOT NULL DEFAULT '0', \`is_night_shift\` tinyint NOT NULL DEFAULT 0, \`crosses_midnight\` tinyint NOT NULL DEFAULT 0, \`allow_overtime\` tinyint NOT NULL DEFAULT 0, \`max_overtime_minutes\` int NOT NULL DEFAULT '0', \`requires_checkout\` tinyint NOT NULL DEFAULT 1, \`allow_early_checkin\` tinyint NOT NULL DEFAULT 1, \`allow_late_checkout\` tinyint NOT NULL DEFAULT 1, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`created_by\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`UQ_shifts_company_name\` (\`company_id\`, \`name\`), UNIQUE INDEX \`UQ_shifts_company_code\` (\`company_id\`, \`code\`), INDEX \`IDX_shifts_status\` (\`status\`), INDEX \`IDX_shifts_department_id\` (\`department_id\`), INDEX \`IDX_shifts_branch_id\` (\`branch_id\`), INDEX \`IDX_shifts_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_templates\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`template_type\` enum ('FIXED', 'ROTATIONAL', 'FLEXIBLE', 'CUSTOM') NOT NULL, \`configuration\` longtext NOT NULL, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_shift_templates_company_name\` (\`company_id\`, \`name\`), INDEX \`IDX_shift_templates_status\` (\`status\`), INDEX \`IDX_shift_templates_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`shift_change_requests\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`current_shift_id\` int NOT NULL, \`requested_shift_id\` int NOT NULL, \`request_date\` date NOT NULL, \`reason\` text NOT NULL, \`status\` enum ('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING', \`approved_by\` int NULL, \`approved_at\` timestamp NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), INDEX \`IDX_shift_change_requests_status\` (\`status\`), INDEX \`IDX_shift_change_requests_request_date\` (\`request_date\`), INDEX \`IDX_shift_change_requests_employee_id\` (\`employee_id\`), INDEX \`IDX_shift_change_requests_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`attendance_settings\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`name\` varchar(150) NOT NULL, \`overtime_start_after_minutes\` int NOT NULL DEFAULT '0', \`max_overtime_minutes_per_day\` int NOT NULL DEFAULT '0', \`max_overtime_minutes_per_month\` int NOT NULL DEFAULT '0', \`overtime_rate_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00', \`holiday_overtime_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00', \`weekend_overtime_multiplier\` decimal(5,2) NOT NULL DEFAULT '1.00', \`requires_approval\` tinyint NOT NULL DEFAULT 0, \`auto_calculate\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_attendance_settings_company_name\` (\`company_id\`, \`name\`), INDEX \`IDX_attendance_settings_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_shift_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`timetable_day_id\` int NOT NULL, \`shift_id\` int NOT NULL, \`priority_order\` int NOT NULL DEFAULT '1', \`is_primary\` tinyint NOT NULL DEFAULT 0, \`max_employees\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_shift_rules_day_priority\` (\`timetable_day_id\`, \`priority_order\`), INDEX \`IDX_timetable_shift_rules_shift_id\` (\`shift_id\`), INDEX \`IDX_timetable_shift_rules_timetable_day_id\` (\`timetable_day_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_days\` (\`id\` int NOT NULL AUTO_INCREMENT, \`timetable_id\` int NOT NULL, \`day_of_week\` tinyint NOT NULL, \`is_working_day\` tinyint NOT NULL DEFAULT 1, \`default_shift_id\` int NULL, \`minimum_work_minutes\` int NOT NULL DEFAULT '0', \`expected_check_in_time\` time NULL, \`expected_check_out_time\` time NULL, \`allow_flexible_time\` tinyint NOT NULL DEFAULT 0, \`flexible_start_from\` time NULL, \`flexible_start_to\` time NULL, \`overtime_allowed\` tinyint NOT NULL DEFAULT 0, \`break_required\` tinyint NOT NULL DEFAULT 0, \`break_minutes\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_days_timetable_day\` (\`timetable_id\`, \`day_of_week\`), INDEX \`IDX_timetable_days_timetable_id\` (\`timetable_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`employee_timetables\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`timetable_id\` int NOT NULL, \`effective_from\` date NOT NULL, \`effective_to\` date NULL, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`assigned_by\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_employee_timetables_status\` (\`status\`), INDEX \`IDX_employee_timetables_effective_from\` (\`effective_from\`), INDEX \`IDX_employee_timetables_timetable_id\` (\`timetable_id\`), INDEX \`IDX_employee_timetables_employee_id\` (\`employee_id\`), INDEX \`IDX_employee_timetables_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_rotation_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`rotation_id\` int NOT NULL, \`day_index\` int NOT NULL, \`shift_id\` int NULL, \`is_off_day\` tinyint NOT NULL DEFAULT 0, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_rotation_rules_rotation_day\` (\`rotation_id\`, \`day_index\`), INDEX \`IDX_timetable_rotation_rules_shift_id\` (\`shift_id\`), INDEX \`IDX_timetable_rotation_rules_rotation_id\` (\`rotation_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_rotations\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`timetable_id\` int NOT NULL, \`name\` varchar(120) NOT NULL, \`cycle_days\` int NOT NULL, \`description\` text NULL, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_rotations_timetable_name\` (\`timetable_id\`, \`name\`), INDEX \`IDX_timetable_rotations_status\` (\`status\`), INDEX \`IDX_timetable_rotations_timetable_id\` (\`timetable_id\`), INDEX \`IDX_timetable_rotations_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_holiday_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`timetable_id\` int NOT NULL, \`holiday_group_id\` int NOT NULL, \`action_type\` enum ('OFF_DAY', 'PAID_HOLIDAY', 'WORKING_HOLIDAY') NOT NULL, \`apply_overtime_rules\` tinyint NOT NULL DEFAULT 0, \`auto_mark_offday\` tinyint NOT NULL DEFAULT 1, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_holiday_rules_timetable_group\` (\`timetable_id\`, \`holiday_group_id\`), INDEX \`IDX_timetable_holiday_rules_holiday_group_id\` (\`holiday_group_id\`), INDEX \`IDX_timetable_holiday_rules_timetable_id\` (\`timetable_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_attendance_rules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`timetable_id\` int NOT NULL, \`late_after_minutes\` int NOT NULL DEFAULT '0', \`half_day_after_minutes\` int NOT NULL DEFAULT '0', \`absent_after_minutes\` int NOT NULL DEFAULT '0', \`allow_early_checkin\` tinyint NOT NULL DEFAULT 1, \`allow_late_checkout\` tinyint NOT NULL DEFAULT 1, \`auto_absent_if_no_checkin\` tinyint NOT NULL DEFAULT 1, \`max_overtime_minutes\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_attendance_rules_timetable\` (\`timetable_id\`), INDEX \`IDX_timetable_attendance_rules_timetable_id\` (\`timetable_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetable_generated_schedules\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`employee_id\` int NOT NULL, \`timetable_id\` int NOT NULL, \`shift_id\` int NULL, \`schedule_date\` date NOT NULL, \`generated_from_rotation\` tinyint NOT NULL DEFAULT 0, \`is_off_day\` tinyint NOT NULL DEFAULT 0, \`holiday_id\` int NULL, \`source_rule\` enum ('rotation', 'day', 'override') NOT NULL DEFAULT 'day', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_timetable_generated_schedules_company_employee_date\` (\`company_id\`, \`employee_id\`, \`schedule_date\`), INDEX \`IDX_timetable_generated_schedules_holiday_id\` (\`holiday_id\`), INDEX \`IDX_timetable_generated_schedules_schedule_date\` (\`schedule_date\`), INDEX \`IDX_timetable_generated_schedules_shift_id\` (\`shift_id\`), INDEX \`IDX_timetable_generated_schedules_timetable_id\` (\`timetable_id\`), INDEX \`IDX_timetable_generated_schedules_employee_id\` (\`employee_id\`), INDEX \`IDX_timetable_generated_schedules_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`timetables\` (\`id\` int NOT NULL AUTO_INCREMENT, \`company_id\` int NOT NULL, \`branch_id\` int NULL, \`name\` varchar(150) NOT NULL, \`code\` varchar(50) NOT NULL, \`description\` text NULL, \`timetable_type\` enum ('FIXED', 'FLEXIBLE', 'ROTATIONAL') NOT NULL, \`timezone\` varchar(100) NOT NULL, \`is_default\` tinyint NOT NULL DEFAULT 0, \`status\` enum ('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE', \`created_by\` int NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, UNIQUE INDEX \`UQ_timetables_company_name\` (\`company_id\`, \`name\`), UNIQUE INDEX \`UQ_timetables_company_code\` (\`company_id\`, \`code\`), INDEX \`IDX_timetables_default\` (\`company_id\`, \`is_default\`), INDEX \`IDX_timetables_status\` (\`status\`), INDEX \`IDX_timetables_branch_id\` (\`branch_id\`), INDEX \`IDX_timetables_company_id\` (\`company_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permission_role\` (\`rolesId\` int NOT NULL, \`permissionsId\` int NOT NULL, INDEX \`IDX_ad249cf4f60be340850d7429e2\` (\`rolesId\`), INDEX \`IDX_f131407a830249c1b575316321\` (\`permissionsId\`), PRIMARY KEY (\`rolesId\`, \`permissionsId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`role_user\` (\`usersId\` int NOT NULL, \`rolesId\` int NOT NULL, INDEX \`IDX_788a980aa4fa89a8859419146a\` (\`usersId\`), INDEX \`IDX_eb446d431a1abb9801e6ade445\` (\`rolesId\`), PRIMARY KEY (\`usersId\`, \`rolesId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`permission_user\` (\`usersId\` int NOT NULL, \`permissionsId\` int NOT NULL, INDEX \`IDX_eebf5c79455539db169da54830\` (\`usersId\`), INDEX \`IDX_fe30ce4377c9320e2b8a23c836\` (\`permissionsId\`), PRIMARY KEY (\`usersId\`, \`permissionsId\`)) ENGINE=InnoDB`);
        const __hasFkAdd_FK_74ec3aa89216198cb0cfd6edc24 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_roles', 'FK_74ec3aa89216198cb0cfd6edc24']);
        if (!__hasFkAdd_FK_74ec3aa89216198cb0cfd6edc24.length) {
          await queryRunner.query(`ALTER TABLE \`company_user_roles\` ADD CONSTRAINT \`FK_74ec3aa89216198cb0cfd6edc24\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_c1314bc5a97bc33594274eba554 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_roles', 'FK_c1314bc5a97bc33594274eba554']);
        if (!__hasFkAdd_FK_c1314bc5a97bc33594274eba554.length) {
          await queryRunner.query(`ALTER TABLE \`company_user_roles\` ADD CONSTRAINT \`FK_c1314bc5a97bc33594274eba554\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_42b8ee52319678d53cbfaf3f057 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_permissions', 'FK_42b8ee52319678d53cbfaf3f057']);
        if (!__hasFkAdd_FK_42b8ee52319678d53cbfaf3f057.length) {
          await queryRunner.query(`ALTER TABLE \`company_user_permissions\` ADD CONSTRAINT \`FK_42b8ee52319678d53cbfaf3f057\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_acb030193db62480c2fd8b2e352 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_permissions', 'FK_acb030193db62480c2fd8b2e352']);
        if (!__hasFkAdd_FK_acb030193db62480c2fd8b2e352.length) {
          await queryRunner.query(`ALTER TABLE \`company_user_permissions\` ADD CONSTRAINT \`FK_acb030193db62480c2fd8b2e352\` FOREIGN KEY (\`permission_id\`) REFERENCES \`permissions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6fddbffebbac0eba9eb916be7c0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_6fddbffebbac0eba9eb916be7c0']);
        if (!__hasFkAdd_FK_6fddbffebbac0eba9eb916be7c0.length) {
          await queryRunner.query(`ALTER TABLE \`employee_positions\` ADD CONSTRAINT \`FK_6fddbffebbac0eba9eb916be7c0\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_aa29183a0652f1a189b9d7bcc9f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_aa29183a0652f1a189b9d7bcc9f']);
        if (!__hasFkAdd_FK_aa29183a0652f1a189b9d7bcc9f.length) {
          await queryRunner.query(`ALTER TABLE \`employee_positions\` ADD CONSTRAINT \`FK_aa29183a0652f1a189b9d7bcc9f\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_1f97107ff3fd45a193d7d39761b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_1f97107ff3fd45a193d7d39761b']);
        if (!__hasFkAdd_FK_1f97107ff3fd45a193d7d39761b.length) {
          await queryRunner.query(`ALTER TABLE \`employee_positions\` ADD CONSTRAINT \`FK_1f97107ff3fd45a193d7d39761b\` FOREIGN KEY (\`position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6003d1059182b224978835d35ef = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_6003d1059182b224978835d35ef']);
        if (!__hasFkAdd_FK_6003d1059182b224978835d35ef.length) {
          await queryRunner.query(`ALTER TABLE \`employee_positions\` ADD CONSTRAINT \`FK_6003d1059182b224978835d35ef\` FOREIGN KEY (\`designation_id\`) REFERENCES \`designations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6844c44333df4976bc4db69aec8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_6844c44333df4976bc4db69aec8']);
        if (!__hasFkAdd_FK_6844c44333df4976bc4db69aec8.length) {
          await queryRunner.query(`ALTER TABLE \`positions\` ADD CONSTRAINT \`FK_6844c44333df4976bc4db69aec8\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_869da2fb64cbdc5eb09b0a732d1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_869da2fb64cbdc5eb09b0a732d1']);
        if (!__hasFkAdd_FK_869da2fb64cbdc5eb09b0a732d1.length) {
          await queryRunner.query(`ALTER TABLE \`positions\` ADD CONSTRAINT \`FK_869da2fb64cbdc5eb09b0a732d1\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e413c6578fcdae9a8fd673c5bc7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_e413c6578fcdae9a8fd673c5bc7']);
        if (!__hasFkAdd_FK_e413c6578fcdae9a8fd673c5bc7.length) {
          await queryRunner.query(`ALTER TABLE \`positions\` ADD CONSTRAINT \`FK_e413c6578fcdae9a8fd673c5bc7\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_333d281ecd8a4f2deaff228d489 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_333d281ecd8a4f2deaff228d489']);
        if (!__hasFkAdd_FK_333d281ecd8a4f2deaff228d489.length) {
          await queryRunner.query(`ALTER TABLE \`positions\` ADD CONSTRAINT \`FK_333d281ecd8a4f2deaff228d489\` FOREIGN KEY (\`designation_id\`) REFERENCES \`designations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_3e83545af5e55e42004fcea83d4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_3e83545af5e55e42004fcea83d4']);
        if (!__hasFkAdd_FK_3e83545af5e55e42004fcea83d4.length) {
          await queryRunner.query(`ALTER TABLE \`positions\` ADD CONSTRAINT \`FK_3e83545af5e55e42004fcea83d4\` FOREIGN KEY (\`reports_to_position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_abf80c712e7c247e7894fc233d8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_addresses', 'FK_abf80c712e7c247e7894fc233d8']);
        if (!__hasFkAdd_FK_abf80c712e7c247e7894fc233d8.length) {
          await queryRunner.query(`ALTER TABLE \`employee_addresses\` ADD CONSTRAINT \`FK_abf80c712e7c247e7894fc233d8\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_362cbc67d2ac1ee20a1f121c8cf = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_bank_accounts', 'FK_362cbc67d2ac1ee20a1f121c8cf']);
        if (!__hasFkAdd_FK_362cbc67d2ac1ee20a1f121c8cf.length) {
          await queryRunner.query(`ALTER TABLE \`employee_bank_accounts\` ADD CONSTRAINT \`FK_362cbc67d2ac1ee20a1f121c8cf\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_041514c529c086579bf5e564cd8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_contacts', 'FK_041514c529c086579bf5e564cd8']);
        if (!__hasFkAdd_FK_041514c529c086579bf5e564cd8.length) {
          await queryRunner.query(`ALTER TABLE \`employee_contacts\` ADD CONSTRAINT \`FK_041514c529c086579bf5e564cd8\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_969a93ad90f5becbced7353f448 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_designations', 'FK_969a93ad90f5becbced7353f448']);
        if (!__hasFkAdd_FK_969a93ad90f5becbced7353f448.length) {
          await queryRunner.query(`ALTER TABLE \`employee_designations\` ADD CONSTRAINT \`FK_969a93ad90f5becbced7353f448\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_85d002e5beceec079282e48bf4f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_designations', 'FK_85d002e5beceec079282e48bf4f']);
        if (!__hasFkAdd_FK_85d002e5beceec079282e48bf4f.length) {
          await queryRunner.query(`ALTER TABLE \`employee_designations\` ADD CONSTRAINT \`FK_85d002e5beceec079282e48bf4f\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_61abc802fc379b5cb73acf76043 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_designations', 'FK_61abc802fc379b5cb73acf76043']);
        if (!__hasFkAdd_FK_61abc802fc379b5cb73acf76043.length) {
          await queryRunner.query(`ALTER TABLE \`employee_designations\` ADD CONSTRAINT \`FK_61abc802fc379b5cb73acf76043\` FOREIGN KEY (\`designation_id\`) REFERENCES \`designations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ed390b2466f6f70591a7d93e0a1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_departments', 'FK_ed390b2466f6f70591a7d93e0a1']);
        if (!__hasFkAdd_FK_ed390b2466f6f70591a7d93e0a1.length) {
          await queryRunner.query(`ALTER TABLE \`employee_departments\` ADD CONSTRAINT \`FK_ed390b2466f6f70591a7d93e0a1\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_b42531bfb853f20d06f11776535 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_departments', 'FK_b42531bfb853f20d06f11776535']);
        if (!__hasFkAdd_FK_b42531bfb853f20d06f11776535.length) {
          await queryRunner.query(`ALTER TABLE \`employee_departments\` ADD CONSTRAINT \`FK_b42531bfb853f20d06f11776535\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_7fce49bcbfe15a73953b2809944 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_documents', 'FK_7fce49bcbfe15a73953b2809944']);
        if (!__hasFkAdd_FK_7fce49bcbfe15a73953b2809944.length) {
          await queryRunner.query(`ALTER TABLE \`employee_documents\` ADD CONSTRAINT \`FK_7fce49bcbfe15a73953b2809944\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_efcc97184c5e2beeb92294bfda1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_documents', 'FK_efcc97184c5e2beeb92294bfda1']);
        if (!__hasFkAdd_FK_efcc97184c5e2beeb92294bfda1.length) {
          await queryRunner.query(`ALTER TABLE \`employee_documents\` ADD CONSTRAINT \`FK_efcc97184c5e2beeb92294bfda1\` FOREIGN KEY (\`uploaded_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6f176e65e744f1a1736754af872 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_experiences', 'FK_6f176e65e744f1a1736754af872']);
        if (!__hasFkAdd_FK_6f176e65e744f1a1736754af872.length) {
          await queryRunner.query(`ALTER TABLE \`employee_experiences\` ADD CONSTRAINT \`FK_6f176e65e744f1a1736754af872\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_29462e62bd15a63f0d87d3cd1cc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_identifications', 'FK_29462e62bd15a63f0d87d3cd1cc']);
        if (!__hasFkAdd_FK_29462e62bd15a63f0d87d3cd1cc.length) {
          await queryRunner.query(`ALTER TABLE \`employee_identifications\` ADD CONSTRAINT \`FK_29462e62bd15a63f0d87d3cd1cc\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a08956e5e42a044b2912e011ed9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_academic_qualifications', 'FK_a08956e5e42a044b2912e011ed9']);
        if (!__hasFkAdd_FK_a08956e5e42a044b2912e011ed9.length) {
          await queryRunner.query(`ALTER TABLE \`employee_academic_qualifications\` ADD CONSTRAINT \`FK_a08956e5e42a044b2912e011ed9\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_8f377c5e56b23f029e5e582aea0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_academic_qualifications', 'FK_8f377c5e56b23f029e5e582aea0']);
        if (!__hasFkAdd_FK_8f377c5e56b23f029e5e582aea0.length) {
          await queryRunner.query(`ALTER TABLE \`employee_academic_qualifications\` ADD CONSTRAINT \`FK_8f377c5e56b23f029e5e582aea0\` FOREIGN KEY (\`uploaded_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_198a52bcdc38fc3fb3d75ae0813 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_professional_qualifications', 'FK_198a52bcdc38fc3fb3d75ae0813']);
        if (!__hasFkAdd_FK_198a52bcdc38fc3fb3d75ae0813.length) {
          await queryRunner.query(`ALTER TABLE \`employee_professional_qualifications\` ADD CONSTRAINT \`FK_198a52bcdc38fc3fb3d75ae0813\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a22c2d167d33e363ee7ba6bb2c4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_professional_qualifications', 'FK_a22c2d167d33e363ee7ba6bb2c4']);
        if (!__hasFkAdd_FK_a22c2d167d33e363ee7ba6bb2c4.length) {
          await queryRunner.query(`ALTER TABLE \`employee_professional_qualifications\` ADD CONSTRAINT \`FK_a22c2d167d33e363ee7ba6bb2c4\` FOREIGN KEY (\`uploaded_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_bebe2625e8606fe8e55f9f6106a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_relatives', 'FK_bebe2625e8606fe8e55f9f6106a']);
        if (!__hasFkAdd_FK_bebe2625e8606fe8e55f9f6106a.length) {
          await queryRunner.query(`ALTER TABLE \`employee_relatives\` ADD CONSTRAINT \`FK_bebe2625e8606fe8e55f9f6106a\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_640b443f67415a68f5386f5e36e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_640b443f67415a68f5386f5e36e']);
        if (!__hasFkAdd_FK_640b443f67415a68f5386f5e36e.length) {
          await queryRunner.query(`ALTER TABLE \`employees\` ADD CONSTRAINT \`FK_640b443f67415a68f5386f5e36e\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ebb588125dcb322894cb6494f26 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_ebb588125dcb322894cb6494f26']);
        if (!__hasFkAdd_FK_ebb588125dcb322894cb6494f26.length) {
          await queryRunner.query(`ALTER TABLE \`employees\` ADD CONSTRAINT \`FK_ebb588125dcb322894cb6494f26\` FOREIGN KEY (\`primary_branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_78c4d0dd8c753633afce6ecaf67 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_78c4d0dd8c753633afce6ecaf67']);
        if (!__hasFkAdd_FK_78c4d0dd8c753633afce6ecaf67.length) {
          await queryRunner.query(`ALTER TABLE \`employees\` ADD CONSTRAINT \`FK_78c4d0dd8c753633afce6ecaf67\` FOREIGN KEY (\`primary_department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_15b8425f2c72b1c6b951045a595 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_15b8425f2c72b1c6b951045a595']);
        if (!__hasFkAdd_FK_15b8425f2c72b1c6b951045a595.length) {
          await queryRunner.query(`ALTER TABLE \`employees\` ADD CONSTRAINT \`FK_15b8425f2c72b1c6b951045a595\` FOREIGN KEY (\`primary_position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_7cd9e62424388f822b59689716e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_7cd9e62424388f822b59689716e']);
        if (!__hasFkAdd_FK_7cd9e62424388f822b59689716e.length) {
          await queryRunner.query(`ALTER TABLE \`employees\` ADD CONSTRAINT \`FK_7cd9e62424388f822b59689716e\` FOREIGN KEY (\`primary_designation_id\`) REFERENCES \`designations\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6a6e3e4cd4f6e58ffa33683e570 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_6a6e3e4cd4f6e58ffa33683e570']);
        if (!__hasFkAdd_FK_6a6e3e4cd4f6e58ffa33683e570.length) {
          await queryRunner.query(`ALTER TABLE \`employees\` ADD CONSTRAINT \`FK_6a6e3e4cd4f6e58ffa33683e570\` FOREIGN KEY (\`reports_to\`) REFERENCES \`employees\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_afa94101357165af73943deb8f3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['designations', 'FK_afa94101357165af73943deb8f3']);
        if (!__hasFkAdd_FK_afa94101357165af73943deb8f3.length) {
          await queryRunner.query(`ALTER TABLE \`designations\` ADD CONSTRAINT \`FK_afa94101357165af73943deb8f3\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_97884615dba807341722aa7aa4b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['designations', 'FK_97884615dba807341722aa7aa4b']);
        if (!__hasFkAdd_FK_97884615dba807341722aa7aa4b.length) {
          await queryRunner.query(`ALTER TABLE \`designations\` ADD CONSTRAINT \`FK_97884615dba807341722aa7aa4b\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_541e3d07c93baa9cc42b149a5fb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['departments', 'FK_541e3d07c93baa9cc42b149a5fb']);
        if (!__hasFkAdd_FK_541e3d07c93baa9cc42b149a5fb.length) {
          await queryRunner.query(`ALTER TABLE \`departments\` ADD CONSTRAINT \`FK_541e3d07c93baa9cc42b149a5fb\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_40b8818a0e3324c859199265503 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['departments', 'FK_40b8818a0e3324c859199265503']);
        if (!__hasFkAdd_FK_40b8818a0e3324c859199265503.length) {
          await queryRunner.query(`ALTER TABLE \`departments\` ADD CONSTRAINT \`FK_40b8818a0e3324c859199265503\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_700b0b13f494cb37b6ca929e79b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['departments', 'FK_700b0b13f494cb37b6ca929e79b']);
        if (!__hasFkAdd_FK_700b0b13f494cb37b6ca929e79b.length) {
          await queryRunner.query(`ALTER TABLE \`departments\` ADD CONSTRAINT \`FK_700b0b13f494cb37b6ca929e79b\` FOREIGN KEY (\`parent_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5973f79e64a27c506b07cd84b29 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['branches', 'FK_5973f79e64a27c506b07cd84b29']);
        if (!__hasFkAdd_FK_5973f79e64a27c506b07cd84b29.length) {
          await queryRunner.query(`ALTER TABLE \`branches\` ADD CONSTRAINT \`FK_5973f79e64a27c506b07cd84b29\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_cea1bcbfccb70283f658dcfb6db = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_branch_accesses', 'FK_cea1bcbfccb70283f658dcfb6db']);
        if (!__hasFkAdd_FK_cea1bcbfccb70283f658dcfb6db.length) {
          await queryRunner.query(`ALTER TABLE \`company_user_branch_accesses\` ADD CONSTRAINT \`FK_cea1bcbfccb70283f658dcfb6db\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_676bfdb821c9989808c8139a29f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_branch_accesses', 'FK_676bfdb821c9989808c8139a29f']);
        if (!__hasFkAdd_FK_676bfdb821c9989808c8139a29f.length) {
          await queryRunner.query(`ALTER TABLE \`company_user_branch_accesses\` ADD CONSTRAINT \`FK_676bfdb821c9989808c8139a29f\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0a12e8588834314e38e43d6f5a7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_users', 'FK_0a12e8588834314e38e43d6f5a7']);
        if (!__hasFkAdd_FK_0a12e8588834314e38e43d6f5a7.length) {
          await queryRunner.query(`ALTER TABLE \`company_users\` ADD CONSTRAINT \`FK_0a12e8588834314e38e43d6f5a7\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0363bc7120c6f81b0fdf3a77a8e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_users', 'FK_0363bc7120c6f81b0fdf3a77a8e']);
        if (!__hasFkAdd_FK_0363bc7120c6f81b0fdf3a77a8e.length) {
          await queryRunner.query(`ALTER TABLE \`company_users\` ADD CONSTRAINT \`FK_0363bc7120c6f81b0fdf3a77a8e\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_bb3dbac491a9fb1c005e6ff2f1d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_bb3dbac491a9fb1c005e6ff2f1d']);
        if (!__hasFkAdd_FK_bb3dbac491a9fb1c005e6ff2f1d.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` ADD CONSTRAINT \`FK_bb3dbac491a9fb1c005e6ff2f1d\` FOREIGN KEY (\`onboarding_request_id\`) REFERENCES \`onboarding_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_37ac5b77082a70c3b7e61bb08a5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_37ac5b77082a70c3b7e61bb08a5']);
        if (!__hasFkAdd_FK_37ac5b77082a70c3b7e61bb08a5.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` ADD CONSTRAINT \`FK_37ac5b77082a70c3b7e61bb08a5\` FOREIGN KEY (\`workflow_step_id\`) REFERENCES \`onboarding_workflow_steps\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_79fc4bd47ed67a55c2eb5d5cc4c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_79fc4bd47ed67a55c2eb5d5cc4c']);
        if (!__hasFkAdd_FK_79fc4bd47ed67a55c2eb5d5cc4c.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` ADD CONSTRAINT \`FK_79fc4bd47ed67a55c2eb5d5cc4c\` FOREIGN KEY (\`assigned_department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_fb9b788affb08dd232642fa791d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_fb9b788affb08dd232642fa791d']);
        if (!__hasFkAdd_FK_fb9b788affb08dd232642fa791d.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` ADD CONSTRAINT \`FK_fb9b788affb08dd232642fa791d\` FOREIGN KEY (\`assigned_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_c768bd7d398488153724abac46e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_c768bd7d398488153724abac46e']);
        if (!__hasFkAdd_FK_c768bd7d398488153724abac46e.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` ADD CONSTRAINT \`FK_c768bd7d398488153724abac46e\` FOREIGN KEY (\`created_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_7eb6a9dad2c5e3acf2c155bf9bb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_7eb6a9dad2c5e3acf2c155bf9bb']);
        if (!__hasFkAdd_FK_7eb6a9dad2c5e3acf2c155bf9bb.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` ADD CONSTRAINT \`FK_7eb6a9dad2c5e3acf2c155bf9bb\` FOREIGN KEY (\`completed_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_b67cafd6b6a18641620ca701c0c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_b67cafd6b6a18641620ca701c0c']);
        if (!__hasFkAdd_FK_b67cafd6b6a18641620ca701c0c.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` ADD CONSTRAINT \`FK_b67cafd6b6a18641620ca701c0c\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`onboarding_workflows\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_37f25f4fb277d8b4a520e36936c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_37f25f4fb277d8b4a520e36936c']);
        if (!__hasFkAdd_FK_37f25f4fb277d8b4a520e36936c.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` ADD CONSTRAINT \`FK_37f25f4fb277d8b4a520e36936c\` FOREIGN KEY (\`assigned_department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_da33e93da314259268b6ce0a86d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_da33e93da314259268b6ce0a86d']);
        if (!__hasFkAdd_FK_da33e93da314259268b6ce0a86d.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` ADD CONSTRAINT \`FK_da33e93da314259268b6ce0a86d\` FOREIGN KEY (\`assigned_branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ea1d76a8eda488dea9e45832f36 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_ea1d76a8eda488dea9e45832f36']);
        if (!__hasFkAdd_FK_ea1d76a8eda488dea9e45832f36.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` ADD CONSTRAINT \`FK_ea1d76a8eda488dea9e45832f36\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_329de14b9b44cad50d5571946c1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_329de14b9b44cad50d5571946c1']);
        if (!__hasFkAdd_FK_329de14b9b44cad50d5571946c1.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` ADD CONSTRAINT \`FK_329de14b9b44cad50d5571946c1\` FOREIGN KEY (\`position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5918a8d4aa34c40c87888e82a73 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_5918a8d4aa34c40c87888e82a73']);
        if (!__hasFkAdd_FK_5918a8d4aa34c40c87888e82a73.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` ADD CONSTRAINT \`FK_5918a8d4aa34c40c87888e82a73\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d2f578b3932a7d77ca678368f53 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_approvals', 'FK_d2f578b3932a7d77ca678368f53']);
        if (!__hasFkAdd_FK_d2f578b3932a7d77ca678368f53.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_approvals\` ADD CONSTRAINT \`FK_d2f578b3932a7d77ca678368f53\` FOREIGN KEY (\`onboarding_request_id\`) REFERENCES \`onboarding_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_cb0b47352929a662971e3905013 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_approvals', 'FK_cb0b47352929a662971e3905013']);
        if (!__hasFkAdd_FK_cb0b47352929a662971e3905013.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_approvals\` ADD CONSTRAINT \`FK_cb0b47352929a662971e3905013\` FOREIGN KEY (\`workflow_step_id\`) REFERENCES \`onboarding_workflow_steps\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_410914c976c0b46cbc2c6817f3a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_approvals', 'FK_410914c976c0b46cbc2c6817f3a']);
        if (!__hasFkAdd_FK_410914c976c0b46cbc2c6817f3a.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_approvals\` ADD CONSTRAINT \`FK_410914c976c0b46cbc2c6817f3a\` FOREIGN KEY (\`approver_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e06b9bbbd4aa167f74f5e691133 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_audit_logs', 'FK_e06b9bbbd4aa167f74f5e691133']);
        if (!__hasFkAdd_FK_e06b9bbbd4aa167f74f5e691133.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_audit_logs\` ADD CONSTRAINT \`FK_e06b9bbbd4aa167f74f5e691133\` FOREIGN KEY (\`onboarding_request_id\`) REFERENCES \`onboarding_requests\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_100c17e1cd9f07ac1e4ca13178d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_audit_logs', 'FK_100c17e1cd9f07ac1e4ca13178d']);
        if (!__hasFkAdd_FK_100c17e1cd9f07ac1e4ca13178d.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_audit_logs\` ADD CONSTRAINT \`FK_100c17e1cd9f07ac1e4ca13178d\` FOREIGN KEY (\`actor_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_02e61f86d8b6730449a26586bcd = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_02e61f86d8b6730449a26586bcd']);
        if (!__hasFkAdd_FK_02e61f86d8b6730449a26586bcd.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_requests\` ADD CONSTRAINT \`FK_02e61f86d8b6730449a26586bcd\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_f38b58308ed8f5f0755af9e5bd6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_f38b58308ed8f5f0755af9e5bd6']);
        if (!__hasFkAdd_FK_f38b58308ed8f5f0755af9e5bd6.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_requests\` ADD CONSTRAINT \`FK_f38b58308ed8f5f0755af9e5bd6\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d90b6c7b682bc4701998e0e5b15 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_d90b6c7b682bc4701998e0e5b15']);
        if (!__hasFkAdd_FK_d90b6c7b682bc4701998e0e5b15.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_requests\` ADD CONSTRAINT \`FK_d90b6c7b682bc4701998e0e5b15\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`onboarding_workflows\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_00ca02c67f89a3933b3f8c6682b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_00ca02c67f89a3933b3f8c6682b']);
        if (!__hasFkAdd_FK_00ca02c67f89a3933b3f8c6682b.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_requests\` ADD CONSTRAINT \`FK_00ca02c67f89a3933b3f8c6682b\` FOREIGN KEY (\`created_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_58e6f74f15f2ed2bb7497ad5ad8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_58e6f74f15f2ed2bb7497ad5ad8']);
        if (!__hasFkAdd_FK_58e6f74f15f2ed2bb7497ad5ad8.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_requests\` ADD CONSTRAINT \`FK_58e6f74f15f2ed2bb7497ad5ad8\` FOREIGN KEY (\`finalized_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e321f50dd817bca743078ae03f4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflows', 'FK_e321f50dd817bca743078ae03f4']);
        if (!__hasFkAdd_FK_e321f50dd817bca743078ae03f4.length) {
          await queryRunner.query(`ALTER TABLE \`onboarding_workflows\` ADD CONSTRAINT \`FK_e321f50dd817bca743078ae03f4\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ca1782fe96cc14adf7afa6def6a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_tasks', 'FK_ca1782fe96cc14adf7afa6def6a']);
        if (!__hasFkAdd_FK_ca1782fe96cc14adf7afa6def6a.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_tasks\` ADD CONSTRAINT \`FK_ca1782fe96cc14adf7afa6def6a\` FOREIGN KEY (\`offboarding_request_id\`) REFERENCES \`offboarding_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_8504e4a38faa0e7793d5789a1c4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_tasks', 'FK_8504e4a38faa0e7793d5789a1c4']);
        if (!__hasFkAdd_FK_8504e4a38faa0e7793d5789a1c4.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_tasks\` ADD CONSTRAINT \`FK_8504e4a38faa0e7793d5789a1c4\` FOREIGN KEY (\`workflow_step_id\`) REFERENCES \`offboarding_workflow_steps\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_518681b393df9a750dddfbee839 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_tasks', 'FK_518681b393df9a750dddfbee839']);
        if (!__hasFkAdd_FK_518681b393df9a750dddfbee839.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_tasks\` ADD CONSTRAINT \`FK_518681b393df9a750dddfbee839\` FOREIGN KEY (\`assigned_to_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_f6af6450256b6ad2474ae75a44d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_f6af6450256b6ad2474ae75a44d']);
        if (!__hasFkAdd_FK_f6af6450256b6ad2474ae75a44d.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` ADD CONSTRAINT \`FK_f6af6450256b6ad2474ae75a44d\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`offboarding_workflows\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_40fd0acca667c1eb0a367a9cb7e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_40fd0acca667c1eb0a367a9cb7e']);
        if (!__hasFkAdd_FK_40fd0acca667c1eb0a367a9cb7e.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` ADD CONSTRAINT \`FK_40fd0acca667c1eb0a367a9cb7e\` FOREIGN KEY (\`assigned_branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0e8e6012e4a99834fa2134fd9dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_0e8e6012e4a99834fa2134fd9dc']);
        if (!__hasFkAdd_FK_0e8e6012e4a99834fa2134fd9dc.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` ADD CONSTRAINT \`FK_0e8e6012e4a99834fa2134fd9dc\` FOREIGN KEY (\`assigned_department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d760de2926b0ca478a349135635 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_d760de2926b0ca478a349135635']);
        if (!__hasFkAdd_FK_d760de2926b0ca478a349135635.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` ADD CONSTRAINT \`FK_d760de2926b0ca478a349135635\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_fde93bcbed6b4925bda2b652253 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_fde93bcbed6b4925bda2b652253']);
        if (!__hasFkAdd_FK_fde93bcbed6b4925bda2b652253.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` ADD CONSTRAINT \`FK_fde93bcbed6b4925bda2b652253\` FOREIGN KEY (\`position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_bda09ef8780f77d58ebe5078284 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_bda09ef8780f77d58ebe5078284']);
        if (!__hasFkAdd_FK_bda09ef8780f77d58ebe5078284.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` ADD CONSTRAINT \`FK_bda09ef8780f77d58ebe5078284\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_fdbdf70289a17bdfa8b3d156c1b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_approvals', 'FK_fdbdf70289a17bdfa8b3d156c1b']);
        if (!__hasFkAdd_FK_fdbdf70289a17bdfa8b3d156c1b.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_approvals\` ADD CONSTRAINT \`FK_fdbdf70289a17bdfa8b3d156c1b\` FOREIGN KEY (\`offboarding_request_id\`) REFERENCES \`offboarding_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_4c7f6855d25ff44db3548477dce = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_approvals', 'FK_4c7f6855d25ff44db3548477dce']);
        if (!__hasFkAdd_FK_4c7f6855d25ff44db3548477dce.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_approvals\` ADD CONSTRAINT \`FK_4c7f6855d25ff44db3548477dce\` FOREIGN KEY (\`workflow_step_id\`) REFERENCES \`offboarding_workflow_steps\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_caf88fe3fa994b5e16133d67654 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_approvals', 'FK_caf88fe3fa994b5e16133d67654']);
        if (!__hasFkAdd_FK_caf88fe3fa994b5e16133d67654.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_approvals\` ADD CONSTRAINT \`FK_caf88fe3fa994b5e16133d67654\` FOREIGN KEY (\`approver_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d845c74fcdd1022ff5928890a65 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_audit_logs', 'FK_d845c74fcdd1022ff5928890a65']);
        if (!__hasFkAdd_FK_d845c74fcdd1022ff5928890a65.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_audit_logs\` ADD CONSTRAINT \`FK_d845c74fcdd1022ff5928890a65\` FOREIGN KEY (\`offboarding_request_id\`) REFERENCES \`offboarding_requests\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e05407a0672babb347388ffa793 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_audit_logs', 'FK_e05407a0672babb347388ffa793']);
        if (!__hasFkAdd_FK_e05407a0672babb347388ffa793.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_audit_logs\` ADD CONSTRAINT \`FK_e05407a0672babb347388ffa793\` FOREIGN KEY (\`actor_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ac3119d04e4b30ea60ffd30d1f0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_clearances', 'FK_ac3119d04e4b30ea60ffd30d1f0']);
        if (!__hasFkAdd_FK_ac3119d04e4b30ea60ffd30d1f0.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_clearances\` ADD CONSTRAINT \`FK_ac3119d04e4b30ea60ffd30d1f0\` FOREIGN KEY (\`offboarding_request_id\`) REFERENCES \`offboarding_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_90fbedcb9a71b67330b836b5702 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_clearances', 'FK_90fbedcb9a71b67330b836b5702']);
        if (!__hasFkAdd_FK_90fbedcb9a71b67330b836b5702.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_clearances\` ADD CONSTRAINT \`FK_90fbedcb9a71b67330b836b5702\` FOREIGN KEY (\`cleared_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d47153fa0f74a75b758f05ecf6b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_d47153fa0f74a75b758f05ecf6b']);
        if (!__hasFkAdd_FK_d47153fa0f74a75b758f05ecf6b.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_requests\` ADD CONSTRAINT \`FK_d47153fa0f74a75b758f05ecf6b\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_bfd6dc7744409308e735fd4263f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_bfd6dc7744409308e735fd4263f']);
        if (!__hasFkAdd_FK_bfd6dc7744409308e735fd4263f.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_requests\` ADD CONSTRAINT \`FK_bfd6dc7744409308e735fd4263f\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_46663dd1dac65f02e3f66ff1544 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_46663dd1dac65f02e3f66ff1544']);
        if (!__hasFkAdd_FK_46663dd1dac65f02e3f66ff1544.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_requests\` ADD CONSTRAINT \`FK_46663dd1dac65f02e3f66ff1544\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_98f40fbc0af40216c80c2d2bc3b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_98f40fbc0af40216c80c2d2bc3b']);
        if (!__hasFkAdd_FK_98f40fbc0af40216c80c2d2bc3b.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_requests\` ADD CONSTRAINT \`FK_98f40fbc0af40216c80c2d2bc3b\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_32083abf023e566231be6000aee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_32083abf023e566231be6000aee']);
        if (!__hasFkAdd_FK_32083abf023e566231be6000aee.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_requests\` ADD CONSTRAINT \`FK_32083abf023e566231be6000aee\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`offboarding_workflows\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_529245d10757f8b0493bf9d9c9f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_529245d10757f8b0493bf9d9c9f']);
        if (!__hasFkAdd_FK_529245d10757f8b0493bf9d9c9f.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_requests\` ADD CONSTRAINT \`FK_529245d10757f8b0493bf9d9c9f\` FOREIGN KEY (\`created_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a97a128153d3a74396ac8a57219 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflows', 'FK_a97a128153d3a74396ac8a57219']);
        if (!__hasFkAdd_FK_a97a128153d3a74396ac8a57219.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflows\` ADD CONSTRAINT \`FK_a97a128153d3a74396ac8a57219\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_cf83c129f16ecc72bee03993047 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflows', 'FK_cf83c129f16ecc72bee03993047']);
        if (!__hasFkAdd_FK_cf83c129f16ecc72bee03993047.length) {
          await queryRunner.query(`ALTER TABLE \`offboarding_workflows\` ADD CONSTRAINT \`FK_cf83c129f16ecc72bee03993047\` FOREIGN KEY (\`created_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6c8503a66476faa65ecad636370 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_audit_logs', 'FK_6c8503a66476faa65ecad636370']);
        if (!__hasFkAdd_FK_6c8503a66476faa65ecad636370.length) {
          await queryRunner.query(`ALTER TABLE \`leave_audit_logs\` ADD CONSTRAINT \`FK_6c8503a66476faa65ecad636370\` FOREIGN KEY (\`leave_request_id\`) REFERENCES \`leave_requests\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_9a7498586720850726a84bf1a73 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_audit_logs', 'FK_9a7498586720850726a84bf1a73']);
        if (!__hasFkAdd_FK_9a7498586720850726a84bf1a73.length) {
          await queryRunner.query(`ALTER TABLE \`leave_audit_logs\` ADD CONSTRAINT \`FK_9a7498586720850726a84bf1a73\` FOREIGN KEY (\`actor_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_eda04fe4e7348cb18f468a30064 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_documents', 'FK_eda04fe4e7348cb18f468a30064']);
        if (!__hasFkAdd_FK_eda04fe4e7348cb18f468a30064.length) {
          await queryRunner.query(`ALTER TABLE \`leave_documents\` ADD CONSTRAINT \`FK_eda04fe4e7348cb18f468a30064\` FOREIGN KEY (\`leave_request_id\`) REFERENCES \`leave_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_81f749951ce1dde3b12679cc0b6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_documents', 'FK_81f749951ce1dde3b12679cc0b6']);
        if (!__hasFkAdd_FK_81f749951ce1dde3b12679cc0b6.length) {
          await queryRunner.query(`ALTER TABLE \`leave_documents\` ADD CONSTRAINT \`FK_81f749951ce1dde3b12679cc0b6\` FOREIGN KEY (\`uploaded_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d1bd68913860ced896392c02eb1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_medical_details', 'FK_d1bd68913860ced896392c02eb1']);
        if (!__hasFkAdd_FK_d1bd68913860ced896392c02eb1.length) {
          await queryRunner.query(`ALTER TABLE \`leave_medical_details\` ADD CONSTRAINT \`FK_d1bd68913860ced896392c02eb1\` FOREIGN KEY (\`leave_request_id\`) REFERENCES \`leave_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_43c15abe870cf2a725b3d722b78 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_43c15abe870cf2a725b3d722b78']);
        if (!__hasFkAdd_FK_43c15abe870cf2a725b3d722b78.length) {
          await queryRunner.query(`ALTER TABLE \`leave_requests\` ADD CONSTRAINT \`FK_43c15abe870cf2a725b3d722b78\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_52b4b7c7d295e204add6dbe0a09 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_52b4b7c7d295e204add6dbe0a09']);
        if (!__hasFkAdd_FK_52b4b7c7d295e204add6dbe0a09.length) {
          await queryRunner.query(`ALTER TABLE \`leave_requests\` ADD CONSTRAINT \`FK_52b4b7c7d295e204add6dbe0a09\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_54a57db316598806786c2b95323 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_54a57db316598806786c2b95323']);
        if (!__hasFkAdd_FK_54a57db316598806786c2b95323.length) {
          await queryRunner.query(`ALTER TABLE \`leave_requests\` ADD CONSTRAINT \`FK_54a57db316598806786c2b95323\` FOREIGN KEY (\`leave_type_id\`) REFERENCES \`leave_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_3483ae1e96704c26e2367ee1a9d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_3483ae1e96704c26e2367ee1a9d']);
        if (!__hasFkAdd_FK_3483ae1e96704c26e2367ee1a9d.length) {
          await queryRunner.query(`ALTER TABLE \`leave_requests\` ADD CONSTRAINT \`FK_3483ae1e96704c26e2367ee1a9d\` FOREIGN KEY (\`created_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_1b3354f3879c4eb2d0639ed0934 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_request_approvals', 'FK_1b3354f3879c4eb2d0639ed0934']);
        if (!__hasFkAdd_FK_1b3354f3879c4eb2d0639ed0934.length) {
          await queryRunner.query(`ALTER TABLE \`leave_request_approvals\` ADD CONSTRAINT \`FK_1b3354f3879c4eb2d0639ed0934\` FOREIGN KEY (\`leave_request_id\`) REFERENCES \`leave_requests\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_66c2722ee08966489cdbcd65a6f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_request_approvals', 'FK_66c2722ee08966489cdbcd65a6f']);
        if (!__hasFkAdd_FK_66c2722ee08966489cdbcd65a6f.length) {
          await queryRunner.query(`ALTER TABLE \`leave_request_approvals\` ADD CONSTRAINT \`FK_66c2722ee08966489cdbcd65a6f\` FOREIGN KEY (\`workflow_step_id\`) REFERENCES \`leave_approval_workflow_steps\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_837e805f48253f7d6987ba33a37 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_request_approvals', 'FK_837e805f48253f7d6987ba33a37']);
        if (!__hasFkAdd_FK_837e805f48253f7d6987ba33a37.length) {
          await queryRunner.query(`ALTER TABLE \`leave_request_approvals\` ADD CONSTRAINT \`FK_837e805f48253f7d6987ba33a37\` FOREIGN KEY (\`approver_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_41f8715fd54c5b19074851dac3a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_41f8715fd54c5b19074851dac3a']);
        if (!__hasFkAdd_FK_41f8715fd54c5b19074851dac3a.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` ADD CONSTRAINT \`FK_41f8715fd54c5b19074851dac3a\` FOREIGN KEY (\`workflow_id\`) REFERENCES \`leave_approval_workflows\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ec2e2cb88d8464a3aa269cef25f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_ec2e2cb88d8464a3aa269cef25f']);
        if (!__hasFkAdd_FK_ec2e2cb88d8464a3aa269cef25f.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` ADD CONSTRAINT \`FK_ec2e2cb88d8464a3aa269cef25f\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_363efb785ae444caf732a50204b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_363efb785ae444caf732a50204b']);
        if (!__hasFkAdd_FK_363efb785ae444caf732a50204b.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` ADD CONSTRAINT \`FK_363efb785ae444caf732a50204b\` FOREIGN KEY (\`assigned_branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e7ce5022f21e17473d61c075288 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_e7ce5022f21e17473d61c075288']);
        if (!__hasFkAdd_FK_e7ce5022f21e17473d61c075288.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` ADD CONSTRAINT \`FK_e7ce5022f21e17473d61c075288\` FOREIGN KEY (\`assigned_department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_3623192fc92cbd9582e943d4ce8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_3623192fc92cbd9582e943d4ce8']);
        if (!__hasFkAdd_FK_3623192fc92cbd9582e943d4ce8.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` ADD CONSTRAINT \`FK_3623192fc92cbd9582e943d4ce8\` FOREIGN KEY (\`position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_2c8491bbc7106bffaf7b0c8e94e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_2c8491bbc7106bffaf7b0c8e94e']);
        if (!__hasFkAdd_FK_2c8491bbc7106bffaf7b0c8e94e.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` ADD CONSTRAINT \`FK_2c8491bbc7106bffaf7b0c8e94e\` FOREIGN KEY (\`company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0e8d1623bab6d59b1caab6679d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflows', 'FK_0e8d1623bab6d59b1caab6679d3']);
        if (!__hasFkAdd_FK_0e8d1623bab6d59b1caab6679d3.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflows\` ADD CONSTRAINT \`FK_0e8d1623bab6d59b1caab6679d3\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5542f00916a572d2a2b3cf4a8ee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflows', 'FK_5542f00916a572d2a2b3cf4a8ee']);
        if (!__hasFkAdd_FK_5542f00916a572d2a2b3cf4a8ee.length) {
          await queryRunner.query(`ALTER TABLE \`leave_approval_workflows\` ADD CONSTRAINT \`FK_5542f00916a572d2a2b3cf4a8ee\` FOREIGN KEY (\`leave_type_id\`) REFERENCES \`leave_types\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_2f8aebce74941a2e2168e94ba68 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_balances', 'FK_2f8aebce74941a2e2168e94ba68']);
        if (!__hasFkAdd_FK_2f8aebce74941a2e2168e94ba68.length) {
          await queryRunner.query(`ALTER TABLE \`leave_balances\` ADD CONSTRAINT \`FK_2f8aebce74941a2e2168e94ba68\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d64da0a991d2f4d23d86031530c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_balances', 'FK_d64da0a991d2f4d23d86031530c']);
        if (!__hasFkAdd_FK_d64da0a991d2f4d23d86031530c.length) {
          await queryRunner.query(`ALTER TABLE \`leave_balances\` ADD CONSTRAINT \`FK_d64da0a991d2f4d23d86031530c\` FOREIGN KEY (\`leave_type_id\`) REFERENCES \`leave_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e944bd0d894099fe5632364d219 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policies', 'FK_e944bd0d894099fe5632364d219']);
        if (!__hasFkAdd_FK_e944bd0d894099fe5632364d219.length) {
          await queryRunner.query(`ALTER TABLE \`leave_policies\` ADD CONSTRAINT \`FK_e944bd0d894099fe5632364d219\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e4161185eb3aa7729038aca6d52 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policies', 'FK_e4161185eb3aa7729038aca6d52']);
        if (!__hasFkAdd_FK_e4161185eb3aa7729038aca6d52.length) {
          await queryRunner.query(`ALTER TABLE \`leave_policies\` ADD CONSTRAINT \`FK_e4161185eb3aa7729038aca6d52\` FOREIGN KEY (\`applicable_department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_cff2ff9892c449cc528d3824789 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policies', 'FK_cff2ff9892c449cc528d3824789']);
        if (!__hasFkAdd_FK_cff2ff9892c449cc528d3824789.length) {
          await queryRunner.query(`ALTER TABLE \`leave_policies\` ADD CONSTRAINT \`FK_cff2ff9892c449cc528d3824789\` FOREIGN KEY (\`applicable_position_id\`) REFERENCES \`positions\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_71e19e25abb4ce3fd6b97aee483 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policy_types', 'FK_71e19e25abb4ce3fd6b97aee483']);
        if (!__hasFkAdd_FK_71e19e25abb4ce3fd6b97aee483.length) {
          await queryRunner.query(`ALTER TABLE \`leave_policy_types\` ADD CONSTRAINT \`FK_71e19e25abb4ce3fd6b97aee483\` FOREIGN KEY (\`policy_id\`) REFERENCES \`leave_policies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_787ccb268c4684db7656b35b1c9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policy_types', 'FK_787ccb268c4684db7656b35b1c9']);
        if (!__hasFkAdd_FK_787ccb268c4684db7656b35b1c9.length) {
          await queryRunner.query(`ALTER TABLE \`leave_policy_types\` ADD CONSTRAINT \`FK_787ccb268c4684db7656b35b1c9\` FOREIGN KEY (\`leave_type_id\`) REFERENCES \`leave_types\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_dd27cdf2939bc23d54c5a76ffee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_types', 'FK_dd27cdf2939bc23d54c5a76ffee']);
        if (!__hasFkAdd_FK_dd27cdf2939bc23d54c5a76ffee.length) {
          await queryRunner.query(`ALTER TABLE \`leave_types\` ADD CONSTRAINT \`FK_dd27cdf2939bc23d54c5a76ffee\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d71758308098a1529c84edf0cd6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['holidays', 'FK_d71758308098a1529c84edf0cd6']);
        if (!__hasFkAdd_FK_d71758308098a1529c84edf0cd6.length) {
          await queryRunner.query(`ALTER TABLE \`holidays\` ADD CONSTRAINT \`FK_d71758308098a1529c84edf0cd6\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_7f9de69b9f75391dc280dd640fc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['documents', 'FK_7f9de69b9f75391dc280dd640fc']);
        if (!__hasFkAdd_FK_7f9de69b9f75391dc280dd640fc.length) {
          await queryRunner.query(`ALTER TABLE \`documents\` ADD CONSTRAINT \`FK_7f9de69b9f75391dc280dd640fc\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_491e1520355bdcb727734a22248 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['documents', 'FK_491e1520355bdcb727734a22248']);
        if (!__hasFkAdd_FK_491e1520355bdcb727734a22248.length) {
          await queryRunner.query(`ALTER TABLE \`documents\` ADD CONSTRAINT \`FK_491e1520355bdcb727734a22248\` FOREIGN KEY (\`uploaded_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_db1f319c7de68f9079ff286c59f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['documents', 'FK_db1f319c7de68f9079ff286c59f']);
        if (!__hasFkAdd_FK_db1f319c7de68f9079ff286c59f.length) {
          await queryRunner.query(`ALTER TABLE \`documents\` ADD CONSTRAINT \`FK_db1f319c7de68f9079ff286c59f\` FOREIGN KEY (\`verified_by_company_user_id\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_4fa23c532e73a852bd8debfc251 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_policies', 'FK_4fa23c532e73a852bd8debfc251']);
        if (!__hasFkAdd_FK_4fa23c532e73a852bd8debfc251.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_policies\` ADD CONSTRAINT \`FK_4fa23c532e73a852bd8debfc251\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_8ea01d856094e7488a75580ac1b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_8ea01d856094e7488a75580ac1b']);
        if (!__hasFkAdd_FK_8ea01d856094e7488a75580ac1b.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` ADD CONSTRAINT \`FK_8ea01d856094e7488a75580ac1b\` FOREIGN KEY (\`policy_set_id\`) REFERENCES \`attendance_policies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_f506648440b38a9496d3b691b5d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_f506648440b38a9496d3b691b5d']);
        if (!__hasFkAdd_FK_f506648440b38a9496d3b691b5d.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` ADD CONSTRAINT \`FK_f506648440b38a9496d3b691b5d\` FOREIGN KEY (\`device_id\`) REFERENCES \`attendance_devices\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_2a22684ea23ecf30d273e63cfac = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_devices', 'FK_2a22684ea23ecf30d273e63cfac']);
        if (!__hasFkAdd_FK_2a22684ea23ecf30d273e63cfac.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_devices\` ADD CONSTRAINT \`FK_2a22684ea23ecf30d273e63cfac\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_62e3556cab1ffa9cc228af957b4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_devices', 'FK_62e3556cab1ffa9cc228af957b4']);
        if (!__hasFkAdd_FK_62e3556cab1ffa9cc228af957b4.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_devices\` ADD CONSTRAINT \`FK_62e3556cab1ffa9cc228af957b4\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d6ad50d8303b626932d4901fefb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_device_sync_logs', 'FK_d6ad50d8303b626932d4901fefb']);
        if (!__hasFkAdd_FK_d6ad50d8303b626932d4901fefb.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_device_sync_logs\` ADD CONSTRAINT \`FK_d6ad50d8303b626932d4901fefb\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_2387e8f40c6eff6ea7783edc8dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_device_sync_logs', 'FK_2387e8f40c6eff6ea7783edc8dc']);
        if (!__hasFkAdd_FK_2387e8f40c6eff6ea7783edc8dc.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_device_sync_logs\` ADD CONSTRAINT \`FK_2387e8f40c6eff6ea7783edc8dc\` FOREIGN KEY (\`device_id\`) REFERENCES \`attendance_devices\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_f4349d2a938a146ccb4877b73dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_breaks', 'FK_f4349d2a938a146ccb4877b73dc']);
        if (!__hasFkAdd_FK_f4349d2a938a146ccb4877b73dc.length) {
          await queryRunner.query(`ALTER TABLE \`shift_breaks\` ADD CONSTRAINT \`FK_f4349d2a938a146ccb4877b73dc\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_c91e0e69a72f709e05bfde5fa7a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_overtime_rules', 'FK_c91e0e69a72f709e05bfde5fa7a']);
        if (!__hasFkAdd_FK_c91e0e69a72f709e05bfde5fa7a.length) {
          await queryRunner.query(`ALTER TABLE \`shift_overtime_rules\` ADD CONSTRAINT \`FK_c91e0e69a72f709e05bfde5fa7a\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a2c1178c6c1cfeff19606cf790a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_attendance_rules', 'FK_a2c1178c6c1cfeff19606cf790a']);
        if (!__hasFkAdd_FK_a2c1178c6c1cfeff19606cf790a.length) {
          await queryRunner.query(`ALTER TABLE \`shift_attendance_rules\` ADD CONSTRAINT \`FK_a2c1178c6c1cfeff19606cf790a\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_37845cc20ea29c383b2a60eec98 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_rotation_rules', 'FK_37845cc20ea29c383b2a60eec98']);
        if (!__hasFkAdd_FK_37845cc20ea29c383b2a60eec98.length) {
          await queryRunner.query(`ALTER TABLE \`shift_rotation_rules\` ADD CONSTRAINT \`FK_37845cc20ea29c383b2a60eec98\` FOREIGN KEY (\`rotation_group_id\`) REFERENCES \`shift_rotation_groups\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_eaa64ebfa53763e92fc0bb976e9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_rotation_rules', 'FK_eaa64ebfa53763e92fc0bb976e9']);
        if (!__hasFkAdd_FK_eaa64ebfa53763e92fc0bb976e9.length) {
          await queryRunner.query(`ALTER TABLE \`shift_rotation_rules\` ADD CONSTRAINT \`FK_eaa64ebfa53763e92fc0bb976e9\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ed11d637c8f6913347d6d5cf004 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_rotation_groups', 'FK_ed11d637c8f6913347d6d5cf004']);
        if (!__hasFkAdd_FK_ed11d637c8f6913347d6d5cf004.length) {
          await queryRunner.query(`ALTER TABLE \`shift_rotation_groups\` ADD CONSTRAINT \`FK_ed11d637c8f6913347d6d5cf004\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_872c8ae74d3de63160e5eca5fcb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_872c8ae74d3de63160e5eca5fcb']);
        if (!__hasFkAdd_FK_872c8ae74d3de63160e5eca5fcb.length) {
          await queryRunner.query(`ALTER TABLE \`shift_assignments\` ADD CONSTRAINT \`FK_872c8ae74d3de63160e5eca5fcb\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5e833f28fbf459e626b71aa09d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_5e833f28fbf459e626b71aa09d3']);
        if (!__hasFkAdd_FK_5e833f28fbf459e626b71aa09d3.length) {
          await queryRunner.query(`ALTER TABLE \`shift_assignments\` ADD CONSTRAINT \`FK_5e833f28fbf459e626b71aa09d3\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_fe59c463f888b8ee0da19404b14 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_fe59c463f888b8ee0da19404b14']);
        if (!__hasFkAdd_FK_fe59c463f888b8ee0da19404b14.length) {
          await queryRunner.query(`ALTER TABLE \`shift_assignments\` ADD CONSTRAINT \`FK_fe59c463f888b8ee0da19404b14\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_979ea53ee3d75eb55042100cd28 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_979ea53ee3d75eb55042100cd28']);
        if (!__hasFkAdd_FK_979ea53ee3d75eb55042100cd28.length) {
          await queryRunner.query(`ALTER TABLE \`shift_assignments\` ADD CONSTRAINT \`FK_979ea53ee3d75eb55042100cd28\` FOREIGN KEY (\`rotation_group_id\`) REFERENCES \`shift_rotation_groups\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ca6a55c42eba9ad6dc333df0ff3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_ca6a55c42eba9ad6dc333df0ff3']);
        if (!__hasFkAdd_FK_ca6a55c42eba9ad6dc333df0ff3.length) {
          await queryRunner.query(`ALTER TABLE \`shift_assignments\` ADD CONSTRAINT \`FK_ca6a55c42eba9ad6dc333df0ff3\` FOREIGN KEY (\`assigned_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_1ccdd04f09c607254d1264d596d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['holiday_groups', 'FK_1ccdd04f09c607254d1264d596d']);
        if (!__hasFkAdd_FK_1ccdd04f09c607254d1264d596d.length) {
          await queryRunner.query(`ALTER TABLE \`holiday_groups\` ADD CONSTRAINT \`FK_1ccdd04f09c607254d1264d596d\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_983b05d55206adc21da9b767290 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_holidays', 'FK_983b05d55206adc21da9b767290']);
        if (!__hasFkAdd_FK_983b05d55206adc21da9b767290.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_holidays\` ADD CONSTRAINT \`FK_983b05d55206adc21da9b767290\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_fd729d7e11c4f005fe290466b31 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_holidays', 'FK_fd729d7e11c4f005fe290466b31']);
        if (!__hasFkAdd_FK_fd729d7e11c4f005fe290466b31.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_holidays\` ADD CONSTRAINT \`FK_fd729d7e11c4f005fe290466b31\` FOREIGN KEY (\`holiday_group_id\`) REFERENCES \`holiday_groups\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_6b0552732ccc0c6b63f832c7f5b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_holidays', 'FK_6b0552732ccc0c6b63f832c7f5b']);
        if (!__hasFkAdd_FK_6b0552732ccc0c6b63f832c7f5b.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_holidays\` ADD CONSTRAINT \`FK_6b0552732ccc0c6b63f832c7f5b\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_53a81648abb3681db9ed3694cb9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_53a81648abb3681db9ed3694cb9']);
        if (!__hasFkAdd_FK_53a81648abb3681db9ed3694cb9.length) {
          await queryRunner.query(`ALTER TABLE \`shift_schedules\` ADD CONSTRAINT \`FK_53a81648abb3681db9ed3694cb9\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_20e173b8ca93238c78f26d2fc68 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_20e173b8ca93238c78f26d2fc68']);
        if (!__hasFkAdd_FK_20e173b8ca93238c78f26d2fc68.length) {
          await queryRunner.query(`ALTER TABLE \`shift_schedules\` ADD CONSTRAINT \`FK_20e173b8ca93238c78f26d2fc68\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_26118ed01fd2856d48f3ee8bd5e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_26118ed01fd2856d48f3ee8bd5e']);
        if (!__hasFkAdd_FK_26118ed01fd2856d48f3ee8bd5e.length) {
          await queryRunner.query(`ALTER TABLE \`shift_schedules\` ADD CONSTRAINT \`FK_26118ed01fd2856d48f3ee8bd5e\` FOREIGN KEY (\`shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_45ee284953d019b9484c7565ddd = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_45ee284953d019b9484c7565ddd']);
        if (!__hasFkAdd_FK_45ee284953d019b9484c7565ddd.length) {
          await queryRunner.query(`ALTER TABLE \`shift_schedules\` ADD CONSTRAINT \`FK_45ee284953d019b9484c7565ddd\` FOREIGN KEY (\`override_shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_229850edcae5528ea1540aa0b90 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_229850edcae5528ea1540aa0b90']);
        if (!__hasFkAdd_FK_229850edcae5528ea1540aa0b90.length) {
          await queryRunner.query(`ALTER TABLE \`shift_schedules\` ADD CONSTRAINT \`FK_229850edcae5528ea1540aa0b90\` FOREIGN KEY (\`holiday_id\`) REFERENCES \`attendance_holidays\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_36331ffc3e915b3672af262784a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_36331ffc3e915b3672af262784a']);
        if (!__hasFkAdd_FK_36331ffc3e915b3672af262784a.length) {
          await queryRunner.query(`ALTER TABLE \`shift_schedules\` ADD CONSTRAINT \`FK_36331ffc3e915b3672af262784a\` FOREIGN KEY (\`assigned_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_e155f8dd2a50f91604c8d946369 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_e155f8dd2a50f91604c8d946369']);
        if (!__hasFkAdd_FK_e155f8dd2a50f91604c8d946369.length) {
          await queryRunner.query(`ALTER TABLE \`shifts\` ADD CONSTRAINT \`FK_e155f8dd2a50f91604c8d946369\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_cddc0af590dd113d6e5b6b530c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_cddc0af590dd113d6e5b6b530c8']);
        if (!__hasFkAdd_FK_cddc0af590dd113d6e5b6b530c8.length) {
          await queryRunner.query(`ALTER TABLE \`shifts\` ADD CONSTRAINT \`FK_cddc0af590dd113d6e5b6b530c8\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_dc6fc3c0390d21f7cc29c03047a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_dc6fc3c0390d21f7cc29c03047a']);
        if (!__hasFkAdd_FK_dc6fc3c0390d21f7cc29c03047a.length) {
          await queryRunner.query(`ALTER TABLE \`shifts\` ADD CONSTRAINT \`FK_dc6fc3c0390d21f7cc29c03047a\` FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_f4e71fdb4bc59e606ef75ead4db = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_f4e71fdb4bc59e606ef75ead4db']);
        if (!__hasFkAdd_FK_f4e71fdb4bc59e606ef75ead4db.length) {
          await queryRunner.query(`ALTER TABLE \`shifts\` ADD CONSTRAINT \`FK_f4e71fdb4bc59e606ef75ead4db\` FOREIGN KEY (\`created_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5e1a59a41ed323cd53ca22cf5ca = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_templates', 'FK_5e1a59a41ed323cd53ca22cf5ca']);
        if (!__hasFkAdd_FK_5e1a59a41ed323cd53ca22cf5ca.length) {
          await queryRunner.query(`ALTER TABLE \`shift_templates\` ADD CONSTRAINT \`FK_5e1a59a41ed323cd53ca22cf5ca\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d77db3e5f7286a943ea2400baa6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_d77db3e5f7286a943ea2400baa6']);
        if (!__hasFkAdd_FK_d77db3e5f7286a943ea2400baa6.length) {
          await queryRunner.query(`ALTER TABLE \`shift_change_requests\` ADD CONSTRAINT \`FK_d77db3e5f7286a943ea2400baa6\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_8ede9b0d45af9599ad08a170fd0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_8ede9b0d45af9599ad08a170fd0']);
        if (!__hasFkAdd_FK_8ede9b0d45af9599ad08a170fd0.length) {
          await queryRunner.query(`ALTER TABLE \`shift_change_requests\` ADD CONSTRAINT \`FK_8ede9b0d45af9599ad08a170fd0\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_8f99fb29bed9ce4766c3981b7b5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_8f99fb29bed9ce4766c3981b7b5']);
        if (!__hasFkAdd_FK_8f99fb29bed9ce4766c3981b7b5.length) {
          await queryRunner.query(`ALTER TABLE \`shift_change_requests\` ADD CONSTRAINT \`FK_8f99fb29bed9ce4766c3981b7b5\` FOREIGN KEY (\`current_shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_d0182beaef496f8d2f84e639bd2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_d0182beaef496f8d2f84e639bd2']);
        if (!__hasFkAdd_FK_d0182beaef496f8d2f84e639bd2.length) {
          await queryRunner.query(`ALTER TABLE \`shift_change_requests\` ADD CONSTRAINT \`FK_d0182beaef496f8d2f84e639bd2\` FOREIGN KEY (\`requested_shift_id\`) REFERENCES \`shifts\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_5c43ea623505eb24e8fa4800a05 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_5c43ea623505eb24e8fa4800a05']);
        if (!__hasFkAdd_FK_5c43ea623505eb24e8fa4800a05.length) {
          await queryRunner.query(`ALTER TABLE \`shift_change_requests\` ADD CONSTRAINT \`FK_5c43ea623505eb24e8fa4800a05\` FOREIGN KEY (\`approved_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a60ef3151f5eb62f656d1641cd7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_settings', 'FK_a60ef3151f5eb62f656d1641cd7']);
        if (!__hasFkAdd_FK_a60ef3151f5eb62f656d1641cd7.length) {
          await queryRunner.query(`ALTER TABLE \`attendance_settings\` ADD CONSTRAINT \`FK_a60ef3151f5eb62f656d1641cd7\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_477d68eeda21c816851878e6c5e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_shift_rules', 'FK_477d68eeda21c816851878e6c5e']);
        if (!__hasFkAdd_FK_477d68eeda21c816851878e6c5e.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_shift_rules\` ADD CONSTRAINT \`FK_477d68eeda21c816851878e6c5e\` FOREIGN KEY (\`timetable_day_id\`) REFERENCES \`timetable_days\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_1e2129bf437fcdf5a1764080abc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_days', 'FK_1e2129bf437fcdf5a1764080abc']);
        if (!__hasFkAdd_FK_1e2129bf437fcdf5a1764080abc.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_days\` ADD CONSTRAINT \`FK_1e2129bf437fcdf5a1764080abc\` FOREIGN KEY (\`timetable_id\`) REFERENCES \`timetables\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_c75e781fa0a1cea10e91a22d9e4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_c75e781fa0a1cea10e91a22d9e4']);
        if (!__hasFkAdd_FK_c75e781fa0a1cea10e91a22d9e4.length) {
          await queryRunner.query(`ALTER TABLE \`employee_timetables\` ADD CONSTRAINT \`FK_c75e781fa0a1cea10e91a22d9e4\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ba0243d21e533a2932b6fe51c0c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_ba0243d21e533a2932b6fe51c0c']);
        if (!__hasFkAdd_FK_ba0243d21e533a2932b6fe51c0c.length) {
          await queryRunner.query(`ALTER TABLE \`employee_timetables\` ADD CONSTRAINT \`FK_ba0243d21e533a2932b6fe51c0c\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_4f6df1947976854225b23410082 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_4f6df1947976854225b23410082']);
        if (!__hasFkAdd_FK_4f6df1947976854225b23410082.length) {
          await queryRunner.query(`ALTER TABLE \`employee_timetables\` ADD CONSTRAINT \`FK_4f6df1947976854225b23410082\` FOREIGN KEY (\`timetable_id\`) REFERENCES \`timetables\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_14e68f0ffb284b71ee7f5aab334 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_14e68f0ffb284b71ee7f5aab334']);
        if (!__hasFkAdd_FK_14e68f0ffb284b71ee7f5aab334.length) {
          await queryRunner.query(`ALTER TABLE \`employee_timetables\` ADD CONSTRAINT \`FK_14e68f0ffb284b71ee7f5aab334\` FOREIGN KEY (\`assigned_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_4dcbb2c9fc65df40ed481130cec = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotation_rules', 'FK_4dcbb2c9fc65df40ed481130cec']);
        if (!__hasFkAdd_FK_4dcbb2c9fc65df40ed481130cec.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_rotation_rules\` ADD CONSTRAINT \`FK_4dcbb2c9fc65df40ed481130cec\` FOREIGN KEY (\`rotation_id\`) REFERENCES \`timetable_rotations\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_4c68c85ce63f3f82d61364d350d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotations', 'FK_4c68c85ce63f3f82d61364d350d']);
        if (!__hasFkAdd_FK_4c68c85ce63f3f82d61364d350d.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_rotations\` ADD CONSTRAINT \`FK_4c68c85ce63f3f82d61364d350d\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_b6d06cb3b96aa541f6d2aa4a2ca = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotations', 'FK_b6d06cb3b96aa541f6d2aa4a2ca']);
        if (!__hasFkAdd_FK_b6d06cb3b96aa541f6d2aa4a2ca.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_rotations\` ADD CONSTRAINT \`FK_b6d06cb3b96aa541f6d2aa4a2ca\` FOREIGN KEY (\`timetable_id\`) REFERENCES \`timetables\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_696cfbf7e1f79966320abdc354e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_holiday_rules', 'FK_696cfbf7e1f79966320abdc354e']);
        if (!__hasFkAdd_FK_696cfbf7e1f79966320abdc354e.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_holiday_rules\` ADD CONSTRAINT \`FK_696cfbf7e1f79966320abdc354e\` FOREIGN KEY (\`timetable_id\`) REFERENCES \`timetables\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_20903afcd9e1a36823524192278 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_holiday_rules', 'FK_20903afcd9e1a36823524192278']);
        if (!__hasFkAdd_FK_20903afcd9e1a36823524192278.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_holiday_rules\` ADD CONSTRAINT \`FK_20903afcd9e1a36823524192278\` FOREIGN KEY (\`holiday_group_id\`) REFERENCES \`holiday_groups\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_f3a85af6c51a9156621565af9ba = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_attendance_rules', 'FK_f3a85af6c51a9156621565af9ba']);
        if (!__hasFkAdd_FK_f3a85af6c51a9156621565af9ba.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_attendance_rules\` ADD CONSTRAINT \`FK_f3a85af6c51a9156621565af9ba\` FOREIGN KEY (\`timetable_id\`) REFERENCES \`timetables\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0dd7fe9162d37ee0140d2fae7f6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_0dd7fe9162d37ee0140d2fae7f6']);
        if (!__hasFkAdd_FK_0dd7fe9162d37ee0140d2fae7f6.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` ADD CONSTRAINT \`FK_0dd7fe9162d37ee0140d2fae7f6\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_0b5ffe304e6403b2bc9c24ea0e7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_0b5ffe304e6403b2bc9c24ea0e7']);
        if (!__hasFkAdd_FK_0b5ffe304e6403b2bc9c24ea0e7.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` ADD CONSTRAINT \`FK_0b5ffe304e6403b2bc9c24ea0e7\` FOREIGN KEY (\`employee_id\`) REFERENCES \`employees\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_182e376033b68cf8d6c337d94c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_182e376033b68cf8d6c337d94c8']);
        if (!__hasFkAdd_FK_182e376033b68cf8d6c337d94c8.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` ADD CONSTRAINT \`FK_182e376033b68cf8d6c337d94c8\` FOREIGN KEY (\`timetable_id\`) REFERENCES \`timetables\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_01642abc506da4fef5b102e70e6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_01642abc506da4fef5b102e70e6']);
        if (!__hasFkAdd_FK_01642abc506da4fef5b102e70e6.length) {
          await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` ADD CONSTRAINT \`FK_01642abc506da4fef5b102e70e6\` FOREIGN KEY (\`holiday_id\`) REFERENCES \`attendance_holidays\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_01a3cf98edbabd5d8f0a04e5a11 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetables', 'FK_01a3cf98edbabd5d8f0a04e5a11']);
        if (!__hasFkAdd_FK_01a3cf98edbabd5d8f0a04e5a11.length) {
          await queryRunner.query(`ALTER TABLE \`timetables\` ADD CONSTRAINT \`FK_01a3cf98edbabd5d8f0a04e5a11\` FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_a34aa165df75f4cf3e426f875bc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetables', 'FK_a34aa165df75f4cf3e426f875bc']);
        if (!__hasFkAdd_FK_a34aa165df75f4cf3e426f875bc.length) {
          await queryRunner.query(`ALTER TABLE \`timetables\` ADD CONSTRAINT \`FK_a34aa165df75f4cf3e426f875bc\` FOREIGN KEY (\`branch_id\`) REFERENCES \`branches\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_c4a596c34eae12d91d148ee22c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetables', 'FK_c4a596c34eae12d91d148ee22c8']);
        if (!__hasFkAdd_FK_c4a596c34eae12d91d148ee22c8.length) {
          await queryRunner.query(`ALTER TABLE \`timetables\` ADD CONSTRAINT \`FK_c4a596c34eae12d91d148ee22c8\` FOREIGN KEY (\`created_by\`) REFERENCES \`company_users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_ad249cf4f60be340850d7429e28 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_role', 'FK_ad249cf4f60be340850d7429e28']);
        if (!__hasFkAdd_FK_ad249cf4f60be340850d7429e28.length) {
          await queryRunner.query(`ALTER TABLE \`permission_role\` ADD CONSTRAINT \`FK_ad249cf4f60be340850d7429e28\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        }
        const __hasFkAdd_FK_f131407a830249c1b5753163211 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_role', 'FK_f131407a830249c1b5753163211']);
        if (!__hasFkAdd_FK_f131407a830249c1b5753163211.length) {
          await queryRunner.query(`ALTER TABLE \`permission_role\` ADD CONSTRAINT \`FK_f131407a830249c1b5753163211\` FOREIGN KEY (\`permissionsId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_788a980aa4fa89a8859419146ae = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['role_user', 'FK_788a980aa4fa89a8859419146ae']);
        if (!__hasFkAdd_FK_788a980aa4fa89a8859419146ae.length) {
          await queryRunner.query(`ALTER TABLE \`role_user\` ADD CONSTRAINT \`FK_788a980aa4fa89a8859419146ae\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        }
        const __hasFkAdd_FK_eb446d431a1abb9801e6ade4456 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['role_user', 'FK_eb446d431a1abb9801e6ade4456']);
        if (!__hasFkAdd_FK_eb446d431a1abb9801e6ade4456.length) {
          await queryRunner.query(`ALTER TABLE \`role_user\` ADD CONSTRAINT \`FK_eb446d431a1abb9801e6ade4456\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        }
        const __hasFkAdd_FK_eebf5c79455539db169da548301 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_user', 'FK_eebf5c79455539db169da548301']);
        if (!__hasFkAdd_FK_eebf5c79455539db169da548301.length) {
          await queryRunner.query(`ALTER TABLE \`permission_user\` ADD CONSTRAINT \`FK_eebf5c79455539db169da548301\` FOREIGN KEY (\`usersId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        }
        const __hasFkAdd_FK_fe30ce4377c9320e2b8a23c8362 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_user', 'FK_fe30ce4377c9320e2b8a23c8362']);
        if (!__hasFkAdd_FK_fe30ce4377c9320e2b8a23c8362.length) {
          await queryRunner.query(`ALTER TABLE \`permission_user\` ADD CONSTRAINT \`FK_fe30ce4377c9320e2b8a23c8362\` FOREIGN KEY (\`permissionsId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE NO ACTION ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const __tbl_FK_fe30ce4377c9320e2b8a23c8362 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['permission_user']);
        if (__tbl_FK_fe30ce4377c9320e2b8a23c8362.length) {
          const __hasFk_FK_fe30ce4377c9320e2b8a23c8362 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_user', 'FK_fe30ce4377c9320e2b8a23c8362']);
          if (__hasFk_FK_fe30ce4377c9320e2b8a23c8362.length) {
            await queryRunner.query(`ALTER TABLE \`permission_user\` DROP FOREIGN KEY \`FK_fe30ce4377c9320e2b8a23c8362\``);
          }
        }
        const __tbl_FK_eebf5c79455539db169da548301 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['permission_user']);
        if (__tbl_FK_eebf5c79455539db169da548301.length) {
          const __hasFk_FK_eebf5c79455539db169da548301 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_user', 'FK_eebf5c79455539db169da548301']);
          if (__hasFk_FK_eebf5c79455539db169da548301.length) {
            await queryRunner.query(`ALTER TABLE \`permission_user\` DROP FOREIGN KEY \`FK_eebf5c79455539db169da548301\``);
          }
        }
        const __tbl_FK_eb446d431a1abb9801e6ade4456 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['role_user']);
        if (__tbl_FK_eb446d431a1abb9801e6ade4456.length) {
          const __hasFk_FK_eb446d431a1abb9801e6ade4456 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['role_user', 'FK_eb446d431a1abb9801e6ade4456']);
          if (__hasFk_FK_eb446d431a1abb9801e6ade4456.length) {
            await queryRunner.query(`ALTER TABLE \`role_user\` DROP FOREIGN KEY \`FK_eb446d431a1abb9801e6ade4456\``);
          }
        }
        const __tbl_FK_788a980aa4fa89a8859419146ae = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['role_user']);
        if (__tbl_FK_788a980aa4fa89a8859419146ae.length) {
          const __hasFk_FK_788a980aa4fa89a8859419146ae = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['role_user', 'FK_788a980aa4fa89a8859419146ae']);
          if (__hasFk_FK_788a980aa4fa89a8859419146ae.length) {
            await queryRunner.query(`ALTER TABLE \`role_user\` DROP FOREIGN KEY \`FK_788a980aa4fa89a8859419146ae\``);
          }
        }
        const __tbl_FK_f131407a830249c1b5753163211 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['permission_role']);
        if (__tbl_FK_f131407a830249c1b5753163211.length) {
          const __hasFk_FK_f131407a830249c1b5753163211 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_role', 'FK_f131407a830249c1b5753163211']);
          if (__hasFk_FK_f131407a830249c1b5753163211.length) {
            await queryRunner.query(`ALTER TABLE \`permission_role\` DROP FOREIGN KEY \`FK_f131407a830249c1b5753163211\``);
          }
        }
        const __tbl_FK_ad249cf4f60be340850d7429e28 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['permission_role']);
        if (__tbl_FK_ad249cf4f60be340850d7429e28.length) {
          const __hasFk_FK_ad249cf4f60be340850d7429e28 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['permission_role', 'FK_ad249cf4f60be340850d7429e28']);
          if (__hasFk_FK_ad249cf4f60be340850d7429e28.length) {
            await queryRunner.query(`ALTER TABLE \`permission_role\` DROP FOREIGN KEY \`FK_ad249cf4f60be340850d7429e28\``);
          }
        }
        const __tbl_FK_c4a596c34eae12d91d148ee22c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetables']);
        if (__tbl_FK_c4a596c34eae12d91d148ee22c8.length) {
          const __hasFk_FK_c4a596c34eae12d91d148ee22c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetables', 'FK_c4a596c34eae12d91d148ee22c8']);
          if (__hasFk_FK_c4a596c34eae12d91d148ee22c8.length) {
            await queryRunner.query(`ALTER TABLE \`timetables\` DROP FOREIGN KEY \`FK_c4a596c34eae12d91d148ee22c8\``);
          }
        }
        const __tbl_FK_a34aa165df75f4cf3e426f875bc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetables']);
        if (__tbl_FK_a34aa165df75f4cf3e426f875bc.length) {
          const __hasFk_FK_a34aa165df75f4cf3e426f875bc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetables', 'FK_a34aa165df75f4cf3e426f875bc']);
          if (__hasFk_FK_a34aa165df75f4cf3e426f875bc.length) {
            await queryRunner.query(`ALTER TABLE \`timetables\` DROP FOREIGN KEY \`FK_a34aa165df75f4cf3e426f875bc\``);
          }
        }
        const __tbl_FK_01a3cf98edbabd5d8f0a04e5a11 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetables']);
        if (__tbl_FK_01a3cf98edbabd5d8f0a04e5a11.length) {
          const __hasFk_FK_01a3cf98edbabd5d8f0a04e5a11 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetables', 'FK_01a3cf98edbabd5d8f0a04e5a11']);
          if (__hasFk_FK_01a3cf98edbabd5d8f0a04e5a11.length) {
            await queryRunner.query(`ALTER TABLE \`timetables\` DROP FOREIGN KEY \`FK_01a3cf98edbabd5d8f0a04e5a11\``);
          }
        }
        const __tbl_FK_01642abc506da4fef5b102e70e6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_generated_schedules']);
        if (__tbl_FK_01642abc506da4fef5b102e70e6.length) {
          const __hasFk_FK_01642abc506da4fef5b102e70e6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_01642abc506da4fef5b102e70e6']);
          if (__hasFk_FK_01642abc506da4fef5b102e70e6.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` DROP FOREIGN KEY \`FK_01642abc506da4fef5b102e70e6\``);
          }
        }
        const __tbl_FK_182e376033b68cf8d6c337d94c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_generated_schedules']);
        if (__tbl_FK_182e376033b68cf8d6c337d94c8.length) {
          const __hasFk_FK_182e376033b68cf8d6c337d94c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_182e376033b68cf8d6c337d94c8']);
          if (__hasFk_FK_182e376033b68cf8d6c337d94c8.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` DROP FOREIGN KEY \`FK_182e376033b68cf8d6c337d94c8\``);
          }
        }
        const __tbl_FK_0b5ffe304e6403b2bc9c24ea0e7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_generated_schedules']);
        if (__tbl_FK_0b5ffe304e6403b2bc9c24ea0e7.length) {
          const __hasFk_FK_0b5ffe304e6403b2bc9c24ea0e7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_0b5ffe304e6403b2bc9c24ea0e7']);
          if (__hasFk_FK_0b5ffe304e6403b2bc9c24ea0e7.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` DROP FOREIGN KEY \`FK_0b5ffe304e6403b2bc9c24ea0e7\``);
          }
        }
        const __tbl_FK_0dd7fe9162d37ee0140d2fae7f6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_generated_schedules']);
        if (__tbl_FK_0dd7fe9162d37ee0140d2fae7f6.length) {
          const __hasFk_FK_0dd7fe9162d37ee0140d2fae7f6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_generated_schedules', 'FK_0dd7fe9162d37ee0140d2fae7f6']);
          if (__hasFk_FK_0dd7fe9162d37ee0140d2fae7f6.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_generated_schedules\` DROP FOREIGN KEY \`FK_0dd7fe9162d37ee0140d2fae7f6\``);
          }
        }
        const __tbl_FK_f3a85af6c51a9156621565af9ba = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_attendance_rules']);
        if (__tbl_FK_f3a85af6c51a9156621565af9ba.length) {
          const __hasFk_FK_f3a85af6c51a9156621565af9ba = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_attendance_rules', 'FK_f3a85af6c51a9156621565af9ba']);
          if (__hasFk_FK_f3a85af6c51a9156621565af9ba.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_attendance_rules\` DROP FOREIGN KEY \`FK_f3a85af6c51a9156621565af9ba\``);
          }
        }
        const __tbl_FK_20903afcd9e1a36823524192278 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_holiday_rules']);
        if (__tbl_FK_20903afcd9e1a36823524192278.length) {
          const __hasFk_FK_20903afcd9e1a36823524192278 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_holiday_rules', 'FK_20903afcd9e1a36823524192278']);
          if (__hasFk_FK_20903afcd9e1a36823524192278.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_holiday_rules\` DROP FOREIGN KEY \`FK_20903afcd9e1a36823524192278\``);
          }
        }
        const __tbl_FK_696cfbf7e1f79966320abdc354e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_holiday_rules']);
        if (__tbl_FK_696cfbf7e1f79966320abdc354e.length) {
          const __hasFk_FK_696cfbf7e1f79966320abdc354e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_holiday_rules', 'FK_696cfbf7e1f79966320abdc354e']);
          if (__hasFk_FK_696cfbf7e1f79966320abdc354e.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_holiday_rules\` DROP FOREIGN KEY \`FK_696cfbf7e1f79966320abdc354e\``);
          }
        }
        const __tbl_FK_b6d06cb3b96aa541f6d2aa4a2ca = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_rotations']);
        if (__tbl_FK_b6d06cb3b96aa541f6d2aa4a2ca.length) {
          const __hasFk_FK_b6d06cb3b96aa541f6d2aa4a2ca = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotations', 'FK_b6d06cb3b96aa541f6d2aa4a2ca']);
          if (__hasFk_FK_b6d06cb3b96aa541f6d2aa4a2ca.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_rotations\` DROP FOREIGN KEY \`FK_b6d06cb3b96aa541f6d2aa4a2ca\``);
          }
        }
        const __tbl_FK_4c68c85ce63f3f82d61364d350d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_rotations']);
        if (__tbl_FK_4c68c85ce63f3f82d61364d350d.length) {
          const __hasFk_FK_4c68c85ce63f3f82d61364d350d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotations', 'FK_4c68c85ce63f3f82d61364d350d']);
          if (__hasFk_FK_4c68c85ce63f3f82d61364d350d.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_rotations\` DROP FOREIGN KEY \`FK_4c68c85ce63f3f82d61364d350d\``);
          }
        }
        const __tbl_FK_4dcbb2c9fc65df40ed481130cec = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_rotation_rules']);
        if (__tbl_FK_4dcbb2c9fc65df40ed481130cec.length) {
          const __hasFk_FK_4dcbb2c9fc65df40ed481130cec = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_rotation_rules', 'FK_4dcbb2c9fc65df40ed481130cec']);
          if (__hasFk_FK_4dcbb2c9fc65df40ed481130cec.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_rotation_rules\` DROP FOREIGN KEY \`FK_4dcbb2c9fc65df40ed481130cec\``);
          }
        }
        const __tbl_FK_14e68f0ffb284b71ee7f5aab334 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_timetables']);
        if (__tbl_FK_14e68f0ffb284b71ee7f5aab334.length) {
          const __hasFk_FK_14e68f0ffb284b71ee7f5aab334 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_14e68f0ffb284b71ee7f5aab334']);
          if (__hasFk_FK_14e68f0ffb284b71ee7f5aab334.length) {
            await queryRunner.query(`ALTER TABLE \`employee_timetables\` DROP FOREIGN KEY \`FK_14e68f0ffb284b71ee7f5aab334\``);
          }
        }
        const __tbl_FK_4f6df1947976854225b23410082 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_timetables']);
        if (__tbl_FK_4f6df1947976854225b23410082.length) {
          const __hasFk_FK_4f6df1947976854225b23410082 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_4f6df1947976854225b23410082']);
          if (__hasFk_FK_4f6df1947976854225b23410082.length) {
            await queryRunner.query(`ALTER TABLE \`employee_timetables\` DROP FOREIGN KEY \`FK_4f6df1947976854225b23410082\``);
          }
        }
        const __tbl_FK_ba0243d21e533a2932b6fe51c0c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_timetables']);
        if (__tbl_FK_ba0243d21e533a2932b6fe51c0c.length) {
          const __hasFk_FK_ba0243d21e533a2932b6fe51c0c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_ba0243d21e533a2932b6fe51c0c']);
          if (__hasFk_FK_ba0243d21e533a2932b6fe51c0c.length) {
            await queryRunner.query(`ALTER TABLE \`employee_timetables\` DROP FOREIGN KEY \`FK_ba0243d21e533a2932b6fe51c0c\``);
          }
        }
        const __tbl_FK_c75e781fa0a1cea10e91a22d9e4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_timetables']);
        if (__tbl_FK_c75e781fa0a1cea10e91a22d9e4.length) {
          const __hasFk_FK_c75e781fa0a1cea10e91a22d9e4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_timetables', 'FK_c75e781fa0a1cea10e91a22d9e4']);
          if (__hasFk_FK_c75e781fa0a1cea10e91a22d9e4.length) {
            await queryRunner.query(`ALTER TABLE \`employee_timetables\` DROP FOREIGN KEY \`FK_c75e781fa0a1cea10e91a22d9e4\``);
          }
        }
        const __tbl_FK_1e2129bf437fcdf5a1764080abc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_days']);
        if (__tbl_FK_1e2129bf437fcdf5a1764080abc.length) {
          const __hasFk_FK_1e2129bf437fcdf5a1764080abc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_days', 'FK_1e2129bf437fcdf5a1764080abc']);
          if (__hasFk_FK_1e2129bf437fcdf5a1764080abc.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_days\` DROP FOREIGN KEY \`FK_1e2129bf437fcdf5a1764080abc\``);
          }
        }
        const __tbl_FK_477d68eeda21c816851878e6c5e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['timetable_shift_rules']);
        if (__tbl_FK_477d68eeda21c816851878e6c5e.length) {
          const __hasFk_FK_477d68eeda21c816851878e6c5e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['timetable_shift_rules', 'FK_477d68eeda21c816851878e6c5e']);
          if (__hasFk_FK_477d68eeda21c816851878e6c5e.length) {
            await queryRunner.query(`ALTER TABLE \`timetable_shift_rules\` DROP FOREIGN KEY \`FK_477d68eeda21c816851878e6c5e\``);
          }
        }
        const __tbl_FK_a60ef3151f5eb62f656d1641cd7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_settings']);
        if (__tbl_FK_a60ef3151f5eb62f656d1641cd7.length) {
          const __hasFk_FK_a60ef3151f5eb62f656d1641cd7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_settings', 'FK_a60ef3151f5eb62f656d1641cd7']);
          if (__hasFk_FK_a60ef3151f5eb62f656d1641cd7.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_settings\` DROP FOREIGN KEY \`FK_a60ef3151f5eb62f656d1641cd7\``);
          }
        }
        const __tbl_FK_5c43ea623505eb24e8fa4800a05 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_change_requests']);
        if (__tbl_FK_5c43ea623505eb24e8fa4800a05.length) {
          const __hasFk_FK_5c43ea623505eb24e8fa4800a05 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_5c43ea623505eb24e8fa4800a05']);
          if (__hasFk_FK_5c43ea623505eb24e8fa4800a05.length) {
            await queryRunner.query(`ALTER TABLE \`shift_change_requests\` DROP FOREIGN KEY \`FK_5c43ea623505eb24e8fa4800a05\``);
          }
        }
        const __tbl_FK_d0182beaef496f8d2f84e639bd2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_change_requests']);
        if (__tbl_FK_d0182beaef496f8d2f84e639bd2.length) {
          const __hasFk_FK_d0182beaef496f8d2f84e639bd2 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_d0182beaef496f8d2f84e639bd2']);
          if (__hasFk_FK_d0182beaef496f8d2f84e639bd2.length) {
            await queryRunner.query(`ALTER TABLE \`shift_change_requests\` DROP FOREIGN KEY \`FK_d0182beaef496f8d2f84e639bd2\``);
          }
        }
        const __tbl_FK_8f99fb29bed9ce4766c3981b7b5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_change_requests']);
        if (__tbl_FK_8f99fb29bed9ce4766c3981b7b5.length) {
          const __hasFk_FK_8f99fb29bed9ce4766c3981b7b5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_8f99fb29bed9ce4766c3981b7b5']);
          if (__hasFk_FK_8f99fb29bed9ce4766c3981b7b5.length) {
            await queryRunner.query(`ALTER TABLE \`shift_change_requests\` DROP FOREIGN KEY \`FK_8f99fb29bed9ce4766c3981b7b5\``);
          }
        }
        const __tbl_FK_8ede9b0d45af9599ad08a170fd0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_change_requests']);
        if (__tbl_FK_8ede9b0d45af9599ad08a170fd0.length) {
          const __hasFk_FK_8ede9b0d45af9599ad08a170fd0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_8ede9b0d45af9599ad08a170fd0']);
          if (__hasFk_FK_8ede9b0d45af9599ad08a170fd0.length) {
            await queryRunner.query(`ALTER TABLE \`shift_change_requests\` DROP FOREIGN KEY \`FK_8ede9b0d45af9599ad08a170fd0\``);
          }
        }
        const __tbl_FK_d77db3e5f7286a943ea2400baa6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_change_requests']);
        if (__tbl_FK_d77db3e5f7286a943ea2400baa6.length) {
          const __hasFk_FK_d77db3e5f7286a943ea2400baa6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_change_requests', 'FK_d77db3e5f7286a943ea2400baa6']);
          if (__hasFk_FK_d77db3e5f7286a943ea2400baa6.length) {
            await queryRunner.query(`ALTER TABLE \`shift_change_requests\` DROP FOREIGN KEY \`FK_d77db3e5f7286a943ea2400baa6\``);
          }
        }
        const __tbl_FK_5e1a59a41ed323cd53ca22cf5ca = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_templates']);
        if (__tbl_FK_5e1a59a41ed323cd53ca22cf5ca.length) {
          const __hasFk_FK_5e1a59a41ed323cd53ca22cf5ca = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_templates', 'FK_5e1a59a41ed323cd53ca22cf5ca']);
          if (__hasFk_FK_5e1a59a41ed323cd53ca22cf5ca.length) {
            await queryRunner.query(`ALTER TABLE \`shift_templates\` DROP FOREIGN KEY \`FK_5e1a59a41ed323cd53ca22cf5ca\``);
          }
        }
        const __tbl_FK_f4e71fdb4bc59e606ef75ead4db = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shifts']);
        if (__tbl_FK_f4e71fdb4bc59e606ef75ead4db.length) {
          const __hasFk_FK_f4e71fdb4bc59e606ef75ead4db = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_f4e71fdb4bc59e606ef75ead4db']);
          if (__hasFk_FK_f4e71fdb4bc59e606ef75ead4db.length) {
            await queryRunner.query(`ALTER TABLE \`shifts\` DROP FOREIGN KEY \`FK_f4e71fdb4bc59e606ef75ead4db\``);
          }
        }
        const __tbl_FK_dc6fc3c0390d21f7cc29c03047a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shifts']);
        if (__tbl_FK_dc6fc3c0390d21f7cc29c03047a.length) {
          const __hasFk_FK_dc6fc3c0390d21f7cc29c03047a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_dc6fc3c0390d21f7cc29c03047a']);
          if (__hasFk_FK_dc6fc3c0390d21f7cc29c03047a.length) {
            await queryRunner.query(`ALTER TABLE \`shifts\` DROP FOREIGN KEY \`FK_dc6fc3c0390d21f7cc29c03047a\``);
          }
        }
        const __tbl_FK_cddc0af590dd113d6e5b6b530c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shifts']);
        if (__tbl_FK_cddc0af590dd113d6e5b6b530c8.length) {
          const __hasFk_FK_cddc0af590dd113d6e5b6b530c8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_cddc0af590dd113d6e5b6b530c8']);
          if (__hasFk_FK_cddc0af590dd113d6e5b6b530c8.length) {
            await queryRunner.query(`ALTER TABLE \`shifts\` DROP FOREIGN KEY \`FK_cddc0af590dd113d6e5b6b530c8\``);
          }
        }
        const __tbl_FK_e155f8dd2a50f91604c8d946369 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shifts']);
        if (__tbl_FK_e155f8dd2a50f91604c8d946369.length) {
          const __hasFk_FK_e155f8dd2a50f91604c8d946369 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shifts', 'FK_e155f8dd2a50f91604c8d946369']);
          if (__hasFk_FK_e155f8dd2a50f91604c8d946369.length) {
            await queryRunner.query(`ALTER TABLE \`shifts\` DROP FOREIGN KEY \`FK_e155f8dd2a50f91604c8d946369\``);
          }
        }
        const __tbl_FK_36331ffc3e915b3672af262784a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_schedules']);
        if (__tbl_FK_36331ffc3e915b3672af262784a.length) {
          const __hasFk_FK_36331ffc3e915b3672af262784a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_36331ffc3e915b3672af262784a']);
          if (__hasFk_FK_36331ffc3e915b3672af262784a.length) {
            await queryRunner.query(`ALTER TABLE \`shift_schedules\` DROP FOREIGN KEY \`FK_36331ffc3e915b3672af262784a\``);
          }
        }
        const __tbl_FK_229850edcae5528ea1540aa0b90 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_schedules']);
        if (__tbl_FK_229850edcae5528ea1540aa0b90.length) {
          const __hasFk_FK_229850edcae5528ea1540aa0b90 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_229850edcae5528ea1540aa0b90']);
          if (__hasFk_FK_229850edcae5528ea1540aa0b90.length) {
            await queryRunner.query(`ALTER TABLE \`shift_schedules\` DROP FOREIGN KEY \`FK_229850edcae5528ea1540aa0b90\``);
          }
        }
        const __tbl_FK_45ee284953d019b9484c7565ddd = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_schedules']);
        if (__tbl_FK_45ee284953d019b9484c7565ddd.length) {
          const __hasFk_FK_45ee284953d019b9484c7565ddd = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_45ee284953d019b9484c7565ddd']);
          if (__hasFk_FK_45ee284953d019b9484c7565ddd.length) {
            await queryRunner.query(`ALTER TABLE \`shift_schedules\` DROP FOREIGN KEY \`FK_45ee284953d019b9484c7565ddd\``);
          }
        }
        const __tbl_FK_26118ed01fd2856d48f3ee8bd5e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_schedules']);
        if (__tbl_FK_26118ed01fd2856d48f3ee8bd5e.length) {
          const __hasFk_FK_26118ed01fd2856d48f3ee8bd5e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_26118ed01fd2856d48f3ee8bd5e']);
          if (__hasFk_FK_26118ed01fd2856d48f3ee8bd5e.length) {
            await queryRunner.query(`ALTER TABLE \`shift_schedules\` DROP FOREIGN KEY \`FK_26118ed01fd2856d48f3ee8bd5e\``);
          }
        }
        const __tbl_FK_20e173b8ca93238c78f26d2fc68 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_schedules']);
        if (__tbl_FK_20e173b8ca93238c78f26d2fc68.length) {
          const __hasFk_FK_20e173b8ca93238c78f26d2fc68 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_20e173b8ca93238c78f26d2fc68']);
          if (__hasFk_FK_20e173b8ca93238c78f26d2fc68.length) {
            await queryRunner.query(`ALTER TABLE \`shift_schedules\` DROP FOREIGN KEY \`FK_20e173b8ca93238c78f26d2fc68\``);
          }
        }
        const __tbl_FK_53a81648abb3681db9ed3694cb9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_schedules']);
        if (__tbl_FK_53a81648abb3681db9ed3694cb9.length) {
          const __hasFk_FK_53a81648abb3681db9ed3694cb9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_schedules', 'FK_53a81648abb3681db9ed3694cb9']);
          if (__hasFk_FK_53a81648abb3681db9ed3694cb9.length) {
            await queryRunner.query(`ALTER TABLE \`shift_schedules\` DROP FOREIGN KEY \`FK_53a81648abb3681db9ed3694cb9\``);
          }
        }
        const __tbl_FK_6b0552732ccc0c6b63f832c7f5b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_holidays']);
        if (__tbl_FK_6b0552732ccc0c6b63f832c7f5b.length) {
          const __hasFk_FK_6b0552732ccc0c6b63f832c7f5b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_holidays', 'FK_6b0552732ccc0c6b63f832c7f5b']);
          if (__hasFk_FK_6b0552732ccc0c6b63f832c7f5b.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_holidays\` DROP FOREIGN KEY \`FK_6b0552732ccc0c6b63f832c7f5b\``);
          }
        }
        const __tbl_FK_fd729d7e11c4f005fe290466b31 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_holidays']);
        if (__tbl_FK_fd729d7e11c4f005fe290466b31.length) {
          const __hasFk_FK_fd729d7e11c4f005fe290466b31 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_holidays', 'FK_fd729d7e11c4f005fe290466b31']);
          if (__hasFk_FK_fd729d7e11c4f005fe290466b31.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_holidays\` DROP FOREIGN KEY \`FK_fd729d7e11c4f005fe290466b31\``);
          }
        }
        const __tbl_FK_983b05d55206adc21da9b767290 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_holidays']);
        if (__tbl_FK_983b05d55206adc21da9b767290.length) {
          const __hasFk_FK_983b05d55206adc21da9b767290 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_holidays', 'FK_983b05d55206adc21da9b767290']);
          if (__hasFk_FK_983b05d55206adc21da9b767290.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_holidays\` DROP FOREIGN KEY \`FK_983b05d55206adc21da9b767290\``);
          }
        }
        const __tbl_FK_1ccdd04f09c607254d1264d596d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['holiday_groups']);
        if (__tbl_FK_1ccdd04f09c607254d1264d596d.length) {
          const __hasFk_FK_1ccdd04f09c607254d1264d596d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['holiday_groups', 'FK_1ccdd04f09c607254d1264d596d']);
          if (__hasFk_FK_1ccdd04f09c607254d1264d596d.length) {
            await queryRunner.query(`ALTER TABLE \`holiday_groups\` DROP FOREIGN KEY \`FK_1ccdd04f09c607254d1264d596d\``);
          }
        }
        const __tbl_FK_ca6a55c42eba9ad6dc333df0ff3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_assignments']);
        if (__tbl_FK_ca6a55c42eba9ad6dc333df0ff3.length) {
          const __hasFk_FK_ca6a55c42eba9ad6dc333df0ff3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_ca6a55c42eba9ad6dc333df0ff3']);
          if (__hasFk_FK_ca6a55c42eba9ad6dc333df0ff3.length) {
            await queryRunner.query(`ALTER TABLE \`shift_assignments\` DROP FOREIGN KEY \`FK_ca6a55c42eba9ad6dc333df0ff3\``);
          }
        }
        const __tbl_FK_979ea53ee3d75eb55042100cd28 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_assignments']);
        if (__tbl_FK_979ea53ee3d75eb55042100cd28.length) {
          const __hasFk_FK_979ea53ee3d75eb55042100cd28 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_979ea53ee3d75eb55042100cd28']);
          if (__hasFk_FK_979ea53ee3d75eb55042100cd28.length) {
            await queryRunner.query(`ALTER TABLE \`shift_assignments\` DROP FOREIGN KEY \`FK_979ea53ee3d75eb55042100cd28\``);
          }
        }
        const __tbl_FK_fe59c463f888b8ee0da19404b14 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_assignments']);
        if (__tbl_FK_fe59c463f888b8ee0da19404b14.length) {
          const __hasFk_FK_fe59c463f888b8ee0da19404b14 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_fe59c463f888b8ee0da19404b14']);
          if (__hasFk_FK_fe59c463f888b8ee0da19404b14.length) {
            await queryRunner.query(`ALTER TABLE \`shift_assignments\` DROP FOREIGN KEY \`FK_fe59c463f888b8ee0da19404b14\``);
          }
        }
        const __tbl_FK_5e833f28fbf459e626b71aa09d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_assignments']);
        if (__tbl_FK_5e833f28fbf459e626b71aa09d3.length) {
          const __hasFk_FK_5e833f28fbf459e626b71aa09d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_5e833f28fbf459e626b71aa09d3']);
          if (__hasFk_FK_5e833f28fbf459e626b71aa09d3.length) {
            await queryRunner.query(`ALTER TABLE \`shift_assignments\` DROP FOREIGN KEY \`FK_5e833f28fbf459e626b71aa09d3\``);
          }
        }
        const __tbl_FK_872c8ae74d3de63160e5eca5fcb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_assignments']);
        if (__tbl_FK_872c8ae74d3de63160e5eca5fcb.length) {
          const __hasFk_FK_872c8ae74d3de63160e5eca5fcb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_assignments', 'FK_872c8ae74d3de63160e5eca5fcb']);
          if (__hasFk_FK_872c8ae74d3de63160e5eca5fcb.length) {
            await queryRunner.query(`ALTER TABLE \`shift_assignments\` DROP FOREIGN KEY \`FK_872c8ae74d3de63160e5eca5fcb\``);
          }
        }
        const __tbl_FK_ed11d637c8f6913347d6d5cf004 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_rotation_groups']);
        if (__tbl_FK_ed11d637c8f6913347d6d5cf004.length) {
          const __hasFk_FK_ed11d637c8f6913347d6d5cf004 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_rotation_groups', 'FK_ed11d637c8f6913347d6d5cf004']);
          if (__hasFk_FK_ed11d637c8f6913347d6d5cf004.length) {
            await queryRunner.query(`ALTER TABLE \`shift_rotation_groups\` DROP FOREIGN KEY \`FK_ed11d637c8f6913347d6d5cf004\``);
          }
        }
        const __tbl_FK_eaa64ebfa53763e92fc0bb976e9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_rotation_rules']);
        if (__tbl_FK_eaa64ebfa53763e92fc0bb976e9.length) {
          const __hasFk_FK_eaa64ebfa53763e92fc0bb976e9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_rotation_rules', 'FK_eaa64ebfa53763e92fc0bb976e9']);
          if (__hasFk_FK_eaa64ebfa53763e92fc0bb976e9.length) {
            await queryRunner.query(`ALTER TABLE \`shift_rotation_rules\` DROP FOREIGN KEY \`FK_eaa64ebfa53763e92fc0bb976e9\``);
          }
        }
        const __tbl_FK_37845cc20ea29c383b2a60eec98 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_rotation_rules']);
        if (__tbl_FK_37845cc20ea29c383b2a60eec98.length) {
          const __hasFk_FK_37845cc20ea29c383b2a60eec98 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_rotation_rules', 'FK_37845cc20ea29c383b2a60eec98']);
          if (__hasFk_FK_37845cc20ea29c383b2a60eec98.length) {
            await queryRunner.query(`ALTER TABLE \`shift_rotation_rules\` DROP FOREIGN KEY \`FK_37845cc20ea29c383b2a60eec98\``);
          }
        }
        const __tbl_FK_a2c1178c6c1cfeff19606cf790a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_attendance_rules']);
        if (__tbl_FK_a2c1178c6c1cfeff19606cf790a.length) {
          const __hasFk_FK_a2c1178c6c1cfeff19606cf790a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_attendance_rules', 'FK_a2c1178c6c1cfeff19606cf790a']);
          if (__hasFk_FK_a2c1178c6c1cfeff19606cf790a.length) {
            await queryRunner.query(`ALTER TABLE \`shift_attendance_rules\` DROP FOREIGN KEY \`FK_a2c1178c6c1cfeff19606cf790a\``);
          }
        }
        const __tbl_FK_c91e0e69a72f709e05bfde5fa7a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_overtime_rules']);
        if (__tbl_FK_c91e0e69a72f709e05bfde5fa7a.length) {
          const __hasFk_FK_c91e0e69a72f709e05bfde5fa7a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_overtime_rules', 'FK_c91e0e69a72f709e05bfde5fa7a']);
          if (__hasFk_FK_c91e0e69a72f709e05bfde5fa7a.length) {
            await queryRunner.query(`ALTER TABLE \`shift_overtime_rules\` DROP FOREIGN KEY \`FK_c91e0e69a72f709e05bfde5fa7a\``);
          }
        }
        const __tbl_FK_f4349d2a938a146ccb4877b73dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['shift_breaks']);
        if (__tbl_FK_f4349d2a938a146ccb4877b73dc.length) {
          const __hasFk_FK_f4349d2a938a146ccb4877b73dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['shift_breaks', 'FK_f4349d2a938a146ccb4877b73dc']);
          if (__hasFk_FK_f4349d2a938a146ccb4877b73dc.length) {
            await queryRunner.query(`ALTER TABLE \`shift_breaks\` DROP FOREIGN KEY \`FK_f4349d2a938a146ccb4877b73dc\``);
          }
        }
        const __tbl_FK_2387e8f40c6eff6ea7783edc8dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_device_sync_logs']);
        if (__tbl_FK_2387e8f40c6eff6ea7783edc8dc.length) {
          const __hasFk_FK_2387e8f40c6eff6ea7783edc8dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_device_sync_logs', 'FK_2387e8f40c6eff6ea7783edc8dc']);
          if (__hasFk_FK_2387e8f40c6eff6ea7783edc8dc.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_device_sync_logs\` DROP FOREIGN KEY \`FK_2387e8f40c6eff6ea7783edc8dc\``);
          }
        }
        const __tbl_FK_d6ad50d8303b626932d4901fefb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_device_sync_logs']);
        if (__tbl_FK_d6ad50d8303b626932d4901fefb.length) {
          const __hasFk_FK_d6ad50d8303b626932d4901fefb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_device_sync_logs', 'FK_d6ad50d8303b626932d4901fefb']);
          if (__hasFk_FK_d6ad50d8303b626932d4901fefb.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_device_sync_logs\` DROP FOREIGN KEY \`FK_d6ad50d8303b626932d4901fefb\``);
          }
        }
        const __tbl_FK_62e3556cab1ffa9cc228af957b4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_devices']);
        if (__tbl_FK_62e3556cab1ffa9cc228af957b4.length) {
          const __hasFk_FK_62e3556cab1ffa9cc228af957b4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_devices', 'FK_62e3556cab1ffa9cc228af957b4']);
          if (__hasFk_FK_62e3556cab1ffa9cc228af957b4.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_devices\` DROP FOREIGN KEY \`FK_62e3556cab1ffa9cc228af957b4\``);
          }
        }
        const __tbl_FK_2a22684ea23ecf30d273e63cfac = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_devices']);
        if (__tbl_FK_2a22684ea23ecf30d273e63cfac.length) {
          const __hasFk_FK_2a22684ea23ecf30d273e63cfac = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_devices', 'FK_2a22684ea23ecf30d273e63cfac']);
          if (__hasFk_FK_2a22684ea23ecf30d273e63cfac.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_devices\` DROP FOREIGN KEY \`FK_2a22684ea23ecf30d273e63cfac\``);
          }
        }
        const __tbl_FK_f506648440b38a9496d3b691b5d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_checkpoints']);
        if (__tbl_FK_f506648440b38a9496d3b691b5d.length) {
          const __hasFk_FK_f506648440b38a9496d3b691b5d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_f506648440b38a9496d3b691b5d']);
          if (__hasFk_FK_f506648440b38a9496d3b691b5d.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` DROP FOREIGN KEY \`FK_f506648440b38a9496d3b691b5d\``);
          }
        }
        const __tbl_FK_8ea01d856094e7488a75580ac1b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_checkpoints']);
        if (__tbl_FK_8ea01d856094e7488a75580ac1b.length) {
          const __hasFk_FK_8ea01d856094e7488a75580ac1b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_checkpoints', 'FK_8ea01d856094e7488a75580ac1b']);
          if (__hasFk_FK_8ea01d856094e7488a75580ac1b.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_checkpoints\` DROP FOREIGN KEY \`FK_8ea01d856094e7488a75580ac1b\``);
          }
        }
        const __tbl_FK_4fa23c532e73a852bd8debfc251 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['attendance_policies']);
        if (__tbl_FK_4fa23c532e73a852bd8debfc251.length) {
          const __hasFk_FK_4fa23c532e73a852bd8debfc251 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['attendance_policies', 'FK_4fa23c532e73a852bd8debfc251']);
          if (__hasFk_FK_4fa23c532e73a852bd8debfc251.length) {
            await queryRunner.query(`ALTER TABLE \`attendance_policies\` DROP FOREIGN KEY \`FK_4fa23c532e73a852bd8debfc251\``);
          }
        }
        const __tbl_FK_db1f319c7de68f9079ff286c59f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['documents']);
        if (__tbl_FK_db1f319c7de68f9079ff286c59f.length) {
          const __hasFk_FK_db1f319c7de68f9079ff286c59f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['documents', 'FK_db1f319c7de68f9079ff286c59f']);
          if (__hasFk_FK_db1f319c7de68f9079ff286c59f.length) {
            await queryRunner.query(`ALTER TABLE \`documents\` DROP FOREIGN KEY \`FK_db1f319c7de68f9079ff286c59f\``);
          }
        }
        const __tbl_FK_491e1520355bdcb727734a22248 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['documents']);
        if (__tbl_FK_491e1520355bdcb727734a22248.length) {
          const __hasFk_FK_491e1520355bdcb727734a22248 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['documents', 'FK_491e1520355bdcb727734a22248']);
          if (__hasFk_FK_491e1520355bdcb727734a22248.length) {
            await queryRunner.query(`ALTER TABLE \`documents\` DROP FOREIGN KEY \`FK_491e1520355bdcb727734a22248\``);
          }
        }
        const __tbl_FK_7f9de69b9f75391dc280dd640fc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['documents']);
        if (__tbl_FK_7f9de69b9f75391dc280dd640fc.length) {
          const __hasFk_FK_7f9de69b9f75391dc280dd640fc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['documents', 'FK_7f9de69b9f75391dc280dd640fc']);
          if (__hasFk_FK_7f9de69b9f75391dc280dd640fc.length) {
            await queryRunner.query(`ALTER TABLE \`documents\` DROP FOREIGN KEY \`FK_7f9de69b9f75391dc280dd640fc\``);
          }
        }
        const __tbl_FK_d71758308098a1529c84edf0cd6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['holidays']);
        if (__tbl_FK_d71758308098a1529c84edf0cd6.length) {
          const __hasFk_FK_d71758308098a1529c84edf0cd6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['holidays', 'FK_d71758308098a1529c84edf0cd6']);
          if (__hasFk_FK_d71758308098a1529c84edf0cd6.length) {
            await queryRunner.query(`ALTER TABLE \`holidays\` DROP FOREIGN KEY \`FK_d71758308098a1529c84edf0cd6\``);
          }
        }
        const __tbl_FK_dd27cdf2939bc23d54c5a76ffee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_types']);
        if (__tbl_FK_dd27cdf2939bc23d54c5a76ffee.length) {
          const __hasFk_FK_dd27cdf2939bc23d54c5a76ffee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_types', 'FK_dd27cdf2939bc23d54c5a76ffee']);
          if (__hasFk_FK_dd27cdf2939bc23d54c5a76ffee.length) {
            await queryRunner.query(`ALTER TABLE \`leave_types\` DROP FOREIGN KEY \`FK_dd27cdf2939bc23d54c5a76ffee\``);
          }
        }
        const __tbl_FK_787ccb268c4684db7656b35b1c9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_policy_types']);
        if (__tbl_FK_787ccb268c4684db7656b35b1c9.length) {
          const __hasFk_FK_787ccb268c4684db7656b35b1c9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policy_types', 'FK_787ccb268c4684db7656b35b1c9']);
          if (__hasFk_FK_787ccb268c4684db7656b35b1c9.length) {
            await queryRunner.query(`ALTER TABLE \`leave_policy_types\` DROP FOREIGN KEY \`FK_787ccb268c4684db7656b35b1c9\``);
          }
        }
        const __tbl_FK_71e19e25abb4ce3fd6b97aee483 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_policy_types']);
        if (__tbl_FK_71e19e25abb4ce3fd6b97aee483.length) {
          const __hasFk_FK_71e19e25abb4ce3fd6b97aee483 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policy_types', 'FK_71e19e25abb4ce3fd6b97aee483']);
          if (__hasFk_FK_71e19e25abb4ce3fd6b97aee483.length) {
            await queryRunner.query(`ALTER TABLE \`leave_policy_types\` DROP FOREIGN KEY \`FK_71e19e25abb4ce3fd6b97aee483\``);
          }
        }
        const __tbl_FK_cff2ff9892c449cc528d3824789 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_policies']);
        if (__tbl_FK_cff2ff9892c449cc528d3824789.length) {
          const __hasFk_FK_cff2ff9892c449cc528d3824789 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policies', 'FK_cff2ff9892c449cc528d3824789']);
          if (__hasFk_FK_cff2ff9892c449cc528d3824789.length) {
            await queryRunner.query(`ALTER TABLE \`leave_policies\` DROP FOREIGN KEY \`FK_cff2ff9892c449cc528d3824789\``);
          }
        }
        const __tbl_FK_e4161185eb3aa7729038aca6d52 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_policies']);
        if (__tbl_FK_e4161185eb3aa7729038aca6d52.length) {
          const __hasFk_FK_e4161185eb3aa7729038aca6d52 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policies', 'FK_e4161185eb3aa7729038aca6d52']);
          if (__hasFk_FK_e4161185eb3aa7729038aca6d52.length) {
            await queryRunner.query(`ALTER TABLE \`leave_policies\` DROP FOREIGN KEY \`FK_e4161185eb3aa7729038aca6d52\``);
          }
        }
        const __tbl_FK_e944bd0d894099fe5632364d219 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_policies']);
        if (__tbl_FK_e944bd0d894099fe5632364d219.length) {
          const __hasFk_FK_e944bd0d894099fe5632364d219 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_policies', 'FK_e944bd0d894099fe5632364d219']);
          if (__hasFk_FK_e944bd0d894099fe5632364d219.length) {
            await queryRunner.query(`ALTER TABLE \`leave_policies\` DROP FOREIGN KEY \`FK_e944bd0d894099fe5632364d219\``);
          }
        }
        const __tbl_FK_d64da0a991d2f4d23d86031530c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_balances']);
        if (__tbl_FK_d64da0a991d2f4d23d86031530c.length) {
          const __hasFk_FK_d64da0a991d2f4d23d86031530c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_balances', 'FK_d64da0a991d2f4d23d86031530c']);
          if (__hasFk_FK_d64da0a991d2f4d23d86031530c.length) {
            await queryRunner.query(`ALTER TABLE \`leave_balances\` DROP FOREIGN KEY \`FK_d64da0a991d2f4d23d86031530c\``);
          }
        }
        const __tbl_FK_2f8aebce74941a2e2168e94ba68 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_balances']);
        if (__tbl_FK_2f8aebce74941a2e2168e94ba68.length) {
          const __hasFk_FK_2f8aebce74941a2e2168e94ba68 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_balances', 'FK_2f8aebce74941a2e2168e94ba68']);
          if (__hasFk_FK_2f8aebce74941a2e2168e94ba68.length) {
            await queryRunner.query(`ALTER TABLE \`leave_balances\` DROP FOREIGN KEY \`FK_2f8aebce74941a2e2168e94ba68\``);
          }
        }
        const __tbl_FK_5542f00916a572d2a2b3cf4a8ee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflows']);
        if (__tbl_FK_5542f00916a572d2a2b3cf4a8ee.length) {
          const __hasFk_FK_5542f00916a572d2a2b3cf4a8ee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflows', 'FK_5542f00916a572d2a2b3cf4a8ee']);
          if (__hasFk_FK_5542f00916a572d2a2b3cf4a8ee.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflows\` DROP FOREIGN KEY \`FK_5542f00916a572d2a2b3cf4a8ee\``);
          }
        }
        const __tbl_FK_0e8d1623bab6d59b1caab6679d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflows']);
        if (__tbl_FK_0e8d1623bab6d59b1caab6679d3.length) {
          const __hasFk_FK_0e8d1623bab6d59b1caab6679d3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflows', 'FK_0e8d1623bab6d59b1caab6679d3']);
          if (__hasFk_FK_0e8d1623bab6d59b1caab6679d3.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflows\` DROP FOREIGN KEY \`FK_0e8d1623bab6d59b1caab6679d3\``);
          }
        }
        const __tbl_FK_2c8491bbc7106bffaf7b0c8e94e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps']);
        if (__tbl_FK_2c8491bbc7106bffaf7b0c8e94e.length) {
          const __hasFk_FK_2c8491bbc7106bffaf7b0c8e94e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_2c8491bbc7106bffaf7b0c8e94e']);
          if (__hasFk_FK_2c8491bbc7106bffaf7b0c8e94e.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` DROP FOREIGN KEY \`FK_2c8491bbc7106bffaf7b0c8e94e\``);
          }
        }
        const __tbl_FK_3623192fc92cbd9582e943d4ce8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps']);
        if (__tbl_FK_3623192fc92cbd9582e943d4ce8.length) {
          const __hasFk_FK_3623192fc92cbd9582e943d4ce8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_3623192fc92cbd9582e943d4ce8']);
          if (__hasFk_FK_3623192fc92cbd9582e943d4ce8.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` DROP FOREIGN KEY \`FK_3623192fc92cbd9582e943d4ce8\``);
          }
        }
        const __tbl_FK_e7ce5022f21e17473d61c075288 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps']);
        if (__tbl_FK_e7ce5022f21e17473d61c075288.length) {
          const __hasFk_FK_e7ce5022f21e17473d61c075288 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_e7ce5022f21e17473d61c075288']);
          if (__hasFk_FK_e7ce5022f21e17473d61c075288.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` DROP FOREIGN KEY \`FK_e7ce5022f21e17473d61c075288\``);
          }
        }
        const __tbl_FK_363efb785ae444caf732a50204b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps']);
        if (__tbl_FK_363efb785ae444caf732a50204b.length) {
          const __hasFk_FK_363efb785ae444caf732a50204b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_363efb785ae444caf732a50204b']);
          if (__hasFk_FK_363efb785ae444caf732a50204b.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` DROP FOREIGN KEY \`FK_363efb785ae444caf732a50204b\``);
          }
        }
        const __tbl_FK_ec2e2cb88d8464a3aa269cef25f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps']);
        if (__tbl_FK_ec2e2cb88d8464a3aa269cef25f.length) {
          const __hasFk_FK_ec2e2cb88d8464a3aa269cef25f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_ec2e2cb88d8464a3aa269cef25f']);
          if (__hasFk_FK_ec2e2cb88d8464a3aa269cef25f.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` DROP FOREIGN KEY \`FK_ec2e2cb88d8464a3aa269cef25f\``);
          }
        }
        const __tbl_FK_41f8715fd54c5b19074851dac3a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps']);
        if (__tbl_FK_41f8715fd54c5b19074851dac3a.length) {
          const __hasFk_FK_41f8715fd54c5b19074851dac3a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_approval_workflow_steps', 'FK_41f8715fd54c5b19074851dac3a']);
          if (__hasFk_FK_41f8715fd54c5b19074851dac3a.length) {
            await queryRunner.query(`ALTER TABLE \`leave_approval_workflow_steps\` DROP FOREIGN KEY \`FK_41f8715fd54c5b19074851dac3a\``);
          }
        }
        const __tbl_FK_837e805f48253f7d6987ba33a37 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_request_approvals']);
        if (__tbl_FK_837e805f48253f7d6987ba33a37.length) {
          const __hasFk_FK_837e805f48253f7d6987ba33a37 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_request_approvals', 'FK_837e805f48253f7d6987ba33a37']);
          if (__hasFk_FK_837e805f48253f7d6987ba33a37.length) {
            await queryRunner.query(`ALTER TABLE \`leave_request_approvals\` DROP FOREIGN KEY \`FK_837e805f48253f7d6987ba33a37\``);
          }
        }
        const __tbl_FK_66c2722ee08966489cdbcd65a6f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_request_approvals']);
        if (__tbl_FK_66c2722ee08966489cdbcd65a6f.length) {
          const __hasFk_FK_66c2722ee08966489cdbcd65a6f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_request_approvals', 'FK_66c2722ee08966489cdbcd65a6f']);
          if (__hasFk_FK_66c2722ee08966489cdbcd65a6f.length) {
            await queryRunner.query(`ALTER TABLE \`leave_request_approvals\` DROP FOREIGN KEY \`FK_66c2722ee08966489cdbcd65a6f\``);
          }
        }
        const __tbl_FK_1b3354f3879c4eb2d0639ed0934 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_request_approvals']);
        if (__tbl_FK_1b3354f3879c4eb2d0639ed0934.length) {
          const __hasFk_FK_1b3354f3879c4eb2d0639ed0934 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_request_approvals', 'FK_1b3354f3879c4eb2d0639ed0934']);
          if (__hasFk_FK_1b3354f3879c4eb2d0639ed0934.length) {
            await queryRunner.query(`ALTER TABLE \`leave_request_approvals\` DROP FOREIGN KEY \`FK_1b3354f3879c4eb2d0639ed0934\``);
          }
        }
        const __tbl_FK_3483ae1e96704c26e2367ee1a9d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_requests']);
        if (__tbl_FK_3483ae1e96704c26e2367ee1a9d.length) {
          const __hasFk_FK_3483ae1e96704c26e2367ee1a9d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_3483ae1e96704c26e2367ee1a9d']);
          if (__hasFk_FK_3483ae1e96704c26e2367ee1a9d.length) {
            await queryRunner.query(`ALTER TABLE \`leave_requests\` DROP FOREIGN KEY \`FK_3483ae1e96704c26e2367ee1a9d\``);
          }
        }
        const __tbl_FK_54a57db316598806786c2b95323 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_requests']);
        if (__tbl_FK_54a57db316598806786c2b95323.length) {
          const __hasFk_FK_54a57db316598806786c2b95323 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_54a57db316598806786c2b95323']);
          if (__hasFk_FK_54a57db316598806786c2b95323.length) {
            await queryRunner.query(`ALTER TABLE \`leave_requests\` DROP FOREIGN KEY \`FK_54a57db316598806786c2b95323\``);
          }
        }
        const __tbl_FK_52b4b7c7d295e204add6dbe0a09 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_requests']);
        if (__tbl_FK_52b4b7c7d295e204add6dbe0a09.length) {
          const __hasFk_FK_52b4b7c7d295e204add6dbe0a09 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_52b4b7c7d295e204add6dbe0a09']);
          if (__hasFk_FK_52b4b7c7d295e204add6dbe0a09.length) {
            await queryRunner.query(`ALTER TABLE \`leave_requests\` DROP FOREIGN KEY \`FK_52b4b7c7d295e204add6dbe0a09\``);
          }
        }
        const __tbl_FK_43c15abe870cf2a725b3d722b78 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_requests']);
        if (__tbl_FK_43c15abe870cf2a725b3d722b78.length) {
          const __hasFk_FK_43c15abe870cf2a725b3d722b78 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_requests', 'FK_43c15abe870cf2a725b3d722b78']);
          if (__hasFk_FK_43c15abe870cf2a725b3d722b78.length) {
            await queryRunner.query(`ALTER TABLE \`leave_requests\` DROP FOREIGN KEY \`FK_43c15abe870cf2a725b3d722b78\``);
          }
        }
        const __tbl_FK_d1bd68913860ced896392c02eb1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_medical_details']);
        if (__tbl_FK_d1bd68913860ced896392c02eb1.length) {
          const __hasFk_FK_d1bd68913860ced896392c02eb1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_medical_details', 'FK_d1bd68913860ced896392c02eb1']);
          if (__hasFk_FK_d1bd68913860ced896392c02eb1.length) {
            await queryRunner.query(`ALTER TABLE \`leave_medical_details\` DROP FOREIGN KEY \`FK_d1bd68913860ced896392c02eb1\``);
          }
        }
        const __tbl_FK_81f749951ce1dde3b12679cc0b6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_documents']);
        if (__tbl_FK_81f749951ce1dde3b12679cc0b6.length) {
          const __hasFk_FK_81f749951ce1dde3b12679cc0b6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_documents', 'FK_81f749951ce1dde3b12679cc0b6']);
          if (__hasFk_FK_81f749951ce1dde3b12679cc0b6.length) {
            await queryRunner.query(`ALTER TABLE \`leave_documents\` DROP FOREIGN KEY \`FK_81f749951ce1dde3b12679cc0b6\``);
          }
        }
        const __tbl_FK_eda04fe4e7348cb18f468a30064 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_documents']);
        if (__tbl_FK_eda04fe4e7348cb18f468a30064.length) {
          const __hasFk_FK_eda04fe4e7348cb18f468a30064 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_documents', 'FK_eda04fe4e7348cb18f468a30064']);
          if (__hasFk_FK_eda04fe4e7348cb18f468a30064.length) {
            await queryRunner.query(`ALTER TABLE \`leave_documents\` DROP FOREIGN KEY \`FK_eda04fe4e7348cb18f468a30064\``);
          }
        }
        const __tbl_FK_9a7498586720850726a84bf1a73 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_audit_logs']);
        if (__tbl_FK_9a7498586720850726a84bf1a73.length) {
          const __hasFk_FK_9a7498586720850726a84bf1a73 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_audit_logs', 'FK_9a7498586720850726a84bf1a73']);
          if (__hasFk_FK_9a7498586720850726a84bf1a73.length) {
            await queryRunner.query(`ALTER TABLE \`leave_audit_logs\` DROP FOREIGN KEY \`FK_9a7498586720850726a84bf1a73\``);
          }
        }
        const __tbl_FK_6c8503a66476faa65ecad636370 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['leave_audit_logs']);
        if (__tbl_FK_6c8503a66476faa65ecad636370.length) {
          const __hasFk_FK_6c8503a66476faa65ecad636370 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['leave_audit_logs', 'FK_6c8503a66476faa65ecad636370']);
          if (__hasFk_FK_6c8503a66476faa65ecad636370.length) {
            await queryRunner.query(`ALTER TABLE \`leave_audit_logs\` DROP FOREIGN KEY \`FK_6c8503a66476faa65ecad636370\``);
          }
        }
        const __tbl_FK_cf83c129f16ecc72bee03993047 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflows']);
        if (__tbl_FK_cf83c129f16ecc72bee03993047.length) {
          const __hasFk_FK_cf83c129f16ecc72bee03993047 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflows', 'FK_cf83c129f16ecc72bee03993047']);
          if (__hasFk_FK_cf83c129f16ecc72bee03993047.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflows\` DROP FOREIGN KEY \`FK_cf83c129f16ecc72bee03993047\``);
          }
        }
        const __tbl_FK_a97a128153d3a74396ac8a57219 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflows']);
        if (__tbl_FK_a97a128153d3a74396ac8a57219.length) {
          const __hasFk_FK_a97a128153d3a74396ac8a57219 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflows', 'FK_a97a128153d3a74396ac8a57219']);
          if (__hasFk_FK_a97a128153d3a74396ac8a57219.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflows\` DROP FOREIGN KEY \`FK_a97a128153d3a74396ac8a57219\``);
          }
        }
        const __tbl_FK_529245d10757f8b0493bf9d9c9f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_requests']);
        if (__tbl_FK_529245d10757f8b0493bf9d9c9f.length) {
          const __hasFk_FK_529245d10757f8b0493bf9d9c9f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_529245d10757f8b0493bf9d9c9f']);
          if (__hasFk_FK_529245d10757f8b0493bf9d9c9f.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_requests\` DROP FOREIGN KEY \`FK_529245d10757f8b0493bf9d9c9f\``);
          }
        }
        const __tbl_FK_32083abf023e566231be6000aee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_requests']);
        if (__tbl_FK_32083abf023e566231be6000aee.length) {
          const __hasFk_FK_32083abf023e566231be6000aee = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_32083abf023e566231be6000aee']);
          if (__hasFk_FK_32083abf023e566231be6000aee.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_requests\` DROP FOREIGN KEY \`FK_32083abf023e566231be6000aee\``);
          }
        }
        const __tbl_FK_98f40fbc0af40216c80c2d2bc3b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_requests']);
        if (__tbl_FK_98f40fbc0af40216c80c2d2bc3b.length) {
          const __hasFk_FK_98f40fbc0af40216c80c2d2bc3b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_98f40fbc0af40216c80c2d2bc3b']);
          if (__hasFk_FK_98f40fbc0af40216c80c2d2bc3b.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_requests\` DROP FOREIGN KEY \`FK_98f40fbc0af40216c80c2d2bc3b\``);
          }
        }
        const __tbl_FK_46663dd1dac65f02e3f66ff1544 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_requests']);
        if (__tbl_FK_46663dd1dac65f02e3f66ff1544.length) {
          const __hasFk_FK_46663dd1dac65f02e3f66ff1544 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_46663dd1dac65f02e3f66ff1544']);
          if (__hasFk_FK_46663dd1dac65f02e3f66ff1544.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_requests\` DROP FOREIGN KEY \`FK_46663dd1dac65f02e3f66ff1544\``);
          }
        }
        const __tbl_FK_bfd6dc7744409308e735fd4263f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_requests']);
        if (__tbl_FK_bfd6dc7744409308e735fd4263f.length) {
          const __hasFk_FK_bfd6dc7744409308e735fd4263f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_bfd6dc7744409308e735fd4263f']);
          if (__hasFk_FK_bfd6dc7744409308e735fd4263f.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_requests\` DROP FOREIGN KEY \`FK_bfd6dc7744409308e735fd4263f\``);
          }
        }
        const __tbl_FK_d47153fa0f74a75b758f05ecf6b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_requests']);
        if (__tbl_FK_d47153fa0f74a75b758f05ecf6b.length) {
          const __hasFk_FK_d47153fa0f74a75b758f05ecf6b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_requests', 'FK_d47153fa0f74a75b758f05ecf6b']);
          if (__hasFk_FK_d47153fa0f74a75b758f05ecf6b.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_requests\` DROP FOREIGN KEY \`FK_d47153fa0f74a75b758f05ecf6b\``);
          }
        }
        const __tbl_FK_90fbedcb9a71b67330b836b5702 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_clearances']);
        if (__tbl_FK_90fbedcb9a71b67330b836b5702.length) {
          const __hasFk_FK_90fbedcb9a71b67330b836b5702 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_clearances', 'FK_90fbedcb9a71b67330b836b5702']);
          if (__hasFk_FK_90fbedcb9a71b67330b836b5702.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_clearances\` DROP FOREIGN KEY \`FK_90fbedcb9a71b67330b836b5702\``);
          }
        }
        const __tbl_FK_ac3119d04e4b30ea60ffd30d1f0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_clearances']);
        if (__tbl_FK_ac3119d04e4b30ea60ffd30d1f0.length) {
          const __hasFk_FK_ac3119d04e4b30ea60ffd30d1f0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_clearances', 'FK_ac3119d04e4b30ea60ffd30d1f0']);
          if (__hasFk_FK_ac3119d04e4b30ea60ffd30d1f0.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_clearances\` DROP FOREIGN KEY \`FK_ac3119d04e4b30ea60ffd30d1f0\``);
          }
        }
        const __tbl_FK_e05407a0672babb347388ffa793 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_audit_logs']);
        if (__tbl_FK_e05407a0672babb347388ffa793.length) {
          const __hasFk_FK_e05407a0672babb347388ffa793 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_audit_logs', 'FK_e05407a0672babb347388ffa793']);
          if (__hasFk_FK_e05407a0672babb347388ffa793.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_audit_logs\` DROP FOREIGN KEY \`FK_e05407a0672babb347388ffa793\``);
          }
        }
        const __tbl_FK_d845c74fcdd1022ff5928890a65 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_audit_logs']);
        if (__tbl_FK_d845c74fcdd1022ff5928890a65.length) {
          const __hasFk_FK_d845c74fcdd1022ff5928890a65 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_audit_logs', 'FK_d845c74fcdd1022ff5928890a65']);
          if (__hasFk_FK_d845c74fcdd1022ff5928890a65.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_audit_logs\` DROP FOREIGN KEY \`FK_d845c74fcdd1022ff5928890a65\``);
          }
        }
        const __tbl_FK_caf88fe3fa994b5e16133d67654 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_approvals']);
        if (__tbl_FK_caf88fe3fa994b5e16133d67654.length) {
          const __hasFk_FK_caf88fe3fa994b5e16133d67654 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_approvals', 'FK_caf88fe3fa994b5e16133d67654']);
          if (__hasFk_FK_caf88fe3fa994b5e16133d67654.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_approvals\` DROP FOREIGN KEY \`FK_caf88fe3fa994b5e16133d67654\``);
          }
        }
        const __tbl_FK_4c7f6855d25ff44db3548477dce = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_approvals']);
        if (__tbl_FK_4c7f6855d25ff44db3548477dce.length) {
          const __hasFk_FK_4c7f6855d25ff44db3548477dce = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_approvals', 'FK_4c7f6855d25ff44db3548477dce']);
          if (__hasFk_FK_4c7f6855d25ff44db3548477dce.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_approvals\` DROP FOREIGN KEY \`FK_4c7f6855d25ff44db3548477dce\``);
          }
        }
        const __tbl_FK_fdbdf70289a17bdfa8b3d156c1b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_approvals']);
        if (__tbl_FK_fdbdf70289a17bdfa8b3d156c1b.length) {
          const __hasFk_FK_fdbdf70289a17bdfa8b3d156c1b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_approvals', 'FK_fdbdf70289a17bdfa8b3d156c1b']);
          if (__hasFk_FK_fdbdf70289a17bdfa8b3d156c1b.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_approvals\` DROP FOREIGN KEY \`FK_fdbdf70289a17bdfa8b3d156c1b\``);
          }
        }
        const __tbl_FK_bda09ef8780f77d58ebe5078284 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflow_steps']);
        if (__tbl_FK_bda09ef8780f77d58ebe5078284.length) {
          const __hasFk_FK_bda09ef8780f77d58ebe5078284 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_bda09ef8780f77d58ebe5078284']);
          if (__hasFk_FK_bda09ef8780f77d58ebe5078284.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` DROP FOREIGN KEY \`FK_bda09ef8780f77d58ebe5078284\``);
          }
        }
        const __tbl_FK_fde93bcbed6b4925bda2b652253 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflow_steps']);
        if (__tbl_FK_fde93bcbed6b4925bda2b652253.length) {
          const __hasFk_FK_fde93bcbed6b4925bda2b652253 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_fde93bcbed6b4925bda2b652253']);
          if (__hasFk_FK_fde93bcbed6b4925bda2b652253.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` DROP FOREIGN KEY \`FK_fde93bcbed6b4925bda2b652253\``);
          }
        }
        const __tbl_FK_d760de2926b0ca478a349135635 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflow_steps']);
        if (__tbl_FK_d760de2926b0ca478a349135635.length) {
          const __hasFk_FK_d760de2926b0ca478a349135635 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_d760de2926b0ca478a349135635']);
          if (__hasFk_FK_d760de2926b0ca478a349135635.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` DROP FOREIGN KEY \`FK_d760de2926b0ca478a349135635\``);
          }
        }
        const __tbl_FK_0e8e6012e4a99834fa2134fd9dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflow_steps']);
        if (__tbl_FK_0e8e6012e4a99834fa2134fd9dc.length) {
          const __hasFk_FK_0e8e6012e4a99834fa2134fd9dc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_0e8e6012e4a99834fa2134fd9dc']);
          if (__hasFk_FK_0e8e6012e4a99834fa2134fd9dc.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` DROP FOREIGN KEY \`FK_0e8e6012e4a99834fa2134fd9dc\``);
          }
        }
        const __tbl_FK_40fd0acca667c1eb0a367a9cb7e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflow_steps']);
        if (__tbl_FK_40fd0acca667c1eb0a367a9cb7e.length) {
          const __hasFk_FK_40fd0acca667c1eb0a367a9cb7e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_40fd0acca667c1eb0a367a9cb7e']);
          if (__hasFk_FK_40fd0acca667c1eb0a367a9cb7e.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` DROP FOREIGN KEY \`FK_40fd0acca667c1eb0a367a9cb7e\``);
          }
        }
        const __tbl_FK_f6af6450256b6ad2474ae75a44d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_workflow_steps']);
        if (__tbl_FK_f6af6450256b6ad2474ae75a44d.length) {
          const __hasFk_FK_f6af6450256b6ad2474ae75a44d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_workflow_steps', 'FK_f6af6450256b6ad2474ae75a44d']);
          if (__hasFk_FK_f6af6450256b6ad2474ae75a44d.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_workflow_steps\` DROP FOREIGN KEY \`FK_f6af6450256b6ad2474ae75a44d\``);
          }
        }
        const __tbl_FK_518681b393df9a750dddfbee839 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_tasks']);
        if (__tbl_FK_518681b393df9a750dddfbee839.length) {
          const __hasFk_FK_518681b393df9a750dddfbee839 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_tasks', 'FK_518681b393df9a750dddfbee839']);
          if (__hasFk_FK_518681b393df9a750dddfbee839.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_tasks\` DROP FOREIGN KEY \`FK_518681b393df9a750dddfbee839\``);
          }
        }
        const __tbl_FK_8504e4a38faa0e7793d5789a1c4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_tasks']);
        if (__tbl_FK_8504e4a38faa0e7793d5789a1c4.length) {
          const __hasFk_FK_8504e4a38faa0e7793d5789a1c4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_tasks', 'FK_8504e4a38faa0e7793d5789a1c4']);
          if (__hasFk_FK_8504e4a38faa0e7793d5789a1c4.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_tasks\` DROP FOREIGN KEY \`FK_8504e4a38faa0e7793d5789a1c4\``);
          }
        }
        const __tbl_FK_ca1782fe96cc14adf7afa6def6a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['offboarding_tasks']);
        if (__tbl_FK_ca1782fe96cc14adf7afa6def6a.length) {
          const __hasFk_FK_ca1782fe96cc14adf7afa6def6a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['offboarding_tasks', 'FK_ca1782fe96cc14adf7afa6def6a']);
          if (__hasFk_FK_ca1782fe96cc14adf7afa6def6a.length) {
            await queryRunner.query(`ALTER TABLE \`offboarding_tasks\` DROP FOREIGN KEY \`FK_ca1782fe96cc14adf7afa6def6a\``);
          }
        }
        const __tbl_FK_e321f50dd817bca743078ae03f4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflows']);
        if (__tbl_FK_e321f50dd817bca743078ae03f4.length) {
          const __hasFk_FK_e321f50dd817bca743078ae03f4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflows', 'FK_e321f50dd817bca743078ae03f4']);
          if (__hasFk_FK_e321f50dd817bca743078ae03f4.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflows\` DROP FOREIGN KEY \`FK_e321f50dd817bca743078ae03f4\``);
          }
        }
        const __tbl_FK_58e6f74f15f2ed2bb7497ad5ad8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_requests']);
        if (__tbl_FK_58e6f74f15f2ed2bb7497ad5ad8.length) {
          const __hasFk_FK_58e6f74f15f2ed2bb7497ad5ad8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_58e6f74f15f2ed2bb7497ad5ad8']);
          if (__hasFk_FK_58e6f74f15f2ed2bb7497ad5ad8.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_requests\` DROP FOREIGN KEY \`FK_58e6f74f15f2ed2bb7497ad5ad8\``);
          }
        }
        const __tbl_FK_00ca02c67f89a3933b3f8c6682b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_requests']);
        if (__tbl_FK_00ca02c67f89a3933b3f8c6682b.length) {
          const __hasFk_FK_00ca02c67f89a3933b3f8c6682b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_00ca02c67f89a3933b3f8c6682b']);
          if (__hasFk_FK_00ca02c67f89a3933b3f8c6682b.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_requests\` DROP FOREIGN KEY \`FK_00ca02c67f89a3933b3f8c6682b\``);
          }
        }
        const __tbl_FK_d90b6c7b682bc4701998e0e5b15 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_requests']);
        if (__tbl_FK_d90b6c7b682bc4701998e0e5b15.length) {
          const __hasFk_FK_d90b6c7b682bc4701998e0e5b15 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_d90b6c7b682bc4701998e0e5b15']);
          if (__hasFk_FK_d90b6c7b682bc4701998e0e5b15.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_requests\` DROP FOREIGN KEY \`FK_d90b6c7b682bc4701998e0e5b15\``);
          }
        }
        const __tbl_FK_f38b58308ed8f5f0755af9e5bd6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_requests']);
        if (__tbl_FK_f38b58308ed8f5f0755af9e5bd6.length) {
          const __hasFk_FK_f38b58308ed8f5f0755af9e5bd6 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_f38b58308ed8f5f0755af9e5bd6']);
          if (__hasFk_FK_f38b58308ed8f5f0755af9e5bd6.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_requests\` DROP FOREIGN KEY \`FK_f38b58308ed8f5f0755af9e5bd6\``);
          }
        }
        const __tbl_FK_02e61f86d8b6730449a26586bcd = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_requests']);
        if (__tbl_FK_02e61f86d8b6730449a26586bcd.length) {
          const __hasFk_FK_02e61f86d8b6730449a26586bcd = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_requests', 'FK_02e61f86d8b6730449a26586bcd']);
          if (__hasFk_FK_02e61f86d8b6730449a26586bcd.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_requests\` DROP FOREIGN KEY \`FK_02e61f86d8b6730449a26586bcd\``);
          }
        }
        const __tbl_FK_100c17e1cd9f07ac1e4ca13178d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_audit_logs']);
        if (__tbl_FK_100c17e1cd9f07ac1e4ca13178d.length) {
          const __hasFk_FK_100c17e1cd9f07ac1e4ca13178d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_audit_logs', 'FK_100c17e1cd9f07ac1e4ca13178d']);
          if (__hasFk_FK_100c17e1cd9f07ac1e4ca13178d.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_audit_logs\` DROP FOREIGN KEY \`FK_100c17e1cd9f07ac1e4ca13178d\``);
          }
        }
        const __tbl_FK_e06b9bbbd4aa167f74f5e691133 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_audit_logs']);
        if (__tbl_FK_e06b9bbbd4aa167f74f5e691133.length) {
          const __hasFk_FK_e06b9bbbd4aa167f74f5e691133 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_audit_logs', 'FK_e06b9bbbd4aa167f74f5e691133']);
          if (__hasFk_FK_e06b9bbbd4aa167f74f5e691133.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_audit_logs\` DROP FOREIGN KEY \`FK_e06b9bbbd4aa167f74f5e691133\``);
          }
        }
        const __tbl_FK_410914c976c0b46cbc2c6817f3a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_approvals']);
        if (__tbl_FK_410914c976c0b46cbc2c6817f3a.length) {
          const __hasFk_FK_410914c976c0b46cbc2c6817f3a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_approvals', 'FK_410914c976c0b46cbc2c6817f3a']);
          if (__hasFk_FK_410914c976c0b46cbc2c6817f3a.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_approvals\` DROP FOREIGN KEY \`FK_410914c976c0b46cbc2c6817f3a\``);
          }
        }
        const __tbl_FK_cb0b47352929a662971e3905013 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_approvals']);
        if (__tbl_FK_cb0b47352929a662971e3905013.length) {
          const __hasFk_FK_cb0b47352929a662971e3905013 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_approvals', 'FK_cb0b47352929a662971e3905013']);
          if (__hasFk_FK_cb0b47352929a662971e3905013.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_approvals\` DROP FOREIGN KEY \`FK_cb0b47352929a662971e3905013\``);
          }
        }
        const __tbl_FK_d2f578b3932a7d77ca678368f53 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_approvals']);
        if (__tbl_FK_d2f578b3932a7d77ca678368f53.length) {
          const __hasFk_FK_d2f578b3932a7d77ca678368f53 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_approvals', 'FK_d2f578b3932a7d77ca678368f53']);
          if (__hasFk_FK_d2f578b3932a7d77ca678368f53.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_approvals\` DROP FOREIGN KEY \`FK_d2f578b3932a7d77ca678368f53\``);
          }
        }
        const __tbl_FK_5918a8d4aa34c40c87888e82a73 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflow_steps']);
        if (__tbl_FK_5918a8d4aa34c40c87888e82a73.length) {
          const __hasFk_FK_5918a8d4aa34c40c87888e82a73 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_5918a8d4aa34c40c87888e82a73']);
          if (__hasFk_FK_5918a8d4aa34c40c87888e82a73.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` DROP FOREIGN KEY \`FK_5918a8d4aa34c40c87888e82a73\``);
          }
        }
        const __tbl_FK_329de14b9b44cad50d5571946c1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflow_steps']);
        if (__tbl_FK_329de14b9b44cad50d5571946c1.length) {
          const __hasFk_FK_329de14b9b44cad50d5571946c1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_329de14b9b44cad50d5571946c1']);
          if (__hasFk_FK_329de14b9b44cad50d5571946c1.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` DROP FOREIGN KEY \`FK_329de14b9b44cad50d5571946c1\``);
          }
        }
        const __tbl_FK_ea1d76a8eda488dea9e45832f36 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflow_steps']);
        if (__tbl_FK_ea1d76a8eda488dea9e45832f36.length) {
          const __hasFk_FK_ea1d76a8eda488dea9e45832f36 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_ea1d76a8eda488dea9e45832f36']);
          if (__hasFk_FK_ea1d76a8eda488dea9e45832f36.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` DROP FOREIGN KEY \`FK_ea1d76a8eda488dea9e45832f36\``);
          }
        }
        const __tbl_FK_da33e93da314259268b6ce0a86d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflow_steps']);
        if (__tbl_FK_da33e93da314259268b6ce0a86d.length) {
          const __hasFk_FK_da33e93da314259268b6ce0a86d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_da33e93da314259268b6ce0a86d']);
          if (__hasFk_FK_da33e93da314259268b6ce0a86d.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` DROP FOREIGN KEY \`FK_da33e93da314259268b6ce0a86d\``);
          }
        }
        const __tbl_FK_37f25f4fb277d8b4a520e36936c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflow_steps']);
        if (__tbl_FK_37f25f4fb277d8b4a520e36936c.length) {
          const __hasFk_FK_37f25f4fb277d8b4a520e36936c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_37f25f4fb277d8b4a520e36936c']);
          if (__hasFk_FK_37f25f4fb277d8b4a520e36936c.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` DROP FOREIGN KEY \`FK_37f25f4fb277d8b4a520e36936c\``);
          }
        }
        const __tbl_FK_b67cafd6b6a18641620ca701c0c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_workflow_steps']);
        if (__tbl_FK_b67cafd6b6a18641620ca701c0c.length) {
          const __hasFk_FK_b67cafd6b6a18641620ca701c0c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_workflow_steps', 'FK_b67cafd6b6a18641620ca701c0c']);
          if (__hasFk_FK_b67cafd6b6a18641620ca701c0c.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_workflow_steps\` DROP FOREIGN KEY \`FK_b67cafd6b6a18641620ca701c0c\``);
          }
        }
        const __tbl_FK_7eb6a9dad2c5e3acf2c155bf9bb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_tasks']);
        if (__tbl_FK_7eb6a9dad2c5e3acf2c155bf9bb.length) {
          const __hasFk_FK_7eb6a9dad2c5e3acf2c155bf9bb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_7eb6a9dad2c5e3acf2c155bf9bb']);
          if (__hasFk_FK_7eb6a9dad2c5e3acf2c155bf9bb.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` DROP FOREIGN KEY \`FK_7eb6a9dad2c5e3acf2c155bf9bb\``);
          }
        }
        const __tbl_FK_c768bd7d398488153724abac46e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_tasks']);
        if (__tbl_FK_c768bd7d398488153724abac46e.length) {
          const __hasFk_FK_c768bd7d398488153724abac46e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_c768bd7d398488153724abac46e']);
          if (__hasFk_FK_c768bd7d398488153724abac46e.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` DROP FOREIGN KEY \`FK_c768bd7d398488153724abac46e\``);
          }
        }
        const __tbl_FK_fb9b788affb08dd232642fa791d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_tasks']);
        if (__tbl_FK_fb9b788affb08dd232642fa791d.length) {
          const __hasFk_FK_fb9b788affb08dd232642fa791d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_fb9b788affb08dd232642fa791d']);
          if (__hasFk_FK_fb9b788affb08dd232642fa791d.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` DROP FOREIGN KEY \`FK_fb9b788affb08dd232642fa791d\``);
          }
        }
        const __tbl_FK_79fc4bd47ed67a55c2eb5d5cc4c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_tasks']);
        if (__tbl_FK_79fc4bd47ed67a55c2eb5d5cc4c.length) {
          const __hasFk_FK_79fc4bd47ed67a55c2eb5d5cc4c = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_79fc4bd47ed67a55c2eb5d5cc4c']);
          if (__hasFk_FK_79fc4bd47ed67a55c2eb5d5cc4c.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` DROP FOREIGN KEY \`FK_79fc4bd47ed67a55c2eb5d5cc4c\``);
          }
        }
        const __tbl_FK_37ac5b77082a70c3b7e61bb08a5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_tasks']);
        if (__tbl_FK_37ac5b77082a70c3b7e61bb08a5.length) {
          const __hasFk_FK_37ac5b77082a70c3b7e61bb08a5 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_37ac5b77082a70c3b7e61bb08a5']);
          if (__hasFk_FK_37ac5b77082a70c3b7e61bb08a5.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` DROP FOREIGN KEY \`FK_37ac5b77082a70c3b7e61bb08a5\``);
          }
        }
        const __tbl_FK_bb3dbac491a9fb1c005e6ff2f1d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['onboarding_tasks']);
        if (__tbl_FK_bb3dbac491a9fb1c005e6ff2f1d.length) {
          const __hasFk_FK_bb3dbac491a9fb1c005e6ff2f1d = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['onboarding_tasks', 'FK_bb3dbac491a9fb1c005e6ff2f1d']);
          if (__hasFk_FK_bb3dbac491a9fb1c005e6ff2f1d.length) {
            await queryRunner.query(`ALTER TABLE \`onboarding_tasks\` DROP FOREIGN KEY \`FK_bb3dbac491a9fb1c005e6ff2f1d\``);
          }
        }
        const __tbl_FK_0363bc7120c6f81b0fdf3a77a8e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_users']);
        if (__tbl_FK_0363bc7120c6f81b0fdf3a77a8e.length) {
          const __hasFk_FK_0363bc7120c6f81b0fdf3a77a8e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_users', 'FK_0363bc7120c6f81b0fdf3a77a8e']);
          if (__hasFk_FK_0363bc7120c6f81b0fdf3a77a8e.length) {
            await queryRunner.query(`ALTER TABLE \`company_users\` DROP FOREIGN KEY \`FK_0363bc7120c6f81b0fdf3a77a8e\``);
          }
        }
        const __tbl_FK_0a12e8588834314e38e43d6f5a7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_users']);
        if (__tbl_FK_0a12e8588834314e38e43d6f5a7.length) {
          const __hasFk_FK_0a12e8588834314e38e43d6f5a7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_users', 'FK_0a12e8588834314e38e43d6f5a7']);
          if (__hasFk_FK_0a12e8588834314e38e43d6f5a7.length) {
            await queryRunner.query(`ALTER TABLE \`company_users\` DROP FOREIGN KEY \`FK_0a12e8588834314e38e43d6f5a7\``);
          }
        }
        const __tbl_FK_676bfdb821c9989808c8139a29f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_user_branch_accesses']);
        if (__tbl_FK_676bfdb821c9989808c8139a29f.length) {
          const __hasFk_FK_676bfdb821c9989808c8139a29f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_branch_accesses', 'FK_676bfdb821c9989808c8139a29f']);
          if (__hasFk_FK_676bfdb821c9989808c8139a29f.length) {
            await queryRunner.query(`ALTER TABLE \`company_user_branch_accesses\` DROP FOREIGN KEY \`FK_676bfdb821c9989808c8139a29f\``);
          }
        }
        const __tbl_FK_cea1bcbfccb70283f658dcfb6db = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_user_branch_accesses']);
        if (__tbl_FK_cea1bcbfccb70283f658dcfb6db.length) {
          const __hasFk_FK_cea1bcbfccb70283f658dcfb6db = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_branch_accesses', 'FK_cea1bcbfccb70283f658dcfb6db']);
          if (__hasFk_FK_cea1bcbfccb70283f658dcfb6db.length) {
            await queryRunner.query(`ALTER TABLE \`company_user_branch_accesses\` DROP FOREIGN KEY \`FK_cea1bcbfccb70283f658dcfb6db\``);
          }
        }
        const __tbl_FK_5973f79e64a27c506b07cd84b29 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['branches']);
        if (__tbl_FK_5973f79e64a27c506b07cd84b29.length) {
          const __hasFk_FK_5973f79e64a27c506b07cd84b29 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['branches', 'FK_5973f79e64a27c506b07cd84b29']);
          if (__hasFk_FK_5973f79e64a27c506b07cd84b29.length) {
            await queryRunner.query(`ALTER TABLE \`branches\` DROP FOREIGN KEY \`FK_5973f79e64a27c506b07cd84b29\``);
          }
        }
        const __tbl_FK_700b0b13f494cb37b6ca929e79b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['departments']);
        if (__tbl_FK_700b0b13f494cb37b6ca929e79b.length) {
          const __hasFk_FK_700b0b13f494cb37b6ca929e79b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['departments', 'FK_700b0b13f494cb37b6ca929e79b']);
          if (__hasFk_FK_700b0b13f494cb37b6ca929e79b.length) {
            await queryRunner.query(`ALTER TABLE \`departments\` DROP FOREIGN KEY \`FK_700b0b13f494cb37b6ca929e79b\``);
          }
        }
        const __tbl_FK_40b8818a0e3324c859199265503 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['departments']);
        if (__tbl_FK_40b8818a0e3324c859199265503.length) {
          const __hasFk_FK_40b8818a0e3324c859199265503 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['departments', 'FK_40b8818a0e3324c859199265503']);
          if (__hasFk_FK_40b8818a0e3324c859199265503.length) {
            await queryRunner.query(`ALTER TABLE \`departments\` DROP FOREIGN KEY \`FK_40b8818a0e3324c859199265503\``);
          }
        }
        const __tbl_FK_541e3d07c93baa9cc42b149a5fb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['departments']);
        if (__tbl_FK_541e3d07c93baa9cc42b149a5fb.length) {
          const __hasFk_FK_541e3d07c93baa9cc42b149a5fb = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['departments', 'FK_541e3d07c93baa9cc42b149a5fb']);
          if (__hasFk_FK_541e3d07c93baa9cc42b149a5fb.length) {
            await queryRunner.query(`ALTER TABLE \`departments\` DROP FOREIGN KEY \`FK_541e3d07c93baa9cc42b149a5fb\``);
          }
        }
        const __tbl_FK_97884615dba807341722aa7aa4b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['designations']);
        if (__tbl_FK_97884615dba807341722aa7aa4b.length) {
          const __hasFk_FK_97884615dba807341722aa7aa4b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['designations', 'FK_97884615dba807341722aa7aa4b']);
          if (__hasFk_FK_97884615dba807341722aa7aa4b.length) {
            await queryRunner.query(`ALTER TABLE \`designations\` DROP FOREIGN KEY \`FK_97884615dba807341722aa7aa4b\``);
          }
        }
        const __tbl_FK_afa94101357165af73943deb8f3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['designations']);
        if (__tbl_FK_afa94101357165af73943deb8f3.length) {
          const __hasFk_FK_afa94101357165af73943deb8f3 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['designations', 'FK_afa94101357165af73943deb8f3']);
          if (__hasFk_FK_afa94101357165af73943deb8f3.length) {
            await queryRunner.query(`ALTER TABLE \`designations\` DROP FOREIGN KEY \`FK_afa94101357165af73943deb8f3\``);
          }
        }
        const __tbl_FK_6a6e3e4cd4f6e58ffa33683e570 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employees']);
        if (__tbl_FK_6a6e3e4cd4f6e58ffa33683e570.length) {
          const __hasFk_FK_6a6e3e4cd4f6e58ffa33683e570 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_6a6e3e4cd4f6e58ffa33683e570']);
          if (__hasFk_FK_6a6e3e4cd4f6e58ffa33683e570.length) {
            await queryRunner.query(`ALTER TABLE \`employees\` DROP FOREIGN KEY \`FK_6a6e3e4cd4f6e58ffa33683e570\``);
          }
        }
        const __tbl_FK_7cd9e62424388f822b59689716e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employees']);
        if (__tbl_FK_7cd9e62424388f822b59689716e.length) {
          const __hasFk_FK_7cd9e62424388f822b59689716e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_7cd9e62424388f822b59689716e']);
          if (__hasFk_FK_7cd9e62424388f822b59689716e.length) {
            await queryRunner.query(`ALTER TABLE \`employees\` DROP FOREIGN KEY \`FK_7cd9e62424388f822b59689716e\``);
          }
        }
        const __tbl_FK_15b8425f2c72b1c6b951045a595 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employees']);
        if (__tbl_FK_15b8425f2c72b1c6b951045a595.length) {
          const __hasFk_FK_15b8425f2c72b1c6b951045a595 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_15b8425f2c72b1c6b951045a595']);
          if (__hasFk_FK_15b8425f2c72b1c6b951045a595.length) {
            await queryRunner.query(`ALTER TABLE \`employees\` DROP FOREIGN KEY \`FK_15b8425f2c72b1c6b951045a595\``);
          }
        }
        const __tbl_FK_78c4d0dd8c753633afce6ecaf67 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employees']);
        if (__tbl_FK_78c4d0dd8c753633afce6ecaf67.length) {
          const __hasFk_FK_78c4d0dd8c753633afce6ecaf67 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_78c4d0dd8c753633afce6ecaf67']);
          if (__hasFk_FK_78c4d0dd8c753633afce6ecaf67.length) {
            await queryRunner.query(`ALTER TABLE \`employees\` DROP FOREIGN KEY \`FK_78c4d0dd8c753633afce6ecaf67\``);
          }
        }
        const __tbl_FK_ebb588125dcb322894cb6494f26 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employees']);
        if (__tbl_FK_ebb588125dcb322894cb6494f26.length) {
          const __hasFk_FK_ebb588125dcb322894cb6494f26 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_ebb588125dcb322894cb6494f26']);
          if (__hasFk_FK_ebb588125dcb322894cb6494f26.length) {
            await queryRunner.query(`ALTER TABLE \`employees\` DROP FOREIGN KEY \`FK_ebb588125dcb322894cb6494f26\``);
          }
        }
        const __tbl_FK_640b443f67415a68f5386f5e36e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employees']);
        if (__tbl_FK_640b443f67415a68f5386f5e36e.length) {
          const __hasFk_FK_640b443f67415a68f5386f5e36e = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employees', 'FK_640b443f67415a68f5386f5e36e']);
          if (__hasFk_FK_640b443f67415a68f5386f5e36e.length) {
            await queryRunner.query(`ALTER TABLE \`employees\` DROP FOREIGN KEY \`FK_640b443f67415a68f5386f5e36e\``);
          }
        }
        const __tbl_FK_bebe2625e8606fe8e55f9f6106a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_relatives']);
        if (__tbl_FK_bebe2625e8606fe8e55f9f6106a.length) {
          const __hasFk_FK_bebe2625e8606fe8e55f9f6106a = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_relatives', 'FK_bebe2625e8606fe8e55f9f6106a']);
          if (__hasFk_FK_bebe2625e8606fe8e55f9f6106a.length) {
            await queryRunner.query(`ALTER TABLE \`employee_relatives\` DROP FOREIGN KEY \`FK_bebe2625e8606fe8e55f9f6106a\``);
          }
        }
        const __tbl_FK_a22c2d167d33e363ee7ba6bb2c4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_professional_qualifications']);
        if (__tbl_FK_a22c2d167d33e363ee7ba6bb2c4.length) {
          const __hasFk_FK_a22c2d167d33e363ee7ba6bb2c4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_professional_qualifications', 'FK_a22c2d167d33e363ee7ba6bb2c4']);
          if (__hasFk_FK_a22c2d167d33e363ee7ba6bb2c4.length) {
            await queryRunner.query(`ALTER TABLE \`employee_professional_qualifications\` DROP FOREIGN KEY \`FK_a22c2d167d33e363ee7ba6bb2c4\``);
          }
        }
        const __tbl_FK_198a52bcdc38fc3fb3d75ae0813 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_professional_qualifications']);
        if (__tbl_FK_198a52bcdc38fc3fb3d75ae0813.length) {
          const __hasFk_FK_198a52bcdc38fc3fb3d75ae0813 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_professional_qualifications', 'FK_198a52bcdc38fc3fb3d75ae0813']);
          if (__hasFk_FK_198a52bcdc38fc3fb3d75ae0813.length) {
            await queryRunner.query(`ALTER TABLE \`employee_professional_qualifications\` DROP FOREIGN KEY \`FK_198a52bcdc38fc3fb3d75ae0813\``);
          }
        }
        const __tbl_FK_8f377c5e56b23f029e5e582aea0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_academic_qualifications']);
        if (__tbl_FK_8f377c5e56b23f029e5e582aea0.length) {
          const __hasFk_FK_8f377c5e56b23f029e5e582aea0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_academic_qualifications', 'FK_8f377c5e56b23f029e5e582aea0']);
          if (__hasFk_FK_8f377c5e56b23f029e5e582aea0.length) {
            await queryRunner.query(`ALTER TABLE \`employee_academic_qualifications\` DROP FOREIGN KEY \`FK_8f377c5e56b23f029e5e582aea0\``);
          }
        }
        const __tbl_FK_a08956e5e42a044b2912e011ed9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_academic_qualifications']);
        if (__tbl_FK_a08956e5e42a044b2912e011ed9.length) {
          const __hasFk_FK_a08956e5e42a044b2912e011ed9 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_academic_qualifications', 'FK_a08956e5e42a044b2912e011ed9']);
          if (__hasFk_FK_a08956e5e42a044b2912e011ed9.length) {
            await queryRunner.query(`ALTER TABLE \`employee_academic_qualifications\` DROP FOREIGN KEY \`FK_a08956e5e42a044b2912e011ed9\``);
          }
        }
        const __tbl_FK_29462e62bd15a63f0d87d3cd1cc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_identifications']);
        if (__tbl_FK_29462e62bd15a63f0d87d3cd1cc.length) {
          const __hasFk_FK_29462e62bd15a63f0d87d3cd1cc = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_identifications', 'FK_29462e62bd15a63f0d87d3cd1cc']);
          if (__hasFk_FK_29462e62bd15a63f0d87d3cd1cc.length) {
            await queryRunner.query(`ALTER TABLE \`employee_identifications\` DROP FOREIGN KEY \`FK_29462e62bd15a63f0d87d3cd1cc\``);
          }
        }
        const __tbl_FK_6f176e65e744f1a1736754af872 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_experiences']);
        if (__tbl_FK_6f176e65e744f1a1736754af872.length) {
          const __hasFk_FK_6f176e65e744f1a1736754af872 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_experiences', 'FK_6f176e65e744f1a1736754af872']);
          if (__hasFk_FK_6f176e65e744f1a1736754af872.length) {
            await queryRunner.query(`ALTER TABLE \`employee_experiences\` DROP FOREIGN KEY \`FK_6f176e65e744f1a1736754af872\``);
          }
        }
        const __tbl_FK_efcc97184c5e2beeb92294bfda1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_documents']);
        if (__tbl_FK_efcc97184c5e2beeb92294bfda1.length) {
          const __hasFk_FK_efcc97184c5e2beeb92294bfda1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_documents', 'FK_efcc97184c5e2beeb92294bfda1']);
          if (__hasFk_FK_efcc97184c5e2beeb92294bfda1.length) {
            await queryRunner.query(`ALTER TABLE \`employee_documents\` DROP FOREIGN KEY \`FK_efcc97184c5e2beeb92294bfda1\``);
          }
        }
        const __tbl_FK_7fce49bcbfe15a73953b2809944 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_documents']);
        if (__tbl_FK_7fce49bcbfe15a73953b2809944.length) {
          const __hasFk_FK_7fce49bcbfe15a73953b2809944 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_documents', 'FK_7fce49bcbfe15a73953b2809944']);
          if (__hasFk_FK_7fce49bcbfe15a73953b2809944.length) {
            await queryRunner.query(`ALTER TABLE \`employee_documents\` DROP FOREIGN KEY \`FK_7fce49bcbfe15a73953b2809944\``);
          }
        }
        const __tbl_FK_b42531bfb853f20d06f11776535 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_departments']);
        if (__tbl_FK_b42531bfb853f20d06f11776535.length) {
          const __hasFk_FK_b42531bfb853f20d06f11776535 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_departments', 'FK_b42531bfb853f20d06f11776535']);
          if (__hasFk_FK_b42531bfb853f20d06f11776535.length) {
            await queryRunner.query(`ALTER TABLE \`employee_departments\` DROP FOREIGN KEY \`FK_b42531bfb853f20d06f11776535\``);
          }
        }
        const __tbl_FK_ed390b2466f6f70591a7d93e0a1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_departments']);
        if (__tbl_FK_ed390b2466f6f70591a7d93e0a1.length) {
          const __hasFk_FK_ed390b2466f6f70591a7d93e0a1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_departments', 'FK_ed390b2466f6f70591a7d93e0a1']);
          if (__hasFk_FK_ed390b2466f6f70591a7d93e0a1.length) {
            await queryRunner.query(`ALTER TABLE \`employee_departments\` DROP FOREIGN KEY \`FK_ed390b2466f6f70591a7d93e0a1\``);
          }
        }
        const __tbl_FK_61abc802fc379b5cb73acf76043 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_designations']);
        if (__tbl_FK_61abc802fc379b5cb73acf76043.length) {
          const __hasFk_FK_61abc802fc379b5cb73acf76043 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_designations', 'FK_61abc802fc379b5cb73acf76043']);
          if (__hasFk_FK_61abc802fc379b5cb73acf76043.length) {
            await queryRunner.query(`ALTER TABLE \`employee_designations\` DROP FOREIGN KEY \`FK_61abc802fc379b5cb73acf76043\``);
          }
        }
        const __tbl_FK_85d002e5beceec079282e48bf4f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_designations']);
        if (__tbl_FK_85d002e5beceec079282e48bf4f.length) {
          const __hasFk_FK_85d002e5beceec079282e48bf4f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_designations', 'FK_85d002e5beceec079282e48bf4f']);
          if (__hasFk_FK_85d002e5beceec079282e48bf4f.length) {
            await queryRunner.query(`ALTER TABLE \`employee_designations\` DROP FOREIGN KEY \`FK_85d002e5beceec079282e48bf4f\``);
          }
        }
        const __tbl_FK_969a93ad90f5becbced7353f448 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_designations']);
        if (__tbl_FK_969a93ad90f5becbced7353f448.length) {
          const __hasFk_FK_969a93ad90f5becbced7353f448 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_designations', 'FK_969a93ad90f5becbced7353f448']);
          if (__hasFk_FK_969a93ad90f5becbced7353f448.length) {
            await queryRunner.query(`ALTER TABLE \`employee_designations\` DROP FOREIGN KEY \`FK_969a93ad90f5becbced7353f448\``);
          }
        }
        const __tbl_FK_041514c529c086579bf5e564cd8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_contacts']);
        if (__tbl_FK_041514c529c086579bf5e564cd8.length) {
          const __hasFk_FK_041514c529c086579bf5e564cd8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_contacts', 'FK_041514c529c086579bf5e564cd8']);
          if (__hasFk_FK_041514c529c086579bf5e564cd8.length) {
            await queryRunner.query(`ALTER TABLE \`employee_contacts\` DROP FOREIGN KEY \`FK_041514c529c086579bf5e564cd8\``);
          }
        }
        const __tbl_FK_362cbc67d2ac1ee20a1f121c8cf = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_bank_accounts']);
        if (__tbl_FK_362cbc67d2ac1ee20a1f121c8cf.length) {
          const __hasFk_FK_362cbc67d2ac1ee20a1f121c8cf = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_bank_accounts', 'FK_362cbc67d2ac1ee20a1f121c8cf']);
          if (__hasFk_FK_362cbc67d2ac1ee20a1f121c8cf.length) {
            await queryRunner.query(`ALTER TABLE \`employee_bank_accounts\` DROP FOREIGN KEY \`FK_362cbc67d2ac1ee20a1f121c8cf\``);
          }
        }
        const __tbl_FK_abf80c712e7c247e7894fc233d8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_addresses']);
        if (__tbl_FK_abf80c712e7c247e7894fc233d8.length) {
          const __hasFk_FK_abf80c712e7c247e7894fc233d8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_addresses', 'FK_abf80c712e7c247e7894fc233d8']);
          if (__hasFk_FK_abf80c712e7c247e7894fc233d8.length) {
            await queryRunner.query(`ALTER TABLE \`employee_addresses\` DROP FOREIGN KEY \`FK_abf80c712e7c247e7894fc233d8\``);
          }
        }
        const __tbl_FK_3e83545af5e55e42004fcea83d4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['positions']);
        if (__tbl_FK_3e83545af5e55e42004fcea83d4.length) {
          const __hasFk_FK_3e83545af5e55e42004fcea83d4 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_3e83545af5e55e42004fcea83d4']);
          if (__hasFk_FK_3e83545af5e55e42004fcea83d4.length) {
            await queryRunner.query(`ALTER TABLE \`positions\` DROP FOREIGN KEY \`FK_3e83545af5e55e42004fcea83d4\``);
          }
        }
        const __tbl_FK_333d281ecd8a4f2deaff228d489 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['positions']);
        if (__tbl_FK_333d281ecd8a4f2deaff228d489.length) {
          const __hasFk_FK_333d281ecd8a4f2deaff228d489 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_333d281ecd8a4f2deaff228d489']);
          if (__hasFk_FK_333d281ecd8a4f2deaff228d489.length) {
            await queryRunner.query(`ALTER TABLE \`positions\` DROP FOREIGN KEY \`FK_333d281ecd8a4f2deaff228d489\``);
          }
        }
        const __tbl_FK_e413c6578fcdae9a8fd673c5bc7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['positions']);
        if (__tbl_FK_e413c6578fcdae9a8fd673c5bc7.length) {
          const __hasFk_FK_e413c6578fcdae9a8fd673c5bc7 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_e413c6578fcdae9a8fd673c5bc7']);
          if (__hasFk_FK_e413c6578fcdae9a8fd673c5bc7.length) {
            await queryRunner.query(`ALTER TABLE \`positions\` DROP FOREIGN KEY \`FK_e413c6578fcdae9a8fd673c5bc7\``);
          }
        }
        const __tbl_FK_869da2fb64cbdc5eb09b0a732d1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['positions']);
        if (__tbl_FK_869da2fb64cbdc5eb09b0a732d1.length) {
          const __hasFk_FK_869da2fb64cbdc5eb09b0a732d1 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_869da2fb64cbdc5eb09b0a732d1']);
          if (__hasFk_FK_869da2fb64cbdc5eb09b0a732d1.length) {
            await queryRunner.query(`ALTER TABLE \`positions\` DROP FOREIGN KEY \`FK_869da2fb64cbdc5eb09b0a732d1\``);
          }
        }
        const __tbl_FK_6844c44333df4976bc4db69aec8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['positions']);
        if (__tbl_FK_6844c44333df4976bc4db69aec8.length) {
          const __hasFk_FK_6844c44333df4976bc4db69aec8 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['positions', 'FK_6844c44333df4976bc4db69aec8']);
          if (__hasFk_FK_6844c44333df4976bc4db69aec8.length) {
            await queryRunner.query(`ALTER TABLE \`positions\` DROP FOREIGN KEY \`FK_6844c44333df4976bc4db69aec8\``);
          }
        }
        const __tbl_FK_6003d1059182b224978835d35ef = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_positions']);
        if (__tbl_FK_6003d1059182b224978835d35ef.length) {
          const __hasFk_FK_6003d1059182b224978835d35ef = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_6003d1059182b224978835d35ef']);
          if (__hasFk_FK_6003d1059182b224978835d35ef.length) {
            await queryRunner.query(`ALTER TABLE \`employee_positions\` DROP FOREIGN KEY \`FK_6003d1059182b224978835d35ef\``);
          }
        }
        const __tbl_FK_1f97107ff3fd45a193d7d39761b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_positions']);
        if (__tbl_FK_1f97107ff3fd45a193d7d39761b.length) {
          const __hasFk_FK_1f97107ff3fd45a193d7d39761b = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_1f97107ff3fd45a193d7d39761b']);
          if (__hasFk_FK_1f97107ff3fd45a193d7d39761b.length) {
            await queryRunner.query(`ALTER TABLE \`employee_positions\` DROP FOREIGN KEY \`FK_1f97107ff3fd45a193d7d39761b\``);
          }
        }
        const __tbl_FK_aa29183a0652f1a189b9d7bcc9f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_positions']);
        if (__tbl_FK_aa29183a0652f1a189b9d7bcc9f.length) {
          const __hasFk_FK_aa29183a0652f1a189b9d7bcc9f = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_aa29183a0652f1a189b9d7bcc9f']);
          if (__hasFk_FK_aa29183a0652f1a189b9d7bcc9f.length) {
            await queryRunner.query(`ALTER TABLE \`employee_positions\` DROP FOREIGN KEY \`FK_aa29183a0652f1a189b9d7bcc9f\``);
          }
        }
        const __tbl_FK_6fddbffebbac0eba9eb916be7c0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['employee_positions']);
        if (__tbl_FK_6fddbffebbac0eba9eb916be7c0.length) {
          const __hasFk_FK_6fddbffebbac0eba9eb916be7c0 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['employee_positions', 'FK_6fddbffebbac0eba9eb916be7c0']);
          if (__hasFk_FK_6fddbffebbac0eba9eb916be7c0.length) {
            await queryRunner.query(`ALTER TABLE \`employee_positions\` DROP FOREIGN KEY \`FK_6fddbffebbac0eba9eb916be7c0\``);
          }
        }
        const __tbl_FK_acb030193db62480c2fd8b2e352 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_user_permissions']);
        if (__tbl_FK_acb030193db62480c2fd8b2e352.length) {
          const __hasFk_FK_acb030193db62480c2fd8b2e352 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_permissions', 'FK_acb030193db62480c2fd8b2e352']);
          if (__hasFk_FK_acb030193db62480c2fd8b2e352.length) {
            await queryRunner.query(`ALTER TABLE \`company_user_permissions\` DROP FOREIGN KEY \`FK_acb030193db62480c2fd8b2e352\``);
          }
        }
        const __tbl_FK_42b8ee52319678d53cbfaf3f057 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_user_permissions']);
        if (__tbl_FK_42b8ee52319678d53cbfaf3f057.length) {
          const __hasFk_FK_42b8ee52319678d53cbfaf3f057 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_permissions', 'FK_42b8ee52319678d53cbfaf3f057']);
          if (__hasFk_FK_42b8ee52319678d53cbfaf3f057.length) {
            await queryRunner.query(`ALTER TABLE \`company_user_permissions\` DROP FOREIGN KEY \`FK_42b8ee52319678d53cbfaf3f057\``);
          }
        }
        const __tbl_FK_c1314bc5a97bc33594274eba554 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_user_roles']);
        if (__tbl_FK_c1314bc5a97bc33594274eba554.length) {
          const __hasFk_FK_c1314bc5a97bc33594274eba554 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_roles', 'FK_c1314bc5a97bc33594274eba554']);
          if (__hasFk_FK_c1314bc5a97bc33594274eba554.length) {
            await queryRunner.query(`ALTER TABLE \`company_user_roles\` DROP FOREIGN KEY \`FK_c1314bc5a97bc33594274eba554\``);
          }
        }
        const __tbl_FK_74ec3aa89216198cb0cfd6edc24 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`, ['company_user_roles']);
        if (__tbl_FK_74ec3aa89216198cb0cfd6edc24.length) {
          const __hasFk_FK_74ec3aa89216198cb0cfd6edc24 = await queryRunner.query(`SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, ['company_user_roles', 'FK_74ec3aa89216198cb0cfd6edc24']);
          if (__hasFk_FK_74ec3aa89216198cb0cfd6edc24.length) {
            await queryRunner.query(`ALTER TABLE \`company_user_roles\` DROP FOREIGN KEY \`FK_74ec3aa89216198cb0cfd6edc24\``);
          }
        }
        await queryRunner.query(`DROP INDEX \`IDX_fe30ce4377c9320e2b8a23c836\` ON \`permission_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_eebf5c79455539db169da54830\` ON \`permission_user\``);
        await queryRunner.query(`DROP TABLE \`permission_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_eb446d431a1abb9801e6ade445\` ON \`role_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_788a980aa4fa89a8859419146a\` ON \`role_user\``);
        await queryRunner.query(`DROP TABLE \`role_user\``);
        await queryRunner.query(`DROP INDEX \`IDX_f131407a830249c1b575316321\` ON \`permission_role\``);
        await queryRunner.query(`DROP INDEX \`IDX_ad249cf4f60be340850d7429e2\` ON \`permission_role\``);
        await queryRunner.query(`DROP TABLE \`permission_role\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetables_company_id\` ON \`timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetables_branch_id\` ON \`timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetables_status\` ON \`timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetables_default\` ON \`timetables\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetables_company_code\` ON \`timetables\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetables_company_name\` ON \`timetables\``);
        await queryRunner.query(`DROP TABLE \`timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_generated_schedules_company_id\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_generated_schedules_employee_id\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_generated_schedules_timetable_id\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_generated_schedules_shift_id\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_generated_schedules_schedule_date\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_generated_schedules_holiday_id\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_generated_schedules_company_employee_date\` ON \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP TABLE \`timetable_generated_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_attendance_rules_timetable_id\` ON \`timetable_attendance_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_attendance_rules_timetable\` ON \`timetable_attendance_rules\``);
        await queryRunner.query(`DROP TABLE \`timetable_attendance_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_holiday_rules_timetable_id\` ON \`timetable_holiday_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_holiday_rules_holiday_group_id\` ON \`timetable_holiday_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_holiday_rules_timetable_group\` ON \`timetable_holiday_rules\``);
        await queryRunner.query(`DROP TABLE \`timetable_holiday_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_rotations_company_id\` ON \`timetable_rotations\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_rotations_timetable_id\` ON \`timetable_rotations\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_rotations_status\` ON \`timetable_rotations\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_rotations_timetable_name\` ON \`timetable_rotations\``);
        await queryRunner.query(`DROP TABLE \`timetable_rotations\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_rotation_rules_rotation_id\` ON \`timetable_rotation_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_rotation_rules_shift_id\` ON \`timetable_rotation_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_rotation_rules_rotation_day\` ON \`timetable_rotation_rules\``);
        await queryRunner.query(`DROP TABLE \`timetable_rotation_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_timetables_company_id\` ON \`employee_timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_timetables_employee_id\` ON \`employee_timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_timetables_timetable_id\` ON \`employee_timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_timetables_effective_from\` ON \`employee_timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_timetables_status\` ON \`employee_timetables\``);
        await queryRunner.query(`DROP TABLE \`employee_timetables\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_days_timetable_id\` ON \`timetable_days\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_days_timetable_day\` ON \`timetable_days\``);
        await queryRunner.query(`DROP TABLE \`timetable_days\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_shift_rules_timetable_day_id\` ON \`timetable_shift_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_timetable_shift_rules_shift_id\` ON \`timetable_shift_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_timetable_shift_rules_day_priority\` ON \`timetable_shift_rules\``);
        await queryRunner.query(`DROP TABLE \`timetable_shift_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_settings_company_id\` ON \`attendance_settings\``);
        await queryRunner.query(`DROP INDEX \`UQ_attendance_settings_company_name\` ON \`attendance_settings\``);
        await queryRunner.query(`DROP TABLE \`attendance_settings\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_change_requests_company_id\` ON \`shift_change_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_change_requests_employee_id\` ON \`shift_change_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_change_requests_request_date\` ON \`shift_change_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_change_requests_status\` ON \`shift_change_requests\``);
        await queryRunner.query(`DROP TABLE \`shift_change_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_templates_company_id\` ON \`shift_templates\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_templates_status\` ON \`shift_templates\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_templates_company_name\` ON \`shift_templates\``);
        await queryRunner.query(`DROP TABLE \`shift_templates\``);
        await queryRunner.query(`DROP INDEX \`IDX_shifts_company_id\` ON \`shifts\``);
        await queryRunner.query(`DROP INDEX \`IDX_shifts_branch_id\` ON \`shifts\``);
        await queryRunner.query(`DROP INDEX \`IDX_shifts_department_id\` ON \`shifts\``);
        await queryRunner.query(`DROP INDEX \`IDX_shifts_status\` ON \`shifts\``);
        await queryRunner.query(`DROP INDEX \`UQ_shifts_company_code\` ON \`shifts\``);
        await queryRunner.query(`DROP INDEX \`UQ_shifts_company_name\` ON \`shifts\``);
        await queryRunner.query(`DROP TABLE \`shifts\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_schedules_company_id\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_schedules_employee_id\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_schedules_shift_id\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_schedules_override_shift_id\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_schedules_schedule_date\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_schedules_holiday_id\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_schedules_company_employee_date\` ON \`shift_schedules\``);
        await queryRunner.query(`DROP TABLE \`shift_schedules\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_holidays_company_id\` ON \`attendance_holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_holidays_holiday_group_id\` ON \`attendance_holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_holidays_date\` ON \`attendance_holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_holidays_type\` ON \`attendance_holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_holidays_branch_id\` ON \`attendance_holidays\``);
        await queryRunner.query(`DROP INDEX \`UQ_attendance_holidays_group_name_date\` ON \`attendance_holidays\``);
        await queryRunner.query(`DROP TABLE \`attendance_holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_holiday_groups_company_id\` ON \`holiday_groups\``);
        await queryRunner.query(`DROP INDEX \`UQ_holiday_groups_company_name\` ON \`holiday_groups\``);
        await queryRunner.query(`DROP TABLE \`holiday_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_assignments_company_id\` ON \`shift_assignments\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_assignments_employee_id\` ON \`shift_assignments\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_assignments_shift_id\` ON \`shift_assignments\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_assignments_rotation_group_id\` ON \`shift_assignments\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_assignments_status\` ON \`shift_assignments\``);
        await queryRunner.query(`DROP TABLE \`shift_assignments\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_rotation_groups_company_id\` ON \`shift_rotation_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_rotation_groups_status\` ON \`shift_rotation_groups\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_rotation_groups_company_code\` ON \`shift_rotation_groups\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_rotation_groups_company_name\` ON \`shift_rotation_groups\``);
        await queryRunner.query(`DROP TABLE \`shift_rotation_groups\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_rotation_rules_rotation_group_id\` ON \`shift_rotation_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_rotation_rules_shift_id\` ON \`shift_rotation_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_rotation_rules_group_day\` ON \`shift_rotation_rules\``);
        await queryRunner.query(`DROP TABLE \`shift_rotation_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_attendance_rules_shift_id\` ON \`shift_attendance_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_attendance_rules_shift\` ON \`shift_attendance_rules\``);
        await queryRunner.query(`DROP TABLE \`shift_attendance_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_overtime_rules_shift_id\` ON \`shift_overtime_rules\``);
        await queryRunner.query(`DROP INDEX \`UQ_shift_overtime_rules_shift\` ON \`shift_overtime_rules\``);
        await queryRunner.query(`DROP TABLE \`shift_overtime_rules\``);
        await queryRunner.query(`DROP INDEX \`IDX_shift_breaks_shift_id\` ON \`shift_breaks\``);
        await queryRunner.query(`DROP TABLE \`shift_breaks\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_company_id\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_device_id\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_status\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_started_at\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_device_sync_logs_company_device_started\` ON \`attendance_device_sync_logs\``);
        await queryRunner.query(`DROP TABLE \`attendance_device_sync_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_a7b2730ecbf6007a4f2fa413a2\` ON \`attendance_devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_devices_company_id\` ON \`attendance_devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_devices_branch_id\` ON \`attendance_devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_devices_device_code\` ON \`attendance_devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_devices_status\` ON \`attendance_devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_devices_company_status\` ON \`attendance_devices\``);
        await queryRunner.query(`DROP TABLE \`attendance_devices\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_checkpoints_policy_set_id\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_checkpoints_type\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_checkpoints_status\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_checkpoints_device_id\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_checkpoints_geofence_id\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_checkpoints_policy_type\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP INDEX \`UQ_attendance_checkpoints_policy_name\` ON \`attendance_checkpoints\``);
        await queryRunner.query(`DROP TABLE \`attendance_checkpoints\``);
        await queryRunner.query(`DELETE FROM \`hrms_db\`.\`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`, ["GENERATED_COLUMN","active_company_key","hrms_db","attendance_policies"]);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_policy_company\` ON \`attendance_policies\``);
        await queryRunner.query(`DROP INDEX \`IDX_attendance_policy_company_active\` ON \`attendance_policies\``);
        await queryRunner.query(`DROP INDEX \`UQ_attendance_policy_company_name\` ON \`attendance_policies\``);
        await queryRunner.query(`DROP INDEX \`UQ_attendance_policy_active_scope\` ON \`attendance_policies\``);
        await queryRunner.query(`DROP TABLE \`attendance_policies\``);
        await queryRunner.query(`DROP INDEX \`IDX_document_company\` ON \`documents\``);
        await queryRunner.query(`DROP INDEX \`IDX_document_entity\` ON \`documents\``);
        await queryRunner.query(`DROP INDEX \`IDX_document_module\` ON \`documents\``);
        await queryRunner.query(`DROP TABLE \`documents\``);
        await queryRunner.query(`DROP INDEX \`UQ_holiday_company_name_date\` ON \`holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_holiday_company\` ON \`holidays\``);
        await queryRunner.query(`DROP INDEX \`IDX_holiday_date\` ON \`holidays\``);
        await queryRunner.query(`DROP TABLE \`holidays\``);
        await queryRunner.query(`DROP INDEX \`UQ_leave_type_company_code\` ON \`leave_types\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_type_company\` ON \`leave_types\``);
        await queryRunner.query(`DROP TABLE \`leave_types\``);
        await queryRunner.query(`DROP INDEX \`UQ_leave_policy_type_policy_leave_type\` ON \`leave_policy_types\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_policy_type_policy\` ON \`leave_policy_types\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_policy_type_leave_type\` ON \`leave_policy_types\``);
        await queryRunner.query(`DROP TABLE \`leave_policy_types\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_policy_company\` ON \`leave_policies\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_policy_department\` ON \`leave_policies\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_policy_position\` ON \`leave_policies\``);
        await queryRunner.query(`DROP TABLE \`leave_policies\``);
        await queryRunner.query(`DROP INDEX \`UQ_leave_balance_employee_type_year\` ON \`leave_balances\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_balance_employee\` ON \`leave_balances\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_balance_leave_type\` ON \`leave_balances\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_balance_fiscal_year\` ON \`leave_balances\``);
        await queryRunner.query(`DROP TABLE \`leave_balances\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_company\` ON \`leave_approval_workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_leave_type\` ON \`leave_approval_workflows\``);
        await queryRunner.query(`DROP TABLE \`leave_approval_workflows\``);
        await queryRunner.query(`DROP INDEX \`UQ_leave_workflow_step_workflow_level\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_step_workflow\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_step_role\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_step_position\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_step_company_user\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_step_branch\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_workflow_step_department\` ON \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP TABLE \`leave_approval_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_approval_leave_request\` ON \`leave_request_approvals\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_approval_status\` ON \`leave_request_approvals\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_approval_actor\` ON \`leave_request_approvals\``);
        await queryRunner.query(`DROP TABLE \`leave_request_approvals\``);
        await queryRunner.query(`DROP INDEX \`UQ_leave_request_company_no\` ON \`leave_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_company\` ON \`leave_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_employee\` ON \`leave_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_type\` ON \`leave_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_status\` ON \`leave_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_request_period\` ON \`leave_requests\``);
        await queryRunner.query(`DROP TABLE \`leave_requests\``);
        await queryRunner.query(`DROP INDEX \`REL_d1bd68913860ced896392c02eb\` ON \`leave_medical_details\``);
        await queryRunner.query(`DROP INDEX \`UQ_leave_medical_detail_leave_request\` ON \`leave_medical_details\``);
        await queryRunner.query(`DROP TABLE \`leave_medical_details\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_document_leave_request\` ON \`leave_documents\``);
        await queryRunner.query(`DROP TABLE \`leave_documents\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_audit_company\` ON \`leave_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_audit_leave_request\` ON \`leave_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_audit_entity\` ON \`leave_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_leave_audit_action\` ON \`leave_audit_logs\``);
        await queryRunner.query(`DROP TABLE \`leave_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_company\` ON \`offboarding_workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_status\` ON \`offboarding_workflows\``);
        await queryRunner.query(`DROP TABLE \`offboarding_workflows\``);
        await queryRunner.query(`DROP INDEX \`UQ_offboarding_code\` ON \`offboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_request_company\` ON \`offboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_request_employee\` ON \`offboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_request_workflow\` ON \`offboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_request_status\` ON \`offboarding_requests\``);
        await queryRunner.query(`DROP TABLE \`offboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_clearance_request\` ON \`offboarding_clearances\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_clearance_status\` ON \`offboarding_clearances\``);
        await queryRunner.query(`DROP TABLE \`offboarding_clearances\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_audit_request\` ON \`offboarding_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_audit_action\` ON \`offboarding_audit_logs\``);
        await queryRunner.query(`DROP TABLE \`offboarding_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_approval_request\` ON \`offboarding_approvals\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_approval_status\` ON \`offboarding_approvals\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_approval_actor\` ON \`offboarding_approvals\``);
        await queryRunner.query(`DROP TABLE \`offboarding_approvals\``);
        await queryRunner.query(`DROP INDEX \`UQ_offboarding_workflow_step_workflow_level\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_step_workflow\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_step_role\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_step_position\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_step_company_user\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_step_branch\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_workflow_step_department\` ON \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP TABLE \`offboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_task_company\` ON \`offboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_task_request\` ON \`offboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_task_status\` ON \`offboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_offboarding_task_assignee\` ON \`offboarding_tasks\``);
        await queryRunner.query(`DROP TABLE \`offboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_company\` ON \`onboarding_workflows\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_status\` ON \`onboarding_workflows\``);
        await queryRunner.query(`DROP TABLE \`onboarding_workflows\``);
        await queryRunner.query(`DROP INDEX \`UQ_onboarding_request_company_no\` ON \`onboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_request_company\` ON \`onboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_request_employee\` ON \`onboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_request_workflow\` ON \`onboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_request_status\` ON \`onboarding_requests\``);
        await queryRunner.query(`DROP TABLE \`onboarding_requests\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_audit_company\` ON \`onboarding_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_audit_request\` ON \`onboarding_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_audit_entity\` ON \`onboarding_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_audit_action\` ON \`onboarding_audit_logs\``);
        await queryRunner.query(`DROP TABLE \`onboarding_audit_logs\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_approval_request\` ON \`onboarding_approvals\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_approval_status\` ON \`onboarding_approvals\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_approval_actor\` ON \`onboarding_approvals\``);
        await queryRunner.query(`DROP TABLE \`onboarding_approvals\``);
        await queryRunner.query(`DROP INDEX \`UQ_onboarding_workflow_step_workflow_level\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_step_workflow\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_step_role\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_step_position\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_step_company_user\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_step_branch\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_workflow_step_department\` ON \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP TABLE \`onboarding_workflow_steps\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_task_request\` ON \`onboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_task_status\` ON \`onboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_task_department\` ON \`onboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_onboarding_task_assignee\` ON \`onboarding_tasks\``);
        await queryRunner.query(`DROP TABLE \`onboarding_tasks\``);
        await queryRunner.query(`DROP INDEX \`IDX_97672ac88f789774dd47f7c8be\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_a000cca60bcf04454e72769949\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_e5f6813966537a78538a896d74\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DELETE FROM \`hrms_db\`.\`typeorm_metadata\` WHERE \`type\` = ? AND \`name\` = ? AND \`schema\` = ? AND \`table\` = ?`, ["GENERATED_COLUMN","company_scope_key","hrms_db","roles"]);
        await queryRunner.query(`DROP INDEX \`IDX_role_company\` ON \`roles\``);
        await queryRunner.query(`DROP INDEX \`UQ_role_scope_name\` ON \`roles\``);
        await queryRunner.query(`DROP TABLE \`roles\``);
        await queryRunner.query(`DROP INDEX \`IDX_b28b07d25e4324eee577de5496\` ON \`companies\``);
        await queryRunner.query(`DROP TABLE \`companies\``);
        await queryRunner.query(`DROP INDEX \`UQ_company_users_company_user\` ON \`company_users\``);
        await queryRunner.query(`DROP TABLE \`company_users\``);
        await queryRunner.query(`DROP INDEX \`UQ_company_user_branch_access_membership_branch\` ON \`company_user_branch_accesses\``);
        await queryRunner.query(`DROP TABLE \`company_user_branch_accesses\``);
        await queryRunner.query(`DROP INDEX \`UQ_branch_code_company\` ON \`branches\``);
        await queryRunner.query(`DROP INDEX \`IDX_branch_company\` ON \`branches\``);
        await queryRunner.query(`DROP TABLE \`branches\``);
        await queryRunner.query(`DROP INDEX \`UQ_department_code_company\` ON \`departments\``);
        await queryRunner.query(`DROP INDEX \`IDX_department_company\` ON \`departments\``);
        await queryRunner.query(`DROP INDEX \`IDX_department_branch\` ON \`departments\``);
        await queryRunner.query(`DROP TABLE \`departments\``);
        await queryRunner.query(`DROP INDEX \`UQ_designation_code_company\` ON \`designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_designation_company\` ON \`designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_designation_department\` ON \`designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_designation_status\` ON \`designations\``);
        await queryRunner.query(`DROP TABLE \`designations\``);
        await queryRunner.query(`DROP INDEX \`REL_640b443f67415a68f5386f5e36\` ON \`employees\``);
        await queryRunner.query(`DROP INDEX \`UQ_employee_company_user\` ON \`employees\``);
        await queryRunner.query(`DROP TABLE \`employees\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_relative_employee\` ON \`employee_relatives\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_relative_emergency\` ON \`employee_relatives\``);
        await queryRunner.query(`DROP TABLE \`employee_relatives\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_professional_qualification_employee\` ON \`employee_professional_qualifications\``);
        await queryRunner.query(`DROP TABLE \`employee_professional_qualifications\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_academic_qualification_employee\` ON \`employee_academic_qualifications\``);
        await queryRunner.query(`DROP TABLE \`employee_academic_qualifications\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_identification_employee\` ON \`employee_identifications\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_identification_type\` ON \`employee_identifications\``);
        await queryRunner.query(`DROP INDEX \`UQ_employee_identification_employee_type_number\` ON \`employee_identifications\``);
        await queryRunner.query(`DROP TABLE \`employee_identifications\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_experience_employee\` ON \`employee_experiences\``);
        await queryRunner.query(`DROP TABLE \`employee_experiences\``);
        await queryRunner.query(`DROP TABLE \`employee_documents\``);
        await queryRunner.query(`DROP INDEX \`UQ_employee_department\` ON \`employee_departments\``);
        await queryRunner.query(`DROP TABLE \`employee_departments\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_designation_company\` ON \`employee_designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_designation_employee\` ON \`employee_designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_designation_designation\` ON \`employee_designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_designation_is_current\` ON \`employee_designations\``);
        await queryRunner.query(`DROP TABLE \`employee_designations\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_contact_employee\` ON \`employee_contacts\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_contact_type\` ON \`employee_contacts\``);
        await queryRunner.query(`DROP TABLE \`employee_contacts\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_bank_account_employee\` ON \`employee_bank_accounts\``);
        await queryRunner.query(`DROP TABLE \`employee_bank_accounts\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_address_employee\` ON \`employee_addresses\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_address_type\` ON \`employee_addresses\``);
        await queryRunner.query(`DROP TABLE \`employee_addresses\``);
        await queryRunner.query(`DROP INDEX \`UQ_position_code_company\` ON \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_position_company\` ON \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_position_branch\` ON \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_position_department\` ON \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_position_designation\` ON \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_position_reports_to\` ON \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_position_status\` ON \`positions\``);
        await queryRunner.query(`DROP TABLE \`positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_position_company\` ON \`employee_positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_position_employee\` ON \`employee_positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_position_position\` ON \`employee_positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_position_designation\` ON \`employee_positions\``);
        await queryRunner.query(`DROP INDEX \`IDX_employee_position_is_primary\` ON \`employee_positions\``);
        await queryRunner.query(`DROP TABLE \`employee_positions\``);
        await queryRunner.query(`DROP INDEX \`UQ_company_user_permissions_membership_permission\` ON \`company_user_permissions\``);
        await queryRunner.query(`DROP TABLE \`company_user_permissions\``);
        await queryRunner.query(`DROP INDEX \`UQ_permission_name\` ON \`permissions\``);
        await queryRunner.query(`DROP TABLE \`permissions\``);
        await queryRunner.query(`DROP INDEX \`UQ_company_user_roles_membership_role\` ON \`company_user_roles\``);
        await queryRunner.query(`DROP TABLE \`company_user_roles\``);
    }

}
