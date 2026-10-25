import { AppButton, AppText, IconButton } from '@/src/components/core';
import type { IconButtonVariant } from '@/src/components/core/IconButton';
import type { ScreenHeaderActionItem } from '@/src/components/shared/ScreenHeaderActions';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { useSharing } from '@/src/contexts/SharingContext';
import { useTheme } from '@/src/hooks/use-theme';
import type { ShareableCsvControl } from '@/src/hooks/useJournalCsvExport';
import { JOURNAL_CSV_SHAREABLE_ID } from '@/src/services/export/journalCsvExporter';
import { Icon } from '@/src/types/domainIcons';
import { useCallback, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Keyboard, Platform, StyleSheet, View } from 'react-native';

export const JOURNAL_CSV_EXPORT_TEST_ID = 'journal-export-csv';
export const JOURNAL_CSV_EXPORT_BUSY_TEST_ID = 'journal-export-csv-busy';

type CsvExportButtonShared = {
  csvExport?: ShareableCsvControl | null;
  testID?: string;
};

type JournalCsvExportIconProps = CsvExportButtonShared & {
  appearance?: 'icon';
  /** IconButton surface style. */
  iconVariant?: IconButtonVariant;
  iconSize?: number;
};

type JournalCsvExportLabelProps = CsvExportButtonShared & {
  appearance: 'label';
  /** AppButton visual style. */
  buttonVariant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  buttonSize?: 'sm' | 'md' | 'lg';
};

export type JournalCsvExportButtonProps = JournalCsvExportIconProps | JournalCsvExportLabelProps;

function csvExportStrings() {
  return AppConfig.strings.journal.csvExport;
}

function runExport(csvExport: ShareableCsvControl) {
  Keyboard.dismiss();
  void csvExport.onExportCsv();
}

/**
 * Root-level preparing spinner for journal CSV export.
 * Uses an absolute overlay (not RN Modal) so AppState / share-sheet handoff stays healthy.
 */
export function JournalCsvExportBusyHost() {
  const runtime = useSharing();
  const { theme } = useTheme();
  const strings = csvExportStrings();
  const getSnapshot = useCallback(() => {
    const snapshot = runtime.getSnapshot();
    return snapshot.sourceId === JOURNAL_CSV_SHAREABLE_ID && snapshot.phase === 'preparing';
  }, [runtime]);
  const visible = useSyncExternalStore(runtime.subscribe, getSnapshot, getSnapshot);

  if (!visible) return null;

  return (
    <View
      style={[styles.busyOverlay, { backgroundColor: theme.overlay }]}
      pointerEvents="auto"
      accessibilityViewIsModal
      accessibilityRole="progressbar"
      accessibilityLabel={strings.preparing}
      testID={JOURNAL_CSV_EXPORT_BUSY_TEST_ID}
    >
      <View style={[styles.busyCard, { backgroundColor: theme.surface }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <AppText variant="body" weight="semibold" align="center">
          {strings.preparing}
        </AppText>
      </View>
    </View>
  );
}

/** Header-action config for `ScreenHeaderActions` — mirrors `appearance="icon"`. */
export function journalCsvExportHeaderAction(
  csvExport?: ShareableCsvControl | null,
  {
    iconVariant = 'surface',
    iconSize = Size.iconSm,
    testID = JOURNAL_CSV_EXPORT_TEST_ID,
  }: Pick<JournalCsvExportIconProps, 'iconVariant' | 'iconSize' | 'testID'> = {},
): ScreenHeaderActionItem | null {
  if (!csvExport) return null;
  const strings = csvExportStrings();
  return {
    name: Icon.Save,
    size: iconSize,
    variant: iconVariant,
    onPress: () => runExport(csvExport),
    disabled: csvExport.isExportDisabled,
    accessibilityLabel: strings.label,
    accessibilityHint: strings.hint,
    testID,
  };
}

function JournalCsvExportIconButton({
  csvExport,
  iconVariant = 'surface',
  iconSize = Size.iconSm,
  testID = JOURNAL_CSV_EXPORT_TEST_ID,
}: JournalCsvExportIconProps & { csvExport: ShareableCsvControl }) {
  const strings = csvExportStrings();
  return (
    <IconButton
      name={Icon.Save}
      size={iconSize}
      variant={iconVariant}
      disabled={csvExport.isExportDisabled}
      onPress={() => runExport(csvExport)}
      accessibilityLabel={strings.label}
      accessibilityHint={strings.hint}
      testID={testID}
    />
  );
}

function JournalCsvExportLabelButton({
  csvExport,
  buttonVariant = 'secondary',
  buttonSize = 'sm',
  testID = JOURNAL_CSV_EXPORT_TEST_ID,
}: JournalCsvExportLabelProps & { csvExport: ShareableCsvControl }) {
  const [idleWidth, setIdleWidth] = useState<number>();
  const strings = csvExportStrings();

  return (
    <AppButton
      variant={buttonVariant}
      size={buttonSize}
      style={styles.labelButton}
      buttonStyle={csvExport.isExportingCsv ? { minWidth: idleWidth } : undefined}
      onLayout={event => {
        if (!csvExport.isExportingCsv) setIdleWidth(event.nativeEvent.layout.width);
      }}
      loading={csvExport.isExportingCsv}
      disabled={csvExport.isExportDisabled}
      onPress={() => runExport(csvExport)}
      accessibilityLabel={strings.label}
      accessibilityHint={strings.hint}
      testID={testID}
    >
      {strings.label}
    </AppButton>
  );
}

/**
 * CSV export control in two forms:
 * - `appearance="icon"` (default) — header / compact chrome
 * - `appearance="label"` — section rows with the "Export CSV" word button
 *
 * Preparing UI is owned by `JournalCsvExportBusyHost` at the app root.
 */
export function JournalCsvExportButton(props: JournalCsvExportButtonProps) {
  if (!props.csvExport) return null;
  if (props.appearance === 'label') {
    return <JournalCsvExportLabelButton {...props} csvExport={props.csvExport} />;
  }
  return <JournalCsvExportIconButton {...props} csvExport={props.csvExport} />;
}

const styles = StyleSheet.create({
  labelButton: {
    minHeight: Platform.OS === 'android' ? 48 : Size.touchTarget,
    justifyContent: 'center',
  },
  busyOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    zIndex: 1000,
    elevation: 1000,
  },
  busyCard: {
    minWidth: 180,
    maxWidth: '85%',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Shape.radius.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: Opacity.muted,
    shadowRadius: 8,
  },
});
