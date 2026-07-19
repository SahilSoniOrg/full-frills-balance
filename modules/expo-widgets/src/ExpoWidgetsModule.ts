import { requireNativeModule } from 'expo';

import type { PendingSmsRecord, WidgetDataSnapshot } from './ExpoWidgets.types';

type ExpoWidgetsModuleType = {
  syncWidgetData(snapshot: WidgetDataSnapshot): Promise<void>;
  refreshWidgets(): Promise<void>;
  storePendingSms(records: PendingSmsRecord[]): Promise<void>;
};

export default requireNativeModule<ExpoWidgetsModuleType>('ExpoWidgets');

