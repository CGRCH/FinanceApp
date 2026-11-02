export const palette = {
  light: {
    background: '#F3F6FA',
    surface: '#FFFFFF',
    surfaceMuted: '#E8EEF5',
    text: '#0F172A',
    textSecondary: '#475569',
    primary: '#0B6E4F',
    primarySoft: '#D8F3E9',
    accent: '#E36414',
    danger: '#B42318',
    dangerSoft: '#FEE4E2',
    warning: '#B54708',
    warningSoft: '#FEF0C7',
    border: '#CBD5E1',
    chart: ['#0B6E4F', '#E36414', '#2563EB', '#9333EA', '#64748B'],
  },
  dark: {
    background: '#0B1220',
    surface: '#121A2B',
    surfaceMuted: '#1C2740',
    text: '#F8FAFC',
    textSecondary: '#94A3B8',
    primary: '#34D399',
    primarySoft: '#064E3B',
    accent: '#FB923C',
    danger: '#F87171',
    dangerSoft: '#451A1A',
    warning: '#FBBF24',
    warningSoft: '#422006',
    border: '#334155',
    chart: ['#34D399', '#FB923C', '#60A5FA', '#C084FC', '#94A3B8'],
  },
} as const;

export type ThemeColors = (typeof palette)[keyof typeof palette];

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const;
