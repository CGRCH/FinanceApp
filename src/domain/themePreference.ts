export type ThemePreference = 'light' | 'dark';

/** Migra preferencia legacy "system" al tema resuelto en el dispositivo. */
export function normalizeStoredThemePreference(
  stored: string | null,
  resolvedFromSystem: ThemePreference,
): ThemePreference {
  if (stored === 'light' || stored === 'dark') return stored;
  if (stored === 'system') return resolvedFromSystem;
  return 'light';
}
