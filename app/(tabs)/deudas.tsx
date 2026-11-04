import { StyleSheet, Text } from 'react-native';

import { DebtsManager } from '@/src/components/deudas/DebtsManager';
import { KeyboardAwareScrollView } from '@/src/components/ui/KeyboardAwareScrollView';
import { EmptyState } from '@/src/components/ui/Primitives';
import { SafeScreen } from '@/src/components/ui/SafeScreen';
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

  const scrollProps = {
    style: StyleSheet.flatten([styles.container, { backgroundColor: colors.background }]),
    contentContainerStyle: styles.content,
  };

  if (hasDebts === false) {
    return (
      <SafeScreen>
        <KeyboardAwareScrollView {...scrollProps}>
          <EmptyState
            title="Sin deudas registradas"
            description="Agrega deudas para ver estrategias de pago y registrar abonos desde la planilla del mes."
          />
          <DebtsManager />
        </KeyboardAwareScrollView>
      </SafeScreen>
    );
  }

  return (
    <SafeScreen>
      <KeyboardAwareScrollView {...scrollProps}>
        <Text style={[styles.title, { color: colors.text }]}>Deudas</Text>
        <DebtsManager />
      </KeyboardAwareScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  title: { fontSize: 26, fontWeight: '800' },
});
