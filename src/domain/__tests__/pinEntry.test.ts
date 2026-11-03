import {
  appendPinDigit,
  backspacePinDigit,
  legacyKeepDigitsAfterFailedVerify,
  shouldAutoSubmitStandard,
  shouldClearPinAfterFailedVerify,
  shouldTryLegacyVerify,
  type PinEntryMode,
} from '../pinEntry';
import { PIN_LENGTH } from '../appLockPin';

describe('pinEntry state machine', () => {
  it('no borra al escribir menos de 4 dígitos', () => {
    let pin = '';
    pin = appendPinDigit(pin, '1', PIN_LENGTH);
    pin = appendPinDigit(pin, '2', PIN_LENGTH);
    pin = appendPinDigit(pin, '3', PIN_LENGTH);
    expect(pin).toBe('123');
    expect(shouldAutoSubmitStandard(pin)).toBe(false);
  });

  it('auto-envía al 4.º dígito en modo estándar', () => {
    let pin = '';
    for (const d of '1234') pin = appendPinDigit(pin, d, PIN_LENGTH);
    expect(shouldAutoSubmitStandard(pin)).toBe(true);
    expect(shouldClearPinAfterFailedVerify('standard', pin.length, PIN_LENGTH)).toBe(true);
  });

  it('no auto-envía antes del 4.º dígito', () => {
    expect(shouldAutoSubmitStandard('123')).toBe(false);
  });

  it('legacy mantiene dígitos tras fallo antes del máximo', () => {
    expect(legacyKeepDigitsAfterFailedVerify(4, 6)).toBe(true);
    expect(shouldClearPinAfterFailedVerify('legacy', 4, 6)).toBe(false);
    expect(shouldClearPinAfterFailedVerify('legacy', 6, 6)).toBe(true);
  });

  it('legacy intenta verificar entre 4 y maxLength', () => {
    expect(shouldTryLegacyVerify('1234', 6)).toBe(true);
    expect(shouldTryLegacyVerify('123', 6)).toBe(false);
    expect(shouldTryLegacyVerify('123456', 6)).toBe(true);
  });

  it('backspace no dispara envío', () => {
    let pin = '1234';
    pin = backspacePinDigit(pin);
    expect(pin).toBe('123');
    expect(shouldAutoSubmitStandard(pin)).toBe(false);
  });
});
