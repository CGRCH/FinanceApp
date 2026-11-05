import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import type { AiAdviceProvider } from '@/src/domain/aiAdviceClient';
import { DEFAULT_AI_MODELS, DEFAULT_AI_PROVIDER } from '@/src/domain/aiAdviceClient';
import { getSetting, setSetting } from '@/src/db/repository';
import type { SQLiteDatabase } from 'expo-sqlite';

const API_KEY_SECURE = 'financeapp_ai_advice_api_key';
const WEB_STORAGE_KEY = 'financeapp_ai_advice_api_key';

export const AI_SETTING_KEYS = {
  provider: 'ai_advice_provider',
  model: 'ai_advice_model',
  customBaseUrl: 'ai_advice_custom_base_url',
  skipPreview: 'ai_advice_skip_preview',
} as const;

export interface AiAdviceSettings {
  provider: AiAdviceProvider;
  model: string;
  customBaseUrl: string;
  skipPreview: boolean;
}

export function isAiKeyStoredOnWeb(): boolean {
  return Platform.OS === 'web';
}

export async function getAiAdviceApiKey(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(WEB_STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(API_KEY_SECURE);
  } catch {
    return null;
  }
}

export async function setAiAdviceApiKey(value: string): Promise<void> {
  const trimmed = value.trim();
  if (Platform.OS === 'web') {
    if (trimmed) globalThis.localStorage?.setItem(WEB_STORAGE_KEY, trimmed);
    else globalThis.localStorage?.removeItem(WEB_STORAGE_KEY);
    return;
  }
  if (trimmed) await SecureStore.setItemAsync(API_KEY_SECURE, trimmed);
  else await SecureStore.deleteItemAsync(API_KEY_SECURE);
}

export async function loadAiAdviceSettings(db: SQLiteDatabase): Promise<AiAdviceSettings> {
  const providerRaw = await getSetting(db, AI_SETTING_KEYS.provider);
  const valid: AiAdviceProvider[] = ['gemini', 'groq', 'openai', 'grok', 'custom'];
  const provider: AiAdviceProvider = valid.includes(providerRaw as AiAdviceProvider)
    ? (providerRaw as AiAdviceProvider)
    : DEFAULT_AI_PROVIDER;
  const model = (await getSetting(db, AI_SETTING_KEYS.model)) ?? DEFAULT_AI_MODELS[provider];
  const customBaseUrl = (await getSetting(db, AI_SETTING_KEYS.customBaseUrl)) ?? '';
  const skipPreview = (await getSetting(db, AI_SETTING_KEYS.skipPreview)) === '1';
  return { provider, model, customBaseUrl, skipPreview };
}

export async function saveAiAdviceSettings(
  db: SQLiteDatabase,
  settings: Omit<AiAdviceSettings, 'skipPreview'> & { skipPreview?: boolean },
): Promise<void> {
  await setSetting(db, AI_SETTING_KEYS.provider, settings.provider);
  await setSetting(db, AI_SETTING_KEYS.model, settings.model.trim() || DEFAULT_AI_MODELS[settings.provider]);
  await setSetting(db, AI_SETTING_KEYS.customBaseUrl, settings.customBaseUrl.trim());
  if (settings.skipPreview != null) {
    await setSetting(db, AI_SETTING_KEYS.skipPreview, settings.skipPreview ? '1' : '0');
  }
}

export async function setAiAdviceSkipPreview(db: SQLiteDatabase, skip: boolean): Promise<void> {
  await setSetting(db, AI_SETTING_KEYS.skipPreview, skip ? '1' : '0');
}
