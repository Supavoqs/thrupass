import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Platform, StyleSheet } from 'react-native';

import { useThruPassFonts } from './src/fonts.js';
import { colors } from './src/theme.js';
import WalletScreen from './src/screens/WalletScreen.jsx';
import TapToEnterScreen from './src/screens/TapToEnterScreen.jsx';
import GrantedScreen from './src/screens/GrantedScreen.jsx';
import DeniedScreen from './src/screens/DeniedScreen.jsx';
import CreateAccountScreen from './src/screens/CreateAccountScreen.jsx';

const Stack = createNativeStackNavigator();

const navTheme = {
  dark: true,
  colors: {
    primary: colors.lime,
    background: colors.bg,
    card: colors.bg,
    text: colors.textPrimary,
    border: colors.borderSoft,
    notification: colors.lime,
  },
};

export default function App() {
  const [fontsLoaded] = useThruPassFonts();

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <View style={styles.webOuter}>
        <View style={styles.webFrame}>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="light" />
            <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
              <Stack.Screen name="Wallet" component={WalletScreen} />
              <Stack.Screen name="TapToEnter" component={TapToEnterScreen} />
              <Stack.Screen name="Granted" component={GrantedScreen} />
              <Stack.Screen name="Denied" component={DeniedScreen} />
              <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

// On web, the app is designed as a phone-width screen; without this it
// stretches edge-to-edge across a desktop browser window. Native (iOS/
// Android) is untouched since the app there already fills the device.
const styles = StyleSheet.create({
  webOuter: Platform.OS === 'web' ? { flex: 1, backgroundColor: colors.bg, alignItems: 'center' } : { flex: 1 },
  webFrame: Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 480 } : { flex: 1 },
});
