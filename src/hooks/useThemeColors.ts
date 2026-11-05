import { useFinance } from '@/src/context/FinanceContext';
import { palette, type ThemeColors } from '@/src/theme/tokens';

export function useThemeColors(): ThemeColors {
  const { effectiveScheme } = useFinance();
  return palette[effectiveScheme];
}
