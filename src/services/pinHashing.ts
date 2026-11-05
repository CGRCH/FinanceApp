import * as Crypto from 'expo-crypto';

import { pinDigestInput, type PinRecord, serializePinRecord } from '@/src/domain/appLockPin';

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateSaltHex(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return bytesToHex(bytes);
}

async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

export async function hashPinWithSalt(pin: string, salt: string): Promise<string> {
  return sha256Hex(pinDigestInput(salt, pin));
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  const salt = await generateSaltHex();
  const hash = await hashPinWithSalt(pin, salt);
  return { version: 1, salt, hash, pinLength: pin.length };
}

export async function digestPinRecordInput(input: string): Promise<string> {
  return sha256Hex(input);
}

export function pinRecordToStorage(record: PinRecord): string {
  return serializePinRecord(record);
}
