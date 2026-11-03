import { normalizeStoredThemePreference } from '../themePreference';

describe('normalizeStoredThemePreference', () => {
  it('conserva light y dark', () => {
    expect(normalizeStoredThemePreference('light', 'dark')).toBe('light');
    expect(normalizeStoredThemePreference('dark', 'light')).toBe('dark');
  });

  it('migra system al tema resuelto', () => {
    expect(normalizeStoredThemePreference('system', 'dark')).toBe('dark');
    expect(normalizeStoredThemePreference('system', 'light')).toBe('light');
  });

  it('default light si no hay valor', () => {
    expect(normalizeStoredThemePreference(null, 'dark')).toBe('light');
  });
});
