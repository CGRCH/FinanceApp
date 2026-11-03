import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ExpenseBreakdownChart } from '@/src/components/charts/ExpenseBreakdownChart';
import { BodyText, Card, MoneyText, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

export default function PanelScreen() {
  const { availableClp, ledger, projection, monthKey } = useFinance();
  const colors = useThemeColors();

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}
      accessibilityLabel="Panel del mes">
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.kicker, { color: colors.textSecondary }]}>Mes {monthKey}</Text>
          <Text style={[styles.title, { color: colors.text }]}>Tu panorama</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ir a planilla del mes"
          onPress={() => router.push('/(tabs)/planilla')}
          style={StyleSheet.flatten([styles.fab, { backgroundColor: colors.primary }])}>
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      <Card accessibilityRole="summary">
        <Text style={[styles.label, { color: colors.textSecondary }]}>Disponible del mes</Text>
        <MoneyText amountClp={availableClp} large />
        <BodyText muted>
          Fondo {formatClp(ledger.incomeClp)} · Pagado {formatClp(ledger.paidSoFarClp ?? 0)} · Pendiente{' '}
          {formatClp(ledger.pendingOutflowsClp ?? 0)}
        </BodyText>
        <View style={styles.row}>
          <Pill label={`Ingresos ${formatClp(ledger.incomeClp)}`} tone="ok" />
          <Pill
            label={`Gastos ${formatClp(ledger.fixedExpensesClp + ledger.additionalExpensesClp + ledger.sharedExpensesClp)}`}
            tone="neutral"
          />
        </View>
      </Card>

      {projection.willRunShort ? (
        <Card style={{ backgroundColor: colors.dangerSoft, borderColor: colors.danger }}>
          <SectionTitle>Alerta de fin de mes</SectionTitle>
          <BodyText>
            Con el ritmo actual podrías terminar con un faltante de{' '}
            <Text style={{ fontWeight: '700' }}>{formatClp(projection.projectedShortfallClp)}</Text>. Prioriza lo
            esencial y frena gastos variables un par de días.
          </BodyText>
        </Card>
      ) : (
        <Card style={{ backgroundColor: colors.primarySoft, borderColor: colors.primary }}>
          <SectionTitle>Proyección al cierre</SectionTitle>
          <BodyText>
            Estimaríamos cerrar con{' '}
            <Text style={{ fontWeight: '700' }}>{formatClp(projection.projectedEndBalanceClp)}</Text> ({projection.daysRemaining}{' '}
            días restantes).
          </BodyText>
        </Card>
      )}

      <Card>
        <SectionTitle>Fondos menos gastos</SectionTitle>
        <MoneyText amountClp={ledger.fondosMenosGastosClp} large />
        <BodyText muted>Ingresos menos fijos y adicionales (como tu Excel).</BodyText>
      </Card>

      {ledger.reserveClp > 0 ? (
        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Reserva del mes</Text>
          <MoneyText amountClp={ledger.reserveClp} />
        </Card>
      ) : null}

      <Card>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Cuánto podís gastar por día</Text>
        <MoneyText amountClp={projection.dailyAllowanceClp} large />
        <BodyText muted>
          Referencia para gasto variable, después de lo ya registrado. No incluye cuotas futuras que aún no anotaste.
        </BodyText>
      </Card>

      <Card>
        <SectionTitle>Distribución del mes</SectionTitle>
        <ExpenseBreakdownChart
          income={ledger.incomeClp}
          fixed={ledger.fixedExpensesClp}
          additional={ledger.additionalExpensesClp}
          shared={ledger.sharedExpensesClp}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800' },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: '#fff', fontSize: 26, fontWeight: '700', marginTop: -2 },
});
