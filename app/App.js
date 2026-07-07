import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, ActivityIndicator } from 'react-native';

import { useThruPassFonts } from './src/fonts.js';
import { colors } from '../shared/tokens.js';
import WalletScreen from './src/screens/WalletScreen.jsx';
import TapToEnterScreen from './src/screens/TapToEnterScreen.jsx';
import GrantedScreen from './src/screens/GrantedScreen.jsx';
import DeniedScreen from './src/screens/DeniedScreen.jsx';

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
      <NavigationContainer theme={navTheme}>
        <StatusBar style="light" />
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
          <Stack.Screen name="Wallet" component={WalletScreen} />
          <Stack.Screen name="TapToEnter" component={TapToEnterScreen} />
          <Stack.Screen name="Granted" component={GrantedScreen} />
          <Stack.Screen name="Denied" component={DeniedScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
