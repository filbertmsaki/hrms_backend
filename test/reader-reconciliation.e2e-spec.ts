import './setup-e2e';
import { DataSource } from 'typeorm';
import { AppDataSource } from '../src/database/data-source';
import { PostgresAdvisoryLockService } from '../src/common/database/postgres-advisory-lock.service';
import { AuthenticatedUser } from '../src/common/interfaces/authenticated-user.interface';
import { DeviceAccessWriteLockService } from '../src/modules/hikvision/device-access-write-lock.service';
import { HikvisionAccessControlService } from '../src/modules/hikvision/hikvision-access-control.service';
import { HikvisionUserManagementService } from '../src/modules/hikvision/hikvision-user-management.service';
import { CompaniesService } from '../src/modules/companies/companies.service';
import { AccessControlSyncService } from '../src/modules/access-control/service/access-control-sync.service';
import { CardStatusReconciliationService } from '../src/modules/access-control/service/card-status-reconciliation.service';
import { DeviceReconciliationService } from '../src/modules/access-control/service/device-reconciliation.service';
import { ScheduleDeploymentsService } from '../src/modules/access-control/service/schedule-deployments.service';
import { AccessWeekPlansService } from '../src/modules/access-control/access-week-plans/service/access-week-plans.service';
import { AccessScheduleTemplatesService } from '../src/modules/access-control/access-schedule-templates/service/access-schedule-templates.service';

