import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';

import { PinEntry, usePinEntryClear } from '@/src/components/security/PinEntry';
import { BodyText } from '@/src/components/ui/Primitives';
import { useAppLock } from '@/src/context/AppLockContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

type Step = 'create' | 'confirm';

interface Props {
  /** Tras verificar un PIN antiguo, obliga a definir uno de 4 dígitos. */
  migration?: boolean;
}

export function PinSetupScreen({ migration = false }: Props) {
  const colors = useThemeColors();
  const { setupPin, webStorageNotice } = useAppLock();
  const [step, setStep] = useState<Step>('create');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { resetToken, clearPin } = usePinEntryClear();

  const handleCreate = (pin: string) => {
    setError(null);
    setFirstPin(pin);
    setStep('confirm');
    clearPin();
  };

  const handleConfirm = async (pin: string) => {
    if (pin !== firstPin) {
      setError('Los PIN no coinciden. Vuelve a intentarlo.');
      setStep('create');
      setFirstPin('');
      clearPin();
      return;
    }
    try {
      await setupPin(pin);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el PIN');
      setStep('create');
      setFirstPin('');
      clearPin();
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          {migration ? 'Actualiza tu PIN a 4 dígitos' : 'Crea tu PIN'}
        </Text>
        <BodyText muted>
          {migration
            ? 'Por seguridad, el PIN pasa a ser de 4 dígitos. Elige uno nuevo y confírmalo.'
            : 'Elige un PIN de 4 dígitos. Solo se guarda un hash con sal en este dispositivo; nunca almacenamos el PIN en texto plano.'}
        </BodyText>
        {webStorageNotice ? <BodyText muted>{webStorageNotice}</BodyText> : null}
        <Text style={[styles.stepLabel, { color: colors.textSecondary }]}>
          {step === 'create' ? 'Ingresa tu PIN' : 'Confirma tu PIN'}
        </Text>
        {error ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text> : null}
        <PinEntry
          key={step}
          resetToken={resetToken}
          errorMessage={error}
          onAutoSubmit={step === 'create' ? handleCreate : handleConfirm}
          onSubmitPin={step === 'create' ? handleCreate : handleConfirm}
          disabled={false}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  stepLabel: { textAlign: 'center', fontWeight: '600', marginTop: spacing.sm },
});
