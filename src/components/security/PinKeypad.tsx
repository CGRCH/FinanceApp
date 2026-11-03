import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing, radii } from '@/src/theme/tokens';

interface Props {
  value: string;
  /** Siempre 4 en PIN estándar; legacy puede ser 6. */
  dotCount: number;
  maxLength: number;
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  disabled?: boolean;
}

export function PinKeypad({ value, dotCount, maxLength, onDigit, onBackspace, disabled }: Props) {
  const colors = useThemeColors();

  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.dots} accessibilityLabel={`PIN ${value.length} de ${maxLength} dígitos`}>
        {Array.from({ length: dotCount }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                borderColor: colors.border,
                backgroundColor: i < value.length ? colors.primary : 'transparent',
              },
            ]}
          />
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((key) => {
            if (key === '') return <View key="spacer" style={styles.keySpacer} />;
            const isBack = key === '⌫';
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={isBack ? 'Borrar' : `Dígito ${key}`}
                disabled={disabled}
                onPress={() => (isBack ? onBackspace() : onDigit(key))}
                style={({ pressed }) => [
                  styles.key,
                  {
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                    borderColor: colors.border,
                    opacity: disabled ? 0.5 : 1,
                  },
                ]}>
                <Text style={[styles.keyText, { color: colors.text }]}>{key}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, alignItems: 'center' },
  dots: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  row: { flexDirection: 'row', gap: spacing.sm },
  key: {
    width: 72,
    height: 56,
    borderRadius: radii.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySpacer: { width: 72, height: 56 },
  keyText: { fontSize: 22, fontWeight: '700' },
});
