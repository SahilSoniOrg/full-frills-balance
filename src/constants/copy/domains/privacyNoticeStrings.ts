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
    'If you enable SMS import on Android, messages are checked on your device and original transaction texts remain there until you clear app data. You can also connect Gmail. Google’s gmail.readonly permission can read messages across your whole mailbox, while the app’s capture search only checks new Inbox messages on your device, including unrelated Inbox messages it may inspect while matching. Selected details from matches are stored locally, while full email bodies are not retained in app records. Dismissing an inbox item or disconnecting Gmail does not delete its saved details; use Factory Reset or clear app data to remove local copies. Disconnecting the last connected Workplace also asks Google to revoke app access and signs out; if revocation fails, you can remove access in your Google Account. Enabled Apple or Android device backups may keep a copy. Google sign-in components handle access credentials; the app does not put them in transaction records or exports. Automatic capture and Android background checks are separate optional settings. Analytics does not receive email bodies, Gmail sender details, transaction amounts, merchants, balances, notes, or SMS text.',
  acknowledgementPromptClose: 'Close privacy acknowledgement',
  acknowledgementPromptAction: 'Acknowledge & continue',
  subtitle: 'A plain-language summary of what Full Frills Balance stores and sends.',
  heroTitle: 'Your money stays yours.',
  heroCalloutTitle: 'Private by design',
  heroCalloutBody:
    'Your financial records stay on this device unless you export or share a backup. Optional Gmail capture reads and parses Inbox messages on your device, then saves selected transaction details locally.',
  dataSectionTitle: 'What happens to your data',
  controlsSectionTitle: 'Keep control',
  supportSectionTitle: 'Need the full text?',
  manualTitle: 'You enter the data',
  manualBody:
    'Full Frills Balance does not connect to bank accounts. You add accounts, balances, income, spending, and notes yourself, or import a file you choose.',
  localTitle: 'Financial records stay local',
  localBody:
    'Your accounts, journals, entries, categories, and balances are stored on this device. SMS transaction messages may also be retained locally with their sender. If you connect Gmail, the app checks Inbox messages received after connection and parses them on this device, including unrelated messages it later ignores. For matched emails it saves the sender, subject, received time, message identifiers, and selected transaction details locally; it does not retain the full email body in app records. Google sign-in components handle access credentials; the app does not write them to transaction records, logs, analytics, or exported backups. Disconnecting Gmail or dismissing an inbox item does not erase saved email details. Gmail inbox items have no separate delete control; use Factory Reset or clear app data to remove them. These actions also remove other local app data. Gmail is optional and ordinary local use requires no app account.',
  onlineTitle: 'Limited online services',
  onlineBody:
    'The app may request exchange rates and send limited analytics. If you connect Gmail, Google processes sign-in and Gmail API requests directly from your device. If you enable verified automatic capture, Google Public DNS receives the sender domain and DKIM key selector for signature lookup, without the email content. We do not send Gmail content or parsed transaction details to our servers or analytics providers. Analytics may send pseudonymous product and technical events, including Gmail sync status and capture counts, but not email bodies, sender details, transaction values, merchants, balances, notes, or SMS text. Session replay is disabled.',
  backupTitle: 'Backups are files you control',
  backupBody:
    'Exported backups are ZIP files saved or shared through your device and may include original SMS associated with exported workplace records and selected Gmail transaction details. The app does not encrypt those files. If Apple or Android device backup is enabled, it may also back up app data, including locally stored Gmail details. These system backups are managed by your device and account settings; the app cannot access or remove their copies.',
  controlsTitle: 'Your controls',
  controlsBody:
    'Privacy Mode hides amounts in the app. App Lock and widget privacy can add device-level protection. Turn off verified automatic capture to stop automatic posting, or disable background checks to stop background Gmail sync. Disconnect a Workplace to stop future Gmail checks. Disconnecting or dismissing an item does not erase its saved Gmail details. Use Factory Reset or clear app data to remove Gmail inbox details; these actions also remove other local app data. Exported backups remain under your control. Data export, restore, and factory reset are available from Settings.',
  limitsTitle: 'What this app is not',
  limitsBody:
    'Safe to Spend is an estimate based on the entries you provide. Full Frills Balance is a record-keeping tool, not a bank, tax service, investment service, or financial adviser.',
  contactBody: 'For privacy questions or data requests, contact',
  contactEmail: 'sscsps@gmail.com',
  contactAction: 'Email privacy support',
  fullPolicyAction: 'Read full Privacy Policy',
  acknowledgementAction: 'I understand and acknowledge',
  acknowledgedStatus: 'Privacy notice acknowledged on this device',
  effectiveDate: (date: string) => `Policy effective ${date}`,
} as const;
