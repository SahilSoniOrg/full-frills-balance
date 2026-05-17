import { AppText } from '@/src/components/core/AppText';
import { useTheme } from '@/src/hooks/use-theme';
import { Box, Inset, Stack } from '@/src/design-system';
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Animated } from 'react-native';
import { Image } from 'expo-image';

interface DesignedSplashScreenProps {
  isReady: boolean;
}

/**
 * Clean, branded transition screen.
 * Zero domain dependencies, pure UI only.
 */
export function DesignedSplashScreen({ isReady }: DesignedSplashScreenProps) {
  const { theme } = useTheme();
  const [isVisible, setIsVisible] = useState(true);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isReady) {
      // Direct, fast fade-out
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setIsVisible(false);
      });
    }
  }, [isReady, fadeAnim]);

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          opacity: fadeAnim,
        },
      ]}
      pointerEvents="none"
    >
      <Box flex={1} justifyContent="center" alignItems="center">
        <Stack gap="xxxl" alignItems="center">
          <Image
            source={require('@/assets/images/icon.png')}
            style={[styles.logo, { borderColor: theme.border, borderWidth: 1 }]}
            contentFit="contain"
          />

          <AppText variant="title" weight="bold" style={{ color: theme.text }}>
            Balance
          </AppText>
        </Stack>
      </Box>

      <Inset bottom="xxxl">
        <AppText
          variant="caption"
          weight="medium"
          style={{ color: theme.textSecondary, opacity: 0.4 }}
        >
          v1.0.0
        </AppText>
      </Inset>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180, // Matches imageWidth in app.config.ts
    height: 180,
    borderRadius: 45, // Matches the circular mask of Android 12
  },
});
