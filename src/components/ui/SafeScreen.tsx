import type { ReactNode } from 'react';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useThemeColors } from '@/src/hooks/useThemeColors';

type Props = {
  children: ReactNode;
  edges?: Edge[];
};

/** Contenedor de pantalla con márgenes seguros (edge-to-edge Android / iOS). */
export function SafeScreen({ children, edges = ['left', 'right'] }: Props) {
  const colors = useThemeColors();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: colors.background }}>
      {children}
    </SafeAreaView>
  );
}
