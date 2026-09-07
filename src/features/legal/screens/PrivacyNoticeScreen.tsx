import { AppButton, AppCard, AppIcon, AppText } from '@/src/components/core';
import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Box, Inset, Separator, Stack } from '@/src/design-system';
import type { IconName } from '@/src/types/domainIcons';
import {
  acknowledgeCurrentPrivacyPolicy,
  formatPrivacyPolicyEffectiveDate,
  hasAcknowledgedCurrentPrivacyPolicy,
  subscribeToPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';
import { analytics } from '@/src/services/analytics';
import { AppNavigation } from '@/src/utils/navigation';
import { PRIVACY_NOTICE_STRINGS } from '@/src/constants/copy/domains/privacyNoticeStrings';
import { useLocalSearchParams } from 'expo-router';
import { useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

const copy = PRIVACY_NOTICE_STRINGS;

function PrivacyRow({
  icon,
  title,
  body,
  last = false,
}: {
  icon: IconName;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <>
      <Box flexDirection="row" alignItems="flex-start" paddingHorizontal="lg" paddingVertical="lg">
        <Box
          width={Size.xl}
          height={Size.xl}
          borderRadius="full"
          background="primary"
          alignItems="center"
          justifyContent="center"
        >
          <AppIcon name={icon} size={Size.iconSm} color="background" />
        </Box>
        <Stack gap="xs" flex={1} marginLeft="md">
          <AppText variant="body" weight="semibold">
            {title}
          </AppText>
          <AppText variant="body" color="secondary">
            {body}
          </AppText>
        </Stack>
      </Box>
      {!last && <Separator marginLeft={Size.xl + Spacing.lg + Spacing.md} />}
    </>
  );
}

export default function PrivacyNoticeScreen() {
  const { required } = useLocalSearchParams<{ required?: string }>();
  const isRequired = required === '1';
  const isAcknowledged = useSyncExternalStore(
    subscribeToPrivacyPolicyAcknowledgement,
    hasAcknowledgedCurrentPrivacyPolicy,
    hasAcknowledgedCurrentPrivacyPolicy,
  );

  const contactPrivacySupport = () => {
    void Linking.openURL(`mailto:${copy.contactEmail}`).catch(() => undefined);
  };

  const openFullPrivacyPolicy = () => {
    void Linking.openURL(AppConfig.links.privacyPolicyUrl).catch(() => undefined);
  };

  const acknowledgePrivacyPolicy = () => {
    acknowledgeCurrentPrivacyPolicy();
    analytics.logPrivacyPolicyAcknowledged(AppConfig.legal.privacyPolicyVersion);
    AppNavigation.back();
  };

  const chrome = isRequired
    ? { screenTitle: copy.title, showBack: false as const }
    : {
        screenTitle: copy.title,
        showBack: true as const,
        backIcon: 'back' as const,
        onBack: AppNavigation.back,
      };

  return (
    <ScreenWithChrome
      chrome={{
        ...chrome,
      }}
      scrollable
    >
      <Inset horizontal="lg" vertical="md">
        <Stack space="xxl">
          <Stack space="sm">
            <AppText variant="title">{copy.heroTitle}</AppText>
            <AppText variant="body" color="secondary">
              {copy.subtitle}
            </AppText>
          </Stack>

          <AppCard variant="secondary" paddingSize="lg">
            <Stack space="md">
              <Box flexDirection="row" alignItems="center" gap="md">
                <Box
                  width={Size.xl}
                  height={Size.xl}
                  borderRadius="full"
                  background="primary"
                  alignItems="center"
                  justifyContent="center"
                >
                  <AppIcon name="shieldCheck" size={Size.iconSm} color="background" />
                </Box>
                <AppText variant="heading">{copy.heroCalloutTitle}</AppText>
              </Box>
              <AppText variant="body" color="secondary">
                {copy.heroCalloutBody}
              </AppText>
            </Stack>
          </AppCard>

          <Stack space="md">
            <AppText variant="subheading">{copy.dataSectionTitle}</AppText>
            <AppCard variant="default" paddingSize="none">
              <PrivacyRow icon="edit" title={copy.manualTitle} body={copy.manualBody} />
              <PrivacyRow icon="database" title={copy.localTitle} body={copy.localBody} />
              <PrivacyRow icon="share" title={copy.onlineTitle} body={copy.onlineBody} last />
            </AppCard>
          </Stack>

          <Stack space="md">
            <AppText variant="subheading">{copy.controlsSectionTitle}</AppText>
            <AppCard variant="outline" paddingSize="none">
              <PrivacyRow icon="archive" title={copy.backupTitle} body={copy.backupBody} />
              <PrivacyRow icon="lock" title={copy.controlsTitle} body={copy.controlsBody} last />
            </AppCard>
          </Stack>

          <AppCard variant="ghost" paddingSize="lg">
            <Stack space="sm">
              <AppText variant="heading">{copy.limitsTitle}</AppText>
              <AppText variant="body" color="secondary">
                {copy.limitsBody}
              </AppText>
            </Stack>
          </AppCard>

          <Stack space="sm">
            <AppText variant="subheading">{copy.supportSectionTitle}</AppText>
            <AppText variant="body" color="secondary">
              {copy.contactBody} {copy.contactEmail}
            </AppText>
            <AppButton
              variant="outline"
              onPress={openFullPrivacyPolicy}
              accessibilityLabel={copy.fullPolicyAction}
              testID="privacy-notice-full-policy-button"
            >
              {copy.fullPolicyAction}
            </AppButton>
            {isAcknowledged ? (
              <AppText variant="caption" color="secondary">
                {copy.acknowledgedStatus}
              </AppText>
            ) : (
              <AppButton
                variant="primary"
                onPress={acknowledgePrivacyPolicy}
                accessibilityLabel={copy.acknowledgementAction}
                testID="privacy-notice-acknowledge-button"
              >
                {copy.acknowledgementAction}
              </AppButton>
            )}
            <AppButton
              variant="ghost"
              onPress={contactPrivacySupport}
              accessibilityLabel={copy.contactAction}
              testID="privacy-notice-contact-button"
            >
              {copy.contactAction}
            </AppButton>
            <AppText variant="caption" color="secondary">
              {copy.effectiveDate(formatPrivacyPolicyEffectiveDate())}
            </AppText>
          </Stack>
        </Stack>
      </Inset>
    </ScreenWithChrome>
  );
}
