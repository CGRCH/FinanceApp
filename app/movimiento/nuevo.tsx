import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

import { BodyText, Card, SectionTitle } from '@/src/components/ui/Primitives';
import { useFinance } from '@/src/context/FinanceContext';
import { parseClpInput } from '@/src/domain/money';
import { yourShareClp as splitShare } from '@/src/domain/sharedExpenses';
import { insertTransaction } from '@/src/db/repository';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { spacing } from '@/src/theme/tokens';

type Mode = 'income' | 'fixed' | 'additional' | 'shared';

export default function NuevoMovimientoScreen() {
  const db = useSQLiteContext();
  const { refresh, monthKey } = useFinance();
  const colors = useThemeColors();
  const [mode, setMode] = useState<Mode>('additional');
  const [category, setCategory] = useState('');
  const [amount, setAmount] = useState('');
  const [people, setPeople] = useState('2');

  const save = async () => {
    const value = parseClpInput(amount);
    if (!category.trim() || value === null || value <= 0) {
      Alert.alert('Revisa los datos', 'Ingresa categoría y monto en pesos chilenos.');
      return;
    }

    try {
      if (mode === 'income') {
        await insertTransaction(db, { type: 'income', category: category.trim(), amountClp: value, monthKey });
      } else if (mode === 'shared') {
        const n = Number.parseInt(people, 10);
        if (n < 2) {
          Alert.alert('Compartido', 'Indica al menos 2 personas.');
          return;
        }
        const share = splitShare(value, n);
        await insertTransaction(db, {
          type: 'expense',
          kind: 'shared',
          category: category.trim(),
          amountClp: share,
          totalAmountClp: value,
          splitPeople: n,
          monthKey,
        });
      } else {
        await insertTransaction(db, {
          type: 'expense',
          kind: mode,
          category: category.trim(),
          amountClp: value,
          monthKey,
        });
      }
      await refresh();
      router.back();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo guardar');
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={StyleSheet.flatten([styles.container, { backgroundColor: colors.background }])}
        contentContainerStyle={styles.content}>
        <Card>
          <SectionTitle>Tipo de movimiento</SectionTitle>
          <View style={styles.modes}>
            {(
              [
                ['income', 'Ingreso'],
                ['fixed', 'Gasto fijo'],
                ['additional', 'Adicional'],
                ['shared', 'Compartido'],
              ] as const
            ).map(([key, label]) => {
              const active = mode === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => setMode(key)}
                  style={[
                    styles.modeChip,
                    {
                      backgroundColor: active ? colors.primarySoft : colors.surfaceMuted,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}>
                  <Text style={{ color: colors.text, fontWeight: active ? '700' : '500' }}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Card>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Categoría</Text>
          <TextInput
            value={category}
            onChangeText={setCategory}
            placeholder="Ej: Supermercado, Arriendo..."
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          <Text style={[styles.label, { color: colors.textSecondary }]}>
            {mode === 'shared' ? 'Monto total a dividir (CLP)' : 'Monto (CLP)'}
          </Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="450000"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          />

          {mode === 'shared' ? (
            <>
              <Text style={[styles.label, { color: colors.textSecondary }]}>Personas (incluyéndote)</Text>
              <TextInput
                value={people}
                onChangeText={setPeople}
                keyboardType="number-pad"
                style={[
                  styles.input,
                  { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              />
              {parseClpInput(amount) && Number.parseInt(people, 10) > 0 ? (
                <BodyText muted>
                  Tu parte: ${splitShare(parseClpInput(amount)!, Number.parseInt(people, 10)).toLocaleString('es-CL')}
                </BodyText>
              ) : null}
            </>
          ) : null}

          <Pressable style={[styles.save, { backgroundColor: colors.primary }]} onPress={save}>
            <Text style={styles.saveText}>Guardar</Text>
          </Pressable>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.md },
  modes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  modeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: spacing.sm },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 16,
  },
  save: { marginTop: spacing.lg, borderRadius: 12, paddingVertical: spacing.md, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
