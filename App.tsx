import React, { useEffect, useState } from 'react';
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
import { MemoryScreen } from './src/screens/MemoryScreen';
import { ReportErrorScreen } from './src/screens/ReportErrorScreen';
import { AboutScreen } from './src/screens/AboutScreen';
import { LicenseScreen } from './src/screens/LicenseScreen';
import { DebugLogScreen } from './src/screens/DebugLogScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { TailscaleConnectivityLifecycle } from './src/connectivity/TailscaleConnectivityLifecycle';
import { remoteMiraHostClient } from './src/api/remoteMiraHost';
import { deviceCredentialStore } from './src/security/deviceCredentialStore';
import { useHostStore } from './src/store/hostStore';
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
  const [bootstrapChecked, setBootstrapChecked] = useState(false);
  const [hasDeviceCredential, setHasDeviceCredential] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const bootstrapRemoteHost = async () => {
      try {
        if (!remoteMiraHostClient.isSecureStorageAvailable()) {
          if (!cancelled) {
            setHasDeviceCredential(false);
            useHostStore.getState().setConnectionStatus('disconnected');
          }
          return;
        }

        const stored = await deviceCredentialStore.load();
        if (cancelled) return;
        if (!stored) {
          setHasDeviceCredential(false);
          useHostStore.getState().setConnectionStatus('disconnected');
          return;
        }

        setHasDeviceCredential(true);
        try {
          const restored = await remoteMiraHostClient.restoreConnection();
          if (cancelled) return;

          const connected = restored != null;
          setHasDeviceCredential(connected);
          useHostStore
            .getState()
            .setConnectionStatus(connected ? 'connected' : 'disconnected');
        } catch {
          if (cancelled) return;

          // Direct or Relay may be temporarily unreachable. The paired-device
          // credential remains valid unless the Host explicitly returns 401/403.
          setHasDeviceCredential(true);
          useHostStore.getState().setConnectionStatus('reconnecting');
        }
      } finally {
        if (!cancelled) setBootstrapChecked(true);
      }
    };

    void bootstrapRemoteHost();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootstrapChecked) return null;

  return (
    <>
      <TailscaleConnectivityLifecycle />
      <Stack.Navigator
        initialRouteName={hasDeviceCredential ? 'SessionList' : 'HostConfig'}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="SessionList" component={SessionListScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="HostConfig" component={HostConfigScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Search" component={SearchScreen} options={{ animation: 'none' }} />
        <Stack.Screen name="Personalization" component={PersonalizationScreen} />
        <Stack.Screen name="Memory" component={MemoryScreen} />
        <Stack.Screen name="ReportError" component={ReportErrorScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="License" component={LicenseScreen} />
        <Stack.Screen name="DebugLog" component={DebugLogScreen} />
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
