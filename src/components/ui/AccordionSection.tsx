import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, SectionTitle } from '@/src/components/ui/Primitives';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

interface Props {
  title: string;
  children: ReactNode;
  /** Igual que Dividir cuentas en Planilla: cerrado por defecto. */
  defaultExpanded?: boolean;
}

/** Acordeón reutilizable (header + chevron ▸/▾). */
export function AccordionSection({ title, children, defaultExpanded = false }: Props) {
  const colors = useThemeColors();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}>
        <SectionTitle>{title}</SectionTitle>
        <Text style={{ color: colors.textSecondary, fontSize: 22, fontWeight: '700' }}>
          {expanded ? '▾' : '▸'}
        </Text>
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  body: { gap: spacing.sm, marginTop: spacing.sm },
});
