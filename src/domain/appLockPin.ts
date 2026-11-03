export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export interface PinRecord {
  version: 1;
  salt: string;
  hash: string;
}

export function validatePinFormat(pin: string): boolean {
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) return false;
  return /^\d+$/.test(pin);
}

/** Entrada determinista para SHA-256 (salt nunca se reutiliza sin nuevo hash). */
export function pinDigestInput(salt: string, pin: string): string {
  return `${salt}:${pin}`;
}

export function serializePinRecord(record: PinRecord): string {
  return JSON.stringify(record);
}

export function parsePinRecord(raw: string | null): PinRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PinRecord>;
    if (parsed.version !== 1 || typeof parsed.salt !== 'string' || typeof parsed.hash !== 'string') {
      return null;
    }
    if (!parsed.salt || !parsed.hash) return null;
    return { version: 1, salt: parsed.salt, hash: parsed.hash };
  } catch {
    return null;
  }
}

export async function verifyPinAgainstRecord(
  pin: string,
  record: PinRecord,
  digest: (input: string) => Promise<string>,
): Promise<boolean> {
  if (!validatePinFormat(pin)) return false;
  const computed = await digest(pinDigestInput(record.salt, pin));
  return computed === record.hash;
}
