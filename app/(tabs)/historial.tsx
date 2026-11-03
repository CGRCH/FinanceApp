import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MonthHistoryCard } from '@/src/components/historial/MonthHistoryCard';
import { BodyText, Card, MoneyText, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import { loadMonthPlanilla } from '@/src/db/repository';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import { computeMonthTotals } from '@/src/domain/monthPlanilla';

export default function HistorialScreen() {
  const { comparePoints, setMonthKey, monthKey } = useFinance();
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const [selected, setSelected] = useState(monthKey);
  const [detailTotals, setDetailTotals] = useState<ReturnType<typeof computeMonthTotals> | null>(null);

  useEffect(() => {
    setSelected(monthKey);
  }, [monthKey]);

  useEffect(() => {
    loadMonthPlanilla(db, selected).then((p) => setDetailTotals(computeMonthTotals(p)));
  }, [db, selected]);

  const maxIncome = Math.max(...comparePoints.map((p) => p.incomeClp), 1);
  const ordered = useMemo(() => [...comparePoints].reverse(), [comparePoints]);

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Historial</Text>
      <BodyText muted>Revisá mes a mes cómo te fue. Tocá una tarjeta para ver el detalle.</BodyText>

      {comparePoints.length === 0 ? (
        <Card>
          <BodyText muted>Todavía no hay meses guardados. Completá tu planilla o importá Excel.</BodyText>
        </Card>
      ) : (
        <>
          {ordered.map((p) => (
            <MonthHistoryCard
              key={p.monthKey}
              point={p}
              maxIncome={maxIncome}
              selected={selected === p.monthKey}
              onPress={() => setSelected(p.monthKey)}
            />
          ))}

          {detailTotals ? (
            <Card>
              <SectionTitle>Detalle · {monthKeyToLabel(selected)}</SectionTitle>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Fondos menos gastos</Text>
                <MoneyText amountClp={detailTotals.fondosMenosGastosClp} />
              </View>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Tu gasto (con divisiones)</Text>
                <MoneyText amountClp={-detailTotals.allOutflowsClp} />
              </View>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Reserva</Text>
                <MoneyText amountClp={detailTotals.reserveClp} />
              </View>
              <BodyText muted>
                Después de reserva: {formatClp(detailTotals.surplusAfterReserveClp)}
              </BodyText>
              <Pressable
                style={[styles.openBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setMonthKey(selected);
                  router.push('/(tabs)/planilla');
                }}>
                <Text style={styles.openBtnText}>Editar planilla</Text>
              </Pressable>
            </Card>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  title: { fontSize: 26, fontWeight: '800' },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  openBtn: { marginTop: spacing.md, borderRadius: 12, paddingVertical: spacing.sm, alignItems: 'center' },
  openBtnText: { color: '#fff', fontWeight: '700' },
});
