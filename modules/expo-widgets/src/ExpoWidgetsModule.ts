import { requireNativeModule } from 'expo';

import type { WidgetDataSnapshot } from './ExpoWidgets.types';

type ExpoWidgetsModuleType = {
  syncWidgetData(snapshot: WidgetDataSnapshot): Promise<void>;
  refreshWidgets(): Promise<void>;
};

export default requireNativeModule<ExpoWidgetsModuleType>('ExpoWidgets');
