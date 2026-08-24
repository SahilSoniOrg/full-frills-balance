import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

export function useVoiceVisualizer() {
  const [isRecording, setRecording] = useState(false);
  const [animValues] = useState(() => Array.from({ length: 5 }, () => new Animated.Value(1)));
  const animLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const onVolumeChange = useCallback(
    (volume: number) => {
      const scale = Math.max(1, (volume + 2) / 3);
      animValues.forEach(anim => {
        Animated.spring(anim, {
          toValue: scale * (0.8 + Math.random() * 0.4),
          useNativeDriver: true,
          friction: 7,
          tension: 40,
        }).start();
      });
    },
    [animValues],
  );

  useEffect(() => {
    if (isRecording) {
      const animations = animValues.map((anim, index) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: 2.5 + Math.sin(index) * 0.8,
              duration: 350 + index * 80,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0.6,
              duration: 350 + index * 80,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ),
      );

      animLoopRef.current = Animated.parallel(animations);
      animLoopRef.current.start();
    } else {
      animLoopRef.current?.stop();
      animValues.forEach(anim => {
        Animated.spring(anim, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    }

    return () => animLoopRef.current?.stop();
  }, [isRecording, animValues]);

  return { animValues, onVolumeChange, setRecording };
}
