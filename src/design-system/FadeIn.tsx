import React from 'react';
import { View, type ViewStyle } from 'react-native';
import { View as MotiView } from 'moti';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';

export type FadeInProps = {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  fromY?: number;
  style?: ViewStyle;
};

export function FadeIn({ children, delay = 0, duration = 500, fromY = 10, style }: FadeInProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <View style={style}>{children}</View>;
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: fromY }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration,
        delay,
      }}
      style={style}
    >
      {children}
    </MotiView>
  );
}
