import { createHash } from 'crypto';

import {
  parsePinRecord,
  pinDigestInput,
  serializePinRecord,
  validatePinFormat,
  verifyPinAgainstRecord,
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
} from '../appLockPin';

function nodeDigest(input: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(input).digest('hex'));
}

describe('appLockPin', () => {
  it('valida longitud y dígitos', () => {
    expect(validatePinFormat('123')).toBe(false);
    expect(validatePinFormat('1234')).toBe(true);
    expect(validatePinFormat('123456')).toBe(true);
    expect(validatePinFormat('1234567')).toBe(false);
    expect(validatePinFormat('12a4')).toBe(false);
    expect(PIN_MIN_LENGTH).toBe(4);
    expect(PIN_MAX_LENGTH).toBe(6);
  });

  it('serializa y parsea registro sin texto plano', () => {
    const record = { version: 1 as const, salt: 'abc', hash: 'deadbeef' };
    const raw = serializePinRecord(record);
    expect(raw).not.toContain('1234');
    expect(parsePinRecord(raw)).toEqual(record);
    expect(parsePinRecord('not-json')).toBeNull();
  });

  it('verifica PIN con hash salado', async () => {
    const salt = 's1';
    const pin = '5678';
    const hash = await nodeDigest(pinDigestInput(salt, pin));
    const record = { version: 1 as const, salt, hash };
    await expect(verifyPinAgainstRecord(pin, record, nodeDigest)).resolves.toBe(true);
    await expect(verifyPinAgainstRecord('5679', record, nodeDigest)).resolves.toBe(false);
  });
});
