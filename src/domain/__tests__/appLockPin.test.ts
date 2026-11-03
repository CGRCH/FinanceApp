import { createHash } from 'crypto';

import {
  isLegacyPinRecord,
  parsePinRecord,
  pinDigestInput,
  serializePinRecord,
  validatePinFormat,
  validateLegacyPinFormat,
  verifyPinAgainstRecord,
  PIN_LENGTH,
} from '../appLockPin';

function nodeDigest(input: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(input).digest('hex'));
}

describe('appLockPin', () => {
  it('valida exactamente 4 dígitos', () => {
    expect(validatePinFormat('123')).toBe(false);
    expect(validatePinFormat('1234')).toBe(true);
    expect(validatePinFormat('12345')).toBe(false);
    expect(validatePinFormat('12a4')).toBe(false);
    expect(PIN_LENGTH).toBe(4);
    expect(validateLegacyPinFormat('123456')).toBe(true);
  });

  it('serializa y parsea registro con pinLength', () => {
    const record = { version: 1 as const, salt: 'abc', hash: 'deadbeef', pinLength: 4 };
    const raw = serializePinRecord(record);
    expect(raw).not.toContain('1234');
    expect(parsePinRecord(raw)).toEqual(record);
    expect(parsePinRecord('not-json')).toBeNull();
    expect(isLegacyPinRecord({ version: 1, salt: 'a', hash: 'b' })).toBe(true);
    expect(isLegacyPinRecord({ version: 1, salt: 'a', hash: 'b', pinLength: 4 })).toBe(false);
  });

  it('verifica PIN con hash salado', async () => {
    const salt = 's1';
    const pin = '5678';
    const hash = await nodeDigest(pinDigestInput(salt, pin));
    const record = { version: 1 as const, salt, hash, pinLength: 4 };
    await expect(verifyPinAgainstRecord(pin, record, nodeDigest)).resolves.toBe(true);
    await expect(verifyPinAgainstRecord('5679', record, nodeDigest)).resolves.toBe(false);
  });
});
