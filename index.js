if (process.env.EXPO_OS !== 'web') {
  require('react-native-quick-crypto').install();
}

import 'expo-router/entry';
