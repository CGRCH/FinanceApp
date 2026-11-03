import { Alert, Platform } from 'react-native';

/** Confirmación que funciona en web (Alert con botones no dispara onPress en react-native-web). */
export function confirmAsync(
  title: string,
  message: string,
  confirmLabel = 'Eliminar',
): Promise<boolean> {
  if (Platform.OS === 'web' && typeof globalThis.confirm === 'function') {
    return Promise.resolve(globalThis.confirm(`${title}\n\n${message}`));
  }

  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
