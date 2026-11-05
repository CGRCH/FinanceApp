import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MonthDistributionChart } from '@/src/components/charts/MonthDistributionChart';
import { KeyboardAwareScrollView } from '@/src/components/ui/KeyboardAwareScrollView';
import { BodyText, Card, MoneyText, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { SafeScreen } from '@/src/components/ui/SafeScreen';
import { useFinance } from '@/src/context/FinanceContext';
import { dailySpendingExplanation } from '@/src/domain/homeDashboard';
import { formatClp } from '@/src/domain/money';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

function KpiCard({
  label,
  amountClp,
  hint,
  onPress,
  large,
}: {
  label: string;
  amountClp: number;
  hint?: string;
  onPress?: () => void;
  large?: boolean;
}) {
  const colors = useThemeColors();
  const inner = (
    <>
      <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      {large ? <MoneyText amountClp={amountClp} large /> : <MoneyText amountClp={amountClp} />}
      {hint ? <BodyText muted>{hint}</BodyText> : null}
    </>
  );
  if (!onPress) {
    return <Card>{inner}</Card>;
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Card>{inner}</Card>
    </Pressable>
  );
}

export default function PanelScreen() {
  const { monthKey, homeDashboard, totalDebtClp, emergencyFundClp } = useFinance();
  const colors = useThemeColors();

  const totals = homeDashboard?.totals;
  const projection = homeDashboard?.projection;
  const incomeClp = totals?.fundTotalClp ?? 0;
  const availableClp = totals?.availableClp ?? 0;
  const paidClp = totals?.paidSoFarClp ?? 0;
  const pendingClp = totals?.pendingOutflowsClp ?? 0;
  const debtPaidFraction = homeDashboard?.debtProgress.paidFraction ?? null;

  return (
    <SafeScreen>
      <KeyboardAwareScrollView
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={styles.content}
        accessibilityLabel="Panel del mes">
      <View>
        <Text style={[styles.kicker, { color: colors.textSecondary }]}>Mes {monthKey}</Text>
        <Text style={[styles.title, { color: colors.text }]}>Inicio</Text>
        <BodyText muted>Resumen informativo. Edita montos en la Planilla.</BodyText>
      </View>

      <KpiCard
        label="Disponible del mes"
        amountClp={availableClp}
        hint={`Ingresos ${formatClp(incomeClp)} − pagado ${formatClp(paidClp)}`}
        onPress={() => router.push('/(tabs)/planilla')}
        large
      />

      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <KpiCard
            label="Ingresos"
            amountClp={incomeClp}
            onPress={() => router.push('/(tabs)/planilla')}
          />
        </View>
        <View style={styles.gridCell}>
          <KpiCard
            label="Gastos pagados"
            amountClp={paidClp}
            onPress={() => router.push('/(tabs)/planilla')}
          />
        </View>
        <View style={styles.gridCell}>
          <KpiCard
            label="Pendiente por pagar"
            amountClp={pendingClp}
            onPress={() => router.push('/(tabs)/planilla')}
          />
        </View>
        <View style={styles.gridCell}>
          <Pressable onPress={() => router.push('/(tabs)/deudas')} accessibilityRole="button">
            <Card>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Deuda total</Text>
              <MoneyText amountClp={totalDebtClp} />
              {debtPaidFraction != null ? (
                <>
                  <BodyText muted>
                    Progreso (deudas personales con monto original): {Math.round(debtPaidFraction * 100)}% pagado
                  </BodyText>
                  <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                    <View
                      style={{
                        width: `${debtPaidFraction * 100}%`,
                        backgroundColor: colors.primary,
                        height: '100%',
                        borderRadius: 4,
                      }}
                    />
                  </View>
                </>
              ) : null}
            </Card>
          </Pressable>
        </View>
      </View>

      <KpiCard
        label="Fondo de emergencia"
        amountClp={emergencyFundClp}
        hint="Meta registrada en Ajustes"
        onPress={() => router.push('/(tabs)/ajustes')}
      />

      {projection?.willRunShort ? (
        <Card style={styles.alertCard}>
          <Text style={[styles.alertTitle, { color: colors.danger }]}>Alerta de fin de mes</Text>
          <BodyText muted>
            Proyección: faltante de {formatClp(projection.projectedShortfallClp)} con {projection.daysRemaining} días
            restantes (según Planilla y ritmo de gastos adicionales).
          </BodyText>
        </Card>
      ) : null}

      {totals && projection ? (
        <Card>
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Cuánto puedes gastar por día</Text>
          <MoneyText amountClp={projection.dailyAllowanceClp} large />
          <BodyText muted>{dailySpendingExplanation(totals, projection)}</BodyText>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Distribución del mes</SectionTitle>
        <BodyText muted>Tu parte en fijos, adicionales, deudas, diezmo y lo disponible (según Planilla).</BodyText>
        <MonthDistributionChart
          slices={homeDashboard?.distribution ?? []}
          incomeClp={incomeClp}
          hasData={homeDashboard?.hasDistributionData ?? false}
        />
      </Card>

      <Card>
        <SectionTitle>Próximos pagos</SectionTitle>
        {(homeDashboard?.upcomingPayments.length ?? 0) === 0 ? (
          <BodyText muted>No hay ítems pendientes por pagar en la planilla de este mes.</BodyText>
        ) : (
          homeDashboard!.upcomingPayments.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => router.push('/(tabs)/planilla')}
              style={[styles.upcomingRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.label}</Text>
                <Pill
                  label={
                    item.kind === 'debt' ? 'Deuda' : item.kind === 'fixed' ? 'Fijo' : 'Adicional'
                  }
                  tone="neutral"
                />
              </View>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{formatClp(item.amountClp)}</Text>
            </Pressable>
          ))
        )}
      </Card>
      </KeyboardAwareScrollView>
    </SafeScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  kicker: { fontSize: 13, fontWeight: '600' },
  title: { fontSize: 28, fontWeight: '800' },
  kpiLabel: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: { width: '48%', flexGrow: 1 },
  progressTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: spacing.sm },
  alertCard: { paddingVertical: spacing.sm },
  alertTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
