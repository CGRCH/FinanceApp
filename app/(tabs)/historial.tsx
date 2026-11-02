import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BodyText, Card, MoneyText, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { monthKeyToLabel } from '@/src/domain/monthPlanilla';
import { loadMonthPlanilla } from '@/src/db/repository';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import type { MonthPlanilla } from '@/src/domain/monthPlanilla';
import { computeMonthTotals } from '@/src/domain/monthPlanilla';

export default function HistorialScreen() {
  const { comparePoints, monthKeys, setMonthKey, monthKey } = useFinance();
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const [detail, setDetail] = useState<MonthPlanilla | null>(null);
  const [selected, setSelected] = useState(monthKey);

  useEffect(() => {
    setSelected(monthKey);
  }, [monthKey]);

  useEffect(() => {
    loadMonthPlanilla(db, selected).then(setDetail);
  }, [db, selected]);

  const totals = useMemo(() => (detail ? computeMonthTotals(detail) : null), [detail]);
  const maxIncome = Math.max(...comparePoints.map((p) => p.incomeClp), 1);

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: colors.text }]}>Historial por mes</Text>
      <BodyText muted>Compará ingresos, gastos y reserva entre meses.</BodyText>

      {comparePoints.length === 0 ? (
        <Card>
          <BodyText muted>Todavía no hay meses guardados. Creá tu primera planilla o importá Excel.</BodyText>
        </Card>
      ) : (
        <>
          <Card>
            <SectionTitle>Comparativa</SectionTitle>
            {comparePoints.map((p) => (
              <View key={p.monthKey} style={styles.barBlock}>
                <Text style={[styles.barLabel, { color: colors.text }]}>{monthKeyToLabel(p.monthKey)}</Text>
                <View style={[styles.barTrack, { backgroundColor: colors.surfaceMuted }]}>
                  <View
                    style={[
                      styles.barFillIncome,
                      { width: `${Math.round((p.incomeClp / maxIncome) * 100)}%`, backgroundColor: colors.primary },
                    ]}
                  />
                  <View
                    style={[
                      styles.barFillExpense,
                      {
                        width: `${Math.round((p.expensesClp / maxIncome) * 100)}%`,
                        backgroundColor: colors.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                  Ing. {formatClp(p.incomeClp)} · Gastos {formatClp(p.expensesClp)} · Reserva{' '}
                  {formatClp(p.reserveClp)}
                </Text>
              </View>
            ))}
            <BodyText muted>Verde: ingresos · Naranjo: gastos (escala relativa al mes más alto).</BodyText>
          </Card>

          <Text style={[styles.subTitle, { color: colors.text }]}>Meses</Text>
          {comparePoints
            .slice()
            .reverse()
            .map((p) => (
              <Pressable
                key={p.monthKey}
                onPress={() => setSelected(p.monthKey)}
                style={[
                  styles.monthRow,
                  {
                    backgroundColor: selected === p.monthKey ? colors.primarySoft : colors.surface,
                    borderColor: colors.border,
                  },
                ]}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{monthKeyToLabel(p.monthKey)}</Text>
                <Text style={{ color: colors.textSecondary }}>
                  Fondos − gastos: {formatClp(p.fondosMenosGastosClp)}
                </Text>
              </Pressable>
            ))}

          {detail && totals ? (
            <Card>
              <SectionTitle>Detalle · {monthKeyToLabel(selected)}</SectionTitle>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Ingresos</Text>
                <MoneyText amountClp={detail.incomeClp} />
              </View>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Gastos (tu parte)</Text>
                <MoneyText amountClp={-totals.allOutflowsClp} />
              </View>
              <View style={styles.detailRow}>
                <Text style={{ color: colors.textSecondary }}>Reserva</Text>
                <MoneyText amountClp={detail.reserveClp} />
              </View>
              <Pressable
                style={[styles.openBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  setMonthKey(selected);
                  router.push('/(tabs)/planilla');
                }}>
                <Text style={styles.openBtnText}>Editar en Planilla</Text>
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
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  title: { fontSize: 24, fontWeight: '800' },
  subTitle: { fontSize: 18, fontWeight: '700' },
  barBlock: { marginBottom: spacing.sm, gap: 4 },
  barLabel: { fontWeight: '600', fontSize: 14 },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden', flexDirection: 'row' },
  barFillIncome: { height: 10 },
  barFillExpense: { height: 10, opacity: 0.85 },
  monthRow: { borderWidth: 1, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.xs },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  openBtn: { marginTop: spacing.md, borderRadius: radii.sm, paddingVertical: spacing.sm, alignItems: 'center' },
  openBtnText: { color: '#fff', fontWeight: '700' },
});
