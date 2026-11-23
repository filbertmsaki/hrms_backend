import type { EntityManager } from 'typeorm';

// Snapshot of the original choices and logos offered in employee bank forms.
const initialBanks = [
  {
    name: 'Absa Bank Tanzania Limited',
    logo_url: 'https://absa.co.tz/favicon.ico',
  },
  {
    name: 'Access Bank Tanzania Limited',
    logo_url: 'https://accessbank.co.tz/favicon.ico',
  },
  {
    name: 'Akiba Commercial Bank Plc',
    logo_url: 'https://acbtz.co.tz/favicon.ico',
  },
  {
    name: 'Amana Bank Limited',
    logo_url: 'https://amanabank.co.tz/favicon.ico',
  },
  {
    name: 'Azania Bank Limited',
    logo_url: 'https://azaniabank.co.tz/favicon.ico',
  },
  {
    name: 'Bank of Africa Tanzania Limited',
    logo_url: 'https://boatanzania.co.tz/favicon.ico',
  },
  {
    name: 'Bank of Baroda Tanzania Limited',
    logo_url: 'https://bankofbaroda.co.tz/favicon.ico',
  },
  {
    name: 'Bank of India Tanzania Limited',
    logo_url: 'https://bankofindia.co.tz/favicon.ico',
  },
  {
    name: 'China Dasheng Bank Limited',
    logo_url: 'https://chinadashengbank.co.tz/favicon.ico',
  },
  {
    name: 'Citibank Tanzania Limited',
    logo_url: 'https://citi.com/favicon.ico',
  },
  {
    name: 'Cooperative Bank of Tanzania Limited',
    logo_url: 'https://coopbank.co.tz/favicon.ico',
  },
  { name: 'CRDB Bank Plc', logo_url: 'https://crdbbank.co.tz/favicon.ico' },
  {
    name: 'DCB Commercial Bank Plc',
    logo_url: 'https://dcb.co.tz/favicon.ico',
  },
  {
    name: 'Diamond Trust Bank Tanzania Plc',
    logo_url: 'https://diamondtrust.co.tz/favicon.ico',
  },
  {
    name: 'Ecobank Tanzania Limited',
    logo_url: 'https://ecobank.com/favicon.ico',
  },
  {
    name: 'Equity Bank Tanzania Limited',
    logo_url: 'https://equitybank.co.tz/favicon.ico',
  },
  {
    name: 'Exim Bank Tanzania Limited',
    logo_url: 'https://eximbank.co.tz/favicon.ico',
  },
  {
    name: 'Guaranty Trust Bank Tanzania Limited',
    logo_url: 'https://gtbank.co.tz/favicon.ico',
  },
  {
    name: 'Habib African Bank Limited',
    logo_url: 'https://habibafricanbank.co.tz/favicon.ico',
  },
  {
    name: 'I&M Bank Tanzania Limited',
    logo_url: 'https://imbank.co.tz/favicon.ico',
  },
  {
    name: 'International Commercial Bank Tanzania Limited',
    logo_url: 'https://icbank.co.tz/favicon.ico',
  },
  {
    name: 'KCB Bank Tanzania Limited',
    logo_url: 'https://kcbgroup.com/favicon.ico',
  },
  {
    name: 'Letshego Faidika Bank Tanzania Limited',
    logo_url: 'https://letshego.co.tz/favicon.ico',
  },
  {
    name: 'Mkombozi Commercial Bank Plc',
    logo_url: 'https://mkombozibank.co.tz/favicon.ico',
  },
  {
    name: 'Mwalimu Commercial Bank Plc',
    logo_url: 'https://mwalimubank.co.tz/favicon.ico',
  },
  {
    name: 'Mwanga Hakika Bank Limited',
    logo_url: 'https://mwangahakikabank.co.tz/favicon.ico',
  },
  {
    name: 'National Bank of Commerce Limited',
    logo_url: 'https://nbc.co.tz/favicon.ico',
  },
  { name: 'NMB Bank Plc', logo_url: 'https://nmbbank.co.tz/favicon.ico' },
  {
    name: 'NCBA Bank Tanzania Limited',
    logo_url: 'https://ncbagroup.co.tz/favicon.ico',
  },
  {
    name: "People's Bank of Zanzibar Limited",
    logo_url: 'https://pbzbank.co.tz/favicon.ico',
  },
  {
    name: 'Stanbic Bank Tanzania Limited',
    logo_url: 'https://stanbicbank.co.tz/favicon.ico',
  },
  {
    name: 'Standard Chartered Bank Tanzania Limited',
    logo_url: 'https://sc.com/favicon.ico',
  },
  {
    name: 'Tanzania Commercial Bank Plc',
    logo_url: 'https://tcbbank.co.tz/favicon.ico',
  },
  {
    name: 'United Bank for Africa Tanzania Limited',
    logo_url: 'https://ubagroup.com/favicon.ico',
  },
];

export async function initializeCompanyBankDirectory(
  manager: EntityManager,
  companyId: number | null = null,
): Promise<void> {
  // Claim each directory once, even if an administrator subsequently removes every bank.
  await manager.query(
    `WITH initializing AS (
    UPDATE companies SET metadata = jsonb_set(COALESCE(NULLIF(metadata::jsonb, 'null'::jsonb), '{}'::jsonb), '{bank_directory_initialized}', 'true'::jsonb)::json
    WHERE ($1::integer IS NULL OR id = $1) AND status <> 'deleted'
      AND metadata->>'bank_directory_initialized' IS DISTINCT FROM 'true'
    RETURNING id
  )
  INSERT INTO company_banks (company_id, name, logo_url)
  SELECT c.id, b.name, b.logo_url FROM initializing c
  CROSS JOIN jsonb_to_recordset($2::jsonb) AS b(name text, logo_url text)
  WHERE NOT EXISTS (SELECT 1 FROM company_banks existing
    WHERE existing.company_id = c.id AND lower(trim(existing.name)) = lower(b.name))
  ON CONFLICT (company_id, name) DO NOTHING`,
    [companyId, JSON.stringify(initialBanks)],
  );
}
