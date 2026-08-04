import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import {
  NavigationContainer,
  type LinkingOptions,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionListScreen } from './src/screens/SessionListScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { HostConfigScreen } from './src/screens/HostConfigScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { SearchScreen } from './src/screens/SearchScreen';
import { PersonalizationScreen } from './src/screens/PersonalizationScreen';
import { ReportErrorScreen } from './src/screens/ReportErrorScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { LicenseScreen } from './src/screens/LicenseScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { TailscaleConnectivityLifecycle } from './src/connectivity/TailscaleConnectivityLifecycle';
import type { RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['mira://'],
  config: {
    screens: {
      HostConfig: 'pair',
    },
  },
};

function StatusBarThemed() {
  const { theme, colors } = useTheme();
  useEffect(() => {
    StatusBar.setBarStyle(theme === 'dark' ? 'light-content' : 'dark-content');
    StatusBar.setBackgroundColor(colors.bg.canvas);
  }, [theme, colors]);
  return null;
}

function AppInner() {
  return (
    <>
      <TailscaleConnectivityLifecycle />
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="SessionList" component={SessionListScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="HostConfig" component={HostConfigScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'none' }} />
        <Stack.Screen name="Personalization" component={PersonalizationScreen} />
        <Stack.Screen name="ReportError" component={ReportErrorScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="License" component={LicenseScreen} />
      </Stack.Navigator>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <NavigationContainer linking={linking}>
          <StatusBarThemed />
          <AppInner />
        </NavigationContainer>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}

export default App;
