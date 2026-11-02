import { Stack, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import 'react-native-reanimated';

import { AppLoadingScreen, DatabaseErrorScreen } from '@/src/components/database/DatabaseErrorScreen';
import { FinanceProvider, useFinance } from '@/src/context/FinanceContext';
import { DATABASE_NAME, resetLocalDatabase } from '@/src/db/databaseLifecycle';
import { initDatabase } from '@/src/db/repository';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [sqliteError, setSqliteError] = useState<Error | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  const handleSqliteError = useCallback((error: Error) => {
    queueMicrotask(() => setSqliteError(error));
  }, []);

  const handleRetry = useCallback(() => {
    setSqliteError(null);
    setBootAttempt((n) => n + 1);
  }, []);

  const handleResetLocal = useCallback(async () => {
    setResetting(true);
    try {
      await resetLocalDatabase();
      setSqliteError(null);
      setBootAttempt((n) => n + 1);
    } finally {
      setResetting(false);
    }
  }, []);

  if (sqliteError) {
    return (
      <DatabaseErrorScreen
        error={sqliteError}
        onRetry={handleRetry}
        onResetLocal={handleResetLocal}
        resetting={resetting}
      />
    );
  }

  return (
    <SQLiteProvider
      key={`sqlite-${bootAttempt}`}
      databaseName={DATABASE_NAME}
      onInit={initDatabase}
      onError={handleSqliteError}
      options={{ enableChangeListener: false }}>
      <FinanceProvider onRequestRemount={() => setBootAttempt((n) => n + 1)}>
        <RootStack />
      </FinanceProvider>
    </SQLiteProvider>
  );
}

function RootStack() {
  const { effectiveScheme, ready, showOnboarding, bootstrapError, slowBootHint, retryBootstrap, resetLocalData } =
    useFinance();

  useEffect(() => {
    if (ready && showOnboarding && !bootstrapError) {
      router.replace('/onboarding');
    }
  }, [ready, showOnboarding, bootstrapError]);

  if (bootstrapError) {
    return (
      <DatabaseErrorScreen
        error={bootstrapError}
        onRetry={retryBootstrap}
        onResetLocal={resetLocalData}
      />
    );
  }

  if (!ready) {
    return <AppLoadingScreen slowHint={slowBootHint} />;
  }

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
