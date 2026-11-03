import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PinEntry, usePinEntryClear } from '@/src/components/security/PinEntry';
import { BodyText, Card } from '@/src/components/ui/Primitives';
import { attemptsRemainingBeforeDelay } from '@/src/domain/appLockAttempts';
import { shouldClearPinAfterFailedVerify } from '@/src/domain/pinEntry';
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
    verifyStandardPin,
    verifyLegacyPin,
    unlockWithBiometrics,
    biometricsEnabled,
    biometricsAvailable,
    lockoutRemainingMs,
    resetAppForgotPin,
    hasLegacyPin,
    legacyEntryMaxLength,
    failureCount,
  } = useAppLock();
  const [legacyMode, setLegacyMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotStep, setForgotStep] = useState<0 | 1 | 2>(0);
  const { resetToken, clearPin } = usePinEntryClear();

  const lockedOut = lockoutRemainingMs > 0;

  useEffect(() => {
    if (!biometricsEnabled || !biometricsAvailable || lockedOut || legacyMode) return;
    void unlockWithBiometrics();
  }, [biometricsAvailable, biometricsEnabled, lockedOut, legacyMode, unlockWithBiometrics]);

  const failMessage = (remaining: number) =>
    remaining > 0
      ? `PIN incorrecto. Te quedan ${remaining} intento${remaining === 1 ? '' : 's'} antes de la demora.`
      : 'PIN incorrecto.';

  const handleStandardSubmit = async (pin: string) => {
    const result = await verifyStandardPin(pin);
    if (result === 'unlocked' || result === 'migrate') {
      setError(null);
      return;
    }
    if (result === 'locked') return;
    setError(failMessage(attemptsRemainingBeforeDelay(failureCount + 1)));
    clearPin();
  };

  const handleLegacySubmit = async (pin: string) => {
    const result = await verifyLegacyPin(pin);
    if (result === 'migrate') {
      setError(null);
      return;
    }
    if (result === 'locked') return;
    if (shouldClearPinAfterFailedVerify('legacy', pin.length, legacyEntryMaxLength)) {
      setError(failMessage(attemptsRemainingBeforeDelay(failureCount + 1)));
      clearPin();
    }
  };

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
        <BodyText muted>
          {legacyMode
            ? 'Ingresa tu PIN antiguo (4 a 6 dígitos). Luego crearás uno nuevo de 4 dígitos.'
            : 'Ingresa tu PIN de 4 dígitos. Tus datos siguen solo en este dispositivo.'}
        </BodyText>

        {lockedOut ? (
          <Card>
            <BodyText>
              Demasiados intentos fallidos. Espera {formatWait(lockoutRemainingMs)} antes de volver a intentar.
            </BodyText>
          </Card>
        ) : (
          <>
            {error ? <Text style={{ color: colors.danger, fontWeight: '600' }}>{error}</Text> : null}
            <PinEntry
              mode={legacyMode ? 'legacy' : 'standard'}
              maxLength={legacyMode ? legacyEntryMaxLength : undefined}
              disabled={lockedOut}
              resetToken={resetToken}
              errorMessage={error}
              onSubmitPin={legacyMode ? handleLegacySubmit : handleStandardSubmit}
              onAutoSubmit={legacyMode ? handleLegacySubmit : handleStandardSubmit}
            />
            {hasLegacyPin && !legacyMode ? (
              <Pressable accessibilityRole="button" onPress={() => setLegacyMode(true)} style={styles.forgot}>
                <Text style={{ color: colors.primary, fontWeight: '700' }}>Usar PIN antiguo</Text>
              </Pressable>
            ) : null}
            {legacyMode ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setLegacyMode(false);
                  setError(null);
                  clearPin();
                }}
                style={styles.forgot}>
                <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>Volver al PIN de 4 dígitos</Text>
              </Pressable>
            ) : null}
            {biometricsAvailable && biometricsEnabled && !legacyMode ? (
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
