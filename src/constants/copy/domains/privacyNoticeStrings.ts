export const PRIVACY_NOTICE_STRINGS = {
  title: 'Privacy & data',
  onboardingSummary: 'Before you begin, review how your data is handled.',
  onboardingAction: 'Review privacy policy',
  acknowledgementPromptTitle: 'Before you continue',
  acknowledgementPromptBody:
    'Before you start, review the basics of how your information is handled.',
  acknowledgementPromptCalloutTitle: 'Local by default',
  acknowledgementPromptCalloutBody:
    'No bank connection. Your financial records stay on this device unless you choose to export or share them.',
  acknowledgementPromptDetails:
    'Exchange rates and optional analytics may use limited technical data. They do not receive transaction amounts, merchants, balances, notes, or SMS text.',
  acknowledgementPromptClose: 'Close privacy acknowledgement',
  acknowledgementPromptAction: 'Acknowledge & continue',
  subtitle: 'A plain-language summary of what Full Frills Balance stores and sends.',
  heroTitle: 'Your money stays yours.',
  heroCalloutTitle: 'Private by design',
  heroCalloutBody:
    'You enter the records. They stay on this device unless you choose to export or share a backup.',
  dataSectionTitle: 'What happens to your data',
  controlsSectionTitle: 'Keep control',
  supportSectionTitle: 'Need the full text?',
  manualTitle: 'You enter the data',
  manualBody:
    'Full Frills Balance does not connect to bank accounts. You add accounts, balances, income, spending, and notes yourself, or import a file you choose.',
  localTitle: 'Financial records stay local',
  localBody:
    'Your accounts, journals, entries, categories, and balances are stored on this device. No login or cloud account is required.',
  onlineTitle: 'Limited online services',
  onlineBody:
    'The app may request exchange rates. If product analytics is enabled, it may send best-effort pseudonymous product and technical events, including the policy version you acknowledge. This telemetry is not a signed legal record. We do not intentionally send transaction amounts, merchants, balances, notes, or SMS text to analytics providers. Session replay is disabled.',
  backupTitle: 'Backups are files you control',
  backupBody:
    'Exported backups are ZIP files saved or shared through your device. The app does not encrypt those files, so protect and delete copies you no longer need.',
  controlsTitle: 'Your controls',
  controlsBody:
    'Privacy Mode hides amounts in the app. App Lock and widget privacy can add device-level protection. Data export, restore, and factory reset are available from Settings.',
  limitsTitle: 'What this app is not',
  limitsBody:
    'Safe to Spend is an estimate based on the entries you provide. Full Frills Balance is a record-keeping tool, not a bank, tax service, investment service, or financial adviser.',
  contactTitle: 'Questions or requests',
  contactBody: 'For privacy questions or data requests, contact',
  contactEmail: 'sscsps@gmail.com',
  contactAction: 'Email privacy support',
  fullPolicyAction: 'Read full Privacy Policy',
  acknowledgementAction: 'I understand and acknowledge',
  acknowledgedStatus: 'Privacy notice acknowledged on this device',
  effectiveDate: (date: string) => `Policy effective ${date}`,
} as const;
