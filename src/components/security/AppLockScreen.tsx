import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PinKeypad } from '@/src/components/security/PinKeypad';
import { BodyText, Card } from '@/src/components/ui/Primitives';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '@/src/domain/appLockPin';
import { useAppLock } from '@/src/context/AppLockContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

function formatWait(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) return `${sec} s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest > 0 ? `${min} min ${rest} s` : `${min} min`;
}

export function AppLockScreen() {
  const colors = useThemeColors();
  const {
    verifyAndUnlock,
    unlockWithBiometrics,
    biometricsEnabled,
    biometricsAvailable,
    lockoutRemainingMs,
    resetAppForgotPin,
  } = useAppLock();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forgotStep, setForgotStep] = useState<0 | 1 | 2>(0);

  const lockedOut = lockoutRemainingMs > 0;

  useEffect(() => {
    if (!biometricsEnabled || !biometricsAvailable || lockedOut) return;
    void unlockWithBiometrics();
  }, [biometricsAvailable, biometricsEnabled, lockedOut, unlockWithBiometrics]);

  useEffect(() => {
    if (pin.length < PIN_MIN_LENGTH || lockedOut) return;
    const timer = setTimeout(() => {
      void (async () => {
        const ok = await verifyAndUnlock(pin);
        if (ok) {
          setPin('');
          setError(null);
        } else {
          setError('PIN incorrecto');
          setPin('');
        }
      })();
    }, 450);
    return () => clearTimeout(timer);
  }, [pin, verifyAndUnlock, lockedOut]);

  const onForgot = () => setForgotStep(1);

  const confirmForgot = async () => {
    if (forgotStep === 1) {
      setForgotStep(2);
      return;
    }
    await resetAppForgotPin();
    setForgotStep(0);
  };

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen">
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>FinanceApp bloqueada</Text>
        <BodyText muted>Ingresa tu PIN para continuar. Tus datos siguen solo en este dispositivo.</BodyText>

        {lockedOut ? (
          <Card>
            <BodyText>
              Demasiados intentos fallidos. Espera {formatWait(lockoutRemainingMs)} antes de volver a intentar.
            </BodyText>
          </Card>
        ) : (
          <>
            {error ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text> : null}
            <PinKeypad value={pin} maxLength={PIN_MAX_LENGTH} onChange={setPin} disabled={lockedOut} />
            {biometricsAvailable && biometricsEnabled ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => void unlockWithBiometrics()}
                style={[styles.bioBtn, { borderColor: colors.primary }]}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Usar huella / Face ID</Text>
              </Pressable>
            ) : null}
          </>
        )}

        <Pressable accessibilityRole="button" onPress={onForgot} style={styles.forgot}>
          <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Olvidé mi PIN</Text>
        </Pressable>

        {forgotStep > 0 ? (
          <Card style={{ borderColor: colors.danger }}>
            <BodyText>
              {forgotStep === 1
                ? 'Sin tu PIN no podemos recuperar tus datos. La única opción es restablecer la aplicación, lo que borra toda la información local (planilla, deudas, ajustes).'
                : '¿Confirmas el restablecimiento? Esta acción no se puede deshacer.'}
            </BodyText>
            <Pressable
              accessibilityRole="button"
              onPress={() => void confirmForgot()}
              style={[styles.dangerBtn, { backgroundColor: colors.danger }]}>
              <Text style={styles.dangerBtnText}>{forgotStep === 1 ? 'Continuar' : 'Borrar todo y reiniciar'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setForgotStep(0)}>
              <Text style={{ color: colors.textSecondary, fontWeight: '600', marginTop: spacing.sm }}>Cancelar</Text>
            </Pressable>
          </Card>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  bioBtn: {
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  forgot: { alignItems: 'center', marginTop: spacing.md },
  dangerBtn: { borderRadius: 12, paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
  dangerBtnText: { color: '#fff', fontWeight: '800' },
});
