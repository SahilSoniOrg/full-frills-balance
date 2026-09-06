import { AppConfig } from '@/src/constants';
import { AppSegmentedControl, AppText } from '@/src/components/core';
import { ShareFormat } from '@/src/types/sharing';
import { StyleSheet, View } from 'react-native';

interface ShareFormatPreferenceViewProps {
  value: ShareFormat;
  onChange: (value: ShareFormat) => void;
}

const SHARE_FORMAT_OPTIONS = [
  { id: ShareFormat.TEXT, label: AppConfig.strings.settings.data.shareFormats.TEXT },
  { id: ShareFormat.CSV, label: AppConfig.strings.settings.data.shareFormats.CSV },
  { id: ShareFormat.MARKDOWN, label: AppConfig.strings.settings.data.shareFormats.MARKDOWN },
] as const;

export const ShareFormatPreferenceView = ({ value, onChange }: ShareFormatPreferenceViewProps) => {
  return (
    <View>
      <View style={styles.header}>
        <AppText variant="subheading">{AppConfig.strings.settings.data.shareFormatTitle}</AppText>
        <AppText variant="caption" color="secondary" style={styles.sectionDesc}>
          {AppConfig.strings.settings.data.shareFormatDesc}
        </AppText>
      </View>

      <AppSegmentedControl
        options={SHARE_FORMAT_OPTIONS}
        value={value}
        onChange={onChange}
        flex
        size="md"
        testID="share-format-control"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    marginBottom: 12,
  },
  sectionDesc: {
    marginTop: 4,
  },
});
