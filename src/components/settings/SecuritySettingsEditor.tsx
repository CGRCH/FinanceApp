import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { PinEntry, usePinEntryClear } from '@/src/components/security/PinEntry';
import { BodyText } from '@/src/components/ui/Primitives';
import { LOCK_TIMEOUT_OPTIONS_MS } from '@/src/domain/appLockTiming';
import { useAppLock } from '@/src/context/AppLockContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

type ChangePhase = 'idle' | 'current' | 'new' | 'confirmNew';

export function SecuritySettingsEditor() {
  const colors = useThemeColors();
  const {
    biometricsEnabled,
    biometricsAvailable,
    lockTimeoutMs,
    setBiometricsEnabledSetting,
    setLockTimeoutSetting,
    changePin,
    webStorageNotice,
    lockNow,
  } = useAppLock();

  const [changePhase, setChangePhase] = useState<ChangePhase>('idle');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { resetToken, clearPin } = usePinEntryClear();

  const resetChange = () => {
    setChangePhase('idle');
    setCurrentPin('');
    setNewPin('');
    setError(null);
    clearPin();
  };

  const handlePinSubmit = async (pin: string) => {
    setError(null);
    if (changePhase === 'current') {
      setCurrentPin(pin);
      setChangePhase('new');
      clearPin();
      return;
    }
    if (changePhase === 'new') {
      setNewPin(pin);
      setChangePhase('confirmNew');
      clearPin();
      return;
    }
    if (changePhase === 'confirmNew') {
      if (pin !== newPin) {
        setError('Los PIN nuevos no coinciden.');
        resetChange();
        return;
      }
      const result = await changePin(currentPin, pin);
      if (!result.ok) {
        setError(result.reason);
        clearPin();
        setChangePhase('current');
        setCurrentPin('');
        setNewPin('');
        return;
      }
      Alert.alert('Listo', 'Tu PIN se actualizó correctamente.');
      resetChange();
    }
  };

  return (
    <View style={styles.wrap}>
      {webStorageNotice ? <BodyText muted>{webStorageNotice}</BodyText> : null}

      <BodyText muted>Bloqueo automático al volver a la app tras el tiempo de inactividad en segundo plano.</BodyText>
      <View style={styles.chips}>
        {LOCK_TIMEOUT_OPTIONS_MS.map((opt) => {
          const selected = lockTimeoutMs === opt.ms;
          return (
            <Pressable
              key={opt.ms}
              accessibilityRole="button"
              onPress={() => void setLockTimeoutSetting(opt.ms)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primarySoft : colors.surfaceMuted,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}>
              <Text style={{ color: colors.text, fontWeight: selected ? '700' : '500' }}>{opt.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {biometricsAvailable ? (
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: biometricsEnabled }}
          onPress={() => void setBiometricsEnabledSetting(!biometricsEnabled)}
          style={[styles.row, { borderColor: colors.border }]}>
          <Text style={{ color: colors.text, flex: 1, fontWeight: '600' }}>Desbloqueo con huella / Face ID</Text>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>{biometricsEnabled ? 'Sí' : 'No'}</Text>
        </Pressable>
      ) : (
        <BodyText muted>
          {webStorageNotice
            ? 'En web no hay biometría; usa tu PIN.'
            : 'Biometría no disponible en este dispositivo.'}
        </BodyText>
      )}

      {changePhase === 'idle' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setChangePhase('current')}
          style={[styles.btn, { backgroundColor: colors.primarySoft, borderColor: colors.primary }]}>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Cambiar PIN</Text>
        </Pressable>
      ) : (
        <View style={styles.changeBox}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>
            {changePhase === 'current'
              ? 'Ingresa tu PIN actual'
              : changePhase === 'new'
                ? 'Ingresa tu PIN nuevo (4 dígitos)'
                : 'Confirma el PIN nuevo'}
          </Text>
          {error ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text> : null}
          <PinEntry
            key={changePhase}
            resetToken={resetToken}
            errorMessage={error}
            onAutoSubmit={handlePinSubmit}
            onSubmitPin={handlePinSubmit}
          />
          <Pressable accessibilityRole="button" onPress={resetChange}>
            <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Cancelar</Text>
          </Pressable>
        </View>
      )}

      <Pressable accessibilityRole="button" onPress={lockNow} style={styles.ghost}>
        <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Bloquear ahora</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: spacing.sm,
  },
  btn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  changeBox: { gap: spacing.sm, alignItems: 'center' },
  ghost: { alignItems: 'center', paddingVertical: spacing.sm },
});
