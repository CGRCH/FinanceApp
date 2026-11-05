import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { DEFAULT_LOCK_TIMEOUT_MS, normalizeLockTimeoutMs } from '@/src/domain/appLockTiming';
import { parsePinRecord, type PinRecord } from '@/src/domain/appLockPin';

const NATIVE_KEYS = {
  pinRecord: 'financeapp_app_lock_pin',
  biometrics: 'financeapp_app_lock_biometrics',
  timeoutMs: 'financeapp_app_lock_timeout_ms',
  failureCount: 'financeapp_app_lock_fail_count',
  lastFailureAt: 'financeapp_app_lock_last_fail_at',
} as const;

const WEB_PREFIX = 'financeapp_app_lock_';

const WEB_KEYS = {
  pinRecord: `${WEB_PREFIX}pin`,
  biometrics: `${WEB_PREFIX}biometrics`,
  timeoutMs: `${WEB_PREFIX}timeout_ms`,
  failureCount: `${WEB_PREFIX}fail_count`,
  lastFailureAt: `${WEB_PREFIX}last_fail_at`,
} as const;

export function usesWebPinStorage(): boolean {
  return Platform.OS === 'web';
}

export function webPinStorageNotice(): string {
  return 'En la versión web el PIN se guarda en el almacenamiento local del navegador (menos seguro que el llavero del dispositivo). No compartas este equipo.';
}

async function secureGet(which: keyof typeof NATIVE_KEYS): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(WEB_KEYS[which]) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(NATIVE_KEYS[which]);
  } catch {
    return null;
  }
}

async function secureSet(which: keyof typeof NATIVE_KEYS, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(WEB_KEYS[which], value);
    return;
  }
  await SecureStore.setItemAsync(NATIVE_KEYS[which], value);
}

async function secureDelete(which: keyof typeof NATIVE_KEYS): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(WEB_KEYS[which]);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(NATIVE_KEYS[which]);
  } catch {
    /* noop */
  }
}

export async function loadPinRecord(): Promise<PinRecord | null> {
  return parsePinRecord(await secureGet('pinRecord'));
}

export async function savePinRecord(record: PinRecord): Promise<void> {
  await secureSet('pinRecord', JSON.stringify(record));
}

export async function clearPinRecord(): Promise<void> {
  await secureDelete('pinRecord');
}

export async function isBiometricsEnabled(): Promise<boolean> {
  return (await secureGet('biometrics')) === '1';
}

export async function setBiometricsEnabled(enabled: boolean): Promise<void> {
  await secureSet('biometrics', enabled ? '1' : '0');
}

export async function loadLockTimeoutMs(): Promise<number> {
  const raw = await secureGet('timeoutMs');
  if (raw == null) return DEFAULT_LOCK_TIMEOUT_MS;
  return normalizeLockTimeoutMs(Number.parseInt(raw, 10));
}

export async function saveLockTimeoutMs(ms: number): Promise<void> {
  await secureSet('timeoutMs', String(normalizeLockTimeoutMs(ms)));
}

export async function loadFailureState(): Promise<{ failureCount: number; lastFailureAtMs: number | null }> {
  const countRaw = await secureGet('failureCount');
  const atRaw = await secureGet('lastFailureAt');
  const failureCount = countRaw ? Math.max(0, Number.parseInt(countRaw, 10) || 0) : 0;
  const lastFailureAtMs = atRaw ? Number.parseInt(atRaw, 10) || null : null;
  return { failureCount, lastFailureAtMs };
}

export async function saveFailureState(failureCount: number, lastFailureAtMs: number | null): Promise<void> {
  await secureSet('failureCount', String(failureCount));
  if (lastFailureAtMs != null) await secureSet('lastFailureAt', String(lastFailureAtMs));
  else await secureDelete('lastFailureAt');
}

export async function clearAllAppLockStorage(): Promise<void> {
  await Promise.all([
    clearPinRecord(),
    secureDelete('biometrics'),
    secureDelete('timeoutMs'),
    secureDelete('failureCount'),
    secureDelete('lastFailureAt'),
  ]);
}
