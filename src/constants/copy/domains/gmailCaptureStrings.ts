export const gmailCaptureStrings = {
  title: 'Gmail',
  connected: 'Connected. New Inbox mail is checked while open.',
  disconnected: 'Connect Gmail to find new transaction emails.',
  accountHelp: 'Recognize an account from Gmail',
  accountHelpDescription:
    'Open an account and add the complete sender address under Message recognition.',
  syncError: 'Could not check Gmail. Try signing in again or refresh the transaction inbox.',
  reconnect: 'Sign in to Gmail again',
  backgroundTitle: 'Check Gmail in the background?',
  backgroundMessage:
    'The app can check new Inbox messages on this device while it is not open. The operating system decides when checks run, and may stop them after you force-close the app. Checks pause while app lock is enabled and resume when you open the app.',
  backgroundAction: 'Enable background checks',
  backgroundSetting: 'Background Gmail checks',
  backgroundDescription: 'Runs when the device permits. Paused while app lock is enabled.',
  backgroundUnavailable:
    'Background checks are unavailable on this device. Gmail can still be checked while the app is open.',
  automaticSetting: 'Capture verified Gmail transactions',
  automaticDescription:
    'Requires automatic capture and a matching account pattern. Unverified emails stay in review.',
  automaticTitle: 'Capture verified Gmail transactions?',
  automaticMessage:
    'For new matching bank emails, the app checks the sender’s signature and looks up its public key using Google Public DNS. The sender domain and key selector are sent to Google DNS; email content stays on this device. Supported verified transactions can create journals when automatic capture is enabled. Other emails need review.',
  automaticAction: 'Enable Gmail capture',
  connectTitle: 'Connect Gmail?',
  connectMessage:
    'On the first Gmail connection, Google asks for read-only mailbox access. The app checks new Inbox messages, including unrelated mail, while open on this device. Each Workplace has its own Gmail cutoff and capture setting, but Google Sign-In uses one account across the app; use the same Google account for every connected Workplace. Email transactions need review unless you separately enable verified capture. Full email bodies and access tokens are not saved in your books. You can stop syncing for this workplace at any time.',
  connectAction: 'Connect Gmail',
  disconnectTitle: 'Stop Gmail for this workplace?',
  disconnectMessage:
    'This stops checking mail for this workplace. Your existing entries remain. You can revoke the app’s Google access separately in your Google Account.',
  disconnectAction: 'Stop syncing',
  error: 'Gmail could not be connected. Check the Google sign-in configuration and try again.',
  accountConflict:
    'Gmail uses one Google account across connected Workplaces on this device. Reconnect with the same account. To switch accounts or restore a signed-out connection, disconnect Gmail from every connected Workplace first, then reconnect.',
  sourcesUnavailable: 'Automatic message capture is available on Android and iOS with Gmail.',
} as const;
