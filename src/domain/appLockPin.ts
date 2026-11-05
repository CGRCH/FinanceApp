export const PIN_LENGTH = 4;
export const LEGACY_PIN_MAX_LENGTH = 6;

/** @deprecated usar PIN_LENGTH */
export const PIN_MIN_LENGTH = PIN_LENGTH;
/** @deprecated solo PIN antiguo */
export const PIN_MAX_LENGTH = LEGACY_PIN_MAX_LENGTH;

export interface PinRecord {
  version: 1;
  salt: string;
  hash: string;
  /** Longitud del PIN al crear el hash; ausente = PIN antiguo (4–6). */
  pinLength?: number;
}

export function validatePinFormat(pin: string): boolean {
  return pin.length === PIN_LENGTH && /^\d+$/.test(pin);
}

export function validateLegacyPinFormat(pin: string): boolean {
  return pin.length >= PIN_LENGTH && pin.length <= LEGACY_PIN_MAX_LENGTH && /^\d+$/.test(pin);
}

export function isLegacyPinRecord(record: PinRecord): boolean {
  return record.pinLength == null || record.pinLength !== PIN_LENGTH;
}

export function legacyEntryMaxLength(record: PinRecord): number {
  if (record.pinLength != null && record.pinLength > PIN_LENGTH) {
    return record.pinLength;
  }
  return LEGACY_PIN_MAX_LENGTH;
}

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
    const pinLength =
      typeof parsed.pinLength === 'number' && parsed.pinLength >= PIN_LENGTH && parsed.pinLength <= LEGACY_PIN_MAX_LENGTH
        ? parsed.pinLength
        : undefined;
    return { version: 1, salt: parsed.salt, hash: parsed.hash, pinLength };
  } catch {
    return null;
  }
}

export async function verifyPinAgainstRecord(
  pin: string,
  record: PinRecord,
  digest: (input: string) => Promise<string>,
  options?: { allowLegacyLength?: boolean },
): Promise<boolean> {
  const okFormat = options?.allowLegacyLength ? validateLegacyPinFormat(pin) : validatePinFormat(pin);
  if (!okFormat) return false;
  const computed = await digest(pinDigestInput(record.salt, pin));
  return computed === record.hash;
}
