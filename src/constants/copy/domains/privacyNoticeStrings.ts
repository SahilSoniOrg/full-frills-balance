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
    'If you enable SMS import on Android, messages are checked on your device and original transaction texts remain there until you clear app data. You can also connect Gmail. Google’s gmail.readonly permission can read messages across your whole mailbox, while the app checks only new Inbox messages received after connection, including unrelated Inbox messages it may inspect while matching. Unmatched messages and full email bodies are not retained. Selected details from matches stay locally without automatic expiry; dismissing an item or disconnecting Gmail does not delete them. Use Factory Reset, clear app data, or uninstall to remove local copies. Google Sign-In components manage access credentials; the app does not write tokens to records, logs, analytics, or exported backups. The local database has no separate app-level encryption. Optional App Lock gates in-app access but does not encrypt stored files. Use a device screen lock and protect exported ZIP backups, which are not encrypted. Enabled Apple or Android device backups may retain copies. Automatic capture and Android background checks are separate optional settings. Analytics does not receive email bodies, Gmail sender details, transaction amounts, merchants, balances, notes, or SMS text. The app uses information from Google APIs only for transaction capture and bookkeeping under Google’s API Services User Data Policy and its Limited Use requirements.',
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
    'Your accounts, journals, entries, categories, and balances are stored on this device. SMS transaction messages may also be retained locally with their sender. Gmail is optional; if you connect it, selected details from matched Inbox messages are stored locally. See the Gmail section below for what the app reads, how those details are protected, how long they remain, and how to remove them. Ordinary local use requires no app account.',
  onlineTitle: 'Limited online services',
  onlineBody:
    'The app may request exchange rates and send limited analytics. If you connect Gmail, Google processes sign-in and Gmail API requests directly from your device. If you enable verified automatic capture, Google Public DNS receives the sender domain and DKIM key selector for signature lookup, without the email content. We do not send Gmail content or parsed transaction details to our servers or analytics providers. Analytics may send pseudonymous product and technical events, including Gmail sync status and capture counts, but not email bodies, sender details, transaction values, merchants, balances, notes, or SMS text. Session replay is disabled. The app uses information from Google APIs only for the transaction capture and bookkeeping features described in its privacy policy, under Google’s API Services User Data Policy and its Limited Use requirements.',
  backupTitle: 'Backups are files you control',
  backupBody:
    'Exported backups are ZIP files saved or shared through your device and may include original SMS associated with exported workplace records and selected Gmail transaction details. The app does not encrypt those files. If Apple or Android device backup is enabled, it may also back up app data, including locally stored Gmail details. These system backups are managed by your device and account settings; the app cannot access or remove their copies.',
  controlsTitle: 'Your controls',
  controlsBody:
    'Privacy Mode hides amounts in the app. App Lock gates in-app access using your device biometrics or credentials, but does not encrypt stored files. Turn off automatic capture to stop automatic posting or disable background checks to stop background Gmail sync. Disconnect a Workplace to stop future Gmail checks and remove its local Gmail connection data. This does not erase saved Gmail details. Use Factory Reset or clear app data to remove them; these actions also remove other local app data. Exported backups and enabled device backups may retain separate copies. Data export, restore, and factory reset are available from Settings.',
  googleDataSectionTitle: 'If you connect Gmail',
  googleProtectionTitle: 'How Gmail data is protected',
  googleProtectionBody:
    'Google’s gmail.readonly permission can read across your mailbox; the app checks only new Inbox messages received after you connect a Workplace, directly from your device over HTTPS. Message bodies are processed on your device and are not sent to Full Frills Balance servers, analytics, or crash reports. For matched messages, the app stores the sender, subject, received time, message IDs, and selected transaction details in its app-private database. Google Sign-In manages access credentials; the app does not write tokens to records, logs, analytics, or exported backups. The database has no separate app-level encryption. App Lock gates in-app access but does not encrypt files. Use a device screen lock and protect exported ZIP backups, which are not encrypted.',
  googleRetentionTitle: 'How long Gmail data stays',
  googleRetentionBody:
    'Unmatched messages and full email bodies are not retained. Matched details remain on this device without automatic expiry, even if you dismiss an item or disconnect Gmail. There is no delete control for one Gmail inbox item; use Factory Reset, clear app data, or uninstall to remove the app’s local records. Disconnecting stops future checks and asks Google to revoke access when no other Workplace uses the account, but it does not delete saved records or source messages. Exported ZIPs and enabled device backups may keep separate copies that you manage yourself.',
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
