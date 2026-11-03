import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, TextInput, View } from 'react-native';

import { PinKeypad } from '@/src/components/security/PinKeypad';
import {
  appendPinDigit,
  backspacePinDigit,
  displayDotCount,
  mergePinInput,
  shouldAutoSubmitStandard,
  shouldTryLegacyVerify,
  type PinEntryMode,
} from '@/src/domain/pinEntry';
import { PIN_LENGTH } from '@/src/domain/appLockPin';

interface Props {
  mode?: PinEntryMode;
  maxLength?: number;
  disabled?: boolean;
  /** Se llama al completar 4 dígitos (estándar) o en cada longitud legacy según el padre. */
  onSubmitPin: (pin: string) => void | Promise<void>;
  /** Cuando el PIN alcanza longitud de envío automático (4 en estándar). */
  onAutoSubmit?: (pin: string) => void | Promise<void>;
  errorMessage?: string | null;
  resetToken?: number;
}

export function PinEntry({
  mode = 'standard',
  maxLength: maxLengthProp,
  disabled,
  onSubmitPin,
  onAutoSubmit,
  errorMessage,
  resetToken = 0,
}: Props) {
  const maxLength = maxLengthProp ?? (mode === 'standard' ? PIN_LENGTH : 6);
  const dots = displayDotCount(mode, maxLength);
  const [pin, setPin] = useState('');
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setPin('');
  }, [resetToken]);

  useEffect(() => {
    if (!errorMessage) return;
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 50, useNativeDriver: true }),
    ]).start();
  }, [errorMessage, shake]);

  const runAutoSubmit = useCallback(
    async (value: string) => {
      const handler = onAutoSubmit ?? onSubmitPin;
      await handler(value);
    },
    [onAutoSubmit, onSubmitPin],
  );

  const applyPin = useCallback(
    (next: string) => {
      setPin(next);
      if (mode === 'standard' && shouldAutoSubmitStandard(next)) {
        void runAutoSubmit(next);
      } else if (mode === 'legacy' && shouldTryLegacyVerify(next, maxLength)) {
        void onSubmitPin(next);
      }
    },
    [mode, maxLength, onSubmitPin, runAutoSubmit],
  );

  const onDigit = (digit: string) => {
    if (disabled) return;
    applyPin(appendPinDigit(pin, digit, maxLength));
  };

  const onBackspace = () => {
    if (disabled) return;
    setPin(backspacePinDigit(pin));
  };

  const onKeyboardChange = (text: string) => {
    if (disabled) return;
    const next = mergePinInput(pin, text, maxLength);
    applyPin(next);
  };

  return (
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      <TextInput
        value={pin}
        onChangeText={onKeyboardChange}
        keyboardType="number-pad"
        maxLength={maxLength}
        secureTextEntry
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'web' ? 'off' : 'one-time-code'}
        accessibilityLabel="Campo de PIN"
        style={styles.hiddenInput}
        editable={!disabled}
      />
      <PinKeypad
        value={pin}
        dotCount={dots}
        maxLength={maxLength}
        onDigit={onDigit}
        onBackspace={onBackspace}
        disabled={disabled}
      />
    </Animated.View>
  );
}

/** Llamar desde el padre tras fallo de verificación para vaciar el teclado. */
export function usePinEntryClear() {
  const [resetToken, setResetToken] = useState(0);
  const clearPin = useCallback(() => setResetToken((n) => n + 1), []);
  return { resetToken, clearPin };
}

const styles = StyleSheet.create({
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
});
