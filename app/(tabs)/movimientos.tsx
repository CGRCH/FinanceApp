import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyText, Card, EmptyState, MoneyText, Pill } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

const kindLabel: Record<string, string> = {
  fixed: 'Fijo',
  additional: 'Adicional',
  shared: 'Compartido',
};

export default function MovimientosScreen() {
  const { transactions } = useFinance();
  const colors = useThemeColors();

  return (
    <View style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}>
      <FlatList
        contentContainerStyle={styles.list}
        data={transactions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title="Todavía no hay movimientos"
            description="Registra ingresos y gastos para ver dónde se va la plata. Partí por lo fijo del mes."
          />
        }
        ListHeaderComponent={
          <Pressable
            onPress={() => router.push('/movimiento/nuevo')}
            style={StyleSheet.flatten([styles.addButton, { backgroundColor: colors.primary }])}>
            <Text style={styles.addButtonText}>Registrar movimiento</Text>
          </Pressable>
        }
        renderItem={({ item }) => (
          <Card style={styles.item}>
            <View style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.category, { color: colors.text }]}>{item.category}</Text>
                <BodyText muted>
                  {item.type === 'income' ? 'Ingreso' : kindLabel[item.kind ?? 'additional'] ?? 'Gasto'}
                  {item.kind === 'shared' && item.split_people
                    ? ` · tu parte (${item.split_people} personas)`
                    : ''}
                </BodyText>
              </View>
              <MoneyText amountClp={item.type === 'income' ? item.amount_clp : -item.amount_clp} />
            </View>
            {item.kind === 'shared' && item.total_amount_clp ? (
              <Pill label={`Total ${item.total_amount_clp.toLocaleString('es-CL')}`} tone="neutral" />
            ) : null}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md, gap: spacing.sm },
  addButton: {
    borderRadius: 14,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  item: { marginBottom: spacing.sm },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  category: { fontSize: 16, fontWeight: '700' },
});
