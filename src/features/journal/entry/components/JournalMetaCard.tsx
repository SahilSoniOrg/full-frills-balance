import { DateTimePickerModal } from '@/src/components/common/DateTimePickerModal';
import { AppCard, AppIcon, AppInput, ListRow } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { EntryEditBanner } from '@/src/features/journal/entry/components/EntryEditBanner';
import { useTheme } from '@/src/hooks/use-theme';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
interface JournalMetaCardProps {
    date: string;
    setDate: (date: string) => void;
    time: string;
    setTime: (time: string) => void;
    description: string;
    setDescription: (desc: string) => void;
    style?: StyleProp<ViewStyle>;
    showBanner?: boolean;
    bannerText?: string;
}

export function JournalMetaCard({
    date,
    setDate,
    time,
    setTime,
    description,
    setDescription,
    style,
    showBanner,
    bannerText,
}: JournalMetaCardProps) {
    const { theme } = useTheme();
    const [showDatePicker, setShowDatePicker] = useState(false);

    return (
        <AppCard elevation="sm" padding="lg" style={style}>
            <View style={{ gap: Spacing.md }}>
                {showBanner && (
                    <EntryEditBanner
                        text={bannerText || ''}
                        style={{ marginHorizontal: 0, marginTop: 0 }}
                    />
                )}
                <ListRow
                    title={AppConfig.strings.advancedEntry.dateTime}
                    subtitle={dayjs(`${date}T${time}`).format('DD MMM YYYY, HH:mm')}
                    leading={<AppIcon name="calendar" size={Size.iconMd} color={theme.textSecondary} />}
                    onPress={() => setShowDatePicker(true)}
                    style={{ marginHorizontal: -Spacing.lg }}
                />

                <DateTimePickerModal
                    visible={showDatePicker}
                    date={date}
                    time={time}
                    onClose={() => setShowDatePicker(false)}
                    onSelect={(d, t) => {
                        setDate(d);
                        setTime(t);
                    }}
                />

                <AppInput
                    label={AppConfig.strings.advancedEntry.description}
                    value={description}
                    onChangeText={setDescription}
                    placeholder={AppConfig.strings.advancedEntry.descriptionPlaceholder}
                    multiline
                    numberOfLines={2}
                />
            </View>
        </AppCard>
    );
}
