import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator, Platform } from 'react-native';

import { useThruPassFonts } from './src/fonts.js';
import { ThemeProvider, useTheme } from './src/ThemeContext.jsx';
import { getStoredAccountId } from './src/session.js';
import WalletScreen from './src/screens/WalletScreen.jsx';
import TapToEnterScreen from './src/screens/TapToEnterScreen.jsx';
import GrantedScreen from './src/screens/GrantedScreen.jsx';
import DeniedScreen from './src/screens/DeniedScreen.jsx';
import CreateAccountScreen from './src/screens/CreateAccountScreen.jsx';
import ScanScreen from './src/screens/ScanScreen.jsx';
import TicketsScreen from './src/screens/TicketsScreen.jsx';
import BrowseEventsScreen from './src/screens/BrowseEventsScreen.jsx';
import BarTabMenuScreen from './src/screens/BarTabMenuScreen.jsx';
import MyThruBalanceScreen from './src/screens/MyThruBalanceScreen.jsx';

const Stack = createNativeStackNavigator();

// A Bar Tab Event's QR code links here as
// https://thrupass.co.za/app/?barTabEvent=bte_xxx — web-only, since that's
// the only way this app is currently distributed.
function getSharedBarTabEventIdFromUrl() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('barTabEvent');
  } catch {
    return null;
  }
}

export default function App() {
  return (
    <ThemeProvider>
      <AppShell />
    </ThemeProvider>
  );
}

// On web, the app is designed as a phone-width screen; without the outer/frame
// wrapper it stretches edge-to-edge across a desktop browser window. Native
// (iOS/Android) is untouched since the app there already fills the device.
function AppShell() {
  const { colors, mode } = useTheme();
  const [fontsLoaded] = useThruPassFonts();

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.lime} />
      </View>
    );
  }

  const navTheme = {
    dark: mode === 'dark',
    colors: {
      primary: colors.lime,
      background: colors.bg,
      card: colors.bg,
      text: colors.textPrimary,
      border: colors.borderSoft,
      notification: colors.lime,
    },
  };

  const sharedBarTabEventId = getSharedBarTabEventIdFromUrl();
  const initialRouteName = sharedBarTabEventId ? 'BarTabMenu' : getStoredAccountId() ? 'Wallet' : 'CreateAccount';

  return (
    <SafeAreaProvider>
      <View style={Platform.OS === 'web' ? { flex: 1, backgroundColor: colors.bg, alignItems: 'center' } : { flex: 1 }}>
        <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', maxWidth: 480 } : { flex: 1 }}>
          <NavigationContainer theme={navTheme}>
            <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
            <Stack.Navigator
              initialRouteName={initialRouteName}
              screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}
            >
              <Stack.Screen name="Wallet" component={WalletScreen} />
              <Stack.Screen name="MyThruBalance" component={MyThruBalanceScreen} />
              <Stack.Screen name="TapToEnter" component={TapToEnterScreen} />
              <Stack.Screen name="Granted" component={GrantedScreen} />
              <Stack.Screen name="Denied" component={DeniedScreen} />
              <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
              <Stack.Screen name="Scan" component={ScanScreen} />
              <Stack.Screen name="Tickets" component={TicketsScreen} />
              <Stack.Screen name="BrowseEvents" component={BrowseEventsScreen} />
              <Stack.Screen
                name="BarTabMenu"
                component={BarTabMenuScreen}
                initialParams={{ barTabEventId: sharedBarTabEventId }}
              />
            </Stack.Navigator>
          </NavigationContainer>
        </View>
      </View>
    </SafeAreaProvider>
  );
}
