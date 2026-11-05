import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';

import { createFictionalFixtureWorkbook, parseGestiónWorkbook } from '@/src/domain/xlsxGestión';
import type { GestiónImportResult } from '@/src/domain/xlsxGestión';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export async function pickAndParseWorkbook(): Promise<GestiónImportResult> {
  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]?.uri) {
    throw new Error('Importación cancelada');
  }
  const base64 = await FileSystem.readAsStringAsync(result.assets[0].uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return parseGestiónWorkbook(binary.buffer);
}

export async function exportDemoWorkbook(): Promise<void> {
  const buffer = createFictionalFixtureWorkbook();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
  const path = `${FileSystem.cacheDirectory}financeapp-export-${Date.now()}.xlsx`;
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Exportar gestión',
    });
  }
}

export async function ensureNotificationPermissions(): Promise<boolean> {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

export async function scheduleShortfallReminder(message: string): Promise<void> {
  const granted = await ensureNotificationPermissions();
  if (!granted) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  const trigger = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'FinanceApp',
      body: message,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: trigger,
    },
  });
}
