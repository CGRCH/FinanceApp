import { LEGACY_PIN_MAX_LENGTH, PIN_LENGTH } from './appLockPin';

export type PinEntryMode = 'standard' | 'legacy';

export function appendPinDigit(current: string, digit: string, maxLength: number): string {
  if (!/^\d$/.test(digit)) return current;
  if (current.length >= maxLength) return current;
  return current + digit;
}

export function backspacePinDigit(current: string): string {
  return current.slice(0, -1);
}

export function mergePinInput(current: string, next: string, maxLength: number): string {
  const digits = next.replace(/\D/g, '').slice(0, maxLength);
  return digits;
}

/** Envío automático al completar la longitud objetivo (PIN de 4 dígitos). */
export function shouldAutoSubmitStandard(pin: string): boolean {
  return pin.length === PIN_LENGTH;
}

/** En legacy, probar verificación al llegar a 4…maxLength sin borrar antes. */
export function shouldTryLegacyVerify(pin: string, maxLength: number): boolean {
  return pin.length >= PIN_LENGTH && pin.length <= maxLength;
}

/** Tras verificación fallida, ¿borrar dígitos y contar intento? */
export function shouldClearPinAfterFailedVerify(
  mode: PinEntryMode,
  pinLength: number,
  maxLength: number,
): boolean {
  if (mode === 'standard') return pinLength === PIN_LENGTH;
  return pinLength >= maxLength;
}

/** ¿Seguir esperando más dígitos tras fallo en legacy? */
export function legacyKeepDigitsAfterFailedVerify(pinLength: number, maxLength: number): boolean {
  return pinLength < maxLength;
}

export function displayDotCount(mode: PinEntryMode, maxLength: number): number {
  return mode === 'standard' ? PIN_LENGTH : maxLength;
}

export { LEGACY_PIN_MAX_LENGTH, PIN_LENGTH };
