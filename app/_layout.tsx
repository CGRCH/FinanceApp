import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import 'react-native-reanimated';

import { FinanceProvider, useFinance } from '@/src/context/FinanceContext';
import { initDatabase } from '@/src/db/repository';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SQLiteProvider databaseName="financeapp.db" onInit={initDatabase} options={{ enableChangeListener: false }}>
      <FinanceProvider>
        <RootStack />
      </FinanceProvider>
    </SQLiteProvider>
  );
}

function RootStack() {
  const { effectiveScheme, ready, showOnboarding } = useFinance();

  useEffect(() => {
    if (ready && showOnboarding) {
      router.replace('/onboarding');
    }
  }, [ready, showOnboarding]);

  if (!ready) return null;

  return (
    <>
      <StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}
