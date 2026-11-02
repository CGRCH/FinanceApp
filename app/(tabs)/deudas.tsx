import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BodyText, Card, EmptyState, MoneyText, Pill, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { formatClp } from '@/src/domain/money';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';
import { useSQLiteContext } from 'expo-sqlite';
import { debtRowsToAccounts, listDebts } from '@/src/db/repository';
import { useEffect, useState } from 'react';
import type { DebtRow } from '@/src/db/schema';

export default function DeudasScreen() {
  const { debtComparison, extraDebtPaymentClp } = useFinance();
  const colors = useThemeColors();
  const db = useSQLiteContext();
  const [debts, setDebts] = useState<DebtRow[]>([]);

  useEffect(() => {
    listDebts(db).then(setDebts);
  }, [db, debtComparison]);

  if (debts.length === 0) {
    return (
      <ScrollView
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={styles.content}>
        <EmptyState
          title="Sin deudas registradas"
          description="Cuando anotes deudas, te mostramos bola de nieve vs avalancha y la fecha estimada para quedar libre."
        />
      </ScrollView>
    );
  }

  const accounts = debtRowsToAccounts(debts);
  const total = accounts.reduce((s, d) => s + d.balanceClp, 0);

  return (
    <ScrollView
      style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
      contentContainerStyle={styles.content}>
      <Card>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Total adeudado</Text>
        <MoneyText amountClp={total} large />
        <BodyText muted>Abono extra mensual considerado: {formatClp(extraDebtPaymentClp)}</BodyText>
      </Card>

      {debts.map((d) => (
        <Card key={d.id}>
          <View style={styles.row}>
            <Text style={[styles.name, { color: colors.text }]}>{d.name}</Text>
            <MoneyText amountClp={d.balance_clp} />
          </View>
          <BodyText muted>Mínimo sugerido: {formatClp(d.minimum_payment_clp)}</BodyText>
        </Card>
      ))}

      {debtComparison ? (
        <Card>
          <SectionTitle>Estrategias de pago</SectionTitle>
          <View style={styles.strategyRow}>
            <View style={[styles.strategyBox, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.strategyTitle, { color: colors.text }]}>Bola de nieve</Text>
              <BodyText>{debtComparison.snowball.months} meses</BodyText>
              <BodyText muted>Interés est.: {formatClp(debtComparison.snowball.totalInterestClp)}</BodyText>
              <Pill
                label={
                  debtComparison.snowball.debtFreeMonth
                    ? `Libre ${debtComparison.snowball.debtFreeMonth}`
                    : 'Sin fecha'
                }
                tone="neutral"
              />
            </View>
            <View style={[styles.strategyBox, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.strategyTitle, { color: colors.text }]}>Avalancha</Text>
              <BodyText>{debtComparison.avalanche.months} meses</BodyText>
              <BodyText muted>Interés est.: {formatClp(debtComparison.avalanche.totalInterestClp)}</BodyText>
              <Pill
                label={
                  debtComparison.avalanche.debtFreeMonth
                    ? `Libre ${debtComparison.avalanche.debtFreeMonth}`
                    : 'Sin fecha'
                }
                tone="neutral"
              />
            </View>
          </View>
          <Pill
            label={`Recomendación: ${debtComparison.recommended === 'snowball' ? 'Bola de nieve' : 'Avalancha'}`}
            tone="ok"
          />
          <BodyText>{debtComparison.summary}</BodyText>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  label: { fontSize: 14, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700' },
  strategyRow: { flexDirection: 'row', gap: spacing.sm },
  strategyBox: { flex: 1, borderRadius: 12, padding: spacing.sm, gap: 4 },
  strategyTitle: { fontWeight: '700' },
});
