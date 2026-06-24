/**
 * Runtime Pug template render test.
 * Runs each template with realistic sample context and reports errors.
 * Usage: node scripts/test-pug-templates.js
 */

const pug = require('pug');
const path = require('path');
const fs = require('fs');

const TEMPLATES_DIR = path.join(__dirname, '..', 'src', 'modules', 'mail', 'templates');

const BASE_CTX = {
  appName: 'HRMS',
  supportEmail: 'support@alliance.co.tz',
  year: 2026,
};

const TEMPLATES = [
  // ── Auth ──────────────────────────────────────────────────────────────────
  {
    file: 'forgot-password.pug',
    ctx: { ...BASE_CTX, name: 'John Doe', resetLink: 'https://app.example.com/reset?token=abc123' },
  },
  {
    file: 'password-changed.pug',
    ctx: { ...BASE_CTX, name: 'John Doe', changedAt: '2026-06-24 10:30:00' },
  },
  {
    file: 'verification-email.pug',
    ctx: { ...BASE_CTX, name: 'Jane Smith', verificationLink: 'https://app.example.com/verify?token=xyz789' },
  },
  {
    file: 'welcome-after-verification.pug',
    ctx: { ...BASE_CTX, name: 'Jane Smith', loginUrl: 'https://app.example.com/login' },
  },

  // ── Leave ─────────────────────────────────────────────────────────────────
  {
    file: 'hr-leave-submitted.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'Alice Manager',
      employeeName: 'Bob Employee',
      employeeEmail: 'bob@example.com',
      leaveTypeName: 'Annual Leave',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      totalDays: 5,
      reason: 'Family vacation',
      approvers: [{ name: 'Alice Manager', email: 'alice@example.com' }],
      reviewUrl: 'https://app.example.com/leave/42/review',
      companyId: 1,
    },
  },
  {
    file: 'hr-leave-approval-required.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'Alice Manager',
      employeeName: 'Bob Employee',
      leaveTypeName: 'Sick Leave',
      startDate: '2026-07-01',
      endDate: '2026-07-02',
      totalDays: 2,
      approvers: [{ name: 'Alice Manager', email: 'alice@example.com' }],
      reviewUrl: 'https://app.example.com/leave/43/review',
    },
  },
  {
    file: 'hr-leave-approved.pug',
    ctx: {
      ...BASE_CTX,
      employeeName: 'Bob Employee',
      employeeEmail: 'bob@example.com',
      leaveTypeName: 'Annual Leave',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      totalDays: 5,
      dashboardUrl: 'https://app.example.com/dashboard',
    },
  },
  {
    file: 'hr-leave-rejected.pug',
    ctx: {
      ...BASE_CTX,
      employeeName: 'Bob Employee',
      employeeEmail: 'bob@example.com',
      leaveTypeName: 'Annual Leave',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      rejectionComments: 'Insufficient balance',
      dashboardUrl: 'https://app.example.com/dashboard',
    },
  },
  {
    file: 'hr-leave-rejected.pug',
    note: '(no rejection comments)',
    ctx: {
      ...BASE_CTX,
      employeeName: 'Bob Employee',
      employeeEmail: 'bob@example.com',
      leaveTypeName: 'Annual Leave',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      rejectionComments: null,
      dashboardUrl: 'https://app.example.com/dashboard',
    },
  },
  {
    file: 'hr-leave-cancelled.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'Alice Manager',
      employeeName: 'Bob Employee',
      leaveTypeName: 'Annual Leave',
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      pendingApprovers: [{ name: 'Alice Manager', email: 'alice@example.com' }],
    },
  },

  // ── Onboarding ────────────────────────────────────────────────────────────
  {
    file: 'hr-onboarding-submitted-employee.pug',
    ctx: {
      ...BASE_CTX,
      employeeName: 'New Hire',
      employeeEmail: 'newhire@example.com',
      approvers: [{ name: 'HR Manager', email: 'hr@example.com' }],
      reviewUrl: 'https://app.example.com/onboarding/10/review',
      companyId: 1,
    },
  },
  {
    file: 'hr-onboarding-submitted-approver.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'HR Manager',
      employeeName: 'New Hire',
      employeeEmail: 'newhire@example.com',
      approvers: [{ name: 'HR Manager', email: 'hr@example.com' }],
      reviewUrl: 'https://app.example.com/onboarding/10/review',
      companyId: 1,
    },
  },
  {
    file: 'hr-onboarding-approval-required.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'HR Manager',
      employeeName: 'New Hire',
      approvers: [{ name: 'HR Manager', email: 'hr@example.com' }],
      reviewUrl: 'https://app.example.com/onboarding/10/review',
    },
  },
  {
    file: 'hr-onboarding-approved.pug',
    ctx: {
      ...BASE_CTX,
      recipientName: 'New Hire',
      employeeName: 'New Hire',
      employeeEmail: 'newhire@example.com',
      hrRecipients: [],
      dashboardUrl: 'https://app.example.com/onboarding/10',
    },
  },
  {
    file: 'hr-onboarding-rejected.pug',
    ctx: {
      ...BASE_CTX,
      employeeName: 'New Hire',
      employeeEmail: 'newhire@example.com',
      rejectionComments: 'Missing documents',
      dashboardUrl: 'https://app.example.com/onboarding/10',
    },
  },
  {
    file: 'hr-onboarding-task-assigned.pug',
    ctx: {
      ...BASE_CTX,
      assigneeName: 'IT Admin',
      assigneeEmail: 'it@example.com',
      employeeName: 'New Hire',
      taskTitle: 'Set up workstation',
      taskDescription: 'Install required software and configure accounts',
      dueDate: new Date('2026-07-05'),
      taskUrl: 'https://app.example.com/onboarding/10/tasks',
    },
  },
  {
    file: 'hr-onboarding-task-assigned.pug',
    note: '(no description, no due date)',
    ctx: {
      ...BASE_CTX,
      assigneeName: 'IT Admin',
      assigneeEmail: 'it@example.com',
      employeeName: 'New Hire',
      taskTitle: 'Set up workstation',
      taskDescription: null,
      dueDate: null,
      taskUrl: 'https://app.example.com/onboarding/10/tasks',
    },
  },
  {
    file: 'hr-onboarding-completed.pug',
    ctx: {
      ...BASE_CTX,
      recipientName: 'New Hire',
      employeeName: 'New Hire',
      employeeEmail: 'newhire@example.com',
      managerEmail: 'manager@example.com',
      managerName: 'Alice Manager',
      dashboardUrl: 'https://app.example.com/onboarding/10',
    },
  },

  // ── Offboarding ───────────────────────────────────────────────────────────
  {
    file: 'hr-offboarding-submitted-employee.pug',
    ctx: {
      ...BASE_CTX,
      employeeName: 'Leaving Employee',
      employeeEmail: 'leaving@example.com',
      exitDate: '2026-07-31',
      approvers: [{ name: 'HR Manager', email: 'hr@example.com' }],
      reviewUrl: 'https://app.example.com/offboarding/20/review',
      companyId: 1,
    },
  },
  {
    file: 'hr-offboarding-submitted-employee.pug',
    note: '(no exit date)',
    ctx: {
      ...BASE_CTX,
      employeeName: 'Leaving Employee',
      employeeEmail: 'leaving@example.com',
      exitDate: null,
      approvers: [],
      reviewUrl: 'https://app.example.com/offboarding/20/review',
      companyId: 1,
    },
  },
  {
    file: 'hr-offboarding-submitted-approver.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'HR Manager',
      employeeName: 'Leaving Employee',
      employeeEmail: 'leaving@example.com',
      exitDate: '2026-07-31',
      approvers: [{ name: 'HR Manager', email: 'hr@example.com' }],
      reviewUrl: 'https://app.example.com/offboarding/20/review',
      companyId: 1,
    },
  },
  {
    file: 'hr-offboarding-approval-required.pug',
    ctx: {
      ...BASE_CTX,
      approverName: 'HR Manager',
      employeeName: 'Leaving Employee',
      exitDate: '2026-07-31',
      approvers: [{ name: 'HR Manager', email: 'hr@example.com' }],
      reviewUrl: 'https://app.example.com/offboarding/20/review',
    },
  },
  {
    file: 'hr-offboarding-approved.pug',
    ctx: {
      ...BASE_CTX,
      recipientName: 'Leaving Employee',
      employeeName: 'Leaving Employee',
      employeeEmail: 'leaving@example.com',
      exitDate: '2026-07-31',
      hrRecipients: [],
      dashboardUrl: 'https://app.example.com/offboarding/20',
    },
  },
  {
    file: 'hr-offboarding-task-assigned.pug',
    ctx: {
      ...BASE_CTX,
      assigneeName: 'IT Admin',
      assigneeEmail: 'it@example.com',
      employeeName: 'Leaving Employee',
      taskTitle: 'Revoke system access',
      taskDescription: 'Disable all accounts and retrieve equipment',
      exitDate: '2026-07-31',
      dueDate: new Date('2026-07-30'),
      taskUrl: 'https://app.example.com/offboarding/20/tasks',
    },
  },
  {
    file: 'hr-offboarding-clearance-required.pug',
    ctx: {
      ...BASE_CTX,
      ownerName: 'Finance Manager',
      ownerEmail: 'finance@example.com',
      employeeName: 'Leaving Employee',
      clearanceType: 'Finance',
      exitDate: '2026-07-31',
      clearanceUrl: 'https://app.example.com/offboarding/20/clearances',
    },
  },
  {
    file: 'hr-offboarding-completed.pug',
    ctx: {
      ...BASE_CTX,
      recipientName: 'Leaving Employee',
      employeeName: 'Leaving Employee',
      employeeEmail: 'leaving@example.com',
      exitDate: '2026-07-31',
      managerEmail: 'manager@example.com',
      managerName: 'Alice Manager',
      hrRecipients: [],
    },
  },
];

let passed = 0;
let failed = 0;
const errors = [];

console.log(`\nRendering ${TEMPLATES.length} template/context combinations...\n`);

for (const spec of TEMPLATES) {
  const filePath = path.join(TEMPLATES_DIR, spec.file);
  const label = spec.note ? `${spec.file} ${spec.note}` : spec.file;

  if (!fs.existsSync(filePath)) {
    console.error(`  ✗ MISSING  ${label}`);
    errors.push({ label, error: 'File does not exist' });
    failed++;
    continue;
  }

  try {
    const html = pug.renderFile(filePath, spec.ctx);
    if (!html || html.trim().length < 50) {
      throw new Error('Rendered output is suspiciously short');
    }
    console.log(`  ✓ OK       ${label}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ FAILED   ${label}`);
    console.error(`             ${err.message}`);
    errors.push({ label, error: err.message });
    failed++;
  }
}

console.log(`\n${'─'.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (errors.length) {
  console.log('\nFailed templates:');
  for (const e of errors) {
    console.log(`  • ${e.label}`);
    console.log(`    ${e.error}`);
  }
  process.exit(1);
} else {
  console.log('\nAll templates render successfully.\n');
}
