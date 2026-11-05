import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';

import {
  attemptGate,
  attemptsRemainingBeforeDelay,
  failuresAfterSuccess,
  failuresAfterWrongAttempt,
} from '@/src/domain/appLockAttempts';
import {
  isLegacyPinRecord,
  legacyEntryMaxLength,
  validatePinFormat,
  verifyPinAgainstRecord,
} from '@/src/domain/appLockPin';
import { shouldLockOnResume } from '@/src/domain/appLockTiming';
import {
  clearAllAppLockStorage,
  isBiometricsEnabled,
  loadFailureState,
  loadLockTimeoutMs,
  loadPinRecord,
  saveFailureState,
  savePinRecord,
  setBiometricsEnabled,
  saveLockTimeoutMs,
  usesWebPinStorage,
  webPinStorageNotice,
} from '@/src/services/appLockStorage';
import { createPinRecord, digestPinRecordInput } from '@/src/services/pinHashing';

export type PinVerifyResult = 'unlocked' | 'migrate' | 'fail' | 'locked';

interface AppLockContextValue {
  ready: boolean;
  pinConfigured: boolean;
  isUnlocked: boolean;
  hasLegacyPin: boolean;
  pinMigrationRequired: boolean;
  biometricsEnabled: boolean;
  biometricsAvailable: boolean;
  lockTimeoutMs: number;
  failureCount: number;
  lockoutRemainingMs: number;
  attemptsRemaining: number;
  webStorageNotice: string | null;
  legacyEntryMaxLength: number;
  setupPin: (pin: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  verifyStandardPin: (pin: string) => Promise<PinVerifyResult>;
  verifyLegacyPin: (pin: string) => Promise<PinVerifyResult>;
  unlockWithBiometrics: () => Promise<boolean>;
  lockNow: () => void;
  setBiometricsEnabledSetting: (enabled: boolean) => Promise<void>;
  setLockTimeoutSetting: (ms: number) => Promise<void>;
  resetAppForgotPin: () => Promise<void>;
  refreshLockSettings: () => Promise<void>;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

export function AppLockProvider({
  children,
  onForgotPinReset,
}: {
  children: ReactNode;
  onForgotPinReset: () => Promise<void>;
}) {
  const [ready, setReady] = useState(false);
  const [pinConfigured, setPinConfigured] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [hasLegacyPin, setHasLegacyPin] = useState(false);
  const [pinMigrationRequired, setPinMigrationRequired] = useState(false);
  const [legacyEntryMaxLen, setLegacyEntryMaxLen] = useState(6);
  const [biometricsEnabled, setBiometricsEnabledState] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState(false);
  const [lockTimeoutMs, setLockTimeoutMsState] = useState(60_000);
  const [failureCount, setFailureCount] = useState(0);
  const [lastFailureAtMs, setLastFailureAtMs] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const backgroundedAtRef = useRef<number | null>(null);
  const pinRecordRef = useRef<Awaited<ReturnType<typeof loadPinRecord>>>(null);

  const syncRecordMeta = useCallback((record: Awaited<ReturnType<typeof loadPinRecord>>) => {
    pinRecordRef.current = record;
    setPinConfigured(record != null);
    setHasLegacyPin(record != null && isLegacyPinRecord(record));
    setLegacyEntryMaxLen(record ? legacyEntryMaxLength(record) : 6);
  }, []);

  const refreshLockSettings = useCallback(async () => {
    const [record, bio, timeout, failures] = await Promise.all([
      loadPinRecord(),
      isBiometricsEnabled(),
      loadLockTimeoutMs(),
      loadFailureState(),
    ]);
    syncRecordMeta(record);
    setBiometricsEnabledState(bio);
    setLockTimeoutMsState(timeout);
    setFailureCount(failures.failureCount);
    setLastFailureAtMs(failures.lastFailureAtMs);

    if (Platform.OS === 'web') {
      setBiometricsAvailable(false);
    } else {
      const hw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = hw ? await LocalAuthentication.isEnrolledAsync() : false;
      setBiometricsAvailable(hw && enrolled);
    }
  }, [syncRecordMeta]);

  useEffect(() => {
    (async () => {
      await refreshLockSettings();
      const record = await loadPinRecord();
      setIsUnlocked(record == null);
      setReady(true);
    })();
  }, [refreshLockSettings]);

  useEffect(() => {
    if (!pinConfigured || !isUnlocked) return;
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'background' || next === 'inactive') {
        backgroundedAtRef.current = Date.now();
      }
      if (next === 'active') {
        const bg = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (bg != null && shouldLockOnResume(bg, Date.now(), lockTimeoutMs)) {
          setIsUnlocked(false);
        }
      }
    });
    return () => sub.remove();
  }, [pinConfigured, isUnlocked, lockTimeoutMs]);

  useEffect(() => {
    if (failureCount < 5) return;
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [failureCount]);

  const lockoutRemainingMs = useMemo(() => {
    void tick;
    return attemptGate(failureCount, lastFailureAtMs, Date.now()).remainingMs;
  }, [failureCount, lastFailureAtMs, tick]);

  const attemptsRemaining = attemptsRemainingBeforeDelay(failureCount);

  const registerFailedAttempt = useCallback(async () => {
    const next = failuresAfterWrongAttempt(failureCount, Date.now());
    await saveFailureState(next.failureCount, next.lastFailureAtMs);
    setFailureCount(next.failureCount);
    setLastFailureAtMs(next.lastFailureAtMs);
  }, [failureCount]);

  const setupPin = useCallback(async (pin: string) => {
    if (!validatePinFormat(pin)) throw new Error('El PIN debe tener 4 dígitos.');
    const record = await createPinRecord(pin);
    await savePinRecord(record);
    syncRecordMeta(record);
    await saveFailureState(0, null);
    setFailureCount(0);
    setLastFailureAtMs(null);
    setPinMigrationRequired(false);
    setIsUnlocked(true);
  }, [syncRecordMeta]);

  const changePin = useCallback(async (currentPin: string, newPin: string) => {
    const record = pinRecordRef.current ?? (await loadPinRecord());
    if (!record) return { ok: false as const, reason: 'No hay PIN configurado.' };
    const valid = await verifyPinAgainstRecord(currentPin, record, digestPinRecordInput, {
      allowLegacyLength: isLegacyPinRecord(record),
    });
    if (!valid) return { ok: false as const, reason: 'PIN actual incorrecto.' };
    if (!validatePinFormat(newPin)) return { ok: false as const, reason: 'El PIN nuevo debe tener 4 dígitos.' };
    const next = await createPinRecord(newPin);
    await savePinRecord(next);
    syncRecordMeta(next);
    return { ok: true as const };
  }, [syncRecordMeta]);

  const onUnlockSuccess = useCallback(async () => {
    const cleared = failuresAfterSuccess();
    await saveFailureState(cleared.failureCount, cleared.lastFailureAtMs);
    setFailureCount(0);
    setLastFailureAtMs(null);
    setIsUnlocked(true);
  }, []);

  const verifyStandardPin = useCallback(
    async (pin: string): Promise<PinVerifyResult> => {
      const gate = attemptGate(failureCount, lastFailureAtMs, Date.now());
      if (!gate.allowed) return 'locked';
      if (!validatePinFormat(pin)) return 'fail';
      const record = pinRecordRef.current ?? (await loadPinRecord());
      if (!record) return 'fail';
      const valid = await verifyPinAgainstRecord(pin, record, digestPinRecordInput);
      if (!valid) {
        await registerFailedAttempt();
        return 'fail';
      }
      if (isLegacyPinRecord(record)) {
        setPinMigrationRequired(true);
        return 'migrate';
      }
      await onUnlockSuccess();
      return 'unlocked';
    },
    [failureCount, lastFailureAtMs, onUnlockSuccess, registerFailedAttempt],
  );

  const verifyLegacyPin = useCallback(
    async (pin: string): Promise<PinVerifyResult> => {
      const gate = attemptGate(failureCount, lastFailureAtMs, Date.now());
      if (!gate.allowed) return 'locked';
      const record = pinRecordRef.current ?? (await loadPinRecord());
      if (!record) return 'fail';
      const valid = await verifyPinAgainstRecord(pin, record, digestPinRecordInput, { allowLegacyLength: true });
      if (!valid) {
        const maxLen = legacyEntryMaxLength(record);
        if (pin.length >= maxLen) await registerFailedAttempt();
        return 'fail';
      }
      setPinMigrationRequired(true);
      return 'migrate';
    },
    [failureCount, lastFailureAtMs],
  );

  const unlockWithBiometrics = useCallback(async () => {
    if (Platform.OS === 'web' || !biometricsEnabled || !biometricsAvailable) return false;
    const gate = attemptGate(failureCount, lastFailureAtMs, Date.now());
    if (!gate.allowed) return false;
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Desbloquear FinanceApp',
      cancelLabel: 'Usar PIN',
      disableDeviceFallback: true,
    });
    if (!result.success) return false;
    const record = pinRecordRef.current ?? (await loadPinRecord());
    if (record && isLegacyPinRecord(record)) {
      setPinMigrationRequired(true);
      return true;
    }
    await onUnlockSuccess();
    return true;
  }, [biometricsAvailable, biometricsEnabled, failureCount, lastFailureAtMs, onUnlockSuccess]);

  const lockNow = useCallback(() => {
    if (pinConfigured) setIsUnlocked(false);
  }, [pinConfigured]);

  const setBiometricsEnabledSetting = useCallback(async (enabled: boolean) => {
    await setBiometricsEnabled(enabled);
    setBiometricsEnabledState(enabled);
  }, []);

  const setLockTimeoutSetting = useCallback(async (ms: number) => {
    await saveLockTimeoutMs(ms);
    setLockTimeoutMsState(ms);
  }, []);

  const resetAppForgotPin = useCallback(async () => {
    await clearAllAppLockStorage();
    pinRecordRef.current = null;
    setPinConfigured(false);
    setHasLegacyPin(false);
    setPinMigrationRequired(false);
    setIsUnlocked(true);
    setFailureCount(0);
    setLastFailureAtMs(null);
    await onForgotPinReset();
  }, [onForgotPinReset]);

  const value = useMemo(
    () => ({
      ready,
      pinConfigured,
      isUnlocked,
      hasLegacyPin,
      pinMigrationRequired,
      biometricsEnabled,
      biometricsAvailable,
      lockTimeoutMs,
      failureCount,
      lockoutRemainingMs,
      attemptsRemaining,
      webStorageNotice: usesWebPinStorage() ? webPinStorageNotice() : null,
      legacyEntryMaxLength: legacyEntryMaxLen,
      setupPin,
      changePin,
      verifyStandardPin,
      verifyLegacyPin,
      unlockWithBiometrics,
      lockNow,
      setBiometricsEnabledSetting,
      setLockTimeoutSetting,
      resetAppForgotPin,
      refreshLockSettings,
    }),
    [
      ready,
      pinConfigured,
      isUnlocked,
      hasLegacyPin,
      pinMigrationRequired,
      biometricsEnabled,
      biometricsAvailable,
      lockTimeoutMs,
      failureCount,
      lockoutRemainingMs,
      attemptsRemaining,
      legacyEntryMaxLen,
      setupPin,
      changePin,
      verifyStandardPin,
      verifyLegacyPin,
      unlockWithBiometrics,
      lockNow,
      setBiometricsEnabledSetting,
      setLockTimeoutSetting,
      resetAppForgotPin,
      refreshLockSettings,
    ],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const ctx = useContext(AppLockContext);
  if (!ctx) throw new Error('useAppLock debe usarse dentro de AppLockProvider');
  return ctx;
}
