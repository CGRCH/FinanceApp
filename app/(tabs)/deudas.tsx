import { ScrollView, StyleSheet, Text } from 'react-native';

import { DebtsManager } from '@/src/components/deudas/DebtsManager';
import { EmptyState } from '@/src/components/ui/Primitives';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';
import { useSQLiteContext } from 'expo-sqlite';
import { listDebts } from '@/src/db/repository';
import { useEffect, useState } from 'react';

export default function DeudasScreen() {
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const [hasDebts, setHasDebts] = useState<boolean | null>(null);

  useEffect(() => {
    listDebts(db).then((rows) => setHasDebts(rows.length > 0));
  }, [db]);

  if (hasDebts === false) {
    return (
      <ScrollView
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={styles.content}>
        <EmptyState
          title="Sin deudas registradas"
          description="Agrega deudas para ver estrategias de pago y registrar abonos desde la planilla del mes."
        />
        <DebtsManager />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Deudas</Text>
      <DebtsManager />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: '800' },
});
