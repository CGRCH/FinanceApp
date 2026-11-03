import { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps } from 'react-native';

import { formatClp, parseClpInput } from '@/src/domain/money';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { radii, spacing } from '@/src/theme/tokens';

interface Props extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  amountClp: number;
  onChangeAmount: (clp: number) => void;
  editable?: boolean;
}

export function ClpInput({ amountClp, onChangeAmount, style, editable = true, ...rest }: Props) {
  const colors = useThemeColors();
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState('');

  const display = focused ? draft : amountClp > 0 ? formatClp(amountClp) : '';

  return (
    <TextInput
      {...rest}
      editable={editable}
      value={display}
      onFocus={() => {
        setFocused(true);
        setDraft(amountClp > 0 ? String(amountClp) : '');
      }}
      onBlur={() => {
        setFocused(false);
        const parsed = parseClpInput(draft) ?? 0;
        onChangeAmount(parsed);
      }}
      onChangeText={(t) => {
        setDraft(t);
        if (focused) {
          const parsed = parseClpInput(t);
          if (parsed !== null) onChangeAmount(parsed);
        }
      }}
      keyboardType="number-pad"
      placeholder="$0"
      placeholderTextColor={colors.textSecondary}
      accessibilityLabel={rest.accessibilityLabel ?? 'Monto en pesos chilenos'}
      style={[
        styles.input,
        { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    minWidth: 120,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
});
