require('ts-node').register({ transpileOnly: true });
global.describe = () => {};
const fs = require('fs');
const { LeavePdfService } = require('./src/modules/hr/leave/services/leave-pdf.service');
const { basePayload, extractPdfText } = require('./src/modules/hr/leave/services/leave-pdf.service.spec');
const out = process.argv[2];
const s = new LeavePdfService();
const cases = {
  pending_annual: basePayload(),
  approved_annual: basePayload({ status: 'approved', approved_at: new Date('2026-11-12T10:00:00Z'), approval_history: basePayload().approval_history.map((a,i)=>({...a,status:'approved',approver_name:a.approver_name??'Neema Mushi',approver_designation:a.approver_designation??'HR Officer',acted_at:new Date('2026-11-12T10:00:00Z'),comments:i?'Verified against leave register.':a.comments})) }),
  rejected_negative: basePayload({ status: 'rejected', rejection_reason: 'Insufficient cover during year-end close.', current_balance: { ...basePayload().current_balance, mode: 'released', available_days: '-3.00', before_days: null, after_days: null } }),
  sick_medical: basePayload({ leave_type_name: 'Sick Leave', start_date: '2026-11-03', end_date: '2026-11-06', total_days: '4.00', reason: 'Admitted with malaria.', medical: { sickness_nature: 'Malaria', doctor_name: 'Dr. Neema Kweka', doctor_phone: '+255 700 000 111', hospital_name: 'Aga Khan Hospital, Dar es Salaam', treatment_start_date: '2026-11-03', treatment_end_date: '2026-11-06', certificate_status: 'Attached' }, attachments: [{ file_name: 'medical-certificate.pdf', uploaded_at: new Date('2026-11-07T06:00:00Z') }] }),
  long_multilevel: basePayload({ reason: 'Extended family matters requiring travel upcountry. '.repeat(30), status: 'in_review', approval_history: Array.from({length:5},(_, i)=>({level:i+1,step_label:['Head of Department','HR Department','Finance','Deputy MD','Managing Director'][i],action:i==1?'verify':'approve',status:i<3?'approved':'pending',approver_name:i<3?`Approver ${i+1}`:null,approver_designation:'Manager',delegated_for_name:i==2?'Peter Lema':null,comments:i<3?'Reviewed and approved in line with policy. '.repeat(3):null,acted_at:i<3?new Date('2026-11-11T08:00:00Z'):null,signature_url:null})) }),
  halfday_missing: basePayload({ status: 'draft', applied_at: null, department_name: null, position_name: null, hire_date: null, employment_type: null, duration_type: 'HALF_DAY', half_day_session: 'MORNING', total_days: '0.50', end_date: '2026-12-01', resumption_date: null, current_balance: { ...basePayload().current_balance, mode: 'projected', before_days: '11.00', after_days: '10.50' }, approval_history: [] }),
};
(async () => { for (const [k, p] of Object.entries(cases)) { const b = await s.generateLeaveFormPdf(p); fs.writeFileSync(`${out}/Leave_Application_${k}.pdf`, b); console.log(k, extractPdfText(b).pages); } })();