describe('reader reconciliation (PostgreSQL with simulated reader)', () => {
  let db: DataSource,
    company: number,
    device: number,
    user: number,
    member: number,
    employee: number;
  const number = 'TEST-27',
    cardNo = 'TEST-CARD-27';
  const permissions = [
    'access_control_sync:execute',
    'data_scope:company',
    'access_groups:update',
    'employee_device_assignments:update',
    'employee_access_credentials:update',
  ];
  const id = async (sql: string, p: unknown[]) =>
    Number((await db.query<Array<{ id: number }>>(sql, p))[0].id);
  beforeAll(async () => {
    if (!/(_e2e|_test_db)$/.test(process.env.DB_NAME ?? ''))
      throw new Error('Use a disposable test database');
    db = AppDataSource.isInitialized
      ? AppDataSource
      : await AppDataSource.initialize();
    const stamp = String(Date.now());
    company = await id(
      "INSERT INTO companies(name,slug) VALUES('Test reader',$1) RETURNING id",
      ['reader-' + stamp],
    );
    user = await id(
      "INSERT INTO users(user_no,first_name,last_name,phone,email,password) VALUES($1,'Test','Reader',$2,$3,'unused') RETURNING id",
      ['R' + stamp, '+25' + stamp, stamp + '@example.test'],
    );
    member = await id(
      'INSERT INTO company_users(company_id,user_id) VALUES($1,$2) RETURNING id',
      [company, user],
    );
    employee = await id(
      "INSERT INTO employees(company_id,employee_no,first_name,last_name,gender,employment_status,version) VALUES($1,$2,'Test','Reader','female','active',1) RETURNING id",
      [company, number],
    );
    device = await id(
      "INSERT INTO attendance_devices(company_id,device_name,device_code,ip_address,status,api_username,api_password) VALUES($1,'Simulated reader',$2,'127.0.0.1','ACTIVE','fixture','fixture') RETURNING id",
      [company, stamp],
    );
    await db.query(
      'INSERT INTO employee_device_assignments(company_id,employee_id,employee_no,device_id) VALUES($1,$2,$3,$4)',
      [company, employee, number, device],
    );
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(
        'DELETE FROM employee_access_credentials WHERE company_id=$1',
        [company],
      );
      await db.query(
        'DELETE FROM employee_device_assignments WHERE company_id=$1',
        [company],
      );
      await db.query(
        'DELETE FROM access_reconciliation_operations WHERE company_id=$1',
        [company],
      );
      await db.query(
        'DELETE FROM access_reconciliation_managed_rights WHERE company_id=$1',
        [company],
      );
      await db.query('DELETE FROM companies WHERE id=$1', [company]);
      await db.query('DELETE FROM users WHERE id=$1', [user]);
      await db.destroy();
    }
  });
  it('deploys only opted-in schedule revisions and pauses when the authorizing grant is withdrawn', async () => {
    const plan = await id(
      "INSERT INTO access_week_plans(company_id,device_id,hikvision_plan_no,name) VALUES($1,$2,'3','Weekdays') RETURNING id",
      [company, device],
    );
    const allowed = [...permissions, 'access_week_plans:update'];
    let grants = [...allowed];
    const members = {
      getMembershipContext: jest.fn(async () => ({
        membershipId: member,
        permissions: grants,
      })),
    };
    const weeks = {
      syncWeekPlanToDevice: jest
        .fn()
        .mockResolvedValue({ ok: true, message: 'Verified' }),
    };
    const svc = new ScheduleDeploymentsService(
      db,
      new PostgresAdvisoryLockService(db),
      members as unknown as CompaniesService,
      weeks as unknown as AccessWeekPlansService,
      {} as AccessScheduleTemplatesService,
    );
    const actor = {
      id: user,
      companyId: company,
      companyMembershipId: member,
      permissions: allowed,
    } as AuthenticatedUser;
    await svc.run();
    expect(weeks.syncWeekPlanToDevice).not.toHaveBeenCalled();
    await svc.configure(actor, 'week-plan', plan, true, 1);
    await svc.run();
    expect(await svc.state(actor, 'week-plan', plan)).toMatchObject({
      enabled: true,
      verified_revision: 1,
    });
    await db.query("UPDATE access_week_plans SET name='Weekend' WHERE id=$1", [
      plan,
    ]);
    grants = [];
    await svc.run();
    expect(await svc.state(actor, 'week-plan', plan)).toMatchObject({
      enabled: false,
      verified_revision: 1,
    });
    expect(weeks.syncWeekPlanToDevice).toHaveBeenCalledTimes(1);
  });
  it('grants and revokes owned rights, preserves another door, and verifies a bound card suspension and recovery', async () => {
    type Right = { door_no: number; plan_template_no: string };
    let rights: Right[] = [{ door_no: 2, plan_template_no: '4' }];
    let desired = [{ door_no: 1, template_no: '2' }];
    let card: { employeeNo: string; cardNo: string; cardType: string } | null =
      { employeeNo: number, cardNo, cardType: 'normalCard' };
    const devices = {
      getUserByEmployeeNumber: jest.fn(async () => ({
        exists: true,
        user: {
          employee_no: number,
          matched_employee_id: null,
          raw: {
            doorRight: rights.map((r) => r.door_no).join(','),
            RightPlan: rights.map((r) => ({
              doorNo: r.door_no,
              planTemplateNo: r.plan_template_no,
            })),
          },
        },
      })),
      updateUserOnDevice: jest.fn(
        async (_c: number, _d: number, input: { right_plan: Right[] }) => {
          rights = input.right_plan;
        },
      ),
    };
    const transport = {
      searchCardInfo: jest.fn(async () => ({
        ok: true,
        parsed: {
          CardInfoSearch: {
            totalMatches: card ? 1 : 0,
            CardInfo: card ? [card] : [],
          },
        },
      })),
      deleteCardInfo: jest.fn(async () => {
        card = null;
        return { ok: true };
      }),
      recordCardInfo: jest.fn(async () => {
        card = { employeeNo: number, cardNo, cardType: 'normalCard' };
        return { ok: true };
      }),
    };
    const access = {
      previewEffectiveAccess: jest.fn(async () => ({
        employee_no: number,
        employment_status: 'active',
        ready: true,
        desired_version: JSON.stringify(desired),
        recorded_rights: [],
        desired_rights: desired,
      })),
    };
    const actor = {
      id: user,
      companyId: company,
      companyMembershipId: member,
      permissions,
    } as AuthenticatedUser;
    const members = {
      getMembershipContext: jest.fn(async () => ({
        membershipId: member,
        permissions,
      })),
    };
    const service = new DeviceReconciliationService(
      db,
      new PostgresAdvisoryLockService(db),
      members as unknown as CompaniesService,
      access as unknown as AccessControlSyncService,
      devices as unknown as HikvisionUserManagementService,
      new DeviceAccessWriteLockService(db),
      new CardStatusReconciliationService(
        db,
        transport as unknown as HikvisionAccessControlService,
      ),
    );
    const operation = (reason: string) =>
      id(
        'INSERT INTO access_reconciliation_operations(company_id,employee_id,device_id,reason) VALUES($1,$2,$3,$4) RETURNING id',
        [company, employee, device, reason],
      );
    const status = async (job: number) =>
      (
        await db.query<Array<{ status: string }>>(
          'SELECT status FROM access_reconciliation_operations WHERE id=$1',
          [job],
        )
      )[0].status;
    const previous = await operation('DOOR_CHANGED');
    await service.run();
    expect(await status(previous)).toBe('PENDING_REVIEW');
    expect(devices.getUserByEmployeeNumber).not.toHaveBeenCalled();
    await service.configure(actor, device, true);
    const assigned = await operation('DOOR_CHANGED');
    await service.run();
    expect(await status(assigned)).toBe('VERIFIED');
    expect(rights.map((r) => r.door_no)).toEqual([1, 2]);
    desired = [];
    const removed = await operation('GROUP_REMOVED');
    await service.run();
    expect(rights).toEqual([{ door_no: 2, plan_template_no: '4' }]);
    expect(await status(removed)).toBe('NEEDS_REVIEW');
    const credential = await id(
      "INSERT INTO employee_access_credentials(company_id,employee_id,device_id,employee_no,credential_type,card_no) VALUES($1,$2,$3,$4,'CARD',$5) RETURNING id",
      [company, employee, device, number, cardNo],
    );
    await db.query(
      "UPDATE employee_access_credentials SET credential_status='LOST' WHERE id=$1",
      [credential],
    );
    await service.run();
    expect(transport.deleteCardInfo).toHaveBeenCalledTimes(1);
    expect(card).toBeNull();
    await db.query(
      "UPDATE employee_access_credentials SET credential_status='ACTIVE' WHERE id=$1",
      [credential],
    );
    await service.run();
    expect(transport.recordCardInfo).toHaveBeenCalledTimes(1);
    expect(card).toMatchObject({ employeeNo: number, cardNo });
    const audit = await db.query<Array<{ status: string }>>(
      'SELECT status FROM access_reconciliation_operations WHERE company_id=$1 AND credential_id=$2 ORDER BY id',
      [company, credential],
    );
    expect(audit.map((r) => r.status)).toEqual(['VERIFIED', 'VERIFIED']);
    await service.configure(actor, device, false);
    const paused = await operation('DOOR_CHANGED');
    await service.run();
    expect(await status(paused)).toBe('PENDING_REVIEW');
  });
});
