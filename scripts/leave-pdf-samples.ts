/**
 * Renders sample Leave Application PDFs (real renderer + attachment merger)
 * for visual review. No database access.
 *
 *   npx ts-node --transpile-only scripts/leave-pdf-samples.ts <outDir>
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';
import { PDFDocument as PdfLib } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  LeavePdfApprovalItem,
  LeavePdfPayload,
  LeavePdfService,
} from '../src/modules/hr/leave/services/leave-pdf.service';
import {
  assignPageRanges,
  mergeLeavePdf,
  prepareSupportingDocuments,
  SupportingSource,
} from '../src/modules/hr/leave/services/leave-pdf-attachments';
import { inflateSync } from 'zlib';

function extractPdfText(pdf: Buffer): { pages: number; text: string } {
  const raw = pdf.toString('latin1');
  const pages = (raw.match(/\/Type \/Page\b/g) ?? []).length;
  const parts: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\nendstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw))) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    const tj = /\[([^\]]*)\]\s*TJ/g;
    let t: RegExpExecArray | null;
    while ((t = tj.exec(content))) {
      const hex = t[1].match(/<([0-9a-fA-F]*)>/g) ?? [];
      parts.push(
        hex
          .map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1'))
          .join(''),
      );
    }
  }
  return { pages, text: parts.join('\n') };
}


const out = process.argv[2] ?? 'output/leave-pdf-samples';
mkdirSync(out, { recursive: true });
const service = new LeavePdfService();

const stage = (
  level: number,
  label: string,
  name: string,
  designation: string,
  at: string,
  comments: string,
  action = 'review',
): LeavePdfApprovalItem => ({
  level,
  step_label: label,
  action,
  status: 'approved',
  approver_name: name,
  approver_designation: designation,
  comments,
  acted_at: new Date(at),
  signature_url: null,
});

const base: LeavePdfPayload = {
  verification_url: 'https://hrms.example.test/verify/leave/7f3c2a9b5e1d4c6a8b0e2f4a6c8e0b2d',
  company_name: 'Alliance Insurance Corporation Limited',
  timezone: 'Africa/Dar_es_Salaam',
  generated_at: new Date('2026-11-19T05:25:00Z'),
  leave_no: 'LV-2026-000006',
  employee_no: 'AICL/00008',
  employee_name: 'Filbert Msaki',
  department_name: 'Information Technology',
  position_name: 'Executive',
  branch_name: 'Head Office',
  reporting_manager_name: 'Jasson Kalemera',
  employment_type: 'FULL_TIME',
  hire_date: '2026-11-04',
  leave_type_name: 'Annual Leave',
  is_paid: true,
  start_date: '2026-11-18',
  end_date: '2026-11-23',
  total_days: '5',
  duration_type: 'FULL_DAY',
  resumption_date: '2026-11-24',
  reason:
    'SECRET-REASON I am requesting annual leave to attend to an urgent family matter.',
  status: 'approved',
  applied_at: new Date('2026-11-18T09:57:00Z'),
  approved_at: new Date('2026-11-18T10:03:00Z'),
  evidence_required: false,
  current_balance: {
    fiscal_year: '2026',
    leave_year_start_date: '2026-01-01',
    leave_year_end_date: '2026-12-31',
    entitlement_days: '28',
    opening_balance_days: '0',
    used_days: '5',
    pending_days: '0',
    other_adjustments_days: '-11',
    available_days: '12',
    mode: 'reserved',
    before_days: '17',
    after_days: '12',
  },
  approval_history: [
    stage(1, 'Level 1', 'Jasson Kalemera', 'IT Manager', '2026-11-18T10:00:00Z', 'SECRET-COMMENT Your annual leave request has been approved.'),
    stage(2, 'Level 2', 'Emmy Malekela', 'HR Manager', '2026-11-18T10:03:00Z', 'SECRET-COMMENT Approved from dashboard'),
  ],
  attachments: [],
  acting_employee: null,
};

const acting = {
  name: 'Neema Joseph Mwakalinga',
  employee_no: 'AICL/00012',
  department_name: 'Information Technology',
  position_name: 'Systems Administrator',
  start_date: '2026-11-18',
  end_date: '2026-11-23',
  status: 'ACTIVE',
  responsibilities:
    'Handle IT support tickets for Head Office and approve routine user-access requests.',
  appointed_by_name: 'Jasson Kalemera, IT Manager',
};

async function certificatePdf(pages: number): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => doc.on('end', () => r(Buffer.concat(chunks))));
  for (let i = 1; i <= pages; i++) {
    if (i > 1) doc.addPage();
    doc.fontSize(20).text(`MEDICAL CERTIFICATE (sample) — page ${i} of ${pages}`, 72, 100);
    doc.fontSize(11).text('Patient: Filbert Msaki. Diagnosis: (clinical content kept). Rest recommended 30 Nov – 02 Dec 2026.', 72, 150, { width: 450 });
    doc.rect(72, 220, 450, 300).stroke();
    doc.text('Hospital stamp / doctor signature', 80, 500);
  }
  doc.end();
  return done;
}

async function build(
  name: string,
  payload: LeavePdfPayload,
  sources: SupportingSource[] = [],
) {
  const prepared = sources.length
    ? await prepareSupportingDocuments(sources, payload.leave_no)
    : [];
  const appended = prepared
    .filter((p) => p.disposition === 'appended')
    .reduce((s, p) => s + p.page_count, 0);
  const rows = (ranges: Map<number, { from: number; to: number }>) =>
    sources.map((s) => ({
      file_name: s.file_name,
      uploaded_at: new Date('2026-11-18T11:34:00Z'),
      disposition: prepared.find((p) => p.id === s.id)?.disposition ?? null,
      page_from: ranges.get(s.id)?.from ?? null,
      page_to: ranges.get(s.id)?.to ?? null,
    }));
  const p = { ...payload, appended_page_count: appended, attachments: rows(new Map()) };
  let form = await service.generateLeaveFormPdf(p);
  if (appended) {
    const pages = (await PdfLib.load(form)).getPageCount();
    p.attachments = rows(assignPageRanges(prepared, pages));
    form = await service.generateLeaveFormPdf(p);
  }
  const pdf = appended
    ? await mergeLeavePdf(form, prepared, p.leave_no, `Leave Application ${p.leave_no} (complete)`)
    : form;
  const file = join(out, `${name}.pdf`);
  writeFileSync(file, pdf);
  const count = (await PdfLib.load(pdf)).getPageCount();
  const text = extractPdfText(form).text;
  console.log(
    `${name}: ${count} page(s)${text.includes('SECRET') ? ' !! SECRET TEXT LEAKED' : ''}`,
  );
}

async function main() {
  const cert = await certificatePdf(1);
  const twoPage = await certificatePdf(2);
  const png = await QRCode.toBuffer('sample supporting image', { width: 900 });

  await build('01-annual-with-acting', { ...base, acting_employee: acting });
  await build('02-annual-without-acting', base);
  const sick: LeavePdfPayload = {
    ...base,
    leave_no: 'LV-2026-000007',
    leave_type_name: 'Sick Leave',
    start_date: '2026-11-30',
    end_date: '2026-12-02',
    total_days: '3',
    resumption_date: '2026-12-03',
    evidence_required: true,
    evidence_received_at: new Date('2026-11-18T11:34:00Z'),
    medical: {
      sickness_nature: null,
      doctor_name: null,
      doctor_phone: null,
      hospital_name: null,
      treatment_start_date: null,
      treatment_end_date: null,
      certificate_status: 'Supporting document(s) on file - see section B',
    },
    current_balance: {
      ...base.current_balance!,
      entitlement_days: '126',
      used_days: '3',
      other_adjustments_days: '0',
      before_days: '126',
      after_days: '123',
      available_days: '123',
    },
  };
  await build('03-sick-with-certificate', sick, [
    { id: 1, file_name: 'Medical_Certificate.pdf', mime_type: 'application/pdf', buffer: cert },
  ]);
  await build('04-sick-without-documents', { ...sick, evidence_received_at: null, medical: { ...sick.medical!, certificate_status: 'Not attached' } });
  await build('05-multiple-documents', { ...sick, acting_employee: { ...acting, status: 'PENDING', start_date: '2026-11-30', end_date: '2026-12-02' } }, [
    { id: 1, file_name: 'Medical_Certificate.pdf', mime_type: 'application/pdf', buffer: twoPage },
    { id: 2, file_name: 'Prescription_photo.png', mime_type: 'image/png', buffer: png },
    { id: 3, file_name: 'Lab_results.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK fake docx') },
    { id: 4, file_name: 'Medical_Certificate_copy.pdf', mime_type: 'application/pdf', buffer: twoPage },
    { id: 5, file_name: 'Leave_Application_LV-2026-000007.pdf', mime_type: 'application/pdf', buffer: cert },
  ]);
  const longHistory = [
    stage(1, 'Line Manager', 'Jasson Kalemera', 'IT Manager', '2026-11-18T10:00:00Z', 'x', 'recommend'),
    stage(2, 'Head of Department', 'Grace Wilfred Mushi', 'Head of IT', '2026-11-18T10:10:00Z', 'x', 'recommend'),
    stage(3, 'Finance Review', 'Peter Mollel', 'Finance Officer', '2026-11-18T10:20:00Z', 'x', 'verify'),
    stage(4, 'HR Officer', 'Asha Mohamed', 'HR Officer', '2026-11-18T10:30:00Z', 'x', 'verify'),
    stage(5, 'HR Manager', 'Emmy Malekela', 'HR Manager', '2026-11-18T10:40:00Z', 'x', 'approve'),
    stage(6, 'Managing Director', 'Dr. Abdallah Hassan Kiwelu', 'Managing Director', '2026-11-18T10:50:00Z', 'x', 'approve'),
  ];
  await build('06-long-approval-history', { ...base, approval_history: longHistory, acting_employee: acting });
  await build('07-long-names', {
    ...base,
    employee_name: 'Bartholomew Maximilian Kristoffersen-Mwakalukwamba Junior',
    department_name: 'Enterprise Risk Management, Internal Audit, Compliance and Regulatory Affairs Directorate',
    position_name: 'Senior Principal Officer — Regulatory Reporting and Supervisory Liaison',
    branch_name: 'Dar es Salaam City Centre Corporate Business Branch (Samora Avenue)',
    reporting_manager_name: 'Christopher Emmanuel Rwegasira-Mutabingwa',
    acting_employee: { ...acting, name: 'Anastasia Philomena Ngowi-Kamugisha Mwakyembe', department_name: 'Enterprise Risk Management, Internal Audit, Compliance and Regulatory Affairs Directorate' },
  });
  await build('08-long-responsibilities', {
    ...base,
    acting_employee: {
      ...acting,
      responsibilities: Array.from({ length: 12 }, (_, i) =>
        `${i + 1}. Cover duty ${i + 1}: monitor the overnight batch jobs, respond to service-desk escalations within agreed SLAs, coordinate with vendors on open incidents and brief the IT Manager daily.`,
      ).join('\n'),
    },
  });
  await build('09-pending-no-signature', {
    ...base,
    status: 'pending_hr',
    approved_at: null,
    approval_history: [
      base.approval_history[0],
      { ...base.approval_history[1], status: 'pending', acted_at: null, approver_name: null },
    ],
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
