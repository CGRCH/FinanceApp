import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
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
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SQLiteProvider
      databaseName="financeapp.db"
      onInit={initDatabase}
      options={{ enableChangeListener: true }}>
      <FinanceProvider>
        <RootStack />
      </FinanceProvider>
    </SQLiteProvider>
  );
}

function RootStack() {
  const { effectiveScheme, ready } = useFinance();
  if (!ready) return null;

  return (
    <>
      <StatusBar style={effectiveScheme === 'dark' ? 'light' : 'dark'} />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="movimiento/nuevo" options={{ presentation: 'modal', title: 'Nuevo movimiento' }} />
      </Stack>
    </>
  );
}
