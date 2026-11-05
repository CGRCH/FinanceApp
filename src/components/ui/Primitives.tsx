import { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const colors = useThemeColors();
  return (
    <View
      style={StyleSheet.flatten([styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, style])}
      {...rest}>
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const colors = useThemeColors();
  return <Text style={[styles.sectionTitle, { color: colors.text }]}>{children}</Text>;
}

export function BodyText({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const colors = useThemeColors();
  return (
    <Text style={[styles.body, { color: muted ? colors.textSecondary : colors.text }]}>{children}</Text>
  );
}

export function MoneyText({ amountClp, large }: { amountClp: number; large?: boolean }) {
  const colors = useThemeColors();
  const formatted = `${amountClp < 0 ? '-' : ''}$${Math.abs(amountClp).toLocaleString('es-CL')}`;
  return (
    <Text
      accessibilityRole="text"
      style={[
        large ? styles.moneyLarge : styles.money,
        { color: amountClp < 0 ? colors.danger : colors.text },
      ]}>
      {formatted}
    </Text>
  );
}

export function Pill({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' }) {
  const colors = useThemeColors();
  const bg =
    tone === 'ok'
      ? colors.primarySoft
      : tone === 'warn'
        ? colors.warningSoft
        : tone === 'danger'
          ? colors.dangerSoft
          : colors.surfaceMuted;
  const fg =
    tone === 'ok'
      ? colors.primary
      : tone === 'warn'
        ? colors.warning
        : tone === 'danger'
          ? colors.danger
          : colors.textSecondary;
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  const colors = useThemeColors();
  return (
    <Card style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>{description}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
  },
  money: {
    fontSize: 20,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  moneyLarge: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    alignItems: 'flex-start',
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyBody: {
    fontSize: 14,
    lineHeight: 20,
  },
});
