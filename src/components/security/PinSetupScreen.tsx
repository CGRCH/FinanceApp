import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PinKeypad } from '@/src/components/security/PinKeypad';
import { BodyText } from '@/src/components/ui/Primitives';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/src/domain/appLockPin';
import { useAppLock } from '@/src/context/AppLockContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';

type Step = 'create' | 'confirm';

export function PinSetupScreen() {
  const colors = useThemeColors();
  const { setupPin, webStorageNotice } = useAppLock();
  const [step, setStep] = useState<Step>('create');
  const [firstPin, setFirstPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const onConfirmChange = async (value: string) => {
    setError(null);
    setConfirmPin(value);
    if (value.length !== firstPin.length) return;
    if (value !== firstPin) {
      setError('Los PIN no coinciden. Vuelve a intentarlo.');
      setStep('create');
      setFirstPin('');
      setConfirmPin('');
      return;
    }
    try {
      await setupPin(value);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el PIN');
      setStep('create');
      setFirstPin('');
      setConfirmPin('');
    }
  };

  const activePin = step === 'create' ? firstPin : confirmPin;
  const onChange =
    step === 'create'
      ? (value: string) => {
          setError(null);
          setFirstPin(value);
        }
      : onConfirmChange;

  const canContinue = step === 'create' && firstPin.length >= PIN_MIN_LENGTH;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>Crea tu PIN</Text>
        <BodyText muted>
          Elige un PIN de 4 a 6 dígitos. Solo se guarda un hash con sal en este dispositivo; nunca almacenamos el PIN
          en texto plano.
        </BodyText>
        {webStorageNotice ? <BodyText muted>{webStorageNotice}</BodyText> : null}
        <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>
          {step === 'create' ? 'Ingresa tu PIN' : 'Confirma tu PIN'}
        </Text>
        {error ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text> : null}
        <PinKeypad value={activePin} maxLength={PIN_MAX_LENGTH} onChange={onChange} />
        {step === 'create' && canContinue ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setConfirmPin('');
              setStep('confirm');
            }}
            style={[styles.continueBtn, { backgroundColor: colors.primary }]}>
            <Text style={styles.continueText}>Continuar</Text>
          </Pressable>
        ) : null}
        {step === 'confirm' ? (
          <BodyText muted>Debe coincidir ({firstPin.length} dígitos).</BodyText>
        ) : (
          <BodyText muted>Puedes usar entre {PIN_MIN_LENGTH} y {PIN_MAX_LENGTH} dígitos.</BodyText>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  stepLabel: { textAlign: 'center', fontWeight: '600', marginTop: spacing.sm },
  continueBtn: { borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  continueText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
