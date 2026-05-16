import { SettingsView } from '@/src/features/settings/components/SettingsView';
import { logger } from '@/src/utils/logger';
import React, { useEffect } from 'react';

export default function SettingsScreen() {
  // Log UI Mount
  useEffect(() => {
    logger.info('[Settings] Screen Mounted');
  }, []);

  return <SettingsView />;
}
