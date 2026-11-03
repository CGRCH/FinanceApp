import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BodyText } from '@/src/components/ui/Primitives';
import { formatClp } from '@/src/domain/money';
import type { PlanillaBreakdown } from '@/src/domain/planillaBreakdown';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

interface Props {
  breakdown: PlanillaBreakdown;
}

function Row({
  label,
  value,
  muted,
  colors,
}: {
  label: string;
  value: string;
  muted?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: muted ? colors.textSecondary : colors.text, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

export function PlanillaCalculationBreakdown({ breakdown }: Props) {
  const colors = useThemeColors();
  const [open, setOpen] = useState(false);
  const t = breakdown.totals;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}>
        <Text style={{ color: colors.primary, fontWeight: '800' }}>{open ? 'Ocultar cálculo' : 'Ver cálculo'}</Text>
      </Pressable>

      {open ? (
        <View style={[styles.panel, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}>
          <Row label="Ingresos del mes" value={formatClp(breakdown.incomeClp)} colors={colors} />

          <Text style={[styles.section, { color: colors.textSecondary }]}>Gastos fijos (tu parte)</Text>
          {breakdown.rows
            .filter((r) => r.group === 'fixed')
            .map((r) => (
              <Row
                key={r.id}
                label={`${r.label} · ${r.paid ? 'pagado' : 'pendiente'}${r.note ? ` (${r.note})` : ''}`}
                value={formatClp(r.committedClp)}
                muted
                colors={colors}
              />
            ))}
          <Row label="Subtotal fijos pagados" value={formatClp(breakdown.fixedPaidClp)} colors={colors} />
          <Row label="Subtotal fijos pendientes" value={formatClp(breakdown.fixedPendingClp)} muted colors={colors} />

          <Text style={[styles.section, { color: colors.textSecondary }]}>Gastos adicionales (tu parte)</Text>
          {breakdown.rows
            .filter((r) => r.group === 'additional')
            .map((r) => (
              <Row
                key={r.id}
                label={`${r.label} · ${r.paid ? 'pagado' : 'pendiente'}`}
                value={formatClp(r.committedClp)}
                muted
                colors={colors}
              />
            ))}
          <Row label="Subtotal adicionales pagados" value={formatClp(breakdown.additionalPaidClp)} colors={colors} />
          <Row
            label="Subtotal adicionales pendientes"
            value={formatClp(breakdown.additionalPendingClp)}
            muted
            colors={colors}
          />

          {breakdown.rows.some((r) => r.group === 'household') ? (
            <>
              <Text style={[styles.section, { color: colors.textSecondary }]}>Hogar (tu parte)</Text>
              {breakdown.rows
                .filter((r) => r.group === 'household')
                .map((r) => (
                  <Row key={r.id} label={r.label} value={formatClp(r.committedClp)} muted colors={colors} />
                ))}
            </>
          ) : null}

          <Text style={[styles.section, { color: colors.textSecondary }]}>Pagos de deudas</Text>
          {breakdown.rows.filter((r) => r.group === 'debt_payment').length === 0 ? (
            <BodyText muted>Sin pagos cargados.</BodyText>
          ) : (
            breakdown.rows
              .filter((r) => r.group === 'debt_payment')
              .map((r) => (
                <Row
                  key={r.id}
                  label={`${r.label} · ${r.note} · ${r.paid ? 'pagado' : 'pendiente'}`}
                  value={formatClp(r.committedClp)}
                  muted
                  colors={colors}
                />
              ))
          )}
          <Row label="Subtotal deudas pagadas" value={formatClp(breakdown.debtPaidClp)} colors={colors} />
          <Row label="Subtotal deudas pendientes" value={formatClp(breakdown.debtPendingClp)} muted colors={colors} />

          <Row label="Reserva del mes (aparte)" value={formatClp(breakdown.reserveClp)} colors={colors} />

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <Row label="Pagado hasta ahora (suma ítems pagados)" value={formatClp(t.paidSoFarClp)} colors={colors} />
          <Row
            label="Disponible / Fondos menos gastos (ingresos − pagados)"
            value={formatClp(t.availableClp)}
            colors={colors}
          />
          <Row
            label="Pendiente por pagar (comprometido no pagado)"
            value={formatClp(t.pendingOutflowsClp)}
            colors={colors}
          />
          <Row
            label="Total registrado (fijos + adicionales + hogar + deudas)"
            value={formatClp(t.allOutflowsClp)}
            muted
            colors={colors}
          />
          <Row
            label="Quedaría después de pagar todo (ingresos − comprometido − reserva)"
            value={formatClp(t.afterPayingAllClp)}
            colors={colors}
          />
          <BodyText muted>
            Comprobación: pagado ({formatClp(t.paidSoFarClp)}) + pendiente ({formatClp(t.pendingOutflowsClp)}) ={' '}
            {formatClp(t.paidSoFarClp + t.pendingOutflowsClp)} (comprometido {formatClp(t.allOutflowsClp)}).
          </BodyText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.sm, gap: spacing.sm },
  panel: { borderWidth: 1, borderRadius: radii.md, padding: spacing.sm, gap: 4, marginTop: spacing.xs },
  section: { fontSize: 12, fontWeight: '800', marginTop: spacing.sm, marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 2 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
});
