import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/src/theme/tokens';

/** Padding inferior para contenido desplazable (barra de gestos Android + margen). */
export function useScrollBottomPadding(extra: number = spacing.xl): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 0) + extra;
}

export function useTabBarSafePadding(extra: number = spacing.sm): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 0) + extra;
}
